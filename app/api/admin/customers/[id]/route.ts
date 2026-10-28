import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/require-admin';
import { toOrderDto } from '@/lib/prisma-dto';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const { id } = await params;
  try {
    const orders = await getPrisma().order.findMany({
      where: { customerId: id },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    return NextResponse.json({ orders: orders.map(toOrderDto) });
  } catch (error) {
    console.error('Admin customer order lookup failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: 'Customer order history is temporarily unavailable.' }, { status: 503 });
  }
}
