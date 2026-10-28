# Neon and Prisma migration status

## Current architecture

- Next.js 13.5.1 App Router, React 18, TypeScript, and Tailwind CSS remain on the existing versions.
- Database reads and writes for the storefront, customer account, checkout, order tracking, admin screens, and Razorpay routes use server-side Prisma APIs backed by Neon PostgreSQL.
- The client-facing Prisma DTOs preserve the existing snake_case shapes used by UI components.
- Product prices and order totals are calculated and stored as integer paise. Checkout reserves stock in a serializable transaction.
- Razorpay order creation, signature checks, payment capture checks, and webhook event deduplication are server-side.
- Admin API routes use signed admin sessions. Product images use authenticated Vercel Blob uploads; UPI screenshots are stored privately in Neon.
- Customer wishlists and recently viewed products remain in browser local storage, as before.

## Migration boundaries and cautions

- `prisma/migrations` contains the new Neon schema. The initial migration has not been applied to any database.
- No live Supabase customers, orders, catalog changes, or uploaded images have been copied to Neon. Historical `supabase/migrations` files remain as reference only; do not apply them to Neon.
- `data/local-seed.json` is local/sample catalog data. It is not a production data export.
- Real database connectivity, administrator setup, Blob uploads, Razorpay test-mode payments, and webhooks cannot be verified until the owner configures the corresponding private environment variables.
- Failed Razorpay attempts remain retryable and do not become paid. An automated inventory-expiry/reconciliation job is not yet configured; pending orders may retain reserved stock until an explicit operational cleanup is added.
- Existing external product image URLs may need platform-specific domain configuration or migration into Blob storage.

## Owner actions before deployment

1. Create a Neon project and configure pooled `DATABASE_URL` plus direct `DIRECT_URL` privately.
2. Review and apply the initial migration only to an empty target database.
3. Transfer verified production data using a separately reviewed mapping and backup; do not treat the sample seed as production data.
4. Set independent session secrets, provision the first admin, and run database verification.
5. Configure `BLOB_READ_WRITE_TOKEN` and verify public product-image uploads.
6. Configure Razorpay test credentials and webhook secret; exercise captured, failed, cancelled, and duplicate webhook cases.
7. Add inventory expiry/reconciliation before relying on abandoned or cancelled payment sessions in production.
