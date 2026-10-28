import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getPrisma } from '@/lib/prisma';
import { createAdminSession } from '@/lib/admin-session';
import { hasSameOrigin } from '@/lib/request-security';

export async function POST(request: Request) {
  if (!hasSameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  try {
    const body = z.object({
      email: z.string().email().max(254),
      password: z.string().min(1).max(72),
    }).safeParse(await request.json());
    if (!body.success) return NextResponse.json({ error: 'Enter a valid email and password.' }, { status: 400 });

    const admin = await getPrisma().admin.findUnique({
      where: { email: body.data.email.trim().toLowerCase() },
    });
    if (!admin || !admin.isActive || !(await bcrypt.compare(body.data.password, admin.passwordHash))) {
      return NextResponse.json({ error: 'Invalid credentials.' }, { status: 401 });
    }

    if (!process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_SESSION_SECRET.length < 32) {
      return NextResponse.json({ error: 'Admin authentication is not configured.' }, { status: 503 });
    }
    const token = await createAdminSession(admin.email, admin.role);
    await getPrisma().admin.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });

    const response = NextResponse.json({ success: true });
    response.cookies.set('admin-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 12 * 60 * 60,
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Admin login failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: 'Admin sign-in is temporarily unavailable.' }, { status: 503 });
  }
}
