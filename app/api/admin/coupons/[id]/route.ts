import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/require-admin';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const { id } = await params;
  try {
    await getPrisma().coupon.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Admin coupon delete failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: 'Coupon could not be deleted.' }, { status: 409 });
  }
}
