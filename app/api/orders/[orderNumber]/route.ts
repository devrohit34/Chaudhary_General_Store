import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/prisma';
import { getCustomerSession } from '@/lib/customer-session';
import { hasOrderAccessToken, requestOrderAccessToken } from '@/lib/order-access';
import { toOrderDto } from '@/lib/prisma-dto';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ orderNumber: string }> }
) {
  try {
    const { orderNumber } = await params;
    const order = await getPrisma().order.findUnique({
      where: { orderNumber },
      include: { items: true, refundOperation: true },
    });
    if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });

    const customerSession = await getCustomerSession(request);
    const tokenAllowed = hasOrderAccessToken(requestOrderAccessToken(request, orderNumber), order.guestAccessTokenHash);
    if (!tokenAllowed && customerSession?.id !== order.customerId) {
      return NextResponse.json({ error: 'Order access is not authorized.' }, { status: 403 });
    }
    return NextResponse.json({ order: toOrderDto(order) });
  } catch (error) {
    console.error('Order lookup failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: 'Order details are temporarily unavailable.' }, { status: 503 });
  }
}
