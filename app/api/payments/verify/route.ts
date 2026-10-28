import { NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import { z } from 'zod';
import { getPrisma } from '@/lib/prisma';
import { getRazorpayConfig, razorpayAuth, safeEqualHex } from '@/lib/razorpay-server';

export const runtime = 'nodejs';

const verificationSchema = z.object({
  orderNumber: z.string().min(8).max(64),
  razorpay_order_id: z.string().min(1).max(128),
  razorpay_payment_id: z.string().min(1).max(128),
  razorpay_signature: z.string().regex(/^[a-f0-9]{64}$/i),
});

export async function POST(request: Request) {
  const parsed = verificationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ verified: false, error: 'Payment verification details are invalid.' }, { status: 400 });
  }

  const { orderNumber, razorpay_order_id: razorpayOrderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = parsed.data;
  try {
    const { keyId, keySecret } = getRazorpayConfig();
    const expectedSignature = createHmac('sha256', keySecret)
      .update(`${razorpayOrderId}|${paymentId}`)
      .digest('hex');
    if (!safeEqualHex(expectedSignature, signature)) {
      return NextResponse.json({ verified: false, error: 'Payment signature verification failed.' }, { status: 400 });
    }

    const prisma = getPrisma();
    const order = await prisma.order.findUnique({
      where: { orderNumber },
      include: { payments: true },
    });
    const paymentRecord = order?.payments.find((payment) => payment.gateway === 'razorpay');
    if (!order || !paymentRecord || paymentRecord.gatewayOrderId !== razorpayOrderId) {
      return NextResponse.json({ verified: false, error: 'Order not found.' }, { status: 404 });
    }
    if (order.paymentStatus === 'paid') {
      if (paymentRecord.gatewayPaymentId === paymentId) {
        return NextResponse.json({ verified: true, orderNumber });
      }
      return NextResponse.json({ verified: false, error: 'This order has already been paid.' }, { status: 409 });
    }
    if (paymentRecord.gatewayPaymentId && paymentRecord.gatewayPaymentId !== paymentId) {
      return NextResponse.json({ verified: false, error: 'A different payment is already recorded for this order.' }, { status: 409 });
    }

    const paymentResponse = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, {
      headers: { Authorization: razorpayAuth(keyId, keySecret) },
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
    let response: unknown = await paymentResponse.json();
    if (!paymentResponse.ok || typeof response !== 'object' || response === null) {
      return NextResponse.json({ verified: false, error: 'Razorpay payment status is not available yet.' }, { status: 202 });
    }

    const gatewayPayment = response as { id?: unknown; order_id?: unknown; currency?: unknown; amount?: unknown; status?: unknown };
    if (
      gatewayPayment.id !== paymentId ||
      gatewayPayment.order_id !== razorpayOrderId ||
      gatewayPayment.currency !== order.currency ||
      Number(gatewayPayment.amount) !== order.totalPaise
    ) {
      return NextResponse.json({ verified: false, error: 'Payment details do not match this order.' }, { status: 400 });
    }

    if (gatewayPayment.status === 'authorized') {
      const captureResponse = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}/capture`, {
        method: 'POST',
        headers: { Authorization: razorpayAuth(keyId, keySecret), 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: order.totalPaise, currency: order.currency }),
        cache: 'no-store',
        signal: AbortSignal.timeout(15_000),
      });
      response = await captureResponse.json();
      if (!captureResponse.ok || typeof response !== 'object' || response === null) {
        return NextResponse.json({ verified: false, error: 'Payment capture is pending. Please do not pay again.' }, { status: 202 });
      }
    }

    const captured = response as { id?: unknown; order_id?: unknown; currency?: unknown; amount?: unknown; status?: unknown };
    if (
      captured.status !== 'captured' ||
      captured.id !== paymentId ||
      captured.order_id !== razorpayOrderId ||
      captured.currency !== order.currency ||
      Number(captured.amount) !== order.totalPaise
    ) {
      return NextResponse.json({ verified: false, error: 'Payment is not captured yet.' }, { status: 202 });
    }

    await prisma.$transaction(async (transaction) => {
      const current = await transaction.order.findUnique({
        where: { id: order.id },
        include: { payments: true },
      });
      const currentPayment = current?.payments.find((entry) => entry.gateway === 'razorpay');
      if (!current || !currentPayment) throw new Error('Payment record is missing.');
      if (current.paymentStatus === 'paid' && currentPayment.gatewayPaymentId === paymentId) return;
      if (currentPayment.gatewayPaymentId && currentPayment.gatewayPaymentId !== paymentId) {
        throw new Error('Another payment transaction is already attached to this order.');
      }
      await transaction.payment.update({
        where: { id: currentPayment.id },
        data: { gatewayPaymentId: paymentId, signature, status: 'paid', verifiedAt: new Date(), capturedAt: new Date() },
      });
      await transaction.order.update({
        where: { id: current.id },
        data: { paymentStatus: 'paid', status: 'confirmed', paymentMethod: 'razorpay' },
      });
    }, { isolationLevel: 'Serializable' });

    return NextResponse.json({ verified: true, orderNumber });
  } catch (error) {
    console.error('Payment verification failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({
      verified: false,
      error: 'Could not verify payment right now. Do not pay again; order status can be recovered by webhook.',
    }, { status: 503 });
  }
}
