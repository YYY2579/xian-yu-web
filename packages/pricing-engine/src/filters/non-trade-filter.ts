import {
  NON_TRADE_CATEGORIES,
  NON_TRADE_FILTER_VERSION,
  NON_TRADE_TERMS,
  type NonTradeCategory,
} from '../dictionaries/excluded-terms';

/**
 * 非交易商品过滤规则（PROC-002）
 * - 过滤求购/租赁/定金/配件/维修/营销类标题，避免污染价格基线样本。
 * - 拒绝结果带可解释原因（分类 + 命中词 + 规则版本），不静默丢弃。
 * - 词典可配置覆盖（调用方可按垂类调整），版本号随规则演进。
 * 纯函数，不依赖数据库。
 */

export type FilterRuleOverrides = Partial<Record<NonTradeCategory, readonly string[]>>;

export type NonTradeFilterInput = {
  /** 展示标题（原文） */
  title: string;
  /** 归一化标题（小写 + 空白折叠，与匹配用） */
  normalizedTitle?: string;
};

export type FilterRejectReason = {
  category: NonTradeCategory;
  matchedTerm: string;
  ruleVersion: number;
};

export type NonTradeFilterResult =
  { accepted: true } | { accepted: false; reason: FilterRejectReason };

function resolveTerms(
  overrides?: FilterRuleOverrides,
): Record<NonTradeCategory, readonly string[]> {
  const terms: Record<NonTradeCategory, readonly string[]> = { ...NON_TRADE_TERMS };
  for (const category of NON_TRADE_CATEGORIES) {
    const override = overrides?.[category];
    if (override !== undefined) {
      terms[category] = override;
    }
  }
  return terms;
}

/**
 * 应用非交易过滤：命中任一排除词即拒绝。
 * @param input    商品标题（原文 + 归一化）
 * @param overrides 可选的分类词覆盖（整体替换该分类默认词）
 */
export function applyNonTradeFilter(
  input: NonTradeFilterInput,
  overrides?: FilterRuleOverrides,
): NonTradeFilterResult {
  const terms = resolveTerms(overrides);
  const haystack = `${input.title}\n${input.normalizedTitle ?? ''}`;

  for (const category of NON_TRADE_CATEGORIES) {
    for (const term of terms[category] ?? []) {
      if (haystack.includes(term)) {
        return {
          accepted: false,
          reason: {
            category,
            matchedTerm: term,
            ruleVersion: NON_TRADE_FILTER_VERSION,
          },
        };
      }
    }
  }

  return { accepted: true };
}
