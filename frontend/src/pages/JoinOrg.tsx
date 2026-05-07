import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'

interface OrgInvitePreview {
  org_name: string
  description: string | null
  member_count: number
  slug: string
}

export default function JoinOrg() {
  const { token } = useParams<{ token: string }>()
  const { isAuthenticated } = useAuth()
  const nav = useNavigate()
  const [preview, setPreview] = useState<OrgInvitePreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) { setError('Invalid invite link'); setLoading(false); return }
    api.get<OrgInvitePreview>(`/o/invite/${token}`)
      .then(({ data }) => setPreview(data))
      .catch(() => setError('This invite link is invalid or has expired.'))
      .finally(() => setLoading(false))
  }, [token])

  async function handleJoin() {
    if (!isAuthenticated) {
      nav(`/login?next=/join/${token}`, { replace: true })
      return
    }
    setJoining(true)
    try {
      const { data } = await api.post<{ message: string; org_slug: string }>(`/o/invite/${token}/join`)
      if (data.message === 'already_member') {
        toast('You are already a member of this org.')
      } else {
        toast.success(`Joined ${preview?.org_name}!`)
      }
      nav(`/orgs/${data.org_slug}`, { replace: true })
    } catch {
      toast.error('Failed to join. Please try again.')
    } finally {
      setJoining(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="inline-block h-10 w-10 animate-spin rounded-full border-4
          border-brand-500 border-t-transparent" />
      </div>
    )
  }

  if (error || !preview) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
        <div className="text-center">
          <div className="text-4xl mb-4">🔗</div>
          <h1 className="text-xl font-semibold text-white mb-2">Invalid Invite</h1>
          <p className="text-gray-400 text-sm">{error || 'This invite link is no longer valid.'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center">
          <div className="text-5xl mb-4">👥</div>
          <h1 className="text-2xl font-bold text-white mb-1">{preview.org_name}</h1>
          {preview.description && (
            <p className="text-gray-400 text-sm mb-4">{preview.description}</p>
          )}
          <p className="text-gray-500 text-xs mb-6">
            {preview.member_count} {preview.member_count === 1 ? 'member' : 'members'}
          </p>
          <button
            onClick={handleJoin}
            disabled={joining}
            className="w-full py-3 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-50
              text-white font-semibold transition-colors"
          >
            {joining ? 'Joining…' : isAuthenticated ? 'Join Organisation' : 'Sign in to Join'}
          </button>
        </div>
      </div>
    </div>
  )
}
