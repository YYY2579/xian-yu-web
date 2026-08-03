import { randomUUID } from 'node:crypto';
import type { LowPriceMatchEvent, ProductObservedEvent } from '@xianyu/contracts';
import type { KeywordMonitor } from '@xianyu/database';
import { normalizeKeyword } from '@xianyu/database';
import { calculateBaseline, evaluateLowPrice } from '@xianyu/pricing-engine';

/**
 * 商品事件匹配器（PRI-003）
 * 将清洗后的商品观察事件与用户监控任务匹配：
 * 1. 关键词匹配：事件触发关键词与任务关键词（归一化）一致。
 * 2. 市场基线：从可比样本计算中位价（注入函数，便于测试）。
 * 3. 低价判定：evaluateLowPrice（用户阈值 + 市场基线，样本不足保护）。
 * 4. 命中输出 LowPriceMatchEvent（可解释 reason/score/risk）。
 */

export const LOW_PRICE_MATCH_SCHEMA_VERSION = 1;

export type MatcherDeps = {
  /** 获取关键词的可比样本价格（整数分） */
  comparablePrices: (keyword: string) => Promise<bigint[]>;
};

export type MatchOutcome = {
  matches: LowPriceMatchEvent[];
  /** 未命中任务的跳过原因（可观测） */
  skipped: { monitorId: string; reason: 'keyword_mismatch' | 'not_low_price' }[];
};

export async function matchProduct(
  observed: ProductObservedEvent,
  monitors: KeywordMonitor[],
  deps: MatcherDeps,
): Promise<MatchOutcome> {
  const matches: LowPriceMatchEvent[] = [];
  const skipped: MatchOutcome['skipped'] = [];
  const observedKeyword = normalizeKeyword(observed.keyword ?? '');

  for (const monitor of monitors) {
    // 1. 关键词匹配（归一化一致）
    if (observedKeyword === '' || observedKeyword !== normalizeKeyword(monitor.keyword)) {
      skipped.push({ monitorId: monitor.id, reason: 'keyword_mismatch' });
      continue;
    }

    // 2. 市场基线（可比样本近 7 天）
    const samples = await deps.comparablePrices(monitor.keyword);
    const baseline = calculateBaseline(
      samples.map((v) => Number(v)),
      {
        minSampleSize: monitor.minSampleSize,
      },
    );

    // 3. 低价判定
    const decision = evaluateLowPrice({
      priceCent: observed.price_cent,
      targetPriceCent: Number(monitor.targetPriceCent),
      marketPriceCent: baseline.market_price_cent,
      discountThreshold: Number(monitor.discountThreshold),
      sampleSize: baseline.sample_size,
      minSampleSize: monitor.minSampleSize,
    });

    if (!decision.hit) {
      skipped.push({ monitorId: monitor.id, reason: 'not_low_price' });
      continue;
    }

    // 4. 命中事件
    matches.push({
      event_id: randomUUID(),
      schema_version: LOW_PRICE_MATCH_SCHEMA_VERSION,
      matched_at: new Date().toISOString(),
      monitor_id: monitor.id,
      product_id: observed.product_id,
      canonical_key: observed.canonical_key,
      keyword: monitor.keyword,
      price_cent: observed.price_cent,
      target_price_cent: Number(monitor.targetPriceCent),
      market_price_cent: decision.marketPriceCent,
      discount_rate: decision.discountRate,
      reason: decision.reason.kind,
      score: decision.score,
      risk_score: decision.riskScore,
      rule_version: decision.ruleVersion,
    });
  }

  return { matches, skipped };
}
