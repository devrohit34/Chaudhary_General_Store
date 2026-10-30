import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPrisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/require-admin';
import { toOrderDto } from '@/lib/prisma-dto';

const paymentActionSchema = z.object({
  action: z.enum(['approve', 'reject']),
  reason: z.string().trim().max(500).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const { id } = await params;
  const parsed = paymentActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid payment action.' }, { status: 400 });

  try {
    const prisma = getPrisma();
    const current = await prisma.order.findUnique({ where: { id }, include: { items: true } });
    if (!current) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    if (current.status === 'cancelled') {
      return NextResponse.json({ error: 'Cancelled order payments cannot be reviewed here.' }, { status: 409 });
    }
    if (
      !['upi', 'phonepe', 'googlepay', 'paytm'].includes(current.paymentMethod) ||
      current.paymentStatus !== 'pending_verification'
    ) {
      return NextResponse.json({ error: 'Only pending manual UPI payments can be reviewed.' }, { status: 409 });
    }

    const now = new Date();
    const saved = await prisma.$transaction(async (transaction) => {
      const changed = await transaction.order.updateMany({
        where: { id, status: current.status, paymentStatus: 'pending_verification' },
        data: parsed.data.action === 'approve'
          ? {
            paymentStatus: 'paid',
            upiVerifiedAt: now,
            upiRejectedReason: null,
            ...(current.status === 'pending' ? { status: 'confirmed' } : {}),
          }
          : {
            paymentStatus: 'rejected',
            upiRejectedReason: parsed.data.reason || 'Payment could not be verified.',
          },
      });
      if (changed.count !== 1) throw new Error('Order changed before payment review completed.');
      await transaction.payment.updateMany({
        where: { orderId: id, gateway: 'manual_upi', status: 'pending' },
        data: {
          status: parsed.data.action === 'approve' ? 'paid' : 'rejected',
          verifiedAt: parsed.data.action === 'approve' ? now : null,
        },
      });
      const order = await transaction.order.findUnique({
        where: { id },
        include: { items: true, refundOperation: true },
      });
      if (!order) throw new Error('Reviewed order could not be reloaded.');
      return order;
    });

    return NextResponse.json({
      order: toOrderDto(saved),
      message: parsed.data.action === 'approve' ? 'Payment approved successfully.' : 'Payment rejected.',
    });
  } catch (error) {
    console.error('Admin payment review failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: 'Payment could not be reviewed.' }, { status: 503 });
  }
}
