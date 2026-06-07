import type React from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { ensureNodeProfile } from '@/services/auto-subscribe'
import {
  authGetSession,
  authLogin,
  authLogout,
  authRegister,
  getVerifyCode,
  patchVergeConfig,
  getUserInfo,
  getVerifyCodeByEmail,
} from '@/services/cmds'
import { showNotice } from '@/services/notice-service'

import { AuthContext } from './auth-context'

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<IAuthSession | null>(null)
  const [userDetail, setUserDetail] = useState<IUserDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const fetchUserDetail = useCallback(async (userId: string) => {
    const result = await getUserInfo(userId)
    setUserDetail(result)
    return result
  }, [])

  // 登录后刷新详情：失败也不阻断登录流程（卡片会回退到 session）。返回详情或 null。
  const safeFetchUserDetail = useCallback(
    async (userId: string): Promise<IUserInfo | null> => {
      try {
        return await fetchUserDetail(userId)
      } catch (error) {
        console.warn('[AuthProvider] 拉取个人详情失败:', error)
        return null
      }
    },
    [fetchUserDetail],
  )

  // 设置会话并按新账号刷新详情：三个登录入口共用，确保切换账号时
  // userDetail 与 session 同步更新（卡片优先展示 userDetail）。
  // 注意：此函数本身不写 profile，启动恢复会话时直接复用、不触发订阅写盘。
  const applySession = useCallback(
    async (next: IAuthSession) => {
      setSession(next)
      const detail = next?.id
        ? await safeFetchUserDetail(next.id.toString())
        : null
      return { session: next, detail }
    },
    [safeFetchUserDetail],
  )

  // 登录/注册专用：等用户详情拉完，用「详情里的节点列表」走一次自动订阅。
  // 节点源统一以用户详情为准（detail.nodes），不再用 session.nodes 二次构建写盘——
  // 避免登录后约 1 秒内出现「先正常加载、又被第二次写入/reload 冲垮」的内核错误。
  // 订阅失败不阻断进入主页。
  const loginAndSubscribe = useCallback(
    async (raw: IAuthSession): Promise<IAuthSession> => {
      const { session: next, detail } = await applySession(raw)
      // 节点源以用户详情为准；详情拉取失败或暂时为空时回退到登录返回的节点，
      // 避免把已有节点误清成「仅 DIRECT」。
      const nodes = detail?.nodes?.length ? detail.nodes : (next.nodes ?? [])
      try {
        await ensureNodeProfile({ ...next, nodes })
      } catch (error) {
        console.error('[AuthProvider] 自动订阅失败:', error)
        showNotice.error((error as Error)?.toString?.() ?? String(error))
      }
      return next
    },
    [applySession],
  )

  useEffect(() => {
    let active = true
    authGetSession()
      .then((s) => {
        // 详情后追，不阻塞 isLoading：避免起动时多等一次 getUserInfo 往返
        if (active && s) void applySession(s)
      })
      .catch((error) => {
        console.error('[AuthProvider] 读取会话失败:', error)
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })
    return () => {
      active = false
    }
  }, [applySession])

  const refreshUserDetail = useCallback(async () => {
    if (!session?.id) return
    // get_user_info 已顺带返回个人节点，拿到后重新激活订阅，刷新详情即刷新节点
    const detail = await fetchUserDetail(session.id.toString())
    if (detail?.nodes?.length) {
      try {
        await ensureNodeProfile({ ...session, nodes: detail.nodes })
      } catch (error) {
        console.warn('[AuthProvider] 刷新节点失败:', error)
      }
    }
  }, [session, fetchUserDetail])

  const login = useCallback(
    (username: string, password: string) =>
      authLogin(username, { password }).then(loginAndSubscribe),
    [loginAndSubscribe],
  )

  const loginByCode = useCallback(
    (phone: string, code: string) =>
      authLogin(phone, { code }).then(loginAndSubscribe),
    [loginAndSubscribe],
  )

  const register = useCallback(
    (params: IAuthRegister) =>
      authRegister({ ...params }).then(loginAndSubscribe),
    [loginAndSubscribe],
  )

  const logout = useCallback(async () => {
    // 退出登录时自动关闭代理：关系统代理 + 关 TUN，避免登出后仍走客户端代理
    try {
      await patchVergeConfig({
        enable_system_proxy: false,
        enable_tun_mode: false,
      })
    } catch (e) {
      console.warn('[AuthProvider] 退出时关闭代理失败:', e)
    }
    await authLogout()
    setSession(null)
    // 清掉上个账号的详情缓存，避免下次登录前/登录中卡片闪现旧账号信息
    setUserDetail(null)
  }, [])

  const getSmsCode = useCallback(async (phone: string) => {
    const result = await getVerifyCode(phone)
    return result
  }, [])

  const getEmailCode = useCallback(async (email: string) => {
    const result = await getVerifyCodeByEmail(email)
    return result
  }, [])

  const value = useMemo(
    () => ({
      session,
      isLoading,
      login,
      loginByCode,
      register,
      logout,
      getSmsCode,
      getEmailCode,
      userDetail,
      refreshUserDetail: refreshUserDetail,
    }),
    [
      session,
      isLoading,
      login,
      loginByCode,
      register,
      logout,
      getSmsCode,
      getEmailCode,
      userDetail,
      refreshUserDetail,
    ],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}
