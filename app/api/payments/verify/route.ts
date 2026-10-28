import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { getPaymentConfig, razorpayAuth } from '@/lib/razorpay-server';

export const runtime = 'nodejs';

function safeEqualHex(a: string, b: string) {
  if (!/^[a-f0-9]+$/i.test(a) || !/^[a-f0-9]+$/i.test(b) || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const orderNumber = String(body?.orderNumber || '');
    const razorpayOrderId = String(body?.razorpay_order_id || '');
    const paymentId = String(body?.razorpay_payment_id || '');
    const signature = String(body?.razorpay_signature || '');
    if (!orderNumber || !razorpayOrderId || !paymentId || !signature) {
      return NextResponse.json({ verified: false, error: 'Missing payment verification details.' }, { status: 400 });
    }

    const { keyId, keySecret, supabase } = getPaymentConfig();
    const expectedSignature = createHmac('sha256', keySecret).update(`${razorpayOrderId}|${paymentId}`).digest('hex');
    if (!safeEqualHex(expectedSignature, signature)) {
      return NextResponse.json({ verified: false, error: 'Payment signature verification failed.' }, { status: 400 });
    }

    const { data: order, error: orderError } = await supabase.from('orders')
      .select('id,order_number,total_amount,razorpay_order_id,payment_status')
      .eq('order_number', orderNumber)
      .eq('razorpay_order_id', razorpayOrderId)
      .single();
    if (orderError || !order) return NextResponse.json({ verified: false, error: 'Order not found.' }, { status: 404 });

    const paymentResponse = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, {
      headers: { Authorization: razorpayAuth(keyId, keySecret) },
      cache: 'no-store',
    });
    let payment = await paymentResponse.json();
    if (!paymentResponse.ok || payment.order_id !== razorpayOrderId || payment.currency !== 'INR' || Number(payment.amount) !== Math.round(Number(order.total_amount) * 100)) {
      return NextResponse.json({ verified: false, error: 'Payment details do not match this order.' }, { status: 400 });
    }

    if (payment.status === 'authorized') {
      const captureResponse = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}/capture`, {
        method: 'POST',
        headers: { Authorization: razorpayAuth(keyId, keySecret), 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: payment.amount, currency: 'INR' }),
        cache: 'no-store',
      });
      payment = await captureResponse.json();
      if (!captureResponse.ok) {
        console.error('Razorpay capture pending:', payment?.error?.description || captureResponse.status);
        return NextResponse.json({ verified: false, error: 'Payment is authorized but capture is pending. Please do not pay again.' }, { status: 202 });
      }
    }

    if (payment.status !== 'captured') {
      return NextResponse.json({ verified: false, error: 'Payment is not captured yet.' }, { status: 202 });
    }

    const { error: updateError } = await supabase.from('orders').update({
      payment_status: 'paid',
      status: 'confirmed',
      payment_method: 'razorpay',
      razorpay_payment_id: paymentId,
      razorpay_signature: signature,
      updated_at: new Date().toISOString(),
    }).eq('id', order.id);
    if (updateError) throw new Error('Payment was captured, but order update is pending. The webhook can retry this update.');

    return NextResponse.json({ verified: true, orderNumber });
  } catch (error) {
    console.error('Payment verification error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ verified: false, error: 'Could not verify payment right now. Do not pay again; the order can be updated by webhook.' }, { status: 500 });
  }
}
