import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPrisma } from '@/lib/prisma';
import type { Review } from '@/lib/store-types';

const productIdSchema = z.string().trim().min(1).max(64);

export async function GET(request: Request) {
  const productId = productIdSchema.safeParse(new URL(request.url).searchParams.get('productId'));
  if (!productId.success) return NextResponse.json({ error: 'A valid product id is required.' }, { status: 400 });
  try {
    const reviews = await getPrisma().review.findMany({
      where: { productId: productId.data, product: { isActive: true } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    const result: Review[] = reviews.map((review) => ({
      id: review.id,
      rating: review.rating,
      title: review.title,
      body: review.body,
      is_verified: review.isVerified,
      created_at: review.createdAt.toISOString(),
    }));
    return NextResponse.json({ reviews: result });
  } catch (error) {
    console.error('Product review query failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: 'Reviews are temporarily unavailable.' }, { status: 503 });
  }
}
