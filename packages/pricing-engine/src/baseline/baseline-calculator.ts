/**
 * 市场价基线计算器（PRI-001）
 * 纯函数：对可比样本价格计算中位数市场价与统计量。
 * - 默认近 7 天有效样本（窗口由调用方查询保证）。
 * - 剔除明显异常值（IQR 1.5 规则），降低极端高价/低价干扰。
 * - 样本不足（< minSampleSize，默认 10）返回 insufficient，不输出市场价结论。
 * - 结果带规则版本与计算时间，供低价判定追溯。
 */

export const BASELINE_RULE_VERSION = 1;
export const DEFAULT_MIN_SAMPLE_SIZE = 10;
export const DEFAULT_SAMPLE_DAYS = 7;

export type BaselineStatus = 'ok' | 'insufficient';

export type BaselineResult = {
  baseline_status: BaselineStatus;
  /** 市场价（剔除异常值后的中位数）；样本不足为 null */
  market_price_cent: number | null;
  /** 剔除异常值后的有效样本数 */
  sample_size: number;
  /** 剔除前的原始样本数 */
  raw_sample_size: number;
  quartiles: { q1: number; q2: number; q3: number } | null;
  /** 置信度 [0,1]（基于有效样本量，样本越多越接近 1）；样本不足为 null */
  confidence: number | null;
  rule_version: number;
  calculated_at: string;
  filtered_outliers: number;
};

/** 线性插值百分位（sorted 升序） */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = (sorted.length - 1) * p;
  const lo = Math.floor(index);
  const hi = Math.ceil(index);
  if (lo === hi) return sorted[lo] ?? 0;
  return (sorted[lo] ?? 0) + ((sorted[hi] ?? 0) - (sorted[lo] ?? 0)) * (index - lo);
}

export function calculateBaseline(
  prices: number[],
  options?: { minSampleSize?: number; version?: number },
): BaselineResult {
  const minSampleSize = options?.minSampleSize ?? DEFAULT_MIN_SAMPLE_SIZE;
  const ruleVersion = options?.version ?? BASELINE_RULE_VERSION;
  const calculatedAt = new Date().toISOString();
  const rawSampleSize = prices.length;

  if (prices.length < minSampleSize) {
    return {
      baseline_status: 'insufficient',
      market_price_cent: null,
      sample_size: 0,
      raw_sample_size: rawSampleSize,
      quartiles: null,
      confidence: null,
      rule_version: ruleVersion,
      calculated_at: calculatedAt,
      filtered_outliers: 0,
    };
  }

  // 剔除异常值：IQR 1.5 规则
  const sorted = [...prices].sort((a, b) => a - b);
  const q1 = percentile(sorted, 0.25);
  const q3 = percentile(sorted, 0.75);
  const iqr = q3 - q1;
  const lowerBound = q1 - 1.5 * iqr;
  const upperBound = q3 + 1.5 * iqr;
  const filtered = sorted.filter((p) => p >= lowerBound && p <= upperBound);
  const filteredOutliers = sorted.length - filtered.length;

  if (filtered.length === 0) {
    // 全部被剔除（极端分布）：视为样本不可用
    return {
      baseline_status: 'insufficient',
      market_price_cent: null,
      sample_size: 0,
      raw_sample_size: rawSampleSize,
      quartiles: null,
      confidence: null,
      rule_version: ruleVersion,
      calculated_at: calculatedAt,
      filtered_outliers: filteredOutliers,
    };
  }

  const q2 = percentile(filtered, 0.5);
  const confidence = Math.min(1, filtered.length / 30);

  return {
    baseline_status: 'ok',
    market_price_cent: Math.round(q2),
    sample_size: filtered.length,
    raw_sample_size: rawSampleSize,
    quartiles: {
      q1: Math.round(percentile(filtered, 0.25)),
      q2: Math.round(q2),
      q3: Math.round(percentile(filtered, 0.75)),
    },
    confidence,
    rule_version: ruleVersion,
    calculated_at: calculatedAt,
    filtered_outliers: filteredOutliers,
  };
}
