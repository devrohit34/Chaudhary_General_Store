'use client';

import Image from 'next/image';
import { useRef, useState } from 'react';
import { useCart } from '@/lib/cart-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Truck, MapPin, CreditCard, Zap, Check, ChevronRight, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

declare global {
  interface Window { Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on: (event: string, callback: (response: unknown) => void) => void }; }
}

type CheckoutAddress = {
  full_name: string;
  phone: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  pincode: string;
};

type RazorpayOrderResponse = {
  keyId: string;
  razorpayOrderId: string;
  orderNumber: string;
  amount: number;
  currency: string;
};

function isRazorpayOrderResponse(value: unknown): value is RazorpayOrderResponse {
  return typeof value === 'object' && value !== null &&
    'keyId' in value && typeof value.keyId === 'string' &&
    'razorpayOrderId' in value && typeof value.razorpayOrderId === 'string' &&
    'orderNumber' in value && typeof value.orderNumber === 'string' &&
    'amount' in value && typeof value.amount === 'number' &&
    'currency' in value && typeof value.currency === 'string';
}

function apiError(value: unknown) {
  return typeof value === 'object' && value !== null && 'error' in value && typeof value.error === 'string'
    ? value.error
    : null;
}

function isRazorpaySuccess(value: unknown): value is {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
} {
  return typeof value === 'object' && value !== null &&
    'razorpay_order_id' in value && typeof value.razorpay_order_id === 'string' &&
    'razorpay_payment_id' in value && typeof value.razorpay_payment_id === 'string' &&
    'razorpay_signature' in value && typeof value.razorpay_signature === 'string';
}

function errorDescription(value: unknown) {
  if (typeof value !== 'object' || value === null || !('error' in value) ||
      typeof value.error !== 'object' || value.error === null ||
      !('description' in value.error) || typeof value.error.description !== 'string') return null;
  return value.error.description;
}

const deliverySlots = [
  'Express - 30 mins (₹20 extra)',
  'Today 6-8 PM',
  'Today 8-10 PM',
  'Tomorrow 6-8 AM',
  'Tomorrow 8-10 AM',
  'Tomorrow 10-12 PM',
];

export default function CheckoutPage() {
  const { items, subtotal, clearCart } = useCart();
  const router = useRouter();
  const checkoutKey = useRef<string | null>(null);
  const [step, setStep] = useState(1);
  const [address, setAddress] = useState({
    full_name: '', phone: '', address_line1: '', address_line2: '', city: '', state: '', pincode: '',
  });
  const [deliverySlot, setDeliverySlot] = useState(deliverySlots[0]);
  const [isExpress, setIsExpress] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState('cod');
  const [placing, setPlacing] = useState(false);

  const deliveryCharge = subtotal >= 999 ? 0 : 1;
  const expressCharge = isExpress ? 20 : 0;
  const total = subtotal + deliveryCharge + expressCharge;


  const placeOrder = async () => {
    if (items.length === 0) return;
    setPlacing(true);
    try {
      const idempotencyKey = checkoutKey.current || window.crypto.randomUUID();
      checkoutKey.current = idempotencyKey;
      if (paymentMethod === 'razorpay') {
        const scriptLoaded = await new Promise<boolean>((resolve) => {
          if (window.Razorpay) return resolve(true);
          const existing = document.querySelector<HTMLScriptElement>('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
          if (existing) {
            existing.addEventListener('load', () => resolve(true), { once: true });
            existing.addEventListener('error', () => resolve(false), { once: true });
            return;
          }
          const script = document.createElement('script');
          script.src = 'https://checkout.razorpay.com/v1/checkout.js';
          script.onload = () => resolve(true);
          script.onerror = () => resolve(false);
          document.body.appendChild(script);
        });
        if (!scriptLoaded || !window.Razorpay) throw new Error('Could not load secure Razorpay Checkout. Please try again.');

        const createResponse = await fetch('/api/payments/create-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
          body: JSON.stringify({
            address,
            deliverySlot,
            isExpress,
            items: items.map((item) => ({ product_id: item.product_id, quantity: item.quantity })),
          }),
        });
        const createdPayload: unknown = await createResponse.json().catch(() => null);
        if (!createResponse.ok) {
          checkoutKey.current = null;
          throw new Error(apiError(createdPayload) || 'Unable to start payment.');
        }
        if (!isRazorpayOrderResponse(createdPayload)) throw new Error('The payment service returned an invalid response.');
        const created = createdPayload;

        const razorpay = new window.Razorpay({
          key: created.keyId,
          amount: created.amount,
          currency: created.currency || 'INR',
          name: 'Chaudhary General Store',
          description: `Order ${created.orderNumber}`,
          order_id: created.razorpayOrderId,
          prefill: { name: address.full_name, contact: address.phone },
          notes: { order_number: created.orderNumber },
          theme: { color: '#15803d' },
          handler: async (response: unknown) => {
            try {
              if (!isRazorpaySuccess(response)) throw new Error('Razorpay returned incomplete payment details.');
              const verifyResponse = await fetch('/api/payments/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  orderNumber: created.orderNumber,
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                }),
              });
              const verifiedPayload: unknown = await verifyResponse.json().catch(() => null);
              const verified = typeof verifiedPayload === 'object' && verifiedPayload !== null &&
                'verified' in verifiedPayload && verifiedPayload.verified === true;
              if (!verifyResponse.ok || !verified) throw new Error(apiError(verifiedPayload) || 'Payment verification is pending.');
              clearCart();
              checkoutKey.current = null;
              toast.success('Payment verified! Your order is confirmed.');
              router.push(`/orders/${created.orderNumber}`);
            } catch (verifyError) {
              clearCart();
              checkoutKey.current = null;
              console.error('Razorpay verification failed', verifyError);
              toast.error('Payment received but verification is pending. Please do not pay again; refresh your order page shortly.');
              router.push(`/orders/${created.orderNumber}`);
            } finally {
              setPlacing(false);
            }
          },
          modal: { ondismiss: () => setPlacing(false) },
        });
        razorpay.on('payment.failed', (response: unknown) => {
          const description = errorDescription(response);
          console.error('Razorpay payment failed', description || 'No gateway error description provided.');
          toast.error(description || 'Payment failed. Please try again.');
          setPlacing(false);
        });
        razorpay.open();
        return;
      }

      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          address,
          deliverySlot,
          isExpress,
          paymentMethod,
          items: items.map((item) => ({ product_id: item.product_id, quantity: item.quantity })),
        }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(apiError(payload) || 'Could not place your order.');
      if (typeof payload !== 'object' || payload === null || !('order' in payload) ||
          typeof payload.order !== 'object' || payload.order === null ||
          !('order_number' in payload.order) || typeof payload.order.order_number !== 'string') {
        throw new Error('The order service returned an invalid response.');
      }

      clearCart();
      checkoutKey.current = null;
      toast.success('Order placed successfully!');
      router.push(`/orders/${payload.order.order_number}`);
    } catch (err) {
      console.error('Place order failed', err);
      toast.error(err instanceof Error ? err.message : 'Failed to place order. Please try again.');
      setPlacing(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <p className="text-muted-foreground mb-4">Your cart is empty</p>
        <Link href="/products"><Button>Browse Products</Button></Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 animate-fade-in">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
        <Link href="/cart" className="hover:text-primary">Cart</Link>
        <ChevronRight className="h-4 w-4" />
        <span className="text-foreground">Checkout</span>
      </div>

      <h1 className="text-3xl font-bold mb-6">Checkout</h1>

      <div className="flex items-center gap-2 mb-8">
        {['Address', 'Delivery', 'Payment'].map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
              step > i + 1 ? 'bg-primary text-primary-foreground' : step === i + 1 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            }`}>
              {step > i + 1 ? <Check className="h-4 w-4" /> : i + 1}
            </div>
            <span className={`text-sm font-medium ${step === i + 1 ? 'text-foreground' : 'text-muted-foreground'}`}>{s}</span>
            {i < 2 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {step === 1 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><MapPin className="h-5 w-5 text-primary" /> Delivery Address</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div><Label htmlFor="full_name">Full Name</Label><Input id="full_name" value={address.full_name} onChange={(e) => setAddress({ ...address, full_name: e.target.value })} placeholder="John Doe" /></div>
                  <div><Label htmlFor="phone">Phone Number</Label><Input id="phone" value={address.phone} onChange={(e) => setAddress({ ...address, phone: e.target.value })} placeholder="9876543210" /></div>
                </div>
                <div><Label htmlFor="address_line1">Address Line 1</Label><Input id="address_line1" value={address.address_line1} onChange={(e) => setAddress({ ...address, address_line1: e.target.value })} placeholder="House no, Building" /></div>
                <div><Label htmlFor="address_line2">Address Line 2</Label><Input id="address_line2" value={address.address_line2} onChange={(e) => setAddress({ ...address, address_line2: e.target.value })} placeholder="Area, Landmark" /></div>
                <div className="grid sm:grid-cols-3 gap-4">
                  <div><Label htmlFor="city">City</Label><Input id="city" value={address.city} onChange={(e) => setAddress({ ...address, city: e.target.value })} placeholder="City" /></div>
                  <div><Label htmlFor="state">State</Label><Input id="state" value={address.state} onChange={(e) => setAddress({ ...address, state: e.target.value })} placeholder="State" /></div>
                  <div><Label htmlFor="pincode">Pincode</Label><Input id="pincode" value={address.pincode} onChange={(e) => setAddress({ ...address, pincode: e.target.value })} placeholder="123456" /></div>
                </div>
                <Button onClick={() => setStep(2)} className="w-full" disabled={!address.full_name || !address.phone || !address.address_line1 || !address.city || !address.pincode}>
                  Continue to Delivery
                </Button>
              </CardContent>
            </Card>
          )}

          {step === 2 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Truck className="h-5 w-5 text-primary" /> Delivery Options</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between border rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <Zap className="h-6 w-6 text-accent" />
                    <div>
                      <div className="font-medium">Express Delivery</div>
                      <div className="text-sm text-muted-foreground">Get it in 30 minutes</div>
                    </div>
                  </div>
                  <Checkbox checked={isExpress} onCheckedChange={(v) => setIsExpress(!!v)} />
                </div>
                <div>
                  <Label className="mb-2 block">Select Delivery Slot</Label>
                  <RadioGroup value={deliverySlot} onValueChange={setDeliverySlot}>
                    {deliverySlots.map((slot) => (
                      <div key={slot} className="flex items-center gap-2 border rounded-lg p-3">
                        <RadioGroupItem value={slot} id={slot} />
                        <Label htmlFor={slot} className="font-normal cursor-pointer flex-1">{slot}</Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
                  <Button onClick={() => setStep(3)} className="flex-1">Continue to Payment</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {step === 3 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5 text-primary" /> Payment Method</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <RadioGroup value={paymentMethod} onValueChange={setPaymentMethod}>
                  {[
                    { id: 'cod', label: 'Cash on Delivery', desc: 'Pay when you receive your order', icon: '💵' },
                    { id: 'razorpay', label: 'Pay Online with Razorpay', desc: 'UPI, cards and other available secure payment methods', icon: '🔒' },
                  ].map((m) => (
                    <div key={m.id} className="flex items-center gap-3 border rounded-lg p-4">
                      <RadioGroupItem value={m.id} id={m.id} />
                      <Label htmlFor={m.id} className="font-normal cursor-pointer flex-1 flex items-center gap-3">
                        <span className="text-2xl">{m.icon}</span>
                        <div>
                          <div className="font-medium">{m.label}</div>
                          <div className="text-sm text-muted-foreground">{m.desc}</div>
                        </div>
                      </Label>
                    </div>
                  ))}
                </RadioGroup>

                {paymentMethod === 'razorpay' && (
                  <div className="border-2 border-primary/30 rounded-xl p-5 bg-primary/5 space-y-3 animate-fade-in">
                    <div className="flex items-center gap-3">
                      <ShieldCheck className="h-7 w-7 text-green-700" />
                      <div>
                        <h3 className="font-bold">Secure online payment</h3>
                        <p className="text-sm text-muted-foreground">Pay using UPI, credit/debit cards and other methods shown by Razorpay.</p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">Your order will be marked paid only after the server verifies the payment with Razorpay.</p>
                  </div>
                )}

                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
                  <Button onClick={placeOrder} className="flex-1" disabled={placing}>
                    {placing ? 'Placing Order...' : `Place Order · ₹${total.toFixed(0)}`}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Order Summary */}
        <div>
          <Card className="sticky top-32">
            <CardHeader>
              <CardTitle>Order Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {items.map((item) => (
                <div key={item.id} className="flex gap-3 text-sm">
                  {item.product.image_url && (
                    <Image src={item.product.image_url} alt={item.product.name} width={48} height={48} className="h-12 w-12 rounded object-cover" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="line-clamp-1 font-medium">{item.product.name}</div>
                    <div className="text-muted-foreground">Qty: {item.quantity} · ₹{item.product.price}</div>
                  </div>
                  <div className="font-medium">₹{item.product.price * item.quantity}</div>
                </div>
              ))}
              <div className="border-t pt-3 space-y-2">
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Subtotal</span><span>₹{subtotal}</span></div>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Delivery</span><span>{deliveryCharge === 0 ? 'FREE' : `₹${deliveryCharge}`}</span></div>
                {isExpress && <div className="flex justify-between text-sm"><span className="text-muted-foreground">Express</span><span>₹{expressCharge}</span></div>}
                <div className="border-t pt-2 flex justify-between font-bold"><span>Total</span><span>₹{total.toFixed(0)}</span></div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
