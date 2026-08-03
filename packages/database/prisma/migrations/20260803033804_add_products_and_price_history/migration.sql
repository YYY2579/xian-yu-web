-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "source" TEXT NOT NULL,
    "source_product_id" TEXT NOT NULL,
    "canonical_key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "normalized_title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "seller_id_hash" TEXT,
    "current_price_cent" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "condition" TEXT,
    "location" TEXT,
    "published_at" TIMESTAMPTZ(6),
    "first_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL,
    "raw_payload" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_price_history" (
    "id" BIGSERIAL NOT NULL,
    "product_id" UUID NOT NULL,
    "price_cent" BIGINT NOT NULL,
    "shipping_fee_cent" BIGINT,
    "observed_at" TIMESTAMPTZ(6) NOT NULL,
    "source_event_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_price_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "products_canonical_key_key" ON "products"("canonical_key");

-- CreateIndex
CREATE INDEX "idx_products_source_prod" ON "products"("source", "source_product_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_price_history_source_event_id_key" ON "product_price_history"("source_event_id");

-- CreateIndex
CREATE INDEX "idx_ph_product_observed" ON "product_price_history"("product_id", "observed_at" DESC);

-- CreateIndex
CREATE INDEX "idx_ph_observed_at" ON "product_price_history"("observed_at");

-- AddForeignKey
ALTER TABLE "product_price_history" ADD CONSTRAINT "product_price_history_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
