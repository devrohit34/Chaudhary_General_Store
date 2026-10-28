import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPrisma } from '@/lib/prisma';
import { checkoutSchema } from '@/lib/checkout-validation';
import { createCheckoutOrder, CheckoutError } from '@/lib/order-service';
import { getCustomerSession } from '@/lib/customer-session';
import { toOrderDto } from '@/lib/prisma-dto';
import { orderAccessCookie } from '@/lib/order-access';
import { hasSameOrigin } from '@/lib/request-security';

const requestSchema = checkoutSchema.extend({
  paymentMethod: z.enum(['cod', 'upi', 'phonepe', 'googlepay', 'paytm']),
});

export async function POST(request: Request) {
  if (!hasSameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Check the delivery address and cart details.' }, { status: 400 });
  const idempotencyKey = request.headers.get('idempotency-key')?.trim();
  if (!idempotencyKey || !z.string().uuid().safeParse(idempotencyKey).success) {
    return NextResponse.json({ error: 'A valid checkout request key is required.' }, { status: 400 });
  }

  try {
    const session = await getCustomerSession(request);
    const customer = session
      ? await getPrisma().customer.findUnique({ where: { id: session.id }, select: { id: true, email: true, isActive: true } })
      : null;
    const result = await createCheckoutOrder(
      parsed.data,
      parsed.data.paymentMethod,
      idempotencyKey,
      customer?.isActive ? { id: customer.id, email: customer.email } : undefined
    );
    if (result.alreadyExists) {
      return NextResponse.json({ error: 'This checkout request was already submitted.' }, { status: 409 });
    }

    const order = await getPrisma().order.findUnique({
      where: { id: result.order.id },
      include: { items: true },
    });
    if (!order) throw new Error('New order could not be reloaded.');
    const response = NextResponse.json({
      order: toOrderDto(order),
    }, { status: 201 });
    response.headers.append('Set-Cookie', orderAccessCookie(order.orderNumber, result.orderAccessToken));
    return response;
  } catch (error) {
    if (error instanceof CheckoutError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('Order creation failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: 'Could not place your order. Please try again.' }, { status: 503 });
  }
}

export async function GET(request: Request) {
  try {
    const session = await getCustomerSession(request);
    if (!session) return NextResponse.json({ orders: [] });
    const orders = await getPrisma().order.findMany({
      where: { customerId: session.id },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return NextResponse.json({ orders: orders.map(toOrderDto) });
  } catch (error) {
    console.error('Customer order lookup failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: 'Orders are temporarily unavailable.' }, { status: 503 });
  }
}
