import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPrisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/require-admin';
import { rupeesToPaise } from '@/lib/money';
import { toCouponDto } from '@/lib/prisma-dto';

const couponSchema = z.object({
  code: z.string().trim().min(3).max(40).regex(/^[A-Z0-9_-]+$/),
  description: z.string().trim().max(500).nullable().optional(),
  discount_type: z.enum(['percent', 'fixed']),
  discount_value: z.number().finite().positive().max(500_000),
  min_order_amount: z.number().finite().min(0).max(500_000).optional().default(0),
  max_discount: z.number().finite().positive().max(500_000).nullable().optional(),
  is_active: z.boolean().optional().default(true),
});

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  try {
    const coupons = await getPrisma().coupon.findMany({ orderBy: { createdAt: 'desc' }, take: 500 });
    return NextResponse.json({ coupons: coupons.map(toCouponDto) });
  } catch (error) {
    console.error('Admin coupon list failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: 'Coupons are temporarily unavailable.' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const parsed = couponSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || (parsed.data?.discount_type === 'percent' && parsed.data.discount_value > 100)) {
    return NextResponse.json({ error: 'Coupon details are invalid.' }, { status: 400 });
  }
  try {
    const input = parsed.data;
    const coupon = await getPrisma().coupon.create({
      data: {
        code: input.code.toUpperCase(),
        description: input.description || null,
        discountType: input.discount_type,
        discountValue: input.discount_type === 'fixed' ? rupeesToPaise(input.discount_value) : Math.round(input.discount_value),
        minOrderPaise: rupeesToPaise(input.min_order_amount),
        maxDiscountPaise: input.max_discount === undefined || input.max_discount === null
          ? null
          : rupeesToPaise(input.max_discount),
        isActive: input.is_active,
      },
    });
    return NextResponse.json({ coupon: toCouponDto(coupon) }, { status: 201 });
  } catch (error) {
    console.error('Admin coupon create failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: 'Coupon could not be created.' }, { status: 409 });
  }
}
