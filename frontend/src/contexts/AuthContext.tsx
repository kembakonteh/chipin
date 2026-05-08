import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import type { ReactNode } from 'react'
import { setTokens as apiSetTokens, clearTokens as apiClearTokens, hasTokens, api } from '../lib/api'
import type { UserFeatures } from '../types'

const FEATURES_KEY = 'chipin_features'

function loadFeatures(): UserFeatures | null {
  try {
    const s = localStorage.getItem(FEATURES_KEY)
    return s ? (JSON.parse(s) as UserFeatures) : null
  } catch {
    return null
  }
}

interface AuthCtx {
  isAuthenticated: boolean
  features: UserFeatures | null
  login: (access: string, refresh: string) => void
  logout: () => void
  setFeatures: (f: UserFeatures) => void
}

const Ctx = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(hasTokens)
  // Seed from localStorage so tabs render correctly on the first paint after reload
  const [features, setFeaturesState] = useState<UserFeatures | null>(loadFeatures)

  // Re-fetch from the API on every mount where the user is authenticated.
  // This covers page reloads, PWA foreground restores, and fresh logins.
  useEffect(() => {
    if (!isAuthenticated) return
    api.get<UserFeatures>('/users/me/features')
      .then(({ data }) => {
        setFeaturesState(data)
        localStorage.setItem(FEATURES_KEY, JSON.stringify(data))
      })
      .catch((err) => {
        if (err?.response?.status === 401) {
          apiClearTokens()
          localStorage.removeItem(FEATURES_KEY)
          setIsAuthenticated(false)
          setFeaturesState(null)
        }
        // Non-401 (network error etc.) — keep the localStorage snapshot in place
      })
  }, [isAuthenticated])

  const login = useCallback((access: string, refresh: string) => {
    apiSetTokens(access, refresh)
    setIsAuthenticated(true)
  }, [])

  const logout = useCallback(() => {
    apiClearTokens()
    localStorage.removeItem(FEATURES_KEY)
    setIsAuthenticated(false)
    setFeaturesState(null)
  }, [])

  const setFeatures = useCallback((f: UserFeatures) => {
    setFeaturesState(f)
    localStorage.setItem(FEATURES_KEY, JSON.stringify(f))
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
