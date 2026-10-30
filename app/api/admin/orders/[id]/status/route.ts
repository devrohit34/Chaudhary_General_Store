import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPrisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/require-admin';
import { toOrderDto } from '@/lib/prisma-dto';
import { cancelOrder, OrderCancellationError, processRefundOperation } from '@/lib/order-cancellation';

const statusSchema = z.object({
  status: z.enum(['pending', 'confirmed', 'processing', 'out_for_delivery', 'delivered', 'cancelled']),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const { id } = await params;
  const parsed = statusSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid order status.' }, { status: 400 });

  try {
    const prisma = getPrisma();
    if (parsed.data.status === 'cancelled') {
      const cancellation = await cancelOrder(id, `admin:${auth.session?.email ?? 'admin'}`, 'Cancelled by administrator');
      if (cancellation.refundOperationId && cancellation.refundStatus === 'pending') {
        try {
          await processRefundOperation(cancellation.refundOperationId);
        } catch (error) {
          console.error('Refund processing could not be completed:', error instanceof Error ? error.message : 'Unknown error');
        }
      }
      const order = await prisma.order.findUnique({
        where: { id },
        include: { items: true, refundOperation: true },
      });
      if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
      return NextResponse.json({ order: toOrderDto(order) });
    }
    const current = await prisma.order.findUnique({ where: { id }, select: { status: true } });
    if (!current) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    if (current.status === 'cancelled') {
      return NextResponse.json({ error: 'Cancelled orders cannot be reactivated.' }, { status: 409 });
    }
    const changed = await prisma.order.updateMany({
      where: { id, status: current.status },
      data: {
        status: parsed.data.status,
        ...(parsed.data.status === 'delivered' ? { deliveredAt: new Date() } : {}),
      },
    });
    if (changed.count !== 1) return NextResponse.json({ error: 'The order changed. Refresh and try again.' }, { status: 409 });
    const order = await prisma.order.findUnique({
      where: { id },
      include: { items: true, refundOperation: true },
    });
    if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    return NextResponse.json({ order: toOrderDto(order) });
  } catch (error) {
    if (error instanceof OrderCancellationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Admin order status update failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: 'Order status could not be updated.' }, { status: 503 });
  }
}
