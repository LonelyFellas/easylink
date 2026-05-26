import type { ReactNode } from 'react'
import { Navigate } from 'react-router'

import { useAuth } from './auth-context'

export const RequireAuth = ({ children }: { children: ReactNode }) => {
  const { session, isLoading } = useAuth()
  if (isLoading) return null
  if (!session) return <Navigate to="/login" replace />
  return <>{children}</>
}
