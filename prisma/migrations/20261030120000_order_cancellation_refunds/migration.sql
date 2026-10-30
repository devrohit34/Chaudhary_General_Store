CREATE TYPE "RefundStatus" AS ENUM (
    'pending',
    'processing',
    'completed',
    'failed',
    'requires_review',
    'not_applicable'
);

ALTER TABLE "orders"
ADD COLUMN "cancelled_at" TIMESTAMP(3),
ADD COLUMN "cancellation_reason" TEXT,
ADD COLUMN "cancellation_actor" TEXT,
ADD COLUMN "cancellation_previous_status" "OrderStatus";

ALTER TABLE "webhook_events"
ADD COLUMN "gateway_refund_id" TEXT;

CREATE TABLE "refund_operations" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "gateway" TEXT NOT NULL DEFAULT 'razorpay',
    "gateway_payment_id" TEXT,
    "gateway_refund_id" TEXT,
    "amount_paise" INTEGER NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'pending',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_attempt_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refund_operations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "refund_operations_order_id_key" ON "refund_operations"("order_id");
CREATE UNIQUE INDEX "refund_operations_gateway_refund_id_key" ON "refund_operations"("gateway_refund_id");
CREATE INDEX "refund_operations_status_updated_at_idx" ON "refund_operations"("status", "updated_at");

ALTER TABLE "refund_operations"
ADD CONSTRAINT "refund_operations_order_id_fkey"
FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
