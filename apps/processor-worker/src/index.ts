export type { DedupResult } from './deduplication/product-deduplicator';
export { ProductDeduplicator } from './deduplication/product-deduplicator';
export type { NormalizeResult, RejectionReason } from './normalizers/product-normalizer';
export {
  collapseWhitespace,
  normalizeProduct,
  normalizeTitle,
} from './normalizers/product-normalizer';
export { placeholder } from './placeholder';
