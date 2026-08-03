export {
  iphoneFixtureEvent,
  iphoneFixtureInput,
  sonyCameraFixtureEvent,
  sonyCameraFixtureInput,
} from './events/fixtures';
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
export type { NormalizedProduct } from './products/normalized-product';
