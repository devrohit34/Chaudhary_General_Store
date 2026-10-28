import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/prisma';
import { clearCustomerSessionCookie, getCustomerSession } from '@/lib/customer-session';
import { hasSameOrigin } from '@/lib/request-security';

export async function GET(request: Request) {
  try {
    const session = await getCustomerSession(request);
    if (!session) return NextResponse.json({ user: null });
    const customer = await getPrisma().customer.findUnique({
      where: { id: session.id },
      select: { id: true, email: true, fullName: true, isActive: true },
    });
    if (!customer?.isActive) return NextResponse.json({ user: null }, { headers: { 'Set-Cookie': clearCustomerSessionCookie() } });
    return NextResponse.json({ user: { id: customer.id, email: customer.email, full_name: customer.fullName } });
  } catch (error) {
    console.error('Customer session lookup failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: 'Account service is temporarily unavailable.' }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  if (!hasSameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  return NextResponse.json({ success: true }, { headers: { 'Set-Cookie': clearCustomerSessionCookie() } });
}
