# Neon, Prisma, and Razorpay setup

The application uses Neon PostgreSQL through Prisma for server-side persistence. Razorpay orders are created by the server, payment signatures are verified server-side, and signed webhooks are deduplicated before payment status changes.

## 1. Configure Neon locally

Create a Neon PostgreSQL project and configure these private environment variables in `.env.local` (never commit the file):

- `DATABASE_URL` — Neon pooled connection string for the application runtime.
- `DIRECT_URL` — Neon direct connection string for Prisma migrations.
- `ADMIN_SESSION_SECRET`, `CUSTOMER_SESSION_SECRET`, and `ORDER_ACCESS_SECRET` — independent random secrets, each at least 32 characters.
- `APP_BASE_URL` — canonical application URL.

Keep the connection strings private. Do not send credentials in chat or expose them through `NEXT_PUBLIC_` variables.

## 2. Install, migrate, and optionally seed

Run:

```powershell
npm ci
npm run prisma:generate
npx prisma validate
npm run db:migrate:status
```

For a **new, empty Neon database**, review the checked-in migration and then apply it with:

```powershell
npm run db:migrate:deploy
```

Do not point the initial migration at an existing production database without a separately reviewed data migration and verified backup. No Supabase data is transferred by these commands.

`npm run db:seed` imports the repository's existing local catalog seed only where matching rows are missing. Review `data/local-seed.json` before using it; it is sample/local catalog data, not a transfer of live Supabase business records. Verify the connection with `npm run db:verify`.

Provision an administrator from a trusted local shell after setting `ADMIN_EMAIL`, `ADMIN_NAME`, and `ADMIN_INITIAL_PASSWORD` in the process environment:

```powershell
npm run admin:provision
```

Use a unique password with at least 14 characters. The script stores only a bcrypt hash.

On Windows, this PowerShell snippet prompts for the password without echoing it and clears the temporary environment variables when it finishes:

```powershell
$adminPassword = Read-Host "Admin password (14-72 characters)" -AsSecureString
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($adminPassword)
try {
  $env:ADMIN_EMAIL = Read-Host "Admin email"
  $env:ADMIN_NAME = Read-Host "Admin name"
  $env:ADMIN_INITIAL_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
  npm run admin:provision
  if ($LASTEXITCODE -ne 0) {
    throw "Admin provisioning failed. Check the error above and confirm the database is configured."
  }
}
finally {
  Remove-Item Env:ADMIN_EMAIL -ErrorAction SilentlyContinue
  Remove-Item Env:ADMIN_NAME -ErrorAction SilentlyContinue
  Remove-Item Env:ADMIN_INITIAL_PASSWORD -ErrorAction SilentlyContinue
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
  $adminPassword.Dispose()
}
```

Run this from the project root with the intended database configured in `.env.local`; the script loads that file and upserts only the administrator account. It does not run migrations or modify orders, products, or payments. Running it again for the same email resets that administrator's password. Do not use the default credentials mentioned in the dashboard ZIP; this project authenticates against its own Prisma-backed admin table.

## 3. Configure Razorpay

Set these server-side environment variables in the local environment and the deployment platform:

- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET` — a separate secret configured on the Razorpay webhook.

Never prefix a secret with `NEXT_PUBLIC_`. The browser receives only the public Key ID and the server-created Razorpay order ID. The server calculates totals from active database product prices and reserved inventory; the browser-submitted price is ignored.

Configure the Razorpay webhook URL as:

`https://<your-domain>/api/payments/webhook`

Subscribe to:

- `payment.captured`
- `payment.failed`
- `refund.created`
- `refund.processed`
- `refund.failed`

The handler verifies the signature over the raw request body and records event IDs to make processing idempotent. A failed payment attempt does not mark the order paid or prevent another attempt; only a captured payment matching the stored order amount and currency is confirmed. Refund events are matched to the persisted refund operation and the verified payment; delayed events do not restore a cancelled order to fulfilment.

## 4. Order cancellation and refunds

Customers can cancel orders in `pending`, `confirmed`, and `processing` status. Cancellation is not available after the order reaches `out_for_delivery`, `delivered`, `returned`, or `cancelled`. Inventory reserved at checkout is restored in the same database transaction that marks the order cancelled.

Refunds are separate from cancellation. The server creates a full refund operation only from stored payment records and submits the amount in paise. Refund completion is shown only after a provider response or authenticated refund webhook confirms it. Uncertain requests are held for reconciliation and are not submitted again automatically.

In the admin order details, use **Process Refund** for an unsubmitted operation or **Reconcile Refund** to look up provider status. A retry is allowed only after the server checks Razorpay and an administrator confirms no refund exists; no more than three attempts are allowed. Refund operations without a verified Razorpay payment reference require manual review. There is no background job system configured for this application.

Apply the checked-in schema migration only after checking the intended database target and taking the appropriate backup:

```powershell
npm run db:migrate:status
npm run db:migrate:deploy
```

`db:migrate:deploy` applies pending migrations to the database selected by the private `DIRECT_URL`/`DATABASE_URL` configuration. Do not run it against production until the migration and deployment window are approved.

## Quick start (Windows / PowerShell)

1. Keep your existing private `.env.local` file in the project root. It is intentionally not included in the shared ZIP so API secrets are not redistributed.
2. Ensure it contains `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`. Use **Test Mode** keys first. Add a separate `RAZORPAY_WEBHOOK_SECRET` after creating the webhook in the Razorpay Dashboard.
3. Ensure `DATABASE_URL`, `DIRECT_URL`, `ADMIN_SESSION_SECRET`, `CUSTOMER_SESSION_SECRET`, and `ORDER_ACCESS_SECRET` are also configured. The checkout flow requires the database and order-access/session configuration, not only Razorpay keys.
4. In a terminal opened in this folder, run:

```powershell
npm ci
npm run prisma:generate
npx prisma validate
npm run dev
```

5. Open the local storefront, add an available product to the cart, and test checkout using Razorpay **Test Mode** credentials.
6. In Razorpay Dashboard, configure the webhook URL `https://<your-deployed-domain>/api/payments/webhook` and subscribe to the two payment events and three refund events above. The webhook secret entered in the dashboard must exactly match `RAZORPAY_WEBHOOK_SECRET` in the deployment environment.
7. Before going live, deploy the app with all required environment variables, run database migrations only after reviewing the migration and database target, then test payment, cancellation, refund status, and duplicate webhook delivery in Test Mode.

**Important:** This ZIP contains source code and an environment-variable template, not your private `.env.local` file. Keep your existing local file separately and configure the same variables in your hosting provider. Do not paste secret values into source files or prefix server secrets with `NEXT_PUBLIC_`.

## 5. Product images and manual UPI screenshots

Set `BLOB_READ_WRITE_TOKEN` to enable authenticated admin product-image uploads to public Vercel Blob storage. Product images are public storefront assets.

Manual UPI screenshots are validated and stored privately in the Neon database; retrieval requires the associated customer/order access or an authenticated admin session. Razorpay payments do not use screenshot submission.

## 6. Validate before live payments

1. Configure test-mode Razorpay credentials in a non-production environment.
2. Test successful capture, failed attempts, cancellation, webhook retries, duplicate webhook delivery, and order status recovery.
3. Confirm the deployment's webhook event configuration and that failed attempts never produce a paid order.
4. Configure live credentials only after the test flow, database migration, catalog, administrator login, and storage have all been verified.

The project has not been validated against a live Neon database or Razorpay account. Production readiness must not be inferred until the owner completes those external checks.
