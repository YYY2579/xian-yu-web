-- DropForeignKey
ALTER TABLE "notification_records" DROP CONSTRAINT "notification_records_monitor_id_fkey";

-- DropIndex
DROP INDEX "idx_products_normalized_title_trgm";

-- AddForeignKey
ALTER TABLE "notification_records" ADD CONSTRAINT "notification_records_monitor_id_fkey" FOREIGN KEY ("monitor_id") REFERENCES "keyword_monitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
