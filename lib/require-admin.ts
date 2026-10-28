import 'server-only';
import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/admin-session';
import { hasSameOrigin } from '@/lib/request-security';
import { getPrisma } from '@/lib/prisma';

export async function requireAdmin(request: Request) {
  const token = request.headers.get('cookie')?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('admin-token='))
    ?.slice('admin-token='.length);
  let decodedToken: string | null = null;
  if (token) {
    try {
      decodedToken = decodeURIComponent(token);
    } catch {
      decodedToken = null;
    }
  }
  const session = decodedToken ? await verifyAdminSession(decodedToken) : null;
  if (!session) {
    return { session: null, response: NextResponse.json({ error: 'Authentication required.' }, { status: 401 }) };
  }
  let admin: { role: string } | null;
  try {
    admin = await getPrisma().admin.findUnique({
      where: { email: session.email },
      select: { role: true, isActive: true },
    }).then((record) => record?.isActive ? { role: record.role } : null);
  } catch (error) {
    console.error('Admin authorization lookup failed:', error instanceof Error ? error.message : 'Unknown error');
    return { session: null, response: NextResponse.json({ error: 'Admin service is temporarily unavailable.' }, { status: 503 }) };
  }
  if (!admin || admin.role !== session.role) {
    return { session: null, response: NextResponse.json({ error: 'Authentication required.' }, { status: 401 }) };
  }

  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    if (!hasSameOrigin(request)) {
      return { session: null, response: NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 }) };
    }
  }

  return { session: { ...session, role: admin.role }, response: null };
}
