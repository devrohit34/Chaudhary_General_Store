import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPrisma } from '@/lib/prisma';
import { getCustomerSession } from '@/lib/customer-session';
import { hasOrderAccessToken, requestOrderAccessToken } from '@/lib/order-access';
import { hasSameOrigin } from '@/lib/request-security';
import { toOrderDto } from '@/lib/prisma-dto';
import { CANCELLATION_REASONS } from '@/lib/order-cancellation-policy';
import { cancelOrder, OrderCancellationError, processRefundOperation } from '@/lib/order-cancellation';

export const runtime = 'nodejs';

const requestSchema = z.object({
  reason: z.enum(CANCELLATION_REASONS),
  details: z.string().trim().max(250).optional(),
}).refine((value) => value.reason !== 'Other' || Boolean(value.details && value.details.length >= 3), {
  message: 'Please provide a short cancellation reason.',
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderNumber: string }> }
) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Choose a valid cancellation reason.' }, { status: 400 });
  }

  try {
    const { orderNumber } = await params;
    const prisma = getPrisma();
    const accessOrder = await prisma.order.findUnique({
      where: { orderNumber },
      select: { id: true, customerId: true, guestAccessTokenHash: true },
    });
    const session = await getCustomerSession(request);
    const guestAccessAllowed = hasOrderAccessToken(
      requestOrderAccessToken(request, orderNumber),
      accessOrder?.guestAccessTokenHash ?? null
    );
    if (!accessOrder || (!guestAccessAllowed && session?.id !== accessOrder.customerId)) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }

    const reason = parsed.data.reason === 'Other'
      ? `Other: ${parsed.data.details}`
      : parsed.data.reason;
    const result = await cancelOrder(accessOrder.id, session ? 'customer' : 'guest', reason);

    if (result.refundOperationId && result.refundStatus === 'pending') {
      try {
        await processRefundOperation(result.refundOperationId);
      } catch (error) {
        console.error('Refund processing could not be completed:', error instanceof Error ? error.message : 'Unknown error');
      }
    }

    const order = await prisma.order.findUnique({
      where: { id: result.orderId },
      include: { items: true, refundOperation: true },
    });
    if (!order) throw new Error('Cancelled order could not be reloaded.');
    return NextResponse.json({
      order: toOrderDto(order),
      message: 'Order cancelled. Any eligible online refund is tracked separately.',
    });
  } catch (error) {
    if (error instanceof OrderCancellationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Order cancellation failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: 'The order could not be cancelled right now.' }, { status: 503 });
  }
}
