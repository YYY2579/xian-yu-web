-- CreateEnum
CREATE TYPE "MonitorStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ERROR');

-- CreateTable
CREATE TABLE "keyword_monitors" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "keyword" TEXT NOT NULL,
    "normalized_keyword" TEXT NOT NULL,
    "category_code" TEXT,
    "target_price_cent" BIGINT NOT NULL,
    "discount_threshold" DECIMAL(5,4) NOT NULL,
    "min_sample_size" INTEGER NOT NULL DEFAULT 10,
    "frequency_minutes" INTEGER NOT NULL,
    "filters" JSONB,
    "notify_channels" JSONB,
    "status" "MonitorStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_collected_at" TIMESTAMPTZ(6),
    "next_run_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "keyword_monitors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_monitors_user_status" ON "keyword_monitors"("user_id", "status");

-- CreateIndex
CREATE INDEX "idx_monitors_status_next_run" ON "keyword_monitors"("status", "next_run_at");

-- CreateIndex
CREATE INDEX "idx_monitors_normalized_keyword" ON "keyword_monitors"("normalized_keyword");

-- AddForeignKey
ALTER TABLE "keyword_monitors" ADD CONSTRAINT "keyword_monitors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
