import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({ getPrisma: vi.fn() }));
vi.mock('@/lib/razorpay-server', () => ({
  getRazorpayConfig: vi.fn(() => ({ keyId: 'test-key-id', keySecret: 'test-key-secret' })),
  razorpayAuth: vi.fn(() => 'Basic mocked-auth'),
  safeEqualHex: vi.fn(() => true),
}));
vi.mock('@/lib/request-security', () => ({ hasSameOrigin: vi.fn(() => true) }));
vi.mock('@/lib/order-cancellation', () => ({
  prepareRefundForCapturedPayment: vi.fn(),
  processRefundOperation: vi.fn(),
}));

import { getPrisma } from '@/lib/prisma';
import { POST } from './route';

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

function paymentOrder() {
  return {
    id: 'order-id',
    orderNumber: 'CGS12345678',
    paymentStatus: 'pending',
    status: 'pending',
    totalPaise: 5100,
    currency: 'INR',
    payments: [{
      id: 'payment-record-id',
      gateway: 'razorpay',
      gatewayOrderId: 'gateway-order-id',
      gatewayPaymentId: null,
    }],
    refundOperation: null,
  };
}

function request() {
  return new Request('https://store.example/api/payments/verify', {
    method: 'POST',
    headers: { origin: 'https://store.example', 'content-type': 'application/json' },
    body: JSON.stringify({
      orderNumber: 'CGS12345678',
      razorpay_order_id: 'gateway-order-id',
      razorpay_payment_id: 'gateway-payment-id',
      razorpay_signature: 'a'.repeat(64),
    }),
  });
}

describe('Razorpay payment verification', () => {
  it('marks an order paid only after mocked Razorpay confirms the matching payment was captured', async () => {
    const order = paymentOrder();
    const current = paymentOrder();
    const paymentUpdate = vi.fn(async () => ({}));
    const orderUpdate = vi.fn(async () => ({}));
    const transaction = {
      order: { findUnique: vi.fn(async () => current), update: orderUpdate },
      payment: { update: paymentUpdate },
    };
    vi.mocked(getPrisma).mockReturnValue({
      order: { findUnique: vi.fn(async () => order) },
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<void>) => callback(transaction)),
    } as never);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      id: 'gateway-payment-id',
      order_id: 'gateway-order-id',
      currency: 'INR',
      amount: 5100,
      status: 'captured',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(request());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ verified: true, orderNumber: 'CGS12345678' });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(paymentUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'payment-record-id' },
      data: expect.objectContaining({ gatewayPaymentId: 'gateway-payment-id', status: 'paid' }),
    }));
    expect(orderUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'order-id' },
      data: expect.objectContaining({ paymentStatus: 'paid', status: 'confirmed' }),
    }));
  });
});
