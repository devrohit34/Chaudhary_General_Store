ALTER TABLE "customers"
ADD COLUMN "session_version" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "used_at" TIMESTAMP(3),

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key"
    ON "password_reset_tokens"("token_hash");

CREATE INDEX "password_reset_tokens_customer_id_expires_at_idx"
    ON "password_reset_tokens"("customer_id", "expires_at");

CREATE INDEX "password_reset_tokens_expires_at_idx"
    ON "password_reset_tokens"("expires_at");

ALTER TABLE "password_reset_tokens"
ADD CONSTRAINT "password_reset_tokens_customer_id_fkey"
FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
