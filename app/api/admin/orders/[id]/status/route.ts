import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPrisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/require-admin';
import { toOrderDto } from '@/lib/prisma-dto';

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
    const order = await getPrisma().order.update({
      where: { id },
      data: {
        status: parsed.data.status,
        ...(parsed.data.status === 'delivered' ? { deliveredAt: new Date() } : {}),
      },
      include: { items: true },
    });
    return NextResponse.json({ order: toOrderDto(order) });
  } catch (error) {
    console.error('Admin order status update failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: 'Order status could not be updated.' }, { status: 503 });
  }
}
