import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { requireAdmin } from '@/lib/require-admin';

export const runtime = 'nodejs';

function hasValidImageSignature(type: string, bytes: Buffer) {
  if (type === 'image/jpeg') return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === 'image/png') return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return type === 'image/webp' && bytes.length > 12 &&
    bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return NextResponse.json({ error: 'Product image storage is not configured.' }, { status: 503 });

  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File) || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
        file.size < 1 || file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'Choose a JPEG, PNG, or WebP image smaller than 5 MB.' }, { status: 400 });
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    if (!hasValidImageSignature(file.type, bytes)) {
      return NextResponse.json({ error: 'The uploaded file is not a supported image.' }, { status: 400 });
    }

    const extension = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/png' ? 'png' : 'webp';
    const blob = await put(`products/${randomUUID()}.${extension}`, file, {
      access: 'public',
      addRandomSuffix: false,
      token,
      contentType: file.type,
    });
    return NextResponse.json({ url: blob.url }, { status: 201 });
  } catch (error) {
    console.error('Product image upload failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: 'Image upload is temporarily unavailable.' }, { status: 503 });
  }
}
