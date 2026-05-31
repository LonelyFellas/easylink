import { createContext, use } from 'react'

export interface AuthContextType {
  session: IAuthSession | null
  isLoading: boolean
  getSmsCode: (phone: string) => Promise<boolean>
  login: (username: string, password: string) => Promise<IAuthSession>
  loginByCode: (phone: string, key: string) => Promise<IAuthSession>
  register: (params: IAuthRegister) => Promise<IAuthSession>
  logout: () => Promise<void>
  userDetail: IUserDetail | null
  refreshUserDetail: () => Promise<void>
}

export const AuthContext = createContext<AuthContextType | null>(null)

export const useAuth = () => {
  const context = use(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
