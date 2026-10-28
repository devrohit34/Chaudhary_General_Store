import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPrisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/require-admin';
import { rupeesToPaise } from '@/lib/money';
import { toProductDto } from '@/lib/prisma-dto';

const patchSchema = z.object({
  name: z.string().trim().min(1).max(240).optional(),
  name_hi: z.string().trim().max(240).nullable().optional(),
  slug: z.string().trim().min(1).max(260).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  description: z.string().trim().max(10_000).nullable().optional(),
  brand: z.string().trim().max(120).nullable().optional(),
  sku: z.string().trim().max(100).nullable().optional(),
  price: z.number().finite().positive().max(500_000).optional(),
  original_price: z.number().finite().positive().max(500_000).nullable().optional(),
  stock_quantity: z.number().int().min(0).max(1_000_000).optional(),
  min_stock_alert: z.number().int().min(0).max(1_000_000).optional(),
  weight: z.string().trim().max(100).nullable().optional(),
  image_url: z.string().trim().max(2048).nullable().optional(),
  category_id: z.string().trim().max(64).nullable().optional(),
  is_featured: z.boolean().optional(),
  is_flash_sale: z.boolean().optional(),
  is_active: z.boolean().optional(),
  unit: z.string().trim().min(1).max(60).optional(),
  discount_percent: z.number().int().min(0).max(100).optional(),
  gst_percent: z.number().finite().min(0).max(100).optional(),
  hsn_code: z.string().trim().max(32).nullable().optional(),
}).strict();

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const { id } = await params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || Object.keys(parsed.data || {}).length === 0) {
    return NextResponse.json({ error: 'Product details are invalid.' }, { status: 400 });
  }

  const input = parsed.data;
  try {
    const product = await getPrisma().product.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.name_hi !== undefined ? { nameHi: input.name_hi } : {}),
        ...(input.slug !== undefined ? { slug: input.slug } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.brand !== undefined ? { brand: input.brand } : {}),
        ...(input.sku !== undefined ? { sku: input.sku } : {}),
        ...(input.price !== undefined ? { pricePaise: rupeesToPaise(input.price) } : {}),
        ...(input.original_price !== undefined ? { originalPricePaise: input.original_price === null ? null : rupeesToPaise(input.original_price) } : {}),
        ...(input.stock_quantity !== undefined ? { stockQuantity: input.stock_quantity } : {}),
        ...(input.min_stock_alert !== undefined ? { minStockAlert: input.min_stock_alert } : {}),
        ...(input.weight !== undefined ? { weight: input.weight } : {}),
        ...(input.image_url !== undefined ? { imageUrl: input.image_url } : {}),
        ...(input.category_id !== undefined ? { categoryId: input.category_id } : {}),
        ...(input.is_featured !== undefined ? { isFeatured: input.is_featured } : {}),
        ...(input.is_flash_sale !== undefined ? { isFlashSale: input.is_flash_sale } : {}),
        ...(input.is_active !== undefined ? { isActive: input.is_active } : {}),
        ...(input.unit !== undefined ? { unit: input.unit } : {}),
        ...(input.discount_percent !== undefined ? { discountPercent: input.discount_percent } : {}),
        ...(input.gst_percent !== undefined ? { gstBasisPoints: Math.round(input.gst_percent * 100) } : {}),
        ...(input.hsn_code !== undefined ? { hsnCode: input.hsn_code } : {}),
      },
    });
    return NextResponse.json({ product: toProductDto(product) });
  } catch (error) {
    console.error('Admin product update failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: 'Product could not be updated.' }, { status: 409 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const { id } = await params;
  try {
    await getPrisma().product.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Admin product delete failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: 'Product could not be deleted.' }, { status: 409 });
  }
}
