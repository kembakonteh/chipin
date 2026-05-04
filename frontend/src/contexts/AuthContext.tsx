import { createContext, useContext, useState, useCallback } from 'react'
import type { ReactNode } from 'react'
import { setTokens as apiSetTokens, clearTokens as apiClearTokens } from '../lib/api'

interface AuthCtx {
  isAuthenticated: boolean
  login: (access: string, refresh: string) => void
  logout: () => void
}

const Ctx = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  const login = useCallback((access: string, refresh: string) => {
    apiSetTokens(access, refresh)
    setIsAuthenticated(true)
  }, [])

  const logout = useCallback(() => {
    apiClearTokens()
    setIsAuthenticated(false)
  }, [])

  return <Ctx.Provider value={{ isAuthenticated, login, logout }}>{children}</Ctx.Provider>
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}
