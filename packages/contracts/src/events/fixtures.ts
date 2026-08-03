import { createRawProductEvent, RawProductEventInput } from './raw-product-event';

/**
 * 固定测试 fixture：合法 RawProductEvent 样例（契约测试与未来采集适配器测试共用）。
 * 不使用真实平台数据；金额为整数分，时间带时区。
 */

export const iphoneFixtureInput: RawProductEventInput = {
  source: 'authorized-source',
  monitor_id: '11111111-1111-1111-1111-111111111111',
  keyword: 'iPhone 15 Pro',
  product: {
    source_product_id: 'SRC-PROD-001',
    title: 'iPhone 15 Pro 256G 国行 95新',
    url: 'https://example.com/item/SRC-PROD-001',
    price_cent: 5_999_00,
    shipping_fee_cent: 0,
    currency: 'CNY',
    condition: '95新',
    location: '杭州',
    published_at: '2026-08-01T10:30:00+08:00',
    seller_id_hash: 'sha256:abcdef123456',
    raw_payload: { rawTitle: 'iPhone 15 Pro 256G', rawPrice: '5999元' },
  },
};

export const sonyCameraFixtureInput: RawProductEventInput = {
  source: 'authorized-source',
  monitor_id: '22222222-2222-2222-2222-222222222222',
  keyword: '索尼 A7M4',
  product: {
    source_product_id: 'SRC-PROD-002',
    title: 'Sony A7M4 全新未拆封',
    url: 'https://example.com/item/SRC-PROD-002',
    price_cent: 15_800_00,
    shipping_fee_cent: null,
    condition: null,
    location: '上海',
    published_at: '2026-08-02T09:00:00+08:00',
    seller_id_hash: null,
    raw_payload: null,
  },
};

/** 合法事件样例（已生成 event_id/occurred_at/schema_version） */
export const iphoneFixtureEvent = createRawProductEvent(iphoneFixtureInput);
export const sonyCameraFixtureEvent = createRawProductEvent(sonyCameraFixtureInput);
