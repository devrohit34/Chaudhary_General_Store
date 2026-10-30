import { createHmac } from 'crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({ getPrisma: vi.fn() }));
vi.mock('@/lib/order-service', () => ({ releaseOrderInventoryInTransaction: vi.fn() }));
vi.mock('@/lib/order-cancellation', () => ({
  markRefundNotApplicable: vi.fn(),
  prepareRefundForCapturedPayment: vi.fn(),
  processRefundOperation: vi.fn(),
  recordRefundWebhook: vi.fn(),
}));

import { getPrisma } from '@/lib/prisma';
import { prepareRefundForCapturedPayment, processRefundOperation } from '@/lib/order-cancellation';
import { POST } from './route';

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.RAZORPAY_WEBHOOK_SECRET;
});

function signedRequest(event: unknown, eventId = 'evt_test_1', signatureOverride?: string) {
  const rawBody = JSON.stringify(event);
  const signature = signatureOverride ?? createHmac('sha256', 'webhook-secret').update(rawBody).digest('hex');
  return new Request('https://store.example/api/payments/webhook', {
    method: 'POST',
    headers: {
      'x-razorpay-signature': signature,
      'x-razorpay-event-id': eventId,
    },
    body: rawBody,
  });
}

describe('Razorpay webhook', () => {
  it('rejects invalid signatures before accessing payment data', async () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = 'webhook-secret';

    const response = await POST(signedRequest({ event: 'payment.captured' }, 'evt_invalid', 'bad-signature'));

    expect(response.status).toBe(400);
    expect(getPrisma).not.toHaveBeenCalled();
  });

  it('acknowledges duplicate event IDs without applying state changes again', async () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = 'webhook-secret';
    const transaction = {
      webhookEvent: { findUnique: vi.fn(async () => ({ id: 'existing-event' })) },
    };
    vi.mocked(getPrisma).mockReturnValue({
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction)),
      webhookEvent: { findUnique: vi.fn() },
    } as never);

    const response = await POST(signedRequest({
      event: 'payment.captured',
      payload: { payment: { entity: {
        id: 'pay_test',
        order_id: 'order_test',
        status: 'captured',
        amount: 2500,
        currency: 'INR',
      } } },
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ duplicate: true });
  });

  it('does not reactivate a cancelled order when a payment capture arrives late', async () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = 'webhook-secret';
    const transaction = {
      webhookEvent: {
        findUnique: vi.fn(async () => null),
        create: vi.fn(async () => ({})),
      },
      order: {
        findFirst: vi.fn(async () => ({
          id: 'order-db-id',
          orderNumber: 'CGS12345678',
          status: 'cancelled',
          paymentStatus: 'pending',
          currency: 'INR',
          totalPaise: 2500,
          payments: [{
            id: 'payment-record',
            gateway: 'razorpay',
            gatewayOrderId: 'order_test',
            gatewayPaymentId: null,
            status: 'pending',
            amountPaise: 2500,
            currency: 'INR',
            verifiedAt: null,
            capturedAt: null,
          }],
        })),
        update: vi.fn(async () => ({})),
      },
      payment: { update: vi.fn(async () => ({})) },
    };
    vi.mocked(prepareRefundForCapturedPayment).mockResolvedValue('refund-operation');
    vi.mocked(getPrisma).mockReturnValue({
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction)),
      webhookEvent: { findUnique: vi.fn() },
    } as never);

    const response = await POST(signedRequest({
      event: 'payment.captured',
      payload: { payment: { entity: {
        id: 'pay_test',
        order_id: 'order_test',
        status: 'captured',
        amount: 2500,
        currency: 'INR',
      } } },
    }, 'evt_capture_late'));

    expect(response.status).toBe(200);
    expect(transaction.order.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.not.objectContaining({ status: 'confirmed' }),
    }));
    expect(prepareRefundForCapturedPayment).toHaveBeenCalledWith(transaction, 'order-db-id', 'pay_test', 2500);
    expect(processRefundOperation).toHaveBeenCalledWith('refund-operation');
  });
});
