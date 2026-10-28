import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPrisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/require-admin';
import { rupeesToPaise } from '@/lib/money';
import { toProductDto } from '@/lib/prisma-dto';

const productSchema = z.object({
  name: z.string().trim().min(1).max(240),
  name_hi: z.string().trim().max(240).nullable().optional(),
  slug: z.string().trim().min(1).max(260).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().trim().max(10_000).nullable().optional(),
  description_hi: z.string().trim().max(10_000).nullable().optional(),
  brand: z.string().trim().max(120).nullable().optional(),
  sku: z.string().trim().max(100).nullable().optional(),
  price: z.number().finite().positive().max(500_000),
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

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  try {
    const products = await getPrisma().product.findMany({
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });
    return NextResponse.json({ products: products.map(toProductDto) });
  } catch (error) {
    console.error('Admin product list failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: 'Products are temporarily unavailable.' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const parsed = productSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Product details are invalid.' }, { status: 400 });
  try {
    const product = await getPrisma().product.create({
      data: {
        name: parsed.data.name,
        nameHi: parsed.data.name_hi || null,
        slug: parsed.data.slug,
        description: parsed.data.description || null,
        descriptionHi: parsed.data.description_hi || null,
        brand: parsed.data.brand || null,
        sku: parsed.data.sku || null,
        pricePaise: rupeesToPaise(parsed.data.price),
        originalPricePaise: parsed.data.original_price ? rupeesToPaise(parsed.data.original_price) : null,
        stockQuantity: parsed.data.stock_quantity ?? 0,
        minStockAlert: parsed.data.min_stock_alert ?? 10,
        weight: parsed.data.weight || null,
        imageUrl: parsed.data.image_url || null,
        categoryId: parsed.data.category_id || null,
        isFeatured: parsed.data.is_featured ?? false,
        isFlashSale: parsed.data.is_flash_sale ?? false,
        isActive: parsed.data.is_active ?? true,
        unit: parsed.data.unit ?? 'piece',
        discountPercent: parsed.data.discount_percent ?? 0,
        gstBasisPoints: parsed.data.gst_percent === undefined ? 500 : Math.round(parsed.data.gst_percent * 100),
        hsnCode: parsed.data.hsn_code || null,
      },
    });
    return NextResponse.json({ product: toProductDto(product) }, { status: 201 });
  } catch (error) {
    console.error('Admin product create failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: 'Product could not be created.' }, { status: 409 });
  }
}
