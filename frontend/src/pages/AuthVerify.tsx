import { useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'

// This route exists only for backward-compatibility with old magic-link emails
// that still point to /auth/verify?token=xxx. It immediately redirects to
// /auth/landing so the token is NOT consumed on load (scanner-safe).
export default function AuthVerify() {
  const [params] = useSearchParams()
  const nav = useNavigate()

  useEffect(() => {
    const token = params.get('token')
    if (token) {
      nav(`/auth/landing?token=${encodeURIComponent(token)}`, { replace: true })
    } else {
      nav('/login?error=missing_token', { replace: true })
    }
  }, [])

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="text-center">
        <div className="inline-block h-10 w-10 animate-spin rounded-full border-4
          border-brand-500 border-t-transparent mb-4" />
        <p className="text-sm text-gray-400">Redirecting…</p>
      </div>
    </div>
  )
}
