import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/prisma', () => ({ getPrisma: vi.fn() }));

import { getPrisma } from '@/lib/prisma';
import { CheckoutError, createCheckoutOrder } from '@/lib/order-service';

const checkoutInput = {
  address: {
    full_name: 'Test Customer',
    phone: '9876543210',
    address_line1: '12 Market Road',
    address_line2: '',
    city: 'Delhi',
    state: 'Delhi',
    pincode: '110001',
  },
  deliverySlot: '10:00-12:00',
  isExpress: false,
  items: [{ product_id: 'product-1', quantity: 2 }],
};

type TestProduct = {
  id: string;
  isActive: boolean;
  stockQuantity: number;
  pricePaise: number;
  name: string;
  imageUrl: string | null;
  brand: string | null;
  unit: string;
  gstBasisPoints: number;
};

function setupPrisma(options: {
  orderCreateError?: Error;
  products?: TestProduct[];
} = {}) {
  const products = options.products ?? [{
    id: 'product-1',
    isActive: true,
    stockQuantity: 5,
    pricePaise: 2500,
    name: 'Test product',
    imageUrl: null,
    brand: null,
    unit: 'piece',
    gstBasisPoints: 500,
  }];
  const inventory = new Map(products.map((product) => [product.id, { ...product }]));
  let createdOrder: Record<string, unknown> | null = null;
  let transactionQueue = Promise.resolve();
  const transaction = {
    product: {
      findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in.flatMap((id) => {
          const product = inventory.get(id);
          return product?.isActive ? [{ ...product }] : [];
        })
      ),
    },
    $queryRaw: vi.fn(async (
      _strings: TemplateStringsArray,
      parameters: { values: unknown[] }
    ) => {
      const reserved: Array<{ id: string }> = [];
      const values = parameters.values;
      for (let index = 0; index < values.length; index += 2) {
        const id = values[index] as string;
        const quantity = values[index + 1] as number;
        const product = inventory.get(id);
        if (product?.isActive && product.stockQuantity >= quantity) {
          product.stockQuantity -= quantity;
          reserved.push({ id });
        }
      }
      return reserved;
    }),
    order: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (options.orderCreateError) throw options.orderCreateError;
        if (createdOrder && createdOrder.idempotencyKey === data.idempotencyKey) {
          throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
        }
        createdOrder = { id: `order-${Date.now()}`, ...data };
        return createdOrder;
      }),
    },
  };
  const prisma = {
    order: {
      findUnique: vi.fn(async ({ where }: { where: { idempotencyKey: string } }) =>
        createdOrder?.idempotencyKey === where.idempotencyKey ? createdOrder : null
      ),
    },
    $transaction: vi.fn(async (
      callback: (tx: typeof transaction) => Promise<unknown>,
      _options?: Record<string, unknown>
    ) => {
      const previous = transactionQueue;
      let release!: () => void;
      transactionQueue = new Promise<void>((resolve) => { release = resolve; });
      await previous;
      const inventoryBefore = new Map(
        [...inventory].map(([id, product]) => [id, { ...product }])
      );
      try {
        return await callback(transaction);
      } catch (error) {
        inventory.clear();
        for (const [id, product] of inventoryBefore) inventory.set(id, product);
        throw error;
      } finally {
        release();
      }
    }),
  };
  vi.mocked(getPrisma).mockReturnValue(prisma as never);
  return { prisma, transaction, inventory };
}

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe('checkout order creation', () => {
  it('creates a COD order and reserves the requested stock in the same transaction', async () => {
    vi.stubEnv('ORDER_ACCESS_SECRET', 'test-order-access-secret-with-32-chars');
    const { prisma, transaction } = setupPrisma();

    const result = await createCheckoutOrder(checkoutInput, 'cod', 'checkout-key', {
      id: 'customer-1',
      email: 'customer@example.com',
    });

    expect(result.order).toMatchObject({ id: expect.stringMatching(/^order-/) });
    expect(result.alreadyExists).toBe(false);
    expect(transaction.$queryRaw).toHaveBeenCalledOnce();
    expect(transaction.$queryRaw.mock.calls[0][0].join(' '))
      .toContain('product."stock_quantity" >= requested.quantity::integer');
    expect(transaction.$queryRaw.mock.calls[0][1].values).toEqual(['product-1', 2]);
    expect(transaction.order.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        paymentMethod: 'cod',
        customerId: 'customer-1',
        customerEmail: 'customer@example.com',
        orderNumber: expect.stringMatching(/^CGS/),
        idempotencyKey: 'checkout-key',
        totalPaise: 5100,
        items: { createMany: { data: [expect.objectContaining({ productId: 'product-1', quantity: 2 })] } },
      }),
      include: { items: true, payments: true },
    }));
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
      maxWait: 5_000,
      timeout: 15_000,
    });
  });

  it('creates a pending Razorpay payment record without contacting the payment gateway', async () => {
    vi.stubEnv('ORDER_ACCESS_SECRET', 'test-order-access-secret-with-32-chars');
    const { transaction } = setupPrisma();

    await createCheckoutOrder(checkoutInput, 'razorpay', 'online-payment-key');

    expect(transaction.order.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        paymentMethod: 'razorpay',
        paymentStatus: 'pending',
        payments: {
          create: {
            gateway: 'razorpay',
            status: 'pending',
            amountPaise: 5100,
          },
        },
      }),
    }));
    expect(transaction.$queryRaw).toHaveBeenCalledOnce();
  });

  it('reserves inventory with one bulk conditional update for a full 50-product cart', async () => {
    vi.stubEnv('ORDER_ACCESS_SECRET', 'test-order-access-secret-with-32-chars');
    const products = Array.from({ length: 50 }, (_, index) => ({
      id: `product-${String(index).padStart(2, '0')}`,
      isActive: true,
      stockQuantity: 10,
      pricePaise: 100,
      name: `Product ${index}`,
      imageUrl: null,
      brand: null,
      unit: 'piece',
      gstBasisPoints: 500,
    }));
    const { transaction, inventory } = setupPrisma({ products });
    const input = {
      ...checkoutInput,
      items: products.map((product) => ({ product_id: product.id, quantity: 1 })),
    };

    await createCheckoutOrder(input, 'cod', 'many-products-key');

    expect(transaction.$queryRaw).toHaveBeenCalledOnce();
    expect(transaction.order.create).toHaveBeenCalledOnce();
    expect([...inventory.values()].every((product) => product.stockQuantity === 9)).toBe(true);
  });

  it('rejects invalid quantities before querying the database', async () => {
    vi.stubEnv('ORDER_ACCESS_SECRET', 'test-order-access-secret-with-32-chars');
    const { prisma } = setupPrisma();

    await expect(createCheckoutOrder({
      ...checkoutInput,
      items: [{ product_id: 'product-1', quantity: 0 }],
    }, 'cod', 'invalid-quantity-key')).rejects.toBeInstanceOf(CheckoutError);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects insufficient stock without creating an order', async () => {
    vi.stubEnv('ORDER_ACCESS_SECRET', 'test-order-access-secret-with-32-chars');
    const { transaction, inventory } = setupPrisma({
      products: [{
        id: 'product-1',
        isActive: true,
        stockQuantity: 1,
        pricePaise: 2500,
        name: 'Test product',
        imageUrl: null,
        brand: null,
        unit: 'piece',
        gstBasisPoints: 500,
      }],
    });

    await expect(createCheckoutOrder(checkoutInput, 'cod', 'checkout-key')).rejects.toBeInstanceOf(CheckoutError);

    expect(transaction.order.create).not.toHaveBeenCalled();
    expect(inventory.get('product-1')?.stockQuantity).toBe(1);
  });

  it('propagates order database failures instead of returning a success-shaped result', async () => {
    vi.stubEnv('ORDER_ACCESS_SECRET', 'test-order-access-secret-with-32-chars');
    const databaseError = new Error('database write failed');
    const { transaction, inventory } = setupPrisma({ orderCreateError: databaseError });

    await expect(createCheckoutOrder(checkoutInput, 'cod', 'checkout-key')).rejects.toBe(databaseError);

    expect(transaction.$queryRaw).toHaveBeenCalledOnce();
    expect(transaction.order.create).toHaveBeenCalledOnce();
    expect(inventory.get('product-1')?.stockQuantity).toBe(5);
  });

  it('allows only one concurrent order when customers compete for the same stock', async () => {
    vi.stubEnv('ORDER_ACCESS_SECRET', 'test-order-access-secret-with-32-chars');
    const { inventory } = setupPrisma({
      products: [{
        id: 'product-1',
        isActive: true,
        stockQuantity: 3,
        pricePaise: 2500,
        name: 'Test product',
        imageUrl: null,
        brand: null,
        unit: 'piece',
        gstBasisPoints: 500,
      }],
    });
    const competingCheckout = {
      ...checkoutInput,
      items: [{ product_id: 'product-1', quantity: 2 }],
    };

    const results = await Promise.allSettled([
      createCheckoutOrder(competingCheckout, 'cod', 'customer-one-key'),
      createCheckoutOrder(competingCheckout, 'cod', 'customer-two-key'),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(inventory.get('product-1')?.stockQuantity).toBe(1);
  });

  it('does not reserve stock again when the same checkout key is submitted twice', async () => {
    vi.stubEnv('ORDER_ACCESS_SECRET', 'test-order-access-secret-with-32-chars');
    const { transaction, inventory } = setupPrisma();

    await createCheckoutOrder(checkoutInput, 'cod', 'repeat-checkout-key');
    const retry = await createCheckoutOrder(checkoutInput, 'cod', 'repeat-checkout-key');

    expect(retry.alreadyExists).toBe(true);
    expect(transaction.$queryRaw).toHaveBeenCalledOnce();
    expect(inventory.get('product-1')?.stockQuantity).toBe(3);
  });
});
