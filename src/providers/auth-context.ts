import { createContext, use } from 'react'

export interface AuthContextType {
  session: IAuthSession | null
  isLoading: boolean
  getSmsCode: (phone: string) => Promise<boolean>
  login: (username: string, password: string) => Promise<void>
  loginByCode: (phone: string, key: string) => Promise<void>
  register: (params: IAuthRegister) => Promise<void>
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextType | null>(null)

export const useAuth = () => {
  const context = use(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
