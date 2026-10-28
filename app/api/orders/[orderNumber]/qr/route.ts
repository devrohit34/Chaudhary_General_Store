import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/prisma';
import { getCustomerSession } from '@/lib/customer-session';
import { hasOrderAccessToken, requestOrderAccessToken } from '@/lib/order-access';
import { hasSameOrigin } from '@/lib/request-security';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ orderNumber: string }> }
) {
  if (!hasSameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  try {
    const { orderNumber } = await params;
    const prisma = getPrisma();
    const order = await prisma.order.findUnique({ where: { orderNumber } });
    if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });

    const session = await getCustomerSession(request);
    const guestAccess = hasOrderAccessToken(
      requestOrderAccessToken(request, orderNumber),
      order.guestAccessTokenHash
    );
    if (!guestAccess && session?.id !== order.customerId) {
      return NextResponse.json({ error: 'Order access is not authorized.' }, { status: 403 });
    }
    if (
      !['upi', 'phonepe', 'googlepay', 'paytm'].includes(order.paymentMethod) ||
      !['pending_verification', 'rejected'].includes(order.paymentStatus) ||
      order.upiVerifiedAt
    ) {
      return NextResponse.json({ error: 'A new payment QR is not available for this order.' }, { status: 409 });
    }

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: { qrCreatedAt: new Date() },
      select: { qrCreatedAt: true },
    });
    return NextResponse.json({ qrCreatedAt: updated.qrCreatedAt?.toISOString() ?? null });
  } catch (error) {
    console.error('UPI QR refresh failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: 'A new payment QR could not be generated.' }, { status: 503 });
  }
}
