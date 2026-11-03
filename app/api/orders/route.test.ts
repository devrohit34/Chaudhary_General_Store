import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/prisma', () => ({ getPrisma: vi.fn() }));
vi.mock('@/lib/customer-auth', () => ({ getActiveCustomer: vi.fn() }));
vi.mock('@/lib/order-service', () => ({
  createCheckoutOrder: vi.fn(),
  CheckoutError: class CheckoutError extends Error {
    status = 400;
  },
}));
vi.mock('@/lib/prisma-dto', () => ({ toOrderDto: vi.fn((order) => order) }));
vi.mock('@/lib/request-security', () => ({ hasSameOrigin: vi.fn(() => true) }));

import { getPrisma } from '@/lib/prisma';
import { getActiveCustomer } from '@/lib/customer-auth';
import { createCheckoutOrder } from '@/lib/order-service';
import { POST, GET } from './route';

afterEach(() => {
  vi.clearAllMocks();
});

function checkoutRequest() {
  return new Request('https://store.example/api/orders', {
    method: 'POST',
    headers: {
      origin: 'https://store.example',
      'content-type': 'application/json',
      'idempotency-key': '6f2e7d14-8753-4f69-96f6-90a0bf3e8089',
    },
    body: JSON.stringify({
      address: {
        full_name: 'Test Customer',
        phone: '9876543210',
        address_line1: '12 Market Road',
        address_line2: '',
        city: 'Delhi',
        state: 'Delhi',
        pincode: '110001',
      },
      deliverySlot: '',
      isExpress: true,
      paymentMethod: 'cod',
      items: [{ product_id: 'product-1', quantity: 2 }],
    }),
  });
}

describe('customer order API authentication', () => {
  it('rejects guest COD orders before creating an order', async () => {
    vi.mocked(getActiveCustomer).mockResolvedValue(null);

    const response = await POST(checkoutRequest());

    expect(response.status).toBe(401);
    expect(createCheckoutOrder).not.toHaveBeenCalled();
  });

  it('rejects order history requests without an active customer session', async () => {
    vi.mocked(getActiveCustomer).mockResolvedValue(null);

    const response = await GET(new Request('https://store.example/api/orders'));

    expect(response.status).toBe(401);
    expect(getPrisma).not.toHaveBeenCalled();
  });

  it('returns all orders belonging to the authenticated customer', async () => {
    const orders = [{ id: 'order-1' }, { id: 'order-2' }];
    const findMany = vi.fn(async (_query: {
      where: { customerId: string };
      orderBy: { createdAt: string };
      take?: number;
    }) => orders);
    vi.mocked(getActiveCustomer).mockResolvedValue({
      id: 'customer-1',
      email: 'customer@example.com',
    });
    vi.mocked(getPrisma).mockReturnValue({ order: { findMany } } as never);

    const response = await GET(new Request('https://store.example/api/orders'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ orders });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { customerId: 'customer-1' },
      orderBy: { createdAt: 'desc' },
    }));
    expect(findMany.mock.calls[0][0].take).toBeUndefined();
  });
});
