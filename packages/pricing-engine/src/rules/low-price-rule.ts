import type { LowPriceDecision, LowPriceRuleInput } from './rule-types';

/**
 * 低价规则引擎（PRI-002）
 * 纯函数：相同输入永远得到相同结果。
 * 公式：低价命中 = 当前价 <= min(用户目标价, 市场中位价 × 折扣阈值)
 * - 样本不足：仅比较用户目标价（below_user_target），不输出市场价结论。
 * - score：相对生效阈值（用户目标与市场限价中较低者）的折扣程度。
 * - riskScore：价格显著低于市场（< 0.4 倍）时标记风险（虚假低价/钓鱼）。
 */

export const LOW_PRICE_RULE_VERSION = 1;
export const DEFAULT_DISCOUNT_THRESHOLD = 0.7;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function evaluateLowPrice(input: LowPriceRuleInput): LowPriceDecision {
  const {
    priceCent,
    targetPriceCent,
    marketPriceCent,
    discountThreshold,
    sampleSize,
    minSampleSize,
  } = input;
  const sufficient = sampleSize >= minSampleSize;

  // 用户阈值
  const belowUserTarget = priceCent <= targetPriceCent;

  // 市场基线（仅样本足够且有市场价）
  const marketLimit =
    sufficient && marketPriceCent !== null ? Math.round(marketPriceCent * discountThreshold) : null;
  const belowMarket = marketLimit !== null && priceCent <= marketLimit;

  const hit = belowUserTarget && (marketLimit === null || belowMarket);

  let reason: LowPriceDecision['reason'];
  if (hit && belowMarket) reason = { kind: 'below_both_targets' };
  else if (hit) reason = { kind: 'below_user_target' };
  else if (!sufficient) reason = { kind: 'insufficient_samples' };
  else reason = { kind: 'above_target' };

  // score：相对生效阈值的折扣程度（命中时 > 0）
  const threshold = marketLimit !== null ? Math.min(targetPriceCent, marketLimit) : targetPriceCent;
  const score = hit && threshold > 0 ? clamp01(1 - priceCent / threshold) : 0;

  // riskScore：价格远低于市场（< 0.4 倍）视为高风险
  const discountRate =
    marketPriceCent !== null && marketPriceCent > 0 ? priceCent / marketPriceCent : null;
  const riskScore =
    discountRate !== null && discountRate < 0.4 ? clamp01((0.4 - discountRate) / 0.3) : 0;

  return {
    hit,
    score,
    reason,
    ruleVersion: LOW_PRICE_RULE_VERSION,
    riskScore,
    marketPriceCent,
    discountRate,
  };
}
