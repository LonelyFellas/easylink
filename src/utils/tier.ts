/** 会员等级排序：普通(空)=0，vip=1，svip=2。门禁与默认选节点共用，避免两边规则漂移。 */
export const TIER_RANK: Record<string, number> = { vip: 1, svip: 2 }

export const rankOf = (tier?: string | null): number =>
  tier ? (TIER_RANK[tier.toLowerCase()] ?? 0) : 0
