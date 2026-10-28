import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPrisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/require-admin';

const reviewUpdateSchema = z.object({ is_verified: z.boolean() });

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const { id } = await params;
  const parsed = reviewUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Review update is invalid.' }, { status: 400 });
  try {
    const review = await getPrisma().review.update({
      where: { id },
      data: { isVerified: parsed.data.is_verified },
    });
    return NextResponse.json({ review: { id: review.id, is_verified: review.isVerified } });
  } catch (error) {
    console.error('Admin review update failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: 'Review could not be updated.' }, { status: 409 });
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
    await getPrisma().review.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Admin review delete failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: 'Review could not be deleted.' }, { status: 409 });
  }
}
