import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/require-admin';
import { toOrderDto } from '@/lib/prisma-dto';

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;

  try {
    const prisma = getPrisma();
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const recentStart = new Date(today);
    recentStart.setDate(recentStart.getDate() - 13);

    const [
      products,
      totalOrders,
      todayOrderCount,
      pendingOrders,
      completedOrders,
      revenue,
      todayRevenue,
      customers,
      lowStock,
      recentOrders,
      chartOrders,
      statusCounts,
    ] = await Promise.all([
      prisma.product.count(),
      prisma.order.count(),
      prisma.order.count({ where: { createdAt: { gte: today } } }),
      prisma.order.count({ where: { status: { in: ['pending', 'confirmed', 'processing'] } } }),
      prisma.order.count({ where: { status: 'delivered' } }),
      prisma.order.aggregate({ _sum: { totalPaise: true } }),
      prisma.order.aggregate({ where: { createdAt: { gte: today } }, _sum: { totalPaise: true } }),
      prisma.customer.count(),
      prisma.product.count({ where: { stockQuantity: { lt: 10 } } }),
      prisma.order.findMany({ orderBy: { createdAt: 'desc' }, take: 6, include: { items: true } }),
      prisma.order.findMany({
        where: { createdAt: { gte: recentStart } },
        select: { status: true, totalPaise: true, createdAt: true },
      }),
      prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);

    const revenueByDate = new Map<string, number>();
    for (const order of chartOrders) {
      const key = order.createdAt.toDateString();
      revenueByDate.set(key, (revenueByDate.get(key) || 0) + order.totalPaise);
    }
    const revenueData: { day: string; revenue: number }[] = [];
    for (let offset = 13; offset >= 0; offset--) {
      const date = new Date(today);
      date.setDate(date.getDate() - offset);
      revenueData.push({
        day: date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
        revenue: (revenueByDate.get(date.toDateString()) || 0) / 100,
      });
    }

    return NextResponse.json({
      stats: {
        products,
        totalOrders,
        todayOrders: todayOrderCount,
        pendingOrders,
        completedOrders,
        revenue: (revenue._sum.totalPaise || 0) / 100,
        todayRevenue: (todayRevenue._sum.totalPaise || 0) / 100,
        customers,
        lowStock,
      },
      recentOrders: recentOrders.map(toOrderDto),
      revenueData,
      orderStatusData: statusCounts.map(({ status, _count }) => ({
        status: status.replace(/_/g, ' '),
        count: _count._all,
      })),
    });
  } catch (error) {
    console.error('Admin dashboard query failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: 'Dashboard data is temporarily unavailable.' }, { status: 503 });
  }
}
