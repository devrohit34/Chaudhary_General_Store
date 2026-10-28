import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { getPaymentConfig } from '@/lib/razorpay-server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret) return NextResponse.json({ error: 'Webhook is not configured.' }, { status: 500 });

  const rawBody = await request.text();
  const signature = request.headers.get('x-razorpay-signature') || '';
  const expected = createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
  if (!signature || !/^[a-f0-9]+$/i.test(signature) || signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))) {
    return NextResponse.json({ error: 'Invalid webhook signature.' }, { status: 400 });
  }

  try {
    const event = JSON.parse(rawBody);
    if (!['payment.captured', 'order.paid'].includes(event?.event)) return NextResponse.json({ received: true });

    const payment = event?.payload?.payment?.entity;
    const razorpayOrderId = payment?.order_id || event?.payload?.order?.entity?.id;
    if (!razorpayOrderId) return NextResponse.json({ received: true });

    const { supabase } = getPaymentConfig();
    const { data: order, error: lookupError } = await supabase.from('orders')
      .select('id,razorpay_order_id,total_amount')
      .eq('razorpay_order_id', razorpayOrderId)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!order) return NextResponse.json({ received: true, matched: false });

    if (
      !payment ||
      typeof payment.id !== 'string' ||
      payment.order_id !== order.razorpay_order_id ||
      payment.status !== 'captured' ||
      payment.currency !== 'INR' ||
      !Number.isFinite(Number(order.total_amount)) ||
      Number(payment.amount) !== Math.round(Number(order.total_amount) * 100)
    ) {
      return NextResponse.json({ error: 'Payment details do not match this order.' }, { status: 400 });
    }

    const { error } = await supabase.from('orders').update({
      payment_status: 'paid',
      status: 'confirmed',
      payment_method: 'razorpay',
      razorpay_payment_id: payment.id,
      updated_at: new Date().toISOString(),
    }).eq('id', order.id);
    if (error) throw error;
    return NextResponse.json({ received: true, updated: true });
  } catch (error) {
    console.error('Razorpay webhook update failed:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Webhook processing failed.' }, { status: 500 });
  }
}
