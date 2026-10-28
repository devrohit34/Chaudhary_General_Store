import './load-env';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { getPrisma } from '../lib/prisma-client';
import { rupeesToPaise } from '../lib/money';

const categorySchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(140),
  sort_order: z.number().int().optional(),
  is_active: z.boolean().optional(),
});

const productSchema = z.object({
  id: z.string().min(1).max(64),
  category_id: z.string().min(1).max(64),
  name: z.string().min(1).max(240),
  slug: z.string().min(1).max(260),
  brand: z.string().nullable().optional(),
  price: z.coerce.number().finite().nonnegative(),
  original_price: z.coerce.number().finite().nonnegative().nullable().optional(),
  unit: z.string().optional(),
  weight: z.string().nullable().optional(),
  stock_quantity: z.number().int().nonnegative().optional(),
  image_url: z.string().url().nullable().optional(),
  is_active: z.boolean().optional(),
  is_featured: z.boolean().optional(),
});

const showcaseSchema = z.object({
  categories: z.array(categorySchema),
  products: z.array(productSchema),
});

async function seedShowcaseProducts() {
  const jsonPath = path.join(process.cwd(), 'data', 'showcase-products.json');
  const data = showcaseSchema.parse(JSON.parse(await readFile(jsonPath, 'utf8')));
  const categoryIds = new Set(data.categories.map(({ id }) => id));

  for (const product of data.products) {
    if (!categoryIds.has(product.category_id)) {
      throw new Error(`Showcase product ${product.id} references an unknown category.`);
    }
  }

  const prisma = getPrisma();
  try {
    const result = await prisma.$transaction(async (transaction) => {
      const categories = await transaction.category.createMany({
        data: data.categories.map((category) => ({
          id: category.id,
          name: category.name,
          slug: category.slug,
          sortOrder: category.sort_order ?? 0,
          isActive: category.is_active ?? true,
        })),
        skipDuplicates: true,
      });

      const products = await transaction.product.createMany({
        data: data.products.map((product) => ({
          id: product.id,
          categoryId: product.category_id,
          name: product.name,
          slug: product.slug,
          brand: product.brand ?? null,
          pricePaise: rupeesToPaise(product.price),
          originalPricePaise: product.original_price == null ? null : rupeesToPaise(product.original_price),
          unit: product.unit ?? 'piece',
          weight: product.weight ?? null,
          stockQuantity: product.stock_quantity ?? 0,
          imageUrl: product.image_url ?? null,
          isActive: product.is_active ?? true,
          isFeatured: product.is_featured ?? false,
        })),
        skipDuplicates: true,
      });
      return { categories: categories.count, products: products.count };
    });

    console.log(`Added ${result.categories} categories and ${result.products} showcase products.`);
  } finally {
    await prisma.$disconnect();
  }
}

seedShowcaseProducts().catch((error: unknown) => {
  console.error('Showcase product seeding failed:', error instanceof Error ? error.message : 'Unknown error');
  process.exitCode = 1;
});
