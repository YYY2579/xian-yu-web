import {
  createRawProductEvent,
  iphoneFixtureEvent,
  iphoneFixtureInput,
  type RawProductEvent,
  sonyCameraFixtureInput,
} from '@xianyu/contracts';
import { describe, expect, it } from 'vitest';
import { collapseWhitespace, normalizeProduct, normalizeTitle } from './product-normalizer';

describe('标题清理工具', () => {
  it('collapseWhitespace 折叠全角/连续空白', () => {
    expect(collapseWhitespace('  iPhone 15   Pro ')).toBe('iPhone 15 Pro');
    expect(collapseWhitespace('索尼\u3000A7M4\u3000 全新')).toBe('索尼 A7M4 全新');
  });

  it('normalizeTitle 小写化（中英混合）', () => {
    expect(normalizeTitle('iPhone 15 Pro')).toBe('iphone 15 pro');
    expect(normalizeTitle('索尼 A7M4 全新')).toBe('索尼 a7m4 全新');
  });
});

describe('normalizeProduct 合法事件', () => {
  it('字段完整、canonical_key 生成、原始值保留', () => {
    const event = createRawProductEvent({
      ...iphoneFixtureInput,
      product: {
        ...iphoneFixtureInput.product,
        title: '  iPhone 15 Pro  256G  ',
        raw_payload: { rawPrice: '5999元', rawTitle: 'iPhone 15 Pro 256G' },
      },
    });
    const result = normalizeProduct(event);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.product.canonical_key).toBe('authorized-source:SRC-PROD-001');
    expect(result.product.title).toBe('iPhone 15 Pro 256G'); // 空白已折叠
    expect(result.product.normalized_title).toBe('iphone 15 pro 256g');
    expect(result.product.price_cent).toBe(5_999_00);
    expect(result.product.original_title).toBe('  iPhone 15 Pro  256G  '); // 原始值保留
    expect(result.product.original_price_text).toBe('5999元');
    expect(result.product.warnings).toContain('title_whitespace_normalized');
  });

  it('中文/英文混合标题与可选字段透传', () => {
    const event = createRawProductEvent(sonyCameraFixtureInput);
    const result = normalizeProduct(event);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.product.normalized_title).toBe('sony a7m4 全新未拆封');
    expect(result.product.shipping_fee_cent).toBeNull();
    expect(result.product.seller_id_hash).toBeNull();
    expect(result.product.published_at).toBe('2026-08-02T09:00:00+08:00');
  });

  it('raw_payload 缺失时 original_price_text 为 null', () => {
    const event = createRawProductEvent(sonyCameraFixtureInput); // raw_payload: null
    const result = normalizeProduct(event);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.product.original_price_text).toBeNull();
  });
});

describe('normalizeProduct 拒绝规则', () => {
  // 防御性校验针对"绕过契约校验"的外部事件（如版本演进中的旧事件/手动构造），
  // 因此用类型断言构造非法事件，而不是走 createRawProductEvent（zod 会先拒绝）。
  const asRaw = (patch: Partial<RawProductEvent['product']>): RawProductEvent =>
    ({
      ...iphoneFixtureEvent,
      product: { ...iphoneFixtureEvent.product, ...patch },
    }) as RawProductEvent;

  it('非法价格（负数/非整数）被拒绝', () => {
    expect(normalizeProduct(asRaw({ price_cent: -100 }))).toEqual({
      ok: false,
      reason: 'INVALID_PRICE',
    });
    expect(normalizeProduct(asRaw({ price_cent: 99.5 }))).toEqual({
      ok: false,
      reason: 'INVALID_PRICE',
    });
  });

  it('缺失链接被拒绝', () => {
    expect(normalizeProduct(asRaw({ url: '' }))).toEqual({ ok: false, reason: 'MISSING_URL' });
  });

  it('缺少来源商品 ID 被拒绝', () => {
    expect(normalizeProduct(asRaw({ source_product_id: '' }))).toEqual({
      ok: false,
      reason: 'MISSING_SOURCE_PRODUCT_ID',
    });
  });

  it('空白标题被拒绝', () => {
    expect(normalizeProduct(asRaw({ title: '   ' }))).toEqual({
      ok: false,
      reason: 'INVALID_TITLE',
    });
  });
});
