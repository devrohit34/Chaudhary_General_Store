# Chaudhary General Store Ecommerce

The existing Chaudhary General Store shopping application is built with Next.js App Router, React, TypeScript, and Tailwind CSS. Its customer-facing layout and product browsing experience are preserved while database operations are moved behind server-side Prisma APIs.

## Features

- Product catalog, categories, search, product detail, and local wishlist/cart.
- Checkout with server-calculated totals, stock reservation, COD, and Razorpay.
- Customer accounts, order history, guest order tracking, and private manual-UPI screenshot submission.
- Admin tools for catalog, inventory, orders, customer lookup, manual-UPI review, payments, and reporting.
- Server-authorized database access; no browser-side Supabase client.

## Stack

- Next.js 13.5.11 and React 18
- TypeScript and Tailwind CSS
- Neon PostgreSQL with Prisma 7 and the Neon serverless adapter
- Razorpay Standard Checkout and signed webhooks
- Vercel Blob for administrator-uploaded public product images

## Local setup

Use Node.js 20.19 or newer. Install dependencies:

```powershell
npm ci
```

Configure the private variables in `.env.local` using safe local editing; do not overwrite an existing environment file. Required Neon URLs, independent session secrets, optional Razorpay credentials, and Blob configuration are described in [RAZORPAY_SETUP.md](./RAZORPAY_SETUP.md) and `.env.example`.

For a new, empty Neon database, validate and apply the checked-in migration:

```powershell
npm run prisma:generate
npx prisma validate
npm run db:migrate:deploy
npm run db:verify
```

`npm run db:seed` imports the repository's existing local/sample catalog where rows are missing. It is not a production Supabase data transfer. Do not apply the initial migration to a populated production database without a separately reviewed migration and backup.

Start the application:

```powershell
npm run dev
```

Other useful checks are `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`. Provision an administrator as described in [RAZORPAY_SETUP.md](./RAZORPAY_SETUP.md).

## Migration status

No live database has been migrated, no production data has been transferred, and Razorpay/Neon/Blob have not been validated against owner credentials. Historical `supabase/migrations` are retained only as reference and must not be applied to Neon. See [NEON_MIGRATION_AUDIT.md](./NEON_MIGRATION_AUDIT.md) for boundaries and required owner actions.
