import { selectNodeForGroup } from 'tauri-plugin-mihomo-api'

import {
  authBuildProfileYaml,
  createProfile,
  deleteProfile,
  getProfiles,
  patchProfilesConfig,
  saveProfileFile,
} from './cmds'

/** 固定 uid 让每次登录复用同一份 profile，避免每次都新建一条 */
const AUTO_PROFILE_UID = 'easylink_auto'
const AUTO_PROFILE_NAME = 'EasyLink Auto'
const DEFAULT_GROUP = 'PROXY'

/**
 * 登录后用返回的 nodes 生成 mihomo profile，写盘 → 激活 → 选首节点。
 * 任一步失败抛错；调用方负责 try/catch 并提示用户。
 */
export async function ensureNodeProfile(session: IAuthSession): Promise<void> {
  const nodes = session.nodes ?? []
  if (!nodes.length) {
    throw new Error('登录成功但未返回任何节点')
  }

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

  const firstName = nodes[0]?.name
  if (firstName) {
    try {
      await selectNodeForGroup(DEFAULT_GROUP, firstName)
    } catch (e) {
      // 选节点失败不影响订阅本身，仅记录
      console.warn('[auto-subscribe] 选首节点失败:', e)
    }
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
