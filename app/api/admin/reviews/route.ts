import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/require-admin';

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  try {
    const reviews = await getPrisma().review.findMany({
      include: {
        product: { select: { name: true, imageUrl: true } },
        customer: { select: { fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });
    return NextResponse.json({
      reviews: reviews.map((review) => ({
        id: review.id,
        rating: review.rating,
        title: review.title,
        body: review.body,
        is_verified: review.isVerified,
        created_at: review.createdAt.toISOString(),
        user_id: review.customerId,
        product_id: review.productId,
        products: review.product ? { name: review.product.name, image_url: review.product.imageUrl } : null,
        user_profiles: review.customer ? { full_name: review.customer.fullName } : null,
      })),
    });
  } catch (error) {
    console.error('Admin review list failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: 'Reviews are temporarily unavailable.' }, { status: 503 });
  }
}
