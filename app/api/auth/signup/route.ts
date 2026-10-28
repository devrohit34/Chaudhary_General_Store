import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getPrisma } from '@/lib/prisma';
import { createCustomerSession, customerSessionCookie } from '@/lib/customer-session';
import { hasSameOrigin } from '@/lib/request-security';

const signupSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(10).max(72),
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(24).optional().default(''),
});

export async function POST(request: Request) {
  if (!hasSameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  const parsed = signupSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Check the account details and password requirements.' }, { status: 400 });

  try {
    const email = parsed.data.email.toLowerCase();
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const customer = await getPrisma().customer.create({
      data: { email, passwordHash, fullName: parsed.data.fullName, phone: parsed.data.phone || null },
      select: { id: true, email: true, fullName: true },
    });
    const token = await createCustomerSession(customer);
    return NextResponse.json(
      { user: { id: customer.id, email: customer.email, full_name: customer.fullName } },
      { status: 201, headers: { 'Set-Cookie': customerSessionCookie(token) } }
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unique constraint')) {
      return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 409 });
    }
    console.error('Customer signup failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: 'Account creation is temporarily unavailable.' }, { status: 503 });
  }
}
