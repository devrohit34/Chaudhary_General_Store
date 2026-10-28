import { NextResponse } from 'next/server';
import { randomInt, randomBytes } from 'crypto';
import { getPaymentConfig, razorpayAuth } from '@/lib/razorpay-server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const address = body?.address;
    const items = body?.items;
    const deliverySlot = body?.deliverySlot;
    const isExpress = Boolean(body?.isExpress);

    if (!address?.full_name || !address?.phone || !address?.address_line1 || !address?.city || !address?.state || !address?.pincode) {
      return NextResponse.json({ error: 'Please provide a complete delivery address.' }, { status: 400 });
    }
    if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
      return NextResponse.json({ error: 'Your cart is empty or invalid.' }, { status: 400 });
    }

    const normalizedItems = items.map((item: any) => ({
      product_id: String(item?.product_id || ''),
      quantity: Number(item?.quantity),
    }));
    if (normalizedItems.some((item) => !item.product_id || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 100)) {
      return NextResponse.json({ error: 'One or more cart items are invalid.' }, { status: 400 });
    }

    const { keyId, keySecret, supabase } = getPaymentConfig();
    const productIds = [...new Set(normalizedItems.map((item) => item.product_id))];
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id,name,price,brand,unit,image_url,gst_percent,is_active,stock_quantity')
      .in('id', productIds);

    if (productsError) throw new Error('Could not validate cart products.');
    const productMap = new Map((products || []).map((product) => [product.id, product]));
    if (productMap.size !== productIds.length) {
      return NextResponse.json({ error: 'A product in your cart is no longer available. Refresh your cart.' }, { status: 400 });
    }

    let subtotal = 0;
    const orderItems = normalizedItems.map((item) => {
      const product = productMap.get(item.product_id);
      if (!product || product.is_active === false) throw new Error('A product in your cart is unavailable. Refresh your cart.');
      if (Number.isFinite(Number(product.stock_quantity)) && Number(product.stock_quantity) >= 0 && item.quantity > Number(product.stock_quantity)) {
        throw new Error(`${product.name} does not have enough stock for the requested quantity.`);
      }
      const price = Number(product.price);
      if (!Number.isFinite(price) || price < 0) throw new Error('Invalid product price.');
      subtotal += price * item.quantity;
      return {
        product_id: product.id,
        product_name: product.name,
        product_image: product.image_url,
        brand: product.brand,
        unit: product.unit,
        price,
        quantity: item.quantity,
        gst_percent: product.gst_percent ?? 0,
      };
    });

    subtotal = Math.round((subtotal + Number.EPSILON) * 100) / 100;
    const deliveryCharge = (subtotal >= 999 ? 0 : 69) + (isExpress ? 20 : 0);
    const total = Math.round((subtotal + deliveryCharge + Number.EPSILON) * 100) / 100;
    if (total <= 0 || total > 500000) {
      return NextResponse.json({ error: 'Order amount is outside the supported range.' }, { status: 400 });
    }

    const orderNumber = `CGS${Date.now().toString().slice(-8)}${randomBytes(2).toString('hex').toUpperCase()}`;
    const now = new Date().toISOString();
    const razorpayResponse = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        Authorization: razorpayAuth(keyId, keySecret),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: Math.round(total * 100),
        currency: 'INR',
        receipt: orderNumber,
        notes: { store: 'Chaudhary General Store', order_number: orderNumber },
      }),
      cache: 'no-store',
    });
    const razorpayOrder = await razorpayResponse.json();
    if (!razorpayResponse.ok || !razorpayOrder?.id) {
      console.error('Razorpay order creation failed:', razorpayOrder?.error?.description || razorpayResponse.status);
      return NextResponse.json({ error: 'Razorpay could not start the payment. Please try again.' }, { status: 502 });
    }

    const { data: order, error: orderError } = await supabase.from('orders').insert({
      order_number: orderNumber,
      status: 'pending',
      payment_method: 'razorpay',
      payment_status: 'pending',
      subtotal,
      delivery_charge: deliveryCharge,
      gst_amount: 0,
      total_amount: total,
      address_snapshot: address,
      delivery_slot: String(deliverySlot || ''),
      delivery_otp: String(randomInt(1000, 10000)),
      is_express: isExpress,
      razorpay_order_id: razorpayOrder.id,
      created_at: now,
      updated_at: now,
    }).select('id,order_number').single();

    if (orderError || !order) {
      console.error('Order database insert failed:', orderError?.message);
      return NextResponse.json({ error: 'Payment was prepared but the order could not be saved. Please contact the store before retrying.' }, { status: 500 });
    }

    const { error: itemsError } = await supabase.from('order_items').insert(orderItems.map((item) => ({ ...item, order_id: order.id, created_at: now })));
    if (itemsError) {
      console.error('Order items insert failed:', itemsError.message);
      await supabase.from('orders').delete().eq('id', order.id);
      return NextResponse.json({ error: 'Could not save order items. Please try again.' }, { status: 500 });
    }

    return NextResponse.json({
      keyId,
      razorpayOrderId: razorpayOrder.id,
      orderNumber: order.order_number,
      amount: Math.round(total * 100),
      currency: 'INR',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to start payment.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
