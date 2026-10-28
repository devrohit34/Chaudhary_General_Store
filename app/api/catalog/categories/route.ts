import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/prisma';
import { toCategoryDto } from '@/lib/prisma-dto';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const slug = url.searchParams.get('slug');
    const categories = await getPrisma().category.findMany({
      where: { isActive: true, ...(slug ? { slug } : {}) },
      orderBy: { sortOrder: 'asc' },
      take: 100,
    });
    return NextResponse.json({ categories: categories.map(toCategoryDto) });
  } catch (error) {
    console.error('Category catalog query failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: 'Category catalog is temporarily unavailable.' }, { status: 503 });
  }
}
