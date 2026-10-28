import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/require-admin';

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  try {
    const prisma = getPrisma();
    const [customers, orderStats] = await Promise.all([
      prisma.customer.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5000,
        select: { id: true, fullName: true, phone: true, createdAt: true },
      }),
      prisma.order.groupBy({
        by: ['customerId'],
        where: { customerId: { not: null } },
        _count: { _all: true },
        _sum: { totalPaise: true },
      }),
    ]);
    const statsByCustomer = new Map(
      orderStats.map((stats) => [stats.customerId, {
        count: stats._count._all,
        total: (stats._sum.totalPaise || 0) / 100,
      }])
    );
    return NextResponse.json({
      customers: customers.map((customer) => ({
        id: customer.id,
        full_name: customer.fullName,
        phone: customer.phone,
        loyalty_points: 0,
        created_at: customer.createdAt.toISOString(),
        ...(statsByCustomer.get(customer.id) || { count: 0, total: 0 }),
      })),
    });
  } catch (error) {
    console.error('Admin customer list failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: 'Customers are temporarily unavailable.' }, { status: 503 });
  }
}
