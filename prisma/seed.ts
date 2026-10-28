import '../scripts/load-env';
import { readFile } from 'fs/promises';
import path from 'path';
import { z } from 'zod';
import { getPrisma } from '../lib/prisma-client';
import { rupeesToPaise } from '../lib/money';

const categorySchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
  name_hi: z.string().nullable().optional(),
  slug: z.string().min(1).max(140),
  icon: z.string().nullable().optional(),
  image_url: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  sort_order: z.number().int().optional(),
  is_active: z.boolean().optional(),
});

const productSchema = z.object({
  id: z.string().min(1).max(64),
  category_id: z.string().nullable().optional(),
  name: z.string().min(1).max(240),
  name_hi: z.string().nullable().optional(),
  slug: z.string().min(1).max(260),
  description: z.string().nullable().optional(),
  description_hi: z.string().nullable().optional(),
  brand: z.string().nullable().optional(),
  sku: z.string().nullable().optional(),
  price: z.coerce.number().finite().nonnegative(),
  original_price: z.coerce.number().finite().nonnegative().nullable().optional(),
  discount_percent: z.number().int().min(0).max(100).optional(),
  unit: z.string().optional(),
  weight: z.string().nullable().optional(),
  stock_quantity: z.number().int().nonnegative().optional(),
  min_stock_alert: z.number().int().nonnegative().optional(),
  image_url: z.string().nullable().optional(),
  images: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  is_active: z.boolean().optional(),
  is_featured: z.boolean().optional(),
  is_flash_sale: z.boolean().optional(),
  flash_sale_price: z.coerce.number().finite().nonnegative().nullable().optional(),
  flash_sale_ends_at: z.string().nullable().optional(),
  rating: z.number().finite().min(0).max(5).optional(),
  review_count: z.number().int().nonnegative().optional(),
  gst_percent: z.number().finite().min(0).max(100).optional(),
  hsn_code: z.string().nullable().optional(),
});

const seedSchema = z.object({
  categories: z.array(categorySchema),
  products: z.array(productSchema),
});

async function seed() {
  const raw = await readFile(path.join(process.cwd(), 'data', 'local-seed.json'), 'utf8');
  const document = seedSchema.parse(JSON.parse(raw));
  const prisma = getPrisma();
  const categoryIds = new Set(document.categories.map((category) => category.id));

  await prisma.category.createMany({
    data: document.categories.map((category) => ({
      id: category.id,
      name: category.name,
      nameHi: category.name_hi ?? null,
      slug: category.slug,
      icon: category.icon ?? null,
      imageUrl: category.image_url ?? null,
      description: category.description ?? null,
      sortOrder: category.sort_order ?? 0,
      isActive: category.is_active ?? true,
    })),
    skipDuplicates: true,
  });

  const productsBySlug = new Set<string>();
  const products = document.products.map((product, index) => {
    let slug = product.slug;
    if (productsBySlug.has(slug)) slug = `${slug}-${index + 1}`;
    while (productsBySlug.has(slug)) slug = `${slug}-${index + 1}`;
    productsBySlug.add(slug);
    if (product.category_id && !categoryIds.has(product.category_id)) {
      throw new Error(`Seed product ${product.id} references an unknown category.`);
    }
    return {
      id: product.id,
      categoryId: product.category_id ?? null,
      name: product.name,
      nameHi: product.name_hi ?? null,
      slug,
      description: product.description ?? null,
      descriptionHi: product.description_hi ?? null,
      brand: product.brand ?? null,
      sku: product.sku ?? null,
      pricePaise: rupeesToPaise(product.price),
      originalPricePaise: product.original_price == null ? null : rupeesToPaise(product.original_price),
      discountPercent: product.discount_percent ?? 0,
      unit: product.unit ?? 'piece',
      weight: product.weight ?? null,
      stockQuantity: product.stock_quantity ?? 0,
      minStockAlert: product.min_stock_alert ?? 10,
      imageUrl: product.image_url ?? null,
      images: product.images ?? [],
      tags: product.tags ?? [],
      isActive: product.is_active ?? true,
      isFeatured: product.is_featured ?? false,
      isFlashSale: product.is_flash_sale ?? false,
      flashSalePricePaise: product.flash_sale_price == null ? null : rupeesToPaise(product.flash_sale_price),
      flashSaleEndsAt: product.flash_sale_ends_at ? new Date(product.flash_sale_ends_at) : null,
      rating: product.rating ?? 0,
      reviewCount: product.review_count ?? 0,
      gstBasisPoints: Math.round((product.gst_percent ?? 5) * 100),
      hsnCode: product.hsn_code ?? null,
    };
  });

  await prisma.product.createMany({ data: products, skipDuplicates: true });
  console.log(`Seeded ${document.categories.length} categories and ${products.length} products when missing.`);
  await prisma.$disconnect();
}

seed().catch((error: unknown) => {
  console.error('Neon seed failed:', error instanceof Error ? error.message : 'Unknown error');
  process.exitCode = 1;
});
