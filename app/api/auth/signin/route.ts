import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getPrisma } from '@/lib/prisma';
import { createCustomerSession, customerSessionCookie } from '@/lib/customer-session';
import { hasSameOrigin } from '@/lib/request-security';

const signinSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(72),
});

export async function POST(request: Request) {
  if (!hasSameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  const parsed = signinSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Enter a valid email and password.' }, { status: 400 });

  try {
    const customer = await getPrisma().customer.findUnique({
      where: { email: parsed.data.email.toLowerCase() },
    });
    if (!customer || !customer.isActive || !(await bcrypt.compare(parsed.data.password, customer.passwordHash))) {
      return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
    }
    const token = await createCustomerSession(customer);
    return NextResponse.json(
      { user: { id: customer.id, email: customer.email, full_name: customer.fullName } },
      { headers: { 'Set-Cookie': customerSessionCookie(token) } }
    );
  } catch (error) {
    console.error('Customer sign-in failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: 'Sign-in is temporarily unavailable.' }, { status: 503 });
  }
}
