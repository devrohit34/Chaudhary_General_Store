import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPrisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/require-admin';
import { toOrderDto } from '@/lib/prisma-dto';

const orderStatuses = ['pending', 'confirmed', 'processing', 'out_for_delivery', 'delivered', 'cancelled', 'returned'] as const;
const patchSchema = z.object({
  status: z.enum(orderStatuses).optional(),
  payment_status: z.enum(['paid', 'rejected']).optional(),
  upi_rejected_reason: z.string().trim().max(500).optional(),
}).refine((value) => value.status !== undefined || value.payment_status !== undefined, {
  message: 'At least one order update is required.',
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const { id } = await params;

  try {
    const order = await getPrisma().order.findUnique({ where: { id }, include: { items: true } });
    if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    return NextResponse.json({ order: toOrderDto(order) });
  } catch (error) {
    console.error('Admin order lookup failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: 'Order is temporarily unavailable.' }, { status: 503 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const { id } = await params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Order update is invalid.' }, { status: 400 });

  try {
    const prisma = getPrisma();
    const current = await prisma.order.findUnique({ where: { id }, include: { payments: true } });
    if (!current) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    const update = parsed.data;
    if (update.payment_status !== undefined) {
      const manualUpi = ['upi', 'phonepe', 'googlepay', 'paytm'].includes(current.paymentMethod);
      if (!manualUpi || current.paymentStatus !== 'pending_verification') {
        return NextResponse.json({ error: 'Only pending manual UPI payments can be reviewed here.' }, { status: 409 });
      }
    }

    const saved = await prisma.$transaction(async (transaction) => {
      const order = await transaction.order.update({
        where: { id },
        data: {
          ...(update.status ? { status: update.status } : {}),
          ...(update.status === 'delivered' ? { deliveredAt: new Date() } : {}),
          ...(update.payment_status === 'paid'
            ? {
              paymentStatus: 'paid',
              upiVerifiedAt: new Date(),
              upiRejectedReason: null,
              ...(!update.status ? { status: 'confirmed' } : {}),
            }
            : {}),
          ...(update.payment_status === 'rejected'
            ? {
              paymentStatus: 'rejected',
              upiRejectedReason: update.upi_rejected_reason || 'Payment could not be verified.',
            }
            : {}),
        },
        include: { items: true },
      });
      if (update.payment_status === 'paid' || update.payment_status === 'rejected') {
        await transaction.payment.updateMany({
          where: { orderId: id, gateway: 'manual_upi', status: 'pending' },
          data: { status: update.payment_status === 'paid' ? 'paid' : 'rejected', verifiedAt: update.payment_status === 'paid' ? new Date() : null },
        });
      }
      return order;
    });
    return NextResponse.json({ order: toOrderDto(saved) });
  } catch (error) {
    console.error('Admin order update failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: 'Order could not be updated.' }, { status: 503 });
  }
}
