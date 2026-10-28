import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/require-admin';
import { toOrderDto } from '@/lib/prisma-dto';

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const start = new Date();
  start.setMonth(start.getMonth() - 6);
  try {
    const orders = await getPrisma().order.findMany({
      where: { createdAt: { gte: start } },
      include: { items: true },
      orderBy: { createdAt: 'asc' },
      take: 20_000,
    });
    return NextResponse.json({ orders: orders.map(toOrderDto) });
  } catch (error) {
    console.error('Admin report query failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: 'Reports are temporarily unavailable.' }, { status: 503 });
  }
}
