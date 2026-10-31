import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('./prisma', () => ({ getPrisma: vi.fn() }));

import { getPrisma } from './prisma';
import { cancelOrder, processRefundOperation } from './order-cancellation';

function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    orderNumber: 'CGS12345678',
    status: 'pending',
    paymentMethod: 'cod',
    paymentStatus: 'pending',
    totalPaise: 2500,
    currency: 'INR',
    inventoryReleased: false,
    items: [{ productId: 'product-1', quantity: 2 }],
    payments: [],
    refundOperation: null,
    ...overrides,
  };
}

function createTransaction(order: ReturnType<typeof makeOrder>) {
  const transaction = {
    order: {
      findUnique: vi.fn(async () => order),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    $queryRaw: vi.fn(async () => [...new Set(
      order.items.flatMap((item) => item.productId ? [item.productId] : [])
    )].map((id) => ({ id }))),
    refundOperation: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'refund-1', ...data })),
    },
  };
  return transaction;
}

function mockPrisma(transaction: ReturnType<typeof createTransaction>) {
  const prisma = {
    $transaction: vi.fn(async (
      callback: (tx: typeof transaction) => Promise<unknown>,
      _options?: unknown
    ) => callback(transaction)),
  };
  vi.mocked(getPrisma).mockReturnValue(prisma as never);
  return prisma;
}

type TestOrderItem = { productId: string | null; quantity: number };

function createMemoryPrisma(
  items: TestOrderItem[],
  initialStock: Record<string, number>,
  failInventoryUpdate = false
) {
  let orderState: Record<string, unknown> = makeOrder({ items });
  let stockState = new Map(Object.entries(initialStock));
  let transactionQueue = Promise.resolve();
  let inventoryUpdateCount = 0;
  let inventoryQueryValues: unknown[] = [];
  const prisma = {
    $transaction: vi.fn(async (callback: (transaction: never) => Promise<unknown>) => {
      const previousTransaction = transactionQueue;
      let releaseTransaction!: () => void;
      transactionQueue = new Promise((resolve) => { releaseTransaction = resolve; });
      await previousTransaction;

      const draftOrder = { ...orderState };
      const draftStock = new Map(stockState);
      const transaction = {
        order: {
          findUnique: vi.fn(async () => ({ ...draftOrder, items, payments: [], refundOperation: null })),
          updateMany: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
            if (!['pending', 'confirmed', 'processing'].includes(String(draftOrder.status))) {
              return { count: 0 };
            }
            Object.assign(draftOrder, data);
            return { count: 1 };
          }),
        },
        $queryRaw: vi.fn(async (_query: TemplateStringsArray, values: { values: unknown[] }) => {
          inventoryUpdateCount += 1;
          inventoryQueryValues = values.values;
          const updatedIds = new Set<string>();
          for (let index = 0; index < values.values.length; index += 2) {
            const productId = values.values[index];
            const quantity = values.values[index + 1];
            if (typeof productId !== 'string' || typeof quantity !== 'number') {
              throw new Error('Invalid inventory query parameters.');
            }
            if (!draftStock.has(productId)) continue;
            draftStock.set(productId, (draftStock.get(productId) ?? 0) + quantity);
            updatedIds.add(productId);
          }
          if (failInventoryUpdate) throw new Error('Simulated inventory update failure.');
          return [...updatedIds].map((id) => ({ id }));
        }),
        refundOperation: { create: vi.fn(async () => ({ id: 'refund-1' })) },
      };

      try {
        const result = await callback(transaction as never);
        orderState = draftOrder;
        stockState = draftStock;
        return result;
      } finally {
        releaseTransaction();
      }
    }),
  };
  vi.mocked(getPrisma).mockReturnValue(prisma as never);

  return {
    prisma,
    getInventoryUpdateCount: () => inventoryUpdateCount,
    getInventoryQueryValues: () => inventoryQueryValues,
    getState: () => ({ status: orderState.status, stock: Object.fromEntries(stockState) }),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.RAZORPAY_KEY_ID;
  delete process.env.RAZORPAY_KEY_SECRET;
});

describe('order cancellation transaction', () => {
  it('cancels eligible COD orders and restores reserved inventory once', async () => {
    const transaction = createTransaction(makeOrder());
    const prisma = mockPrisma(transaction);

    const result = await cancelOrder('order-1', 'customer', 'No longer needed');

    expect(result).toMatchObject({ orderId: 'order-1', refundOperationId: null, refundStatus: 'not_applicable' });
    expect(transaction.$queryRaw).toHaveBeenCalledOnce();
    expect(transaction.order.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'order-1', status: { in: ['pending', 'confirmed', 'processing'] } },
      data: expect.objectContaining({ status: 'cancelled', inventoryReleased: true }),
    }));
    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: 'Serializable', maxWait: 5_000, timeout: 15_000 }
    );
    expect(transaction.refundOperation.create).not.toHaveBeenCalled();
  });

  it('does not restore stock again for an already released reservation', async () => {
    const transaction = createTransaction(makeOrder({ inventoryReleased: true }));
    mockPrisma(transaction);

    await cancelOrder('order-1', 'customer', 'No longer needed');

    expect(transaction.$queryRaw).not.toHaveBeenCalled();
    expect(transaction.order.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.not.objectContaining({ inventoryReleased: true }),
    }));
  });

  it('rejects ineligible orders without changing inventory', async () => {
    const transaction = createTransaction(makeOrder({ status: 'out_for_delivery' }));
    mockPrisma(transaction);

    await expect(cancelOrder('order-1', 'customer', 'No longer needed')).rejects.toMatchObject({ status: 409 });
    expect(transaction.order.updateMany).not.toHaveBeenCalled();
    expect(transaction.$queryRaw).not.toHaveBeenCalled();
  });

  it('creates a refund only from a captured Razorpay payment stored on the order', async () => {
    const transaction = createTransaction(makeOrder({
      paymentMethod: 'razorpay',
      paymentStatus: 'paid',
      payments: [{
        gateway: 'razorpay',
        gatewayPaymentId: 'pay_verified',
        status: 'paid',
        capturedAt: new Date(),
        amountPaise: 2500,
        currency: 'INR',
      }],
    }));
    mockPrisma(transaction);

    const result = await cancelOrder('order-1', 'customer', 'Ordered by mistake');

    expect(result).toMatchObject({ refundOperationId: 'refund-1', refundStatus: 'pending' });
    expect(transaction.refundOperation.create).toHaveBeenCalledWith({
      data: {
        orderId: 'order-1',
        gateway: 'razorpay',
        gatewayPaymentId: 'pay_verified',
        amountPaise: 2500,
        status: 'pending',
      },
    });
  });

  it('does not create refunds for failed Razorpay payments', async () => {
    const transaction = createTransaction(makeOrder({
      paymentMethod: 'razorpay',
      paymentStatus: 'failed',
      payments: [{ gateway: 'razorpay', status: 'failed', gatewayPaymentId: null }],
    }));
    mockPrisma(transaction);

    const result = await cancelOrder('order-1', 'customer', 'Ordered by mistake');

    expect(result.refundStatus).toBe('not_applicable');
    expect(transaction.refundOperation.create).not.toHaveBeenCalled();
  });

  it('uses the recorded captured payment for an exceptional COD order', async () => {
    const transaction = createTransaction(makeOrder({
      paymentMethod: 'cod',
      paymentStatus: 'paid',
      payments: [{
        gateway: 'razorpay',
        gatewayPaymentId: 'pay_cod_exception',
        status: 'paid',
        capturedAt: new Date(),
        amountPaise: 2500,
        currency: 'INR',
      }],
    }));
    mockPrisma(transaction);

    const result = await cancelOrder('order-1', 'customer', 'No longer needed');

    expect(result.refundStatus).toBe('pending');
    expect(transaction.refundOperation.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        gateway: 'razorpay',
        gatewayPaymentId: 'pay_cod_exception',
        amountPaise: 2500,
      }),
    }));
  });

  it('holds unresolved Razorpay payment state for reconciliation instead of guessing', async () => {
    const transaction = createTransaction(makeOrder({
      paymentMethod: 'razorpay',
      paymentStatus: 'pending',
      payments: [{ gateway: 'razorpay', status: 'pending', gatewayPaymentId: null }],
    }));
    mockPrisma(transaction);

    const result = await cancelOrder('order-1', 'customer', 'Ordered by mistake');

    expect(result.refundStatus).toBe('requires_review');
    expect(transaction.refundOperation.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'requires_review', gatewayPaymentId: null }),
    }));
  });

  it('does not restore inventory if an order status transition wins the race', async () => {
    const transaction = createTransaction(makeOrder());
    transaction.order.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma(transaction);

    await expect(cancelOrder('order-1', 'customer', 'No longer needed')).rejects.toMatchObject({ status: 409 });
    expect(transaction.$queryRaw).not.toHaveBeenCalled();
  });

  it.each([1, 2, 10, 20])('cancels an order with %i items in one stock update', async (itemCount) => {
    const items = Array.from({ length: itemCount }, (_, index) => ({
      productId: `product-${index + 1}`,
      quantity: 2,
    }));
    const startingStock = Object.fromEntries(items.map(({ productId }) => [productId, 5]));
    const memory = createMemoryPrisma(items, startingStock);

    await cancelOrder('order-1', 'customer', 'No longer needed');

    expect(memory.getState()).toEqual({
      status: 'cancelled',
      stock: Object.fromEntries(items.map(({ productId }) => [productId, 7])),
    });
    expect(memory.getInventoryUpdateCount()).toBe(1);
  });

  it('aggregates duplicate product lines before restoring stock', async () => {
    const items = [
      { productId: 'product-1', quantity: 2 },
      { productId: 'product-1', quantity: 3 },
    ];
    const memory = createMemoryPrisma(items, { 'product-1': 5 });

    await cancelOrder('order-1', 'customer', 'No longer needed');

    expect(memory.getState()).toEqual({ status: 'cancelled', stock: { 'product-1': 10 } });
    expect(memory.getInventoryUpdateCount()).toBe(1);
    expect(memory.getInventoryQueryValues()).toEqual(['product-1', 5]);
  });

  it('restores stock only once for repeated and concurrent cancellation requests', async () => {
    const memory = createMemoryPrisma([{ productId: 'product-1', quantity: 4 }], { 'product-1': 1 });
    const results = await Promise.allSettled([
      cancelOrder('order-1', 'customer', 'No longer needed'),
      cancelOrder('order-1', 'customer', 'No longer needed'),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(memory.getState()).toEqual({ status: 'cancelled', stock: { 'product-1': 5 } });
    expect(memory.getInventoryUpdateCount()).toBe(1);

    await expect(cancelOrder('order-1', 'customer', 'No longer needed')).rejects.toMatchObject({ status: 409 });
    expect(memory.getState().stock).toEqual({ 'product-1': 5 });
    expect(memory.getInventoryUpdateCount()).toBe(1);
  });

  it('rolls back the order transition and stock when inventory restoration fails', async () => {
    const memory = createMemoryPrisma([{ productId: 'product-1', quantity: 4 }], { 'product-1': 1 }, true);

    await expect(cancelOrder('order-1', 'customer', 'No longer needed')).rejects.toThrow(
      'Simulated inventory update failure.'
    );

    expect(memory.getState()).toEqual({ status: 'pending', stock: { 'product-1': 1 } });
  });

  it('rolls back when a referenced product is missing', async () => {
    const memory = createMemoryPrisma([{ productId: 'missing-product', quantity: 4 }], {});

    await expect(cancelOrder('order-1', 'customer', 'No longer needed')).rejects.toThrow(
      'Could not restore inventory for every order item.'
    );

    expect(memory.getState()).toEqual({ status: 'pending', stock: {} });
  });

  it.each([0, -1])('rejects invalid inventory quantity %i without changing order or stock', async (quantity) => {
    const memory = createMemoryPrisma([{ productId: 'product-1', quantity }], { 'product-1': 1 });

    await expect(cancelOrder('order-1', 'customer', 'No longer needed')).rejects.toThrow(
      'Order contains an invalid inventory quantity.'
    );

    expect(memory.getState()).toEqual({ status: 'pending', stock: { 'product-1': 1 } });
    expect(memory.getInventoryUpdateCount()).toBe(0);
  });
});

describe('refund processing safety', () => {
  it('holds timed-out requests for reconciliation and never blindly resubmits them', async () => {
    let status = 'pending';
    const operation: {
      id: string;
      orderId: string;
      gateway: string;
      gatewayPaymentId: string;
      gatewayRefundId: string | null;
      amountPaise: number;
      status: string;
      attemptCount: number;
    } = {
      id: 'refund-1',
      orderId: 'order-1',
      gateway: 'razorpay',
      gatewayPaymentId: 'pay_verified',
      gatewayRefundId: null,
      amountPaise: 2500,
      status,
      attemptCount: 0,
    };
    const prisma = {
      refundOperation: {
        findUnique: vi.fn(async ({ include }: { include?: { order?: unknown } } = {}) => ({
          ...operation,
          status,
          ...(include?.order ? { order: { currency: 'INR', status: 'cancelled' } } : {}),
        })),
        updateMany: vi.fn(async ({ where, data }: { where: { status: string }; data: Record<string, unknown> }) => {
          if (status !== where.status) return { count: 0 };
          status = String(data.status ?? status);
          if ('attemptCount' in data) operation.attemptCount += 1;
          return { count: 1 };
        }),
      },
    };
    vi.mocked(getPrisma).mockReturnValue(prisma as never);
    process.env.RAZORPAY_KEY_ID = 'rzp_test_id';
    process.env.RAZORPAY_KEY_SECRET = 'test-secret';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('timeout'));

    const result = await processRefundOperation('refund-1');
    expect(result?.status).toBe('requires_review');
    expect(operation.attemptCount).toBe(1);

    await processRefundOperation('refund-1');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('submits the database amount in paise and records the provider refund reference', async () => {
    let status = 'pending';
    const operation: {
      id: string;
      orderId: string;
      gateway: string;
      gatewayPaymentId: string;
      gatewayRefundId: string | null;
      amountPaise: number;
      status: string;
      attemptCount: number;
    } = {
      id: 'refund-1',
      orderId: 'order-1',
      gateway: 'razorpay',
      gatewayPaymentId: 'pay_verified',
      gatewayRefundId: null,
      amountPaise: 2500,
      status,
      attemptCount: 0,
    };
    const updateMany = vi.fn(async ({ where, data }: { where: { status: string }; data: Record<string, unknown> }) => {
      if (status !== where.status) return { count: 0 };
      status = String(data.status ?? status);
      if ('attemptCount' in data) operation.attemptCount += 1;
      if ('gatewayRefundId' in data) operation.gatewayRefundId = String(data.gatewayRefundId);
      return { count: 1 };
    });
    const transaction = {
      refundOperation: { updateMany },
      payment: { updateMany: vi.fn(async () => ({ count: 1 })) },
      order: { updateMany: vi.fn(async () => ({ count: 1 })) },
    };
    const prisma = {
      refundOperation: {
        findUnique: vi.fn(async ({ include }: { include?: { order?: unknown } } = {}) => ({
          ...operation,
          status,
          ...(include?.order ? { order: { currency: 'INR', status: 'cancelled' } } : {}),
        })),
        updateMany,
      },
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction)),
    };
    vi.mocked(getPrisma).mockReturnValue(prisma as never);
    process.env.RAZORPAY_KEY_ID = 'rzp_test_id';
    process.env.RAZORPAY_KEY_SECRET = 'test-secret';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      id: 'rfnd_provider_1',
      payment_id: 'pay_verified',
      amount: 2500,
      currency: 'INR',
      status: 'pending',
    }), { status: 200 }));

    const result = await processRefundOperation('refund-1');

    expect(result?.status).toBe('processing');
    expect(result?.gatewayRefundId).toBe('rfnd_provider_1');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.razorpay.com/v1/payments/pay_verified/refund',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ amount: 2500, notes: { refund_operation_id: 'refund-1' } }),
      })
    );
  });
});
