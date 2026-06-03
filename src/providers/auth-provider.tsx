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
  useEffect(() => {
    let active = true
    authGetSession()
      .then((s) => {
        if (active) {
          setSession(s)
          if (s?.id) {
            fetchUserDetail(s.id.toString())
          }
        }
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
  }, [fetchUserDetail])

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

  const login = useCallback(async (username: string, password: string) => {
    const next = await authLogin(username, { password })
    setSession(next)
    return next
  }, [])

  const loginByCode = useCallback(async (phone: string, code: string) => {
    const next = await authLogin(phone, { code })
    setSession(next)
    return next
  }, [])

  const register = useCallback(async (params: IAuthRegister) => {
    const next = await authRegister({ ...params })
    setSession(next)
    return next
  }, [])

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
