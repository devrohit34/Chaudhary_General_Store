import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/prisma';
import { toProductDto } from '@/lib/prisma-dto';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    const excludeId = url.searchParams.get('excludeId');
    const ids = (url.searchParams.get('ids') || '').split(',').filter(Boolean).slice(0, 100);
    const slug = url.searchParams.get('slug');
    const search = url.searchParams.get('search')?.trim();
    const categorySlug = url.searchParams.get('category');
    const categoryId = url.searchParams.get('categoryId');
    const requestedLimit = Number(url.searchParams.get('limit') || 100);
    const take = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 100;
    const prisma = getPrisma();
    const where = {
      isActive: true,
      ...(id ? { id } : {}),
      ...(excludeId ? { id: { not: excludeId } } : {}),
      ...(ids.length ? { id: { in: ids } } : {}),
      ...(slug ? { slug } : {}),
      ...(search ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { nameHi: { contains: search, mode: 'insensitive' as const } },
          { brand: { contains: search, mode: 'insensitive' as const } },
          { description: { contains: search, mode: 'insensitive' as const } },
          { tags: { has: search.toLowerCase() } },
        ],
      } : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(categorySlug ? { category: { slug: categorySlug, isActive: true } } : {}),
    };
    const products = await prisma.product.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
    });
    return NextResponse.json({ products: products.map(toProductDto) });
  } catch (error) {
    console.error('Product catalog query failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: 'Product catalog is temporarily unavailable.' }, { status: 503 });
  }
}
