import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPrisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/require-admin';
import { toCategoryDto } from '@/lib/prisma-dto';

const categorySchema = z.object({
  name: z.string().trim().min(1).max(120),
  name_hi: z.string().trim().max(120).nullable().optional(),
  slug: z.string().trim().min(1).max(140).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  icon: z.string().trim().max(32).nullable().optional(),
  image_url: z.string().trim().max(2048).nullable().optional(),
  description: z.string().trim().max(1000).nullable().optional(),
});

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  try {
    const categories = await getPrisma().category.findMany({ orderBy: { sortOrder: 'asc' }, take: 500 });
    return NextResponse.json({ categories: categories.map(toCategoryDto) });
  } catch (error) {
    console.error('Admin category list failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: 'Categories are temporarily unavailable.' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const parsed = categorySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Category details are invalid.' }, { status: 400 });
  try {
    const category = await getPrisma().category.create({
      data: {
        name: parsed.data.name,
        nameHi: parsed.data.name_hi || null,
        slug: parsed.data.slug,
        icon: parsed.data.icon || null,
        imageUrl: parsed.data.image_url || null,
        description: parsed.data.description || null,
      },
    });
    return NextResponse.json({ category: toCategoryDto(category) }, { status: 201 });
  } catch (error) {
    console.error('Admin category create failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: 'Category could not be created.' }, { status: 409 });
  }
}
