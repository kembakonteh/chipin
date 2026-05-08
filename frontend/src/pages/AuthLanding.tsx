import { useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import type { TokenResponse, UserFeatures } from '../types'

export default function AuthLanding() {
  const [params] = useSearchParams()
  const { login, setFeatures } = useAuth()
  const nav = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const token = params.get('token')

  async function handleSignIn() {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.post<TokenResponse>('/auth/verify', { token })
      login(data.access_token, data.refresh_token)
      try {
        const { data: f } = await api.get<UserFeatures>('/users/me/features')
        setFeatures(f)
        const next = sessionStorage.getItem('auth_next')
        if (next) {
          sessionStorage.removeItem('auth_next')
          nav(next, { replace: true })
        } else {
          nav(f.onboarding_completed ? '/dashboard' : '/onboarding', { replace: true })
        }
      } catch {
        nav('/dashboard', { replace: true })
      }
    } catch {
      setError('This link has expired or already been used. Please request a new one.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-8 text-center shadow-xl">
          <div className="text-4xl mb-4">💸</div>
          <h1 className="text-xl font-bold text-white mb-1">Sign in to ChipIn</h1>
          <p className="text-sm text-gray-400 mb-8">
            {token ? 'Your sign-in link is ready.' : 'No sign-in link found.'}
          </p>

          {error && (
            <div className="mb-5 rounded-lg border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-300">
              {error}
              <div className="mt-2">
                <a href="/login" className="text-red-400 underline hover:text-red-300 text-xs">
                  Request a new link
                </a>
              </div>
            </div>
          )}

          {token && !error && (
            <button
              type="button"
              onClick={handleSignIn}
              disabled={loading}
              className="w-full rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white
                hover:bg-brand-500 disabled:opacity-60 transition-colors"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2
                    border-white border-t-transparent" />
                  Signing in…
                </span>
              ) : (
                'Sign in to ChipIn'
              )}
            </button>
          )}

          {!token && (
            <a
              href="/login"
              className="inline-block text-sm text-brand-400 hover:text-brand-300 underline"
            >
              Request a new sign-in link
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
