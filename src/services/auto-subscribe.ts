import { selectNodeForGroup } from 'tauri-plugin-mihomo-api'

import { rankOf } from '@/utils/tier'

import {
  authBuildProfileYaml,
  authGetCachedNode,
  createProfile,
  deleteProfile,
  getProfiles,
  getUserNodes,
  patchProfilesConfig,
  saveProfileFile,
} from './cmds'

/** 固定 uid 让每次登录复用同一份 profile，避免每次都新建一条 */
const AUTO_PROFILE_UID = 'easylink_auto'
const AUTO_PROFILE_NAME = 'EasyLink Auto'
/** 自动订阅 profile 的默认代理组名（与后端 node_profile.rs build_proxy_groups 对齐） */
export const AUTO_PROXY_GROUP = 'PROXY'

/** 复刻后端 node_profile.rs 的同名去重，得到 mihomo 里真实的代理名列表。 */
function buildProxyNames(nodes: INode[]): string[] {
  const seen = new Map<string, number>()
  return nodes.map((node, idx) => {
    const raw = node.name && node.name.length > 0 ? node.name : `node-${idx}`
    const n = (seen.get(raw) ?? 0) + 1
    seen.set(raw, n)
    return n === 1 ? raw : `${raw} #${n}`
  })
}

/**
 * 缓存节点失效时的逐级回退：在「等级 ≤ 用户身份」的节点里取最高档的第一个
 * （svip→vip→普通），都没有返回 null。返回值为 profile 里的去重名。
 */
function pickByTier(nodes: INode[], userTier?: string | null): string | null {
  const names = buildProxyNames(nodes)
  const userRank = rankOf(userTier)
  for (let rank = userRank; rank >= 0; rank -= 1) {
    const idx = nodes.findIndex((node) => rankOf(node.vip_type) === rank)
    if (idx >= 0) return names[idx]
  }
  return null
}

/**
 * 仅刷新个人节点：单独拉取最新节点 → 重新生成/激活订阅（不涉及用户详情）。
 * 用于「当前节点」卡片的刷新按钮。返回最新节点列表。
 */
export async function refreshUserNodes(
  session: IAuthSession,
): Promise<INode[]> {
  if (!session?.id) return session?.nodes ?? []
  const nodes = await getUserNodes(session.id.toString())
  await ensureNodeProfile({ ...session, nodes })
  return nodes
}

/**
 * 登录后用返回的 nodes 生成 mihomo profile，写盘 → 激活 → 恢复本用户上次选择的节点。
 * 任一步失败抛错；调用方负责 try/catch 并提示用户。
 */
export async function ensureNodeProfile(session: IAuthSession): Promise<void> {
  // nodes 为空（如账号过期）也要重新生成 profile：后端会产出「仅 DIRECT」配置，
  // 借此清掉上一个用户的旧节点，并在下方回退到 DIRECT 直连。
  const nodes = session.nodes ?? []

  const yaml = await authBuildProfileYaml(nodes)

  const profiles = await getProfiles()
  const items = profiles.items ?? []
  const exists = items.some((it) => it.uid === AUTO_PROFILE_UID)

  if (exists) {
    const ok = await saveProfileFile(AUTO_PROFILE_UID, yaml)
    if (!ok) throw new Error('更新订阅配置失败')
  } else {
    await createProfile(
      {
        uid: AUTO_PROFILE_UID,
        type: 'local',
        name: AUTO_PROFILE_NAME,
      },
      yaml,
    )
  }

  const activated = await patchProfilesConfig({ current: AUTO_PROFILE_UID })
  if (!activated) throw new Error('激活订阅配置失败')

  // mihomo reload 是异步的，等一小段时间再选节点
  await new Promise((resolve) => setTimeout(resolve, 300))

  // 按 user id 绑定的缓存恢复默认节点（缓存在 Rust 后端）：
  // - 有缓存且节点仍在 → 切回该节点（包括用户主动选过的 DIRECT）；
  // - 有缓存但节点已没了 → 逐级回退（svip→vip→普通）；
  // - 无缓存（首次登录）→ 按用户等级挑一个默认节点，挑不到才 DIRECT；
  // - 已登录的前提下不主动落到 DIRECT，DIRECT 只是兜底。
  const proxyNames = buildProxyNames(nodes)
  const cached = await authGetCachedNode()
  let target: string
  if (cached === 'DIRECT' || (cached != null && proxyNames.includes(cached))) {
    target = cached
  } else {
    target = pickByTier(nodes, session.vip_type) ?? 'DIRECT'
  }
  try {
    await selectNodeForGroup(AUTO_PROXY_GROUP, target)
  } catch (e) {
    // 选节点失败不影响订阅本身，仅记录
    console.warn('[auto-subscribe] 选默认节点失败:', target, e)
  }

  // 清理历史遗留的重复订阅：早期版本因后端忽略指定 uid，每次登录都会新建一份。
  // 此处激活规范 uid 后，删除其余同名的旧自动订阅。
  const stale = items.filter(
    (it) => it.name === AUTO_PROFILE_NAME && it.uid !== AUTO_PROFILE_UID,
  )
  for (const it of stale) {
    if (!it.uid) continue
    try {
      await deleteProfile(it.uid)
    } catch (e) {
      console.warn('[auto-subscribe] 清理旧订阅失败:', it.uid, e)
    }
  }
}
