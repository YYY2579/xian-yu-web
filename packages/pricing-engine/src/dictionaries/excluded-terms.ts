/**
 * 非交易排除词词典（PROC-002）
 * 用于过滤求购、租赁、定金、配件、维修与明显营销类非可比商品，
 * 避免它们进入价格基线样本与低价命中（伪低价）。
 * 词典按分类组织；规则版本用于命中原因追溯与后续演进。
 */

export const NON_TRADE_TERMS = {
  /** 求购（买家求，非卖家出售） */
  buy_request: ['求购', '收一台', '收个', '收一部', '高价收', '想收', '收闲置'],
  /** 租赁 */
  rent: ['出租', '租赁', '租用', '日租', '周租', '月租', '租借'],
  /** 定金/订金（非完整一口价交易） */
  deposit: ['定金', '订金', '需定金', '付定金', '交定金'],
  /** 配件/零件（非整机主商品） */
  accessory: ['配件', '零件', '拆机件', '维修件', '外壳', '屏幕总成'],
  /** 维修服务（服务而非商品） */
  repair: ['维修', '修理', '换屏', '换电池', '维修服务', '上门修'],
  /** 明显营销/非真实二手交易 */
  marketing: ['免费送', '抽奖', '秒杀价', '限时特价', '清仓', '展示机', '样品机'],
} as const;

export type NonTradeCategory = keyof typeof NON_TRADE_TERMS;

/** 规则版本：词典/规则变更时递增，命中原因携带版本便于追溯 */
export const NON_TRADE_FILTER_VERSION = 1;

/** 全部默认分类（用于校验配置覆盖的合法性） */
export const NON_TRADE_CATEGORIES: readonly NonTradeCategory[] = Object.keys(
  NON_TRADE_TERMS,
) as NonTradeCategory[];
