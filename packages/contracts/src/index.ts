export {
  iphoneFixtureEvent,
  iphoneFixtureInput,
  sonyCameraFixtureEvent,
  sonyCameraFixtureInput,
} from './events/fixtures';
export type { ProductObservedEvent } from './events/product-observed-event';
export { PRODUCT_OBSERVED_EVENT_SCHEMA_VERSION } from './events/product-observed-event';
export type {
  ParseResult,
  RawProductEvent,
  RawProductEventInput,
} from './events/raw-product-event';
export {
  createRawProductEvent,
  isSchemaVersionCompatible,
  parseRawProductEvent,
  RAW_PRODUCT_EVENT_SCHEMA_VERSION,
  rawProductEventSchema,
} from './events/raw-product-event';
export type { CollectorJob } from './jobs/collector-job';
export type { NormalizedProduct } from './products/normalized-product';
