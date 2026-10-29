
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPrisma } from '@/lib/prisma';
import { getRazorpayConfig, razorpayAuth } from '@/lib/razorpay-server';
import { checkoutSchema } from '@/lib/checkout-validation';
import {
  createCheckoutOrder,
  CheckoutError,
  releaseOrderInventory,
} from '@/lib/order-service';
import { getCustomerSession } from '@/lib/customer-session';
import { orderAccessCookie } from '@/lib/order-access';
import { hasSameOrigin } from '@/lib/request-security';

export const runtime = 'nodejs';

const requestSchema = checkoutSchema;

export async function POST(request: Request) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json(
      { error: 'Invalid request origin.' },
      { status: 403 }
    );
  }

  const parsed = requestSchema.safeParse(
    await request.json().catch(() => null)
  );

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Check the delivery address and cart details.' },
      { status: 400 }
    );
  }

  const idempotencyKey = request.headers
    .get('idempotency-key')
    ?.trim();

  if (
    !idempotencyKey ||
    !z.string().uuid().safeParse(idempotencyKey).success
  ) {
    return NextResponse.json(
      { error: 'A valid checkout request key is required.' },
      { status: 400 }
    );
  }

  let orderId: string | null = null;

  try {
    const session = await getCustomerSession(request);

    const customer = session
      ? await getPrisma().customer.findUnique({
          where: { id: session.id },
          select: {
            id: true,
            email: true,
            isActive: true,
          },
        })
      : null;

    const result = await createCheckoutOrder(
      parsed.data,
      'razorpay',
      idempotencyKey,
      customer?.isActive
        ? { id: customer.id, email: customer.email }
        : undefined
    );

    orderId = result.order.id;

    const prisma = getPrisma();

    const order = await prisma.order.findUnique({
      where: { id: result.order.id },
      include: {
        items: true,
        payments: true,
      },
    });

    if (!order) {
      throw new Error('Pending order could not be loaded.');
    }

    const existingPayment = order.payments.find(
      (payment) => payment.gateway === 'razorpay'
    );

    if (!existingPayment) {
      throw new Error('Pending payment record is missing.');
    }

    if (existingPayment.gatewayOrderId) {
      const response = NextResponse.json({
        keyId: getRazorpayConfig().keyId,
        razorpayOrderId: existingPayment.gatewayOrderId,
        orderNumber: order.orderNumber,
        amount: order.totalPaise,
        currency: order.currency,
      });

      response.headers.append(
        'Set-Cookie',
        orderAccessCookie(
          order.orderNumber,
          result.orderAccessToken
        )
      );

      return response;
    }

    const { keyId, keySecret } = getRazorpayConfig();

    const razorpayResponse = await fetch(
      'https://api.razorpay.com/v1/orders',
      {
        method: 'POST',
        headers: {
          Authorization: razorpayAuth(keyId, keySecret),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: order.totalPaise,
          currency: order.currency,
          receipt: order.orderNumber,
          notes: {
            store: 'Chaudhary General Store',
            order_number: order.orderNumber,
          },
        }),
        cache: 'no-store',
        signal: AbortSignal.timeout(15_000),
      }
    );

    // Parse the gateway response safely, including non-JSON responses.
    const payload: unknown = await razorpayResponse
      .json()
      .catch(() => null);

    const responsePayload: Record<string, unknown> | null =
      typeof payload === 'object' && payload !== null
        ? (payload as Record<string, unknown>)
        : null;

    const gatewayOrderId =
      typeof responsePayload?.id === 'string'
        ? responsePayload.id
        : null;

    if (!razorpayResponse.ok || !gatewayOrderId) {
      const rawError = responsePayload?.error;

      const razorpayError: Record<string, unknown> | null =
        typeof rawError === 'object' && rawError !== null
          ? (rawError as Record<string, unknown>)
          : null;

      // Log diagnostic fields only. Never log the API secret or auth header.
      console.error(
        'Razorpay Orders API rejected order creation:',
        {
          httpStatus: razorpayResponse.status,
          code:
            typeof razorpayError?.code === 'string'
              ? razorpayError.code
              : undefined,
          description:
            typeof razorpayError?.description === 'string'
              ? razorpayError.description
              : undefined,
          reason:
            typeof razorpayError?.reason === 'string'
              ? razorpayError.reason
              : undefined,
          field:
            typeof razorpayError?.field === 'string'
              ? razorpayError.field
              : undefined,
        }
      );

      throw new Error('Razorpay did not create an order.');
    }

    await prisma.payment.update({
      where: { id: existingPayment.id },
      data: { gatewayOrderId },
    });

    const response = NextResponse.json(
      {
        keyId,
        razorpayOrderId: gatewayOrderId,
        orderNumber: order.orderNumber,
        amount: order.totalPaise,
        currency: order.currency,
      },
      { status: 201 }
    );

    response.headers.append(
      'Set-Cookie',
      orderAccessCookie(
        order.orderNumber,
        result.orderAccessToken
      )
    );

    return response;
  } catch (error) {
    if (error instanceof CheckoutError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }

    if (orderId) {
      try {
        const prisma = getPrisma();

        await prisma.$transaction([
          prisma.payment.updateMany({
            where: {
              orderId,
              gateway: 'razorpay',
              status: 'pending',
              gatewayOrderId: null,
            },
            data: { status: 'failed' },
          }),
          prisma.order.updateMany({
            where: {
              id: orderId,
              paymentStatus: 'pending',
            },
            data: { paymentStatus: 'failed' },
          }),
        ]);

        await releaseOrderInventory(orderId);
      } catch (cleanupError) {
        console.error(
          'Failed to release inventory for an incomplete payment order:',
          cleanupError instanceof Error
            ? cleanupError.message
            : 'Unknown error'
        );
      }
    }

    console.error(
      'Razorpay order creation failed:',
      error instanceof Error ? error.message : 'Unknown error'
    );

    return NextResponse.json(
      {
        error:
          'Online payment could not be started. Please retry or choose Cash on Delivery.',
      },
      { status: 502 }
    );
  }
}
