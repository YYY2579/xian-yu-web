import { describe, expect, it } from 'vitest';
import { BASELINE_RULE_VERSION, calculateBaseline } from './baseline-calculator';

describe('calculateBaseline 固定样本', () => {
  it('正常样本输出中位数与四分位', () => {
    // 10 个样本：[5000, 5200, 5500, 5600, 5800, 6000, 6200, 6500, 6800, 7000]
    const prices = [5000, 5200, 5500, 5600, 5800, 6000, 6200, 6500, 6800, 7000];
    const result = calculateBaseline(prices);

    expect(result.baseline_status).toBe('ok');
    expect(result.market_price_cent).toBe(5900); // 中位数（5800+6000）/2
    expect(result.sample_size).toBe(10);
    expect(result.raw_sample_size).toBe(10);
    expect(result.quartiles?.q1).toBe(5525); // 线性插值 P25
    expect(result.quartiles?.q2).toBe(5900);
    expect(result.quartiles?.q3).toBe(6425); // 线性插值 P75
    expect(result.confidence).toBeCloseTo(10 / 30, 5);
    expect(result.rule_version).toBe(BASELINE_RULE_VERSION);
    expect(Date.parse(result.calculated_at)).not.toBeNaN();
  });

  it('中位数使用线性插值（偶数样本）', () => {
    const result = calculateBaseline([1000, 2000], { minSampleSize: 2 });
    expect(result.market_price_cent).toBe(1500);
  });

  it('剔除明显异常值（IQR 1.5 规则）', () => {
    const prices = [5000, 5100, 5200, 5300, 5400, 5500, 5600, 5700, 5800, 5900, 99999]; // 极端高价
    const result = calculateBaseline(prices);

    expect(result.baseline_status).toBe('ok');
    expect(result.filtered_outliers).toBe(1);
    expect(result.sample_size).toBe(10);
    expect(result.market_price_cent).toBeLessThan(6000); // 异常值未污染中位数
  });

  it('置信度随样本量提升（封顶 1）', () => {
    const small = calculateBaseline(Array.from({ length: 10 }, (_, i) => 1000 + i * 100));
    const large = calculateBaseline(Array.from({ length: 60 }, (_, i) => 1000 + (i % 10) * 100));
    expect(large.confidence).toBe(1);
    expect(small.confidence).toBeCloseTo(10 / 30, 5);
    expect(small.confidence).toBeLessThan(1);
  });
});

describe('calculateBaseline 样本不足', () => {
  it('样本少于 minSampleSize 返回 insufficient 且无市场价结论', () => {
    const result = calculateBaseline([5000, 5500, 6000], { minSampleSize: 10 });

    expect(result.baseline_status).toBe('insufficient');
    expect(result.market_price_cent).toBeNull();
    expect(result.quartiles).toBeNull();
    expect(result.confidence).toBeNull();
  });

  it('自定义 minSampleSize 生效', () => {
    const ok = calculateBaseline([5000, 5500, 6000], { minSampleSize: 3 });
    expect(ok.baseline_status).toBe('ok');
    expect(ok.market_price_cent).toBe(5500);
  });

  it('空样本返回 insufficient', () => {
    const result = calculateBaseline([]);
    expect(result.baseline_status).toBe('insufficient');
    expect(result.raw_sample_size).toBe(0);
  });

  it('极端高价被剔除且不污染中位数', () => {
    const result = calculateBaseline([
      1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 999999,
    ]);
    expect(result.baseline_status).toBe('ok');
    expect(result.filtered_outliers).toBe(1);
    expect(result.market_price_cent).toBe(1000);
  });
});
