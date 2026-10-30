import { NextResponse } from 'next/server';
import { createHash, createHmac } from 'crypto';
import { z } from 'zod';
import { getPrisma } from '@/lib/prisma';
import { safeEqualHex } from '@/lib/razorpay-server';
import { releaseOrderInventoryInTransaction } from '@/lib/order-service';
import {
  markRefundNotApplicable,
  prepareRefundForCapturedPayment,
  processRefundOperation,
  recordRefundWebhook,
} from '@/lib/order-cancellation';

export const runtime = 'nodejs';

const paymentEventSchema = z.object({
  event: z.enum(['payment.captured', 'payment.failed']),
  payload: z.object({
    payment: z.object({
      entity: z.object({
        id: z.string().min(1).max(128),
        order_id: z.string().min(1).max(128),
        status: z.string().min(1).max(32),
        amount: z.number().int().nonnegative(),
        currency: z.string().length(3),
      }),
    }),
  }),
});

const refundEventSchema = z.object({
  event: z.enum(['refund.created', 'refund.processed', 'refund.failed']),
  payload: z.object({
    refund: z.object({
      entity: z.object({
        id: z.string().min(1).max(128),
        payment_id: z.string().min(1).max(128),
        status: z.string().min(1).max(32),
        amount: z.number().int().positive(),
        currency: z.string().length(3),
      }),
    }),
  }),
});

export async function POST(request: Request) {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret) return NextResponse.json({ error: 'Webhook is not configured.' }, { status: 503 });

  const rawBody = await request.text();
  const signature = request.headers.get('x-razorpay-signature') || '';
  const expected = createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
  if (!safeEqualHex(signature, expected)) {
    return NextResponse.json({ error: 'Invalid webhook signature.' }, { status: 400 });
  }

  let eventPayload: unknown;
  try {
    eventPayload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid webhook payload.' }, { status: 400 });
  }
  if (typeof eventPayload !== 'object' || eventPayload === null || !('event' in eventPayload)) {
    return NextResponse.json({ error: 'Invalid webhook payload.' }, { status: 400 });
  }

  const eventName = eventPayload.event;
  const paymentEvent = paymentEventSchema.safeParse(eventPayload);
  const refundEvent = refundEventSchema.safeParse(eventPayload);
  if (!paymentEvent.success && !refundEvent.success) {
    if (['payment.captured', 'payment.failed', 'refund.created', 'refund.processed', 'refund.failed'].includes(String(eventName))) {
      return NextResponse.json({ error: 'Webhook payment or refund details are invalid.' }, { status: 400 });
    }
    if (typeof eventName === 'string') return NextResponse.json({ received: true, ignored: true });
    return NextResponse.json({ error: 'Invalid webhook payload.' }, { status: 400 });
  }

  const suppliedEventId = request.headers.get('x-razorpay-event-id');
  if (suppliedEventId && !/^[A-Za-z0-9._:-]{1,128}$/.test(suppliedEventId)) {
    return NextResponse.json({ error: 'Invalid webhook event identifier.' }, { status: 400 });
  }
  const eventId = suppliedEventId || createHash('sha256').update(rawBody).digest('hex');
  const prisma = getPrisma();

  try {
    const result = await prisma.$transaction(async (transaction) => {
      const priorEvent = await transaction.webhookEvent.findUnique({ where: { eventId } });
      if (priorEvent) return { duplicate: true, orderId: null, refundOperationId: null };

      if (paymentEvent.success) {
        const event = paymentEvent.data;
        const payment = event.payload.payment.entity;
        const order = await transaction.order.findFirst({
          where: { payments: { some: { gateway: 'razorpay', gatewayOrderId: payment.order_id } } },
          include: { payments: true },
        });
        await transaction.webhookEvent.create({
          data: {
            gateway: 'razorpay',
            eventId,
            eventType: event.event,
            gatewayOrderId: payment.order_id,
            gatewayPaymentId: payment.id,
            processedAt: new Date(),
          },
        });
        if (!order) return { duplicate: false, orderId: null, refundOperationId: null };

        const paymentRecord = order.payments.find((entry) => entry.gatewayOrderId === payment.order_id);
        if (!paymentRecord) throw new Error('Razorpay payment record is missing.');
        if (payment.amount !== paymentRecord.amountPaise || payment.currency !== paymentRecord.currency) {
          throw new Error('Payment webhook does not match stored payment details.');
        }

        if (event.event === 'payment.captured') {
          if (payment.status !== 'captured' || payment.amount !== order.totalPaise || payment.currency !== order.currency) {
            throw new Error('Captured webhook does not match stored order amount.');
          }
          if (paymentRecord.gatewayPaymentId && paymentRecord.gatewayPaymentId !== payment.id) {
            throw new Error('A different Razorpay payment is already attached to this order.');
          }
          if (paymentRecord.status !== 'refunded') {
            await transaction.payment.update({
              where: { id: paymentRecord.id },
              data: {
                gatewayPaymentId: payment.id,
                status: 'paid',
                verifiedAt: paymentRecord.verifiedAt ?? new Date(),
                capturedAt: paymentRecord.capturedAt ?? new Date(),
              },
            });
            await transaction.order.update({
              where: { id: order.id },
              data: {
                paymentStatus: order.paymentStatus === 'refunded' ? 'refunded' : 'paid',
                ...(order.status === 'pending' ? { status: 'confirmed' } : {}),
              },
            });
          }
          const refundOperationId = order.status === 'cancelled' && paymentRecord.status !== 'refunded'
            ? await prepareRefundForCapturedPayment(transaction, order.id, payment.id, payment.amount)
            : null;
          return { duplicate: false, orderId: order.id, refundOperationId };
        }

        if (payment.status !== 'failed') throw new Error('Failure webhook status is invalid.');
        if (paymentRecord.gatewayPaymentId && paymentRecord.gatewayPaymentId !== payment.id) {
          return { duplicate: false, orderId: order.id, refundOperationId: null };
        }
        if (paymentRecord.status !== 'paid' && paymentRecord.status !== 'refunded' && order.paymentStatus !== 'paid' && order.paymentStatus !== 'refunded') {
          await transaction.payment.update({
            where: { id: paymentRecord.id },
            data: { gatewayPaymentId: payment.id, status: 'failed' },
          });
          await transaction.order.update({
            where: { id: order.id },
            data: { paymentStatus: 'failed' },
          });
          await markRefundNotApplicable(transaction, order.id);
          await releaseOrderInventoryInTransaction(transaction, order.id);
        }
        return { duplicate: false, orderId: order.id, refundOperationId: null };
      }

      if (!refundEvent.success) throw new Error('Refund webhook details are invalid.');
      const event = refundEvent.data;
      const refund = event.payload.refund.entity;
      const expectedStatus = event.event === 'refund.processed'
        ? 'processed'
        : event.event === 'refund.failed'
          ? 'failed'
          : ['created', 'pending'].includes(refund.status) ? refund.status : null;
      if (!expectedStatus || refund.status !== expectedStatus) {
        throw new Error('Refund webhook status does not match its event.');
      }
      await transaction.webhookEvent.create({
        data: {
          gateway: 'razorpay',
          eventId,
          eventType: event.event,
          gatewayPaymentId: refund.payment_id,
          gatewayRefundId: refund.id,
          processedAt: new Date(),
        },
      });
      const refundOperationId = await recordRefundWebhook(transaction, {
        paymentId: refund.payment_id,
        refundId: refund.id,
        amountPaise: refund.amount,
        currency: refund.currency,
        status: refund.status,
      });
      return { duplicate: false, orderId: null, refundOperationId };
    }, { isolationLevel: 'Serializable' });

    if (result.duplicate) return NextResponse.json({ received: true, duplicate: true });
    if (result.refundOperationId) {
      try {
        await processRefundOperation(result.refundOperationId);
      } catch (error) {
        console.error('Refund processing could not be completed:', error instanceof Error ? error.message : 'Unknown error');
      }
    }
    return NextResponse.json({
      received: true,
      matched: Boolean(result.orderId || result.refundOperationId),
    });
  } catch (error) {
    const duplicate = await prisma.webhookEvent.findUnique({ where: { eventId } }).catch(() => null);
    if (duplicate) return NextResponse.json({ received: true, duplicate: true });
    console.error('Razorpay webhook processing failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: 'Webhook processing failed.' }, { status: 503 });
  }
}
