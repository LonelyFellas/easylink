import React, { useCallback, useEffect, useMemo, useState } from 'react'

import {
  authGetSession,
  authLogin,
  authLoginByCode,
  authLogout,
  authRegister,
  getVerifyCode,
  patchVergeConfig,
} from '@/services/cmds'

import { AuthContext } from './auth-context'

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<IAuthSession | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let active = true
    authGetSession()
      .then((s) => {
        if (active) setSession(s)
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
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    const next = await authLogin(username, password)
    setSession(next)
    return next
  }, [])

  const loginByCode = useCallback(async (phone: string, key: string) => {
    const next = await authLoginByCode(phone, key)
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

  const value = useMemo(
    () => ({
      session,
      isLoading,
      login,
      loginByCode,
      register,
      logout,
      getSmsCode,
    }),
    [session, isLoading, login, loginByCode, register, logout, getSmsCode],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}
