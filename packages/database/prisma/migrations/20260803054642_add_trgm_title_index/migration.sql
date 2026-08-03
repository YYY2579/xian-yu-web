-- 标题模糊/全文检索索引（DB-005）：normalized_title 支持 pg_trgm GIN 索引
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX idx_products_normalized_title_trgm
  ON products USING gin (normalized_title gin_trgm_ops);
