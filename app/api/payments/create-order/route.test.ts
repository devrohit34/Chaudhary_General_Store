import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({ getPrisma: vi.fn() }));
vi.mock('@/lib/razorpay-server', () => ({
  getRazorpayConfig: vi.fn(() => ({ keyId: 'test_key_id', keySecret: 'test_key_secret' })),
  razorpayAuth: vi.fn(() => 'Basic test-auth'),
}));
vi.mock('@/lib/order-service', () => ({
  createCheckoutOrder: vi.fn(),
  CheckoutError: class CheckoutError extends Error {
    status = 400;
  },
  releaseOrderInventory: vi.fn(),
}));
vi.mock('@/lib/customer-auth', () => ({
  getActiveCustomer: vi.fn(async () => ({ id: 'customer-1', email: 'customer@example.com' })),
}));
vi.mock('@/lib/order-access', () => ({ orderAccessCookie: vi.fn(() => 'order-access=test') }));
vi.mock('@/lib/request-security', () => ({ hasSameOrigin: vi.fn(() => true) }));

import { getPrisma } from '@/lib/prisma';
import { getActiveCustomer } from '@/lib/customer-auth';
import { createCheckoutOrder } from '@/lib/order-service';
import { getAvailableDeliverySlots } from '@/lib/delivery-schedule';
import { POST } from './route';

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('Razorpay order creation route', () => {
  function checkoutRequest() {
    return new Request('https://store.example/api/payments/create-order', {
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
        deliverySlot: getAvailableDeliverySlots()[0].value,
        isExpress: false,
        items: [{ product_id: 'product-1', quantity: 2 }],
      }),
    });
  }

  it('creates the gateway order from the authenticated persisted checkout', async () => {
    const order = {
      id: 'order-1',
      orderNumber: 'CGS12345678',
      totalPaise: 5100,
      currency: 'INR',
      payments: [{ id: 'payment-record-1', gateway: 'razorpay', gatewayOrderId: null }],
    };
    vi.mocked(createCheckoutOrder).mockResolvedValue({
      order,
      orderAccessToken: 'opaque-order-token',
      alreadyExists: false,
    } as never);
    const paymentUpdate = vi.fn(async () => ({}));
    vi.mocked(getPrisma).mockReturnValue({ payment: { update: paymentUpdate } } as never);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      id: 'order_provider_123',
    }), { status: 201, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const response = await POST(checkoutRequest());
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload).toMatchObject({
      keyId: 'test_key_id',
      razorpayOrderId: 'order_provider_123',
      orderNumber: 'CGS12345678',
      amount: 5100,
      currency: 'INR',
    });
    expect(payload).not.toHaveProperty('keySecret');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(paymentUpdate).toHaveBeenCalledWith({
      where: { id: 'payment-record-1' },
      data: { gatewayOrderId: 'order_provider_123' },
    });
    expect(createCheckoutOrder).toHaveBeenCalledWith(
      expect.any(Object),
      'razorpay',
      '6f2e7d14-8753-4f69-96f6-90a0bf3e8089',
      { id: 'customer-1', email: 'customer@example.com' }
    );
  });

  it('rejects guest order creation before calling the order service or payment gateway', async () => {
    vi.mocked(getActiveCustomer).mockResolvedValue(null);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(checkoutRequest());

    expect(response.status).toBe(401);
    expect(createCheckoutOrder).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
