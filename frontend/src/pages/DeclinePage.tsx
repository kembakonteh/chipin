import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'

type State = 'loading' | 'success' | 'error'

interface DeclineResponse {
  message: string
  campaign_title: string
  campaign_slug: string
}

export default function DeclinePage() {
  const { slug } = useParams<{ slug: string }>()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')

  const [state, setState] = useState<State>('loading')
  const [campaignTitle, setCampaignTitle] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (!token || !slug) {
      setErrorMsg('This link is missing required information. Please ask the organiser to resend the invite.')
      setState('error')
      return
    }

    api.post<DeclineResponse>(`/campaigns/${slug}/decline?token=${encodeURIComponent(token)}`)
      .then(r => {
        setCampaignTitle(r.data.campaign_title)
        setState('success')
      })
      .catch(err => {
        const detail = err?.response?.data?.detail
        setErrorMsg(detail ?? 'This link is invalid or has expired. Please ask the organiser to resend the invite.')
        setState('error')
      })
  }, [slug, token])

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        {/* Logo */}
        <div className="mb-10">
          <span className="text-4xl block mb-3">🌍</span>
          <p className="text-xs text-brand-400 font-medium tracking-widest uppercase mb-1">KafoTech</p>
          <h1 className="text-2xl font-bold text-white">ChipIn</h1>
        </div>

        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-8 shadow-2xl">
          {state === 'loading' && (
            <div className="space-y-3">
              <div className="h-8 w-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-sm text-gray-400">Processing your response…</p>
            </div>
          )}

          {state === 'success' && (
            <div className="space-y-3">
              <span className="text-4xl block">✅</span>
              <h2 className="text-lg font-semibold text-white">Response recorded</h2>
              <p className="text-sm text-gray-400">
                You've declined to contribute to <span className="text-white font-medium">{campaignTitle}</span>.
                The organiser has been notified. Thank you for letting them know.
              </p>
            </div>
          )}

          {state === 'error' && (
            <div className="space-y-3">
              <span className="text-4xl block">⚠️</span>
              <h2 className="text-lg font-semibold text-white">Link not valid</h2>
              <p className="text-sm text-gray-400">{errorMsg}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
