import { NextResponse } from 'next/server';
import { createHash, createHmac } from 'crypto';
import { z } from 'zod';
import { getPrisma } from '@/lib/prisma';
import { releaseOrderInventory } from '@/lib/order-service';
import { safeEqualHex } from '@/lib/razorpay-server';

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

  if (
    typeof eventPayload !== 'object' ||
    eventPayload === null ||
    !('event' in eventPayload) ||
    (eventPayload.event !== 'payment.captured' && eventPayload.event !== 'payment.failed')
  ) {
    return NextResponse.json({ received: true, ignored: true });
  }

  const parsedEvent = paymentEventSchema.safeParse(eventPayload);
  if (!parsedEvent.success) {
    return NextResponse.json({ error: 'Webhook payment details are invalid.' }, { status: 400 });
  }
  const event = parsedEvent.data;
  const payment = event.payload.payment.entity;

  const gatewayEventId = request.headers.get('x-razorpay-event-id') ||
    createHash('sha256').update(rawBody).digest('hex');
  const prisma = getPrisma();
  try {
    const result = await prisma.$transaction(async (transaction) => {
      const priorEvent = await transaction.webhookEvent.findUnique({ where: { eventId: gatewayEventId } });
      if (priorEvent) return { duplicate: true, orderId: null };

      const order = await transaction.order.findFirst({
        where: { payments: { some: { gateway: 'razorpay', gatewayOrderId: payment.order_id } } },
        include: { payments: true },
      });
      await transaction.webhookEvent.create({
        data: {
          gateway: 'razorpay',
          eventId: gatewayEventId,
          eventType: event.event,
          gatewayOrderId: payment.order_id,
          gatewayPaymentId: payment.id,
          processedAt: new Date(),
        },
      });
      if (!order) return { duplicate: false, orderId: null };

      const paymentRecord = order.payments.find((entry) => entry.gatewayOrderId === payment.order_id);
      if (!paymentRecord) throw new Error('Razorpay payment record is missing.');
      if (event.event === 'payment.captured') {
        if (
          payment.status !== 'captured' ||
          payment.currency !== order.currency ||
          Number(payment.amount) !== order.totalPaise
        ) {
          throw new Error('Captured webhook does not match stored order amount.');
        }
        if (order.paymentStatus !== 'paid') {
          if (paymentRecord.gatewayPaymentId && paymentRecord.gatewayPaymentId !== payment.id) {
            throw new Error('A different Razorpay payment is already attached to this order.');
          }
          await transaction.payment.update({
            where: { id: paymentRecord.id },
            data: {
              gatewayPaymentId: payment.id,
              status: 'paid',
              verifiedAt: new Date(),
              capturedAt: new Date(),
            },
          });
          await transaction.order.update({
            where: { id: order.id },
            data: { paymentStatus: 'paid', status: 'confirmed' },
          });
        }
        return { duplicate: false, orderId: order.id };
      }

      if (payment.status !== 'failed') throw new Error('Failure webhook status is invalid.');
      return { duplicate: false, orderId: order.id };
    }, { isolationLevel: 'Serializable' });

    if (result.duplicate) return NextResponse.json({ received: true, duplicate: true });
    return NextResponse.json({ received: true, matched: Boolean(result.orderId) });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unique constraint')) {
      return NextResponse.json({ received: true, duplicate: true });
    }
    console.error('Razorpay webhook processing failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: 'Webhook processing failed.' }, { status: 503 });
  }
}
