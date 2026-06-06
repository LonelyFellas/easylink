import React, { useCallback, useEffect, useMemo, useState } from 'react'

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

  // 登录后刷新详情：失败也不阻断登录流程（卡片会回退到 session）
  const safeFetchUserDetail = useCallback(
    async (userId: string) => {
      try {
        await fetchUserDetail(userId)
      } catch (error) {
        console.warn('[AuthProvider] 拉取个人详情失败:', error)
      }
    },
    [fetchUserDetail],
  )

  // 设置会话并按新账号刷新详情：三个登录入口共用，确保切换账号时
  // userDetail 与 session 同步更新（卡片优先展示 userDetail）。
  const applySession = useCallback(
    async (next: IAuthSession) => {
      setSession(next)
      if (next?.id) await safeFetchUserDetail(next.id.toString())
      return next
    },
    [safeFetchUserDetail],
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
      authLogin(username, { password }).then(applySession),
    [applySession],
  )

  const loginByCode = useCallback(
    (phone: string, code: string) =>
      authLogin(phone, { code }).then(applySession),
    [applySession],
  )

  const register = useCallback(
    (params: IAuthRegister) => authRegister({ ...params }).then(applySession),
    [applySession],
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
