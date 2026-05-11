import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import type { AxiosResponse } from 'axios'
import { api } from '../lib/api'
import type { SusuJoinPageInfo, SusuFrequency } from '../types'
import { fmt } from '../types'

function getData<T>(r: AxiosResponse<T>): T { return r.data }

const FREQ_LABELS: Record<SusuFrequency, string> = {
  weekly: 'Weekly',
  biweekly: 'Biweekly',
  monthly: 'Monthly',
}

type PageState = 'form' | 'success'

interface JoinForm {
  name: string
  phone: string
  message: string
}

const EMPTY: JoinForm = { name: '', phone: '', message: '' }

const headerEl = (
  <header className="border-b border-gray-800 bg-gray-950/90 backdrop-blur sticky top-0 z-20">
    <div className="mx-auto flex max-w-sm items-center px-4 py-3">
      <span className="text-xl mr-2.5">🌍</span>
      <div className="leading-none">
        <span className="block text-xs text-brand-400 font-medium">KafoTech</span>
        <span className="block text-sm font-bold text-white">ChipIn · Susu</span>
      </div>
    </div>
  </header>
)

export default function SusuJoin() {
  const { slug } = useParams<{ slug: string }>()
  const [state, setState] = useState<PageState>('form')
  const [form, setForm] = useState<JoinForm>(EMPTY)

  const { data: info, isLoading } = useQuery<SusuJoinPageInfo>({
    queryKey: ['susu-join-info', slug],
    queryFn: () => api.get<SusuJoinPageInfo>(`/s/${slug}/join-info`).then(getData),
  })

  const submit = useMutation({
    mutationFn: () =>
      api.post(`/s/${slug}/join`, {
        name: form.name.trim(),
        phone: form.phone.trim(),
        message: form.message.trim() || null,
      }),
    onSuccess: () => setState('success'),
    onError: (err: any) => {
      const detail = err?.response?.data?.detail ?? 'Something went wrong. Please try again.'
      alert(detail)
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.phone.trim()) return
    submit.mutate()
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-950">
        {headerEl}
        <div className="flex items-center justify-center py-20">
          <p className="text-gray-500">Loading…</p>
        </div>
      </div>
    )
  }

  if (!info || !info.accepting) {
    return (
      <div className="min-h-screen bg-gray-950">
        {headerEl}
        <div className="mx-auto max-w-sm px-4 py-16 text-center">
          <span className="text-4xl block mb-4">🔒</span>
          <h1 className="text-xl font-bold text-white mb-2">
            {!info ? 'Group Not Found' : 'No Longer Accepting Members'}
          </h1>
          <p className="text-sm text-gray-400">
            {!info
              ? 'This Susu group could not be found.'
              : info.has_started
                ? 'This susu has already started and is no longer accepting new members.'
                : 'This susu is no longer accepting new members.'}
          </p>
        </div>
      </div>
    )
  }

  if (state === 'success') {
    const organizer = info.organizer_name ?? 'The organiser'
    const organizerDisplay = organizer.charAt(0).toUpperCase() + organizer.slice(1)
    return (
      <div className="min-h-screen bg-gray-950">
        {headerEl}
        <div className="mx-auto max-w-sm px-4 py-16 text-center">
          <span className="text-5xl block mb-4">✅</span>
          <h1 className="text-xl font-bold text-white mb-2">Request Sent!</h1>
          <p className="text-sm text-gray-400">
            {organizerDisplay} will be in touch.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950">
      {headerEl}
      <main className="mx-auto max-w-sm px-4 py-8 space-y-6">
        <div className="text-center">
          <div className="text-4xl mb-3">🤝</div>
          <h1 className="text-xl font-bold text-white">{info.name}</h1>
          {info.frequency && info.contribution_amount && (
            <p className="text-sm text-gray-400 mt-1">
              {FREQ_LABELS[info.frequency]} · {fmt(parseFloat(String(info.contribution_amount)))}/member
            </p>
          )}
          {info.total_members != null && (
            <p className="text-xs text-gray-600 mt-1">
              {info.total_members} member{info.total_members !== 1 ? 's' : ''} so far
            </p>
          )}
          {info.organizer_name && (
            <p className="text-xs text-gray-500 mt-1">
              Organised by <span className="text-gray-300">{info.organizer_name}</span>
            </p>
          )}
        </div>

        {info.rules && (
          <div className="rounded-xl border border-gray-700 bg-gray-900 p-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Group Rules</p>
            <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">{info.rules}</p>
          </div>
        )}

        <div className="rounded-2xl border border-gray-700 bg-gray-900 p-6 shadow-xl">
          <h2 className="text-base font-semibold text-white mb-4">Request to join</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Full name *</label>
              <input
                required
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Your full name"
                className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:border-brand-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Phone number *</label>
              <input
                required
                type="tel"
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="+1 206 555 0100"
                className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:border-brand-500 focus:outline-none"
              />
              <p className="mt-1 text-xs text-gray-600">Include country code for WhatsApp notifications</p>
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Message to organiser (optional)</label>
              <textarea
                value={form.message}
                onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                placeholder="Introduce yourself or explain why you'd like to join…"
                rows={3}
                maxLength={500}
                className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:border-brand-500 focus:outline-none resize-none"
              />
            </div>

            <button
              type="submit"
              disabled={submit.isPending || !form.name.trim() || !form.phone.trim()}
              className="w-full py-3 bg-brand-600 text-white font-semibold rounded-lg hover:bg-brand-500 disabled:opacity-50 transition-colors"
            >
              {submit.isPending ? 'Submitting…' : 'Request to Join'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-600 pb-4">
          Powered by KafoTech ChipIn
        </p>
      </main>
    </div>
  )
}
