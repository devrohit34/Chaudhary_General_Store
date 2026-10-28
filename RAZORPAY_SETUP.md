# Razorpay setup for Chaudhary General Store

The checkout now supports Cash on Delivery and Razorpay Standard Checkout. Online payments are created server-side, verified against Razorpay, and updated by a signed webhook.

## 1. Apply the Supabase migration

In Supabase Dashboard → SQL Editor, run the SQL from:

`supabase/migrations/20261028000000_add_razorpay_payment_fields.sql`

This adds Razorpay order/payment reference fields and allows `razorpay` as the payment method.

## 2. Add Vercel environment variables

In Vercel → project → Settings → Environment Variables, add these server-side values for Production (and Preview if you test there):

- `RAZORPAY_KEY_ID` — Key ID from Razorpay
- `RAZORPAY_KEY_SECRET` — Secret paired with that Key ID
- `RAZORPAY_WEBHOOK_SECRET` — a separate secret you create when configuring the webhook
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service-role key for this project

The project must already have `NEXT_PUBLIC_SUPABASE_URL` configured. The existing public anon key remains used by the browser client.

**Never prefix any secret with `NEXT_PUBLIC_`. Never commit the service-role key, Razorpay secret, or webhook secret to GitHub.** If any secret was exposed, rotate it.

## 3. Configure Razorpay webhook

In Razorpay Dashboard → Account & Settings / Webhooks, add this URL:

`https://chaudhary-general-store-ecommerce.vercel.app/api/payments/webhook`

Subscribe to at least these events:

- `payment.captured`
- `order.paid`

Set a strong webhook secret and save the exact same value in Vercel as `RAZORPAY_WEBHOOK_SECRET`. This webhook secret is different from the Razorpay API Key Secret.

## 4. Test before accepting real orders

1. First use Razorpay **Test Mode** credentials in a Preview/test deployment and test a successful payment plus a failed/cancelled payment.
2. Confirm successful payment changes the order to `Payment Verified` / `paid` and `confirmed` in the order/admin views.
3. After the tests pass, use Live Mode Key ID and Secret in Vercel Production, redeploy, and make a small real payment to verify the complete flow.
4. Confirm automatic capture is enabled in Razorpay or verify the server capture flow is working. A payment is not marked paid until its status is captured.

The customer-facing checkout does not need a payment screenshot or UTR for Razorpay payments. Existing COD orders and historical manual-UPI orders remain in the database.
