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
    product: { updateMany: vi.fn(async () => ({ count: 1 })) },
    refundOperation: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'refund-1', ...data })),
    },
  };
  return transaction;
}

function mockPrisma(transaction: ReturnType<typeof createTransaction>) {
  const prisma = {
    $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction)),
  };
  vi.mocked(getPrisma).mockReturnValue(prisma as never);
  return prisma;
}

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.RAZORPAY_KEY_ID;
  delete process.env.RAZORPAY_KEY_SECRET;
});

describe('order cancellation transaction', () => {
  it('cancels eligible COD orders and restores reserved inventory once', async () => {
    const transaction = createTransaction(makeOrder());
    mockPrisma(transaction);

    const result = await cancelOrder('order-1', 'customer', 'No longer needed');

    expect(result).toMatchObject({ orderId: 'order-1', refundOperationId: null, refundStatus: 'not_applicable' });
    expect(transaction.product.updateMany).toHaveBeenCalledOnce();
    expect(transaction.product.updateMany).toHaveBeenCalledWith({
      where: { id: 'product-1' },
      data: { stockQuantity: { increment: 2 } },
    });
    expect(transaction.order.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'order-1', status: { in: ['pending', 'confirmed', 'processing'] } },
      data: expect.objectContaining({ status: 'cancelled', inventoryReleased: true }),
    }));
    expect(transaction.refundOperation.create).not.toHaveBeenCalled();
  });

  it('does not restore stock again for an already released reservation', async () => {
    const transaction = createTransaction(makeOrder({ inventoryReleased: true }));
    mockPrisma(transaction);

    await cancelOrder('order-1', 'customer', 'No longer needed');

    expect(transaction.product.updateMany).not.toHaveBeenCalled();
    expect(transaction.order.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.not.objectContaining({ inventoryReleased: true }),
    }));
  });

  it('rejects ineligible orders without changing inventory', async () => {
    const transaction = createTransaction(makeOrder({ status: 'out_for_delivery' }));
    mockPrisma(transaction);

    await expect(cancelOrder('order-1', 'customer', 'No longer needed')).rejects.toMatchObject({ status: 409 });
    expect(transaction.order.updateMany).not.toHaveBeenCalled();
    expect(transaction.product.updateMany).not.toHaveBeenCalled();
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
    expect(transaction.product.updateMany).not.toHaveBeenCalled();
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
