import { useEffect, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import type { TokenResponse, UserFeatures } from '../types'

export default function AuthVerify() {
  const [params] = useSearchParams()
  const { login, setFeatures } = useAuth()
  const nav = useNavigate()
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true

    const token = params.get('token')
    if (!token) {
      nav('/login?error=missing_token', { replace: true })
      return
    }

    api.get<TokenResponse>(`/auth/verify?token=${encodeURIComponent(token)}`)
      .then(async ({ data }) => {
        login(data.access_token, data.refresh_token)
        try {
          const { data: f } = await api.get<UserFeatures>('/users/me/features')
          setFeatures(f)
          nav(f.onboarding_completed ? '/dashboard' : '/onboarding', { replace: true })
        } catch {
          nav('/dashboard', { replace: true })
        }
      })
      .catch(() => {
        nav('/login?error=invalid_token', { replace: true })
      })
  }, [])

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="text-center">
        <div className="inline-block h-10 w-10 animate-spin rounded-full border-4
          border-brand-500 border-t-transparent mb-4" />
        <p className="text-sm text-gray-400">Signing you in…</p>
      </div>
    </div>
  )
}
