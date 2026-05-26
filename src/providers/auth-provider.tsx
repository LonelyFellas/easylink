import React, { useCallback, useEffect, useMemo, useState } from 'react'

import {
  authGetSession,
  authLogin,
  authLogout,
  authRegister,
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

  const register = useCallback(async (username: string, password: string) => {
    setSession(await authRegister(username, password))
  }, [])

  const logout = useCallback(async () => {
    await authLogout()
    setSession(null)
  }, [])

  const value = useMemo(
    () => ({ session, isLoading, login, register, logout }),
    [session, isLoading, login, register, logout],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}
