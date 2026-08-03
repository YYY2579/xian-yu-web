/**
 * 低价规则类型（PRI-002）
 * 规则：低价命中 = 当前价 <= min(用户目标价, 市场中位价 × 折扣阈值)。
 * - 样本不足（< minSampleSize）时只使用用户目标价，不输出"明显低于市场价"结论。
 * - 金额一律整数分；规则纯函数（相同输入永远相同输出）。
 */

export type LowPriceRuleInput = {
  /** 当前商品价格（整数分） */
  priceCent: number;
  /** 用户目标价（整数分） */
  targetPriceCent: number;
  /** 市场中位价（整数分）；样本不足为 null */
  marketPriceCent: number | null;
  /** 折扣阈值（默认 0.7），作用于市场中位价 */
  discountThreshold: number;
  /** 实际可比样本量 */
  sampleSize: number;
  /** 最少可比样本数 */
  minSampleSize: number;
};

export type LowPriceReason =
  /** 同时低于用户目标价与市场基线（样本足够） */
  | { kind: 'below_both_targets' }
  /** 仅低于用户目标价（样本不足，不引用市场价结论） */
  | { kind: 'below_user_target' }
  /** 高于阈值，未命中 */
  | { kind: 'above_target' }
  /** 样本不足且高于用户目标价，未命中 */
  | { kind: 'insufficient_samples' };

export type LowPriceDecision = {
  hit: boolean;
  /** 低价程度 0-1（越高越便宜）；未命中为 0 */
  score: number;
  reason: LowPriceReason;
  ruleVersion: number;
  /** 异常低价风险 0-1（价格远低于市场，可能虚假低价） */
  riskScore: number;
  marketPriceCent: number | null;
  /** 当前价 / 市场价（0-1 区间意义），市场缺失为 null */
  discountRate: number | null;
};
