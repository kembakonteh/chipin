import { createContext, useContext, useState, useCallback } from 'react'
import type { ReactNode } from 'react'
import { setTokens as apiSetTokens, clearTokens as apiClearTokens } from '../lib/api'
import type { UserFeatures } from '../types'

interface AuthCtx {
  isAuthenticated: boolean
  features: UserFeatures | null
  login: (access: string, refresh: string) => void
  logout: () => void
  setFeatures: (f: UserFeatures) => void
}

const Ctx = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [features, setFeaturesState] = useState<UserFeatures | null>(null)

  const login = useCallback((access: string, refresh: string) => {
    apiSetTokens(access, refresh)
    setIsAuthenticated(true)
  }, [])

  const logout = useCallback(() => {
    apiClearTokens()
    setIsAuthenticated(false)
    setFeaturesState(null)
  }, [])

  const setFeatures = useCallback((f: UserFeatures) => {
    setFeaturesState(f)
  }, [])

  return (
    <Ctx.Provider value={{ isAuthenticated, features, login, logout, setFeatures }}>
      {children}
    </Ctx.Provider>
  )
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}
