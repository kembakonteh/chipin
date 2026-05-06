import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'

export default function Login() {
  const { isAuthenticated } = useAuth()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [devLink, setDevLink] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  if (isAuthenticated) return <Navigate to="/dashboard" replace />

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) { toast.error('Enter your email'); return }
    setLoading(true)
    try {
      const res = await api.post<{ message: string; dev_link?: string }>(
        '/auth/send-link', { email: email.trim() }
      )
      setDevLink(res.data.dev_link ?? null)
      setSent(true)
    } catch {
      toast.error('Could not send magic link. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-10">
          <span className="text-5xl block mb-4">🌍</span>
          <p className="text-xs text-brand-400 font-medium tracking-widest uppercase mb-1">KafoTech</p>
          <h1 className="text-3xl font-bold text-white">ChipIn</h1>
          <p className="text-sm text-gray-500 mt-2">Organizer dashboard</p>
        </div>

        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-8 shadow-2xl">
          {sent ? (
            <div className="text-center py-2">
              <span className="text-4xl block mb-4">📬</span>
              <h2 className="text-lg font-semibold text-white mb-2">Check your email</h2>
              <p className="text-sm text-gray-400 mb-4">
                We sent a magic link to <span className="text-brand-300">{email}</span>.
                Click it to sign in.
              </p>

              {/* Dev fallback: show clickable link when SMTP isn't configured */}
              {devLink && (
                <div className="mb-4 rounded-lg border border-yellow-800 bg-yellow-900/20 p-3 text-left">
                  <p className="text-xs text-yellow-400 font-semibold mb-2">
                    Dev mode — SMTP not configured. Use this link:
                  </p>
                  <a
                    href={devLink}
                    className="block text-xs text-brand-300 break-all hover:underline"
                  >
                    {devLink}
                  </a>
                </div>
              )}

              <button
                type="button"
                onClick={() => { setSent(false); setDevLink(null) }}
                className="text-sm text-gray-500 hover:text-brand-300 transition-colors underline"
              >
                Use a different email
              </button>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-semibold text-white mb-1">Sign in</h2>
              <p className="text-sm text-gray-500 mb-6">We'll send you a magic link — no password needed.</p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-xs text-gray-400 mb-1.5">
                    Email address
                  </label>
                  <input
                    id="email"
                    type="email"
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-3
                      text-sm text-white placeholder-gray-600
                      focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-lg bg-brand-600 py-3 text-sm font-semibold text-white
                    hover:bg-brand-500 disabled:opacity-60 transition-colors"
                >
                  {loading ? 'Sending…' : 'Send magic link'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
