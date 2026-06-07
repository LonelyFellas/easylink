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
  readProfileFile,
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
 * 串行化所有 profile 写盘+激活。
 *
 * 登录、刷新用户详情、刷新节点三条路径都会调用 ensureNodeProfile，写的是
 * 同一个 easylink_auto.yaml 并触发内核 reload。这些调用之间原本没有任何互斥，
 * 两次并发（如同时点「登录状态」和「当前节点」的刷新）会交错成
 * 「写 A → 写 B → reload A → reload B」，把配置写坏 / 双重 reload，
 * 正是「内核通信错误 / 暂无激活节点」的根因之一。这里用一条 Promise 链强制排队。
 */
let writeChain: Promise<unknown> = Promise.resolve()

function serializeProfileWrite<T>(task: () => Promise<T>): Promise<T> {
  const run = writeChain.then(task, task)
  // 无论成败都让链继续，避免一次失败后卡死后续写入
  writeChain = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

/**
 * 登录后用返回的 nodes 生成 mihomo profile，写盘 → 激活 → 恢复本用户上次选择的节点。
 * 任一步失败抛错；调用方负责 try/catch 并提示用户。
 *
 * 已串行化：并发调用会自动排队，不会交错写同一份 yaml。
 */
export function ensureNodeProfile(session: IAuthSession): Promise<void> {
  return serializeProfileWrite(() => ensureNodeProfileImpl(session))
}

async function ensureNodeProfileImpl(session: IAuthSession): Promise<void> {
  // nodes 为空（如账号过期）也要重新生成 profile：后端会产出「仅 DIRECT」配置，
  // 借此清掉上一个用户的旧节点，并在下方回退到 DIRECT 直连。
  const nodes = session.nodes ?? []

  const yaml = await authBuildProfileYaml(nodes)

  const profiles = await getProfiles()
  const items = profiles.items ?? []
  const exists = items.some((it) => it.uid === AUTO_PROFILE_UID)
  const isCurrent = profiles.current === AUTO_PROFILE_UID

  // 去重：profile 已存在、已是当前激活、且磁盘内容与本次完全一致时，
  // 跳过写盘 + 重新激活（即跳过一次内核 reload）。重复 reload 是登录/刷新后
  // 「内核通信错误」短暂闪现的剩余来源；内容没变就没必要 reload。
  let needWrite = true
  if (exists && isCurrent) {
    const current = await readProfileFile(AUTO_PROFILE_UID).catch(() => null)
    // 容忍末尾换行等无意义差异
    if (current != null && current.trim() === yaml.trim()) {
      needWrite = false
    }
  }

  if (needWrite) {
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
  }

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
