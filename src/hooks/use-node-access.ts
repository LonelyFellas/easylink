import { useCallback, useMemo } from 'react'

import { useAuth } from '@/providers/auth-context'
import { rankOf } from '@/utils/tier'

/**
 * 根据登录会话里的 nodes(vip_type) 与当前用户身份，判断某个节点是否“超出权限”。
 * mihomo 代理列表只按 name 渲染，这里用 session.nodes 的 name→vip_type 反查。
 */
export function useNodeAccess() {
  const { session } = useAuth()
  const userRank = rankOf(session?.vip_type)

  const tierByName = useMemo(() => {
    const map = new Map<string, string>()
    for (const node of session?.nodes ?? []) {
      if (node.name && node.vip_type) map.set(node.name, node.vip_type)
    }
    return map
  }, [session?.nodes])

  // 生成 profile 时同名节点会被加 " #2" 后缀去重，反查时需要还原
  const requiredTier = useCallback(
    (name: string): string | undefined =>
      tierByName.get(name) ?? tierByName.get(name.replace(/\s*#\d+$/, '')),
    [tierByName],
  )

  const isLocked = useCallback(
    (name: string) => rankOf(requiredTier(name)) > userRank,
    [requiredTier, userRank],
  )

  return { isLocked, requiredTier }
}
