import React, { useCallback, useEffect, useMemo, useState } from 'react'

import {
  authGetSession,
  authLogin,
  authLoginByCode,
  authLogout,
  authRegister,
  getVerifyCode,
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
    setSession(await authLogin(username, password))
  }, [])

  const loginByCode = useCallback(async (phone: string, key: string) => {
    setSession(await authLoginByCode(phone, key))
  }, [])

  const register = useCallback(async (params: IAuthRegister) => {
    setSession(await authRegister({ ...params }))
  }, [])

  const logout = useCallback(async () => {
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
