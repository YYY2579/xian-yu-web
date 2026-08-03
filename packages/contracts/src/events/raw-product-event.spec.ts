import { describe, expect, it } from 'vitest';
import {
  createRawProductEvent,
  iphoneFixtureEvent,
  iphoneFixtureInput,
  isSchemaVersionCompatible,
  parseRawProductEvent,
  RAW_PRODUCT_EVENT_SCHEMA_VERSION,
} from '../index';

describe('createRawProductEvent', () => {
  it('生成带 event_id/occurred_at/schema_version 的合法事件', () => {
    const event = createRawProductEvent(iphoneFixtureInput);
    expect(event.event_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(event.schema_version).toBe(RAW_PRODUCT_EVENT_SCHEMA_VERSION);
    expect(Date.parse(event.occurred_at)).not.toBeNaN();
    expect(event.product.price_cent).toBe(5_999_00);
    expect(event.product.currency).toBe('CNY'); // 默认值
  });

  it('金额为整数分、时间为带时区 ISO', () => {
    const event = createRawProductEvent(iphoneFixtureInput);
    expect(Number.isInteger(event.product.price_cent)).toBe(true);
    expect(event.occurred_at).toMatch(/[+-]\d{2}:\d{2}$|Z$/);
  });
});

describe('parseRawProductEvent', () => {
  it('合法事件通过校验', () => {
    const result = parseRawProductEvent(iphoneFixtureEvent);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.source).toBe('authorized-source');
      expect(result.data.product.source_product_id).toBe('SRC-PROD-001');
    }
  });

  it('缺失必填字段返回字段级错误', () => {
    const { event_id: _omit, ...missingEventId } = iphoneFixtureEvent;
    const r1 = parseRawProductEvent(missingEventId);
    expect(r1.success).toBe(false);
    if (!r1.success) expect(r1.errors.join()).toContain('event_id');

    const missingTitle = {
      ...iphoneFixtureEvent,
      product: { ...iphoneFixtureEvent.product, title: '' },
    };
    const r2 = parseRawProductEvent(missingTitle);
    expect(r2.success).toBe(false);
    if (!r2.success) expect(r2.errors.join()).toContain('product.title');
  });

  it('版本不兼容的事件被拒绝', () => {
    const future = { ...iphoneFixtureEvent, schema_version: 2 };
    const result = parseRawProductEvent(future);
    expect(result.success).toBe(false);
    expect(isSchemaVersionCompatible(2)).toBe(false);
    expect(isSchemaVersionCompatible(RAW_PRODUCT_EVENT_SCHEMA_VERSION)).toBe(true);
  });

  it('负金额被拒绝', () => {
    const negative = {
      ...iphoneFixtureEvent,
      product: { ...iphoneFixtureEvent.product, price_cent: -100 },
    };
    const result = parseRawProductEvent(negative);
    expect(result.success).toBe(false);
  });

  it('非法 URL 被拒绝', () => {
    const badUrl = {
      ...iphoneFixtureEvent,
      product: { ...iphoneFixtureEvent.product, url: 'not-a-url' },
    };
    const result = parseRawProductEvent(badUrl);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors.join()).toContain('product.url');
  });
});
