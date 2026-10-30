import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPrisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/require-admin';
import { toOrderDto } from '@/lib/prisma-dto';

const orderStatuses = ['pending', 'confirmed', 'processing', 'out_for_delivery', 'delivered', 'cancelled', 'returned'] as const;
const paymentStatuses = ['pending', 'authorized', 'paid', 'failed', 'cancelled', 'refunded', 'pending_verification', 'rejected'] as const;

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;

  const params = new URL(request.url).searchParams;
  const status = params.get('status');
  const paymentStatus = params.get('payment_status');
  const search = params.get('search')?.trim().slice(0, 100);
  const validStatus = status && status !== 'all'
    ? z.enum(orderStatuses).safeParse(status)
    : null;
  const validPaymentStatus = paymentStatus && paymentStatus !== 'all' && paymentStatus !== 'cod'
    ? z.enum(paymentStatuses).safeParse(paymentStatus)
    : null;
  if (validStatus && !validStatus.success) {
    return NextResponse.json({ error: 'Invalid order status filter.' }, { status: 400 });
  }
  if (validPaymentStatus && !validPaymentStatus.success) {
    return NextResponse.json({ error: 'Invalid payment status filter.' }, { status: 400 });
  }

  try {
    const orders = await getPrisma().order.findMany({
      where: {
        ...(validStatus?.success ? { status: validStatus.data } : {}),
        ...(paymentStatus === 'cod' ? { paymentMethod: 'cod' as const } : {}),
        ...(validPaymentStatus?.success ? { paymentStatus: validPaymentStatus.data } : {}),
        ...(search ? { orderNumber: { contains: search, mode: 'insensitive' as const } } : {}),
      },
      include: { items: true, refundOperation: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return NextResponse.json({ orders: orders.map(toOrderDto) });
  } catch (error) {
    console.error('Admin order list failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: 'Orders are temporarily unavailable.' }, { status: 503 });
  }
}
