import { describe, expect, it } from 'vitest';
import { evaluateLowPrice, LOW_PRICE_RULE_VERSION } from './low-price-rule';
import type { LowPriceRuleInput } from './rule-types';

function input(overrides: Partial<LowPriceRuleInput>): LowPriceRuleInput {
  return {
    priceCent: 5_500_00,
    targetPriceCent: 6_000_00,
    marketPriceCent: 6_500_00,
    discountThreshold: 0.7,
    sampleSize: 15,
    minSampleSize: 10,
    ...overrides,
  };
}

describe('evaluateLowPrice 边界价格', () => {
  it('价格等于用户目标价且不高于市场限价：命中', () => {
    // market 10000*0.7=7000，min(6000,7000)=6000，price == 6000 命中
    const result = evaluateLowPrice(input({ priceCent: 6_000_00, marketPriceCent: 10_000_00 }));
    expect(result.hit).toBe(true);
    expect(result.reason.kind).toBe('below_both_targets');
  });

  it('价格等于市场限价（市场*0.7）：双阈值命中', () => {
    const marketLimit = Math.round(6_500_00 * 0.7); // 455000
    const result = evaluateLowPrice(input({ priceCent: marketLimit, targetPriceCent: 7_000_00 }));
    expect(result.hit).toBe(true);
    expect(result.reason.kind).toBe('below_both_targets');
  });

  it('价格高于用户目标价：未命中', () => {
    const result = evaluateLowPrice(input({ priceCent: 6_100_00 }));
    expect(result.hit).toBe(false);
    expect(result.reason.kind).toBe('above_target');
  });

  it('价格刚好低于市场限价但不满足用户阈值：未命中（用户阈值优先）', () => {
    const marketLimit = Math.round(6_500_00 * 0.7); // 455000
    const result = evaluateLowPrice(input({ priceCent: marketLimit, targetPriceCent: 4_000_00 }));
    expect(result.hit).toBe(false);
    expect(result.reason.kind).toBe('above_target');
  });
});

describe('evaluateLowPrice 样本不足', () => {
  it('样本不足且低于用户目标价：命中但仅用户阈值（不引用市场结论）', () => {
    const result = evaluateLowPrice(
      input({ sampleSize: 3, minSampleSize: 10, priceCent: 5_500_00 }),
    );
    expect(result.hit).toBe(true);
    expect(result.reason.kind).toBe('below_user_target');
    expect(result.marketPriceCent).not.toBeNull(); // 市场价数据仍在，但未用于命中判定
  });

  it('样本不足且高于用户目标价：未命中（insufficient_samples）', () => {
    const result = evaluateLowPrice(
      input({ sampleSize: 3, minSampleSize: 10, priceCent: 6_500_00 }),
    );
    expect(result.hit).toBe(false);
    expect(result.reason.kind).toBe('insufficient_samples');
  });

  it('样本不足时市场基线不参与判定（即使价格高于市场限价）', () => {
    // market 6500*0.7=4550，price 5000 > 4550；但样本不足 -> 只看用户目标价
    const result = evaluateLowPrice(
      input({ sampleSize: 3, minSampleSize: 10, priceCent: 5_000_00, targetPriceCent: 6_000_00 }),
    );
    expect(result.hit).toBe(true);
    expect(result.reason.kind).toBe('below_user_target');
  });
});

describe('evaluateLowPrice 评分与风险', () => {
  it('相同输入永远得到相同结果（纯函数）', () => {
    const a = evaluateLowPrice(input({}));
    const b = evaluateLowPrice(input({}));
    expect(a).toEqual(b);
  });

  it('命中时 score 在 [0,1]，越便宜 score 越高', () => {
    const cheap = evaluateLowPrice(input({ priceCent: 4_200_00 })); // < 4550 市场限价，命中
    const cheaper = evaluateLowPrice(input({ priceCent: 3_000_00 }));
    expect(cheap.hit).toBe(true);
    expect(cheaper.hit).toBe(true);
    expect(cheaper.score).toBeGreaterThan(cheap.score);
    expect(cheap.score).toBeGreaterThan(0);
    expect(cheap.score).toBeLessThanOrEqual(1);
  });

  it('未命中 score 为 0', () => {
    const result = evaluateLowPrice(input({ priceCent: 9_999_00 }));
    expect(result.hit).toBe(false);
    expect(result.score).toBe(0);
  });

  it('价格远低于市场（<0.4 倍）时 riskScore 升高', () => {
    const normal = evaluateLowPrice(input({ priceCent: 5_000_00, marketPriceCent: 10_000_00 })); // 0.5 倍
    const suspicious = evaluateLowPrice(input({ priceCent: 2_000_00, marketPriceCent: 10_000_00 })); // 0.2 倍
    expect(suspicious.riskScore).toBeGreaterThan(0);
    expect(suspicious.riskScore).toBeGreaterThan(normal.riskScore);
    expect(normal.riskScore).toBe(0);
  });

  it('规则版本与折扣率输出', () => {
    const result = evaluateLowPrice(input({}));
    expect(result.ruleVersion).toBe(LOW_PRICE_RULE_VERSION);
    expect(result.discountRate).toBeCloseTo(5_500_00 / 6_500_00, 5);
  });
});
