import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPrisma } from '@/lib/prisma';
import { checkoutSchemaBase, validateDeliverySelection } from '@/lib/checkout-validation';
import { createCheckoutOrder, CheckoutError } from '@/lib/order-service';
import { getActiveCustomer } from '@/lib/customer-auth';
import { toOrderDto } from '@/lib/prisma-dto';
import { orderAccessCookie } from '@/lib/order-access';
import { hasSameOrigin } from '@/lib/request-security';

const requestSchema = checkoutSchemaBase.extend({
  paymentMethod: z.enum(['cod', 'upi', 'phonepe', 'googlepay', 'paytm']),
}).superRefine(validateDeliverySelection);

export async function POST(request: Request) {
  if (!hasSameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Check the delivery address and cart details.' }, { status: 400 });
  const idempotencyKey = request.headers.get('idempotency-key')?.trim();
  if (!idempotencyKey || !z.string().uuid().safeParse(idempotencyKey).success) {
    return NextResponse.json({ error: 'A valid checkout request key is required.' }, { status: 400 });
  }

  try {
    const customer = await getActiveCustomer(request);
    if (!customer) return NextResponse.json({ error: 'Sign in to place an order.' }, { status: 401 });
    const result = await createCheckoutOrder(
      parsed.data,
      parsed.data.paymentMethod,
      idempotencyKey,
      customer
    );
    if (result.alreadyExists) {
      return NextResponse.json({ error: 'This checkout request was already submitted.' }, { status: 409 });
    }

    const order = result.order;
    const response = NextResponse.json({
      order: toOrderDto(order),
    }, { status: 201 });
    response.headers.append('Set-Cookie', orderAccessCookie(order.orderNumber, result.orderAccessToken));
    return response;
  } catch (error) {
    if (error instanceof CheckoutError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('Order creation failed:', {
      paymentMethod: parsed.data.paymentMethod,
      itemCount: parsed.data.items.length,
      error: error instanceof Error ? error.message : 'Unknown error',
      code: typeof error === 'object' && error !== null && 'code' in error
        ? error.code
        : undefined,
    });
    return NextResponse.json({ error: 'Could not place your order. Please try again.' }, { status: 503 });
  }
}

export async function GET(request: Request) {
  try {
    const customer = await getActiveCustomer(request);
    if (!customer) return NextResponse.json({ error: 'Sign in to view your orders.' }, { status: 401 });
    const orders = await getPrisma().order.findMany({
      where: { customerId: customer.id },
      include: { items: true, refundOperation: true },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ orders: orders.map(toOrderDto) });
  } catch (error) {
    console.error('Customer order lookup failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: 'Orders are temporarily unavailable.' }, { status: 503 });
  }
}
