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

function setupPrisma(options: { orderCreateError?: Error; stockUpdateCount?: number } = {}) {
  const product = {
    id: 'product-1',
    isActive: true,
    stockQuantity: 5,
    pricePaise: 2500,
    name: 'Test product',
    imageUrl: null,
    brand: null,
    unit: 'piece',
    gstBasisPoints: 500,
  };
  const transaction = {
    product: {
      findMany: vi.fn(async () => [product]),
      updateMany: vi.fn(async () => ({ count: options.stockUpdateCount ?? 1 })),
    },
    order: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (options.orderCreateError) throw options.orderCreateError;
        return { id: 'order-1', ...data };
      }),
    },
  };
  const prisma = {
    order: { findUnique: vi.fn(async () => null) },
    $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction)),
  };
  vi.mocked(getPrisma).mockReturnValue(prisma as never);
  return { prisma, transaction };
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

    expect(result.order).toMatchObject({ id: 'order-1' });
    expect(result.alreadyExists).toBe(false);
    expect(transaction.product.updateMany).toHaveBeenCalledWith({
      where: { id: 'product-1', isActive: true, stockQuantity: { gte: 2 } },
      data: { stockQuantity: { decrement: 2 } },
    });
    expect(transaction.order.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        paymentMethod: 'cod',
        customerId: 'customer-1',
        customerEmail: 'customer@example.com',
        orderNumber: expect.stringMatching(/^CGS/),
        idempotencyKey: 'checkout-key',
        totalPaise: 5100,
        items: { create: [expect.objectContaining({ productId: 'product-1', quantity: 2 })] },
      }),
      include: { items: true, payments: true },
    }));
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
  });

  it('rejects sold-out inventory before creating an order', async () => {
    vi.stubEnv('ORDER_ACCESS_SECRET', 'test-order-access-secret-with-32-chars');
    const { transaction } = setupPrisma({ stockUpdateCount: 0 });

    await expect(createCheckoutOrder(checkoutInput, 'cod', 'checkout-key')).rejects.toBeInstanceOf(CheckoutError);

    expect(transaction.order.create).not.toHaveBeenCalled();
  });

  it('propagates order database failures instead of returning a success-shaped result', async () => {
    vi.stubEnv('ORDER_ACCESS_SECRET', 'test-order-access-secret-with-32-chars');
    const databaseError = new Error('database write failed');
    const { transaction } = setupPrisma({ orderCreateError: databaseError });

    await expect(createCheckoutOrder(checkoutInput, 'cod', 'checkout-key')).rejects.toBe(databaseError);

    expect(transaction.product.updateMany).toHaveBeenCalledOnce();
    expect(transaction.order.create).toHaveBeenCalledOnce();
  });
});
