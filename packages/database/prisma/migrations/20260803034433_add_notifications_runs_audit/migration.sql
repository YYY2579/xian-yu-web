-- CreateEnum
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'DEAD', 'SUPPRESSED');

-- CreateEnum
CREATE TYPE "MonitorRunStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "notification_records" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "monitor_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "channel" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "rule_version" TEXT NOT NULL,
    "product_price_cent" BIGINT NOT NULL,
    "market_price_cent" BIGINT,
    "discount_rate" DECIMAL(6,4),
    "reason" JSONB,
    "idempotency_key" TEXT NOT NULL,
    "delivery_status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "provider_message_id" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "sent_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monitor_runs" (
    "id" BIGSERIAL NOT NULL,
    "monitor_id" UUID NOT NULL,
    "status" "MonitorRunStatus" NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),
    "result_count" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "duration_ms" INTEGER,

    CONSTRAINT "monitor_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" TEXT,
    "detail" JSONB,
    "ip" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notification_records_idempotency_key_key" ON "notification_records"("idempotency_key");

-- CreateIndex
CREATE INDEX "idx_notif_user_created" ON "notification_records"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_notif_monitor_created" ON "notification_records"("monitor_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_notif_delivery_status" ON "notification_records"("delivery_status");

-- CreateIndex
CREATE INDEX "idx_run_monitor_started" ON "monitor_runs"("monitor_id", "started_at" DESC);

-- CreateIndex
CREATE INDEX "idx_audit_resource" ON "audit_logs"("resource_type", "resource_id");

-- CreateIndex
CREATE INDEX "idx_audit_actor_created" ON "audit_logs"("actor_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "notification_records" ADD CONSTRAINT "notification_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_records" ADD CONSTRAINT "notification_records_monitor_id_fkey" FOREIGN KEY ("monitor_id") REFERENCES "keyword_monitors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_records" ADD CONSTRAINT "notification_records_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monitor_runs" ADD CONSTRAINT "monitor_runs_monitor_id_fkey" FOREIGN KEY ("monitor_id") REFERENCES "keyword_monitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
