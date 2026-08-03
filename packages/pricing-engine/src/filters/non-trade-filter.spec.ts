import { describe, expect, it } from 'vitest';
import { NON_TRADE_FILTER_VERSION, type NON_TRADE_TERMS } from '../dictionaries/excluded-terms';
import { applyNonTradeFilter } from './non-trade-filter';

/** 正样本：合法主商品标题（不应被误删） */
const POSITIVE_SAMPLES = [
  'iPhone 15 Pro 256G 国行 95新 顺丰包邮',
  '索尼 A7M4 全新未拆封 带发票',
  '任天堂 Switch OLED 日版 自用',
  '佳能 R6 Mark II 单机 9成新',
  'iPad Pro 11寸 2022款 256G',
];

/** 负样本：各非交易分类 */
const NEGATIVE_SAMPLES: Array<{
  title: string;
  category: keyof typeof NON_TRADE_TERMS;
  term: string;
}> = [
  { title: '求购 iPhone 15 Pro 512G', category: 'buy_request', term: '求购' },
  { title: '高价收 索尼 A7M4', category: 'buy_request', term: '高价收' },
  { title: '出租 佳能 R6 日租', category: 'rent', term: '出租' },
  { title: 'A7M4 月租 可谈', category: 'rent', term: '月租' },
  { title: '定金 出 iPhone 15', category: 'deposit', term: '定金' },
  { title: 'iPhone 15 配件 屏幕总成', category: 'accessory', term: '配件' },
  { title: '专业维修 iPhone 主板', category: 'repair', term: '维修' },
  { title: '免费送 iPhone 壳', category: 'marketing', term: '免费送' },
];

describe('applyNonTradeFilter 正样本（不误删）', () => {
  it('合法主商品全部通过', () => {
    for (const title of POSITIVE_SAMPLES) {
      const result = applyNonTradeFilter({ title });
      expect(result.accepted, title).toBe(true);
    }
  });

  it('包邮/出售自用等正常营销词不误删', () => {
    expect(applyNonTradeFilter({ title: '全新未拆封 顺丰包邮' }).accepted).toBe(true);
    expect(applyNonTradeFilter({ title: '出售自用 iPhone 13' }).accepted).toBe(true);
    expect(applyNonTradeFilter({ title: '国行原装 有保修' }).accepted).toBe(true);
  });
});

describe('applyNonTradeFilter 负样本（拒绝且可解释）', () => {
  it('各分类命中拒绝并给出 category/term/ruleVersion', () => {
    for (const sample of NEGATIVE_SAMPLES) {
      const result = applyNonTradeFilter({ title: sample.title });
      expect(result.accepted, sample.title).toBe(false);
      if (!result.accepted) {
        expect(result.reason.category).toBe(sample.category);
        expect(result.reason.matchedTerm).toBe(sample.term);
        expect(result.reason.ruleVersion).toBe(NON_TRADE_FILTER_VERSION);
      }
    }
  });

  it('归一化标题同样参与匹配（大小写/空白）', () => {
    // 原文大小写不同，归一化标题含排除词
    const result = applyNonTradeFilter({
      title: 'IPHONE 15 出售',
      normalizedTitle: 'iphone 15 求购',
    });
    expect(result.accepted).toBe(false);
    if (!result.accepted) expect(result.reason.category).toBe('buy_request');
  });
});

describe('applyNonTradeFilter 规则版本与可配置', () => {
  it('版本号已定义且为整数', () => {
    expect(NON_TRADE_FILTER_VERSION).toBeGreaterThanOrEqual(1);
    expect(Number.isInteger(NON_TRADE_FILTER_VERSION)).toBe(true);
  });

  it('覆盖配置整体替换该分类默认词', () => {
    // 覆盖 marketing：去掉默认词、加入自定义词
    const result = applyNonTradeFilter({ title: '限时特价 iPhone' }, { marketing: ['仅此一件'] });
    expect(result.accepted).toBe(true); // 默认 '限时特价' 已被覆盖移除

    const custom = applyNonTradeFilter({ title: '仅此一件 iPhone' }, { marketing: ['仅此一件'] });
    expect(custom.accepted).toBe(false);
    if (!custom.accepted) expect(custom.reason.category).toBe('marketing');
  });
});
