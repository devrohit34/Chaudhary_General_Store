import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPrisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/require-admin';
import { toCategoryDto } from '@/lib/prisma-dto';

const categoryPatchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  name_hi: z.string().trim().max(120).nullable().optional(),
  slug: z.string().trim().min(1).max(140).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  icon: z.string().trim().max(32).nullable().optional(),
  image_url: z.string().trim().max(2048).nullable().optional(),
  description: z.string().trim().max(1000).nullable().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const { id } = await params;
  const parsed = categoryPatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || Object.keys(parsed.data || {}).length === 0) {
    return NextResponse.json({ error: 'Category details are invalid.' }, { status: 400 });
  }
  try {
    const category = await getPrisma().category.update({
      where: { id },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.name_hi !== undefined ? { nameHi: parsed.data.name_hi } : {}),
        ...(parsed.data.slug !== undefined ? { slug: parsed.data.slug } : {}),
        ...(parsed.data.icon !== undefined ? { icon: parsed.data.icon } : {}),
        ...(parsed.data.image_url !== undefined ? { imageUrl: parsed.data.image_url } : {}),
        ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
      },
    });
    return NextResponse.json({ category: toCategoryDto(category) });
  } catch (error) {
    console.error('Admin category update failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: 'Category could not be updated.' }, { status: 409 });
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
    await getPrisma().category.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Admin category delete failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: 'Category could not be deleted.' }, { status: 409 });
  }
}
