import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import type { AxiosResponse } from 'axios'
import { api } from '../lib/api'
import type { SusuGroup, SusuFrequency } from '../types'
import { fmt } from '../types'

function getData<T>(r: AxiosResponse<T>): T { return r.data }

const FREQ_LABELS: Record<SusuFrequency, string> = {
  weekly: 'Weekly',
  biweekly: 'Biweekly',
  monthly: 'Monthly',
}

type PageState = 'form' | 'success' | 'error'

interface JoinForm {
  name: string
  phone: string
  email: string
  message: string
}

const EMPTY: JoinForm = { name: '', phone: '', email: '', message: '' }

export default function SusuJoin() {
  const { slug } = useParams<{ slug: string }>()
  const [state, setState] = useState<PageState>('form')
  const [form, setForm] = useState<JoinForm>(EMPTY)
  const [errorMsg, setErrorMsg] = useState('')

  const { data: group, isLoading } = useQuery<SusuGroup>({
    queryKey: ['public-susu-info', slug],
    queryFn: () => api.get<SusuGroup>(`/s/${slug}`).then(getData),
  })

  const submit = useMutation({
    mutationFn: () =>
      api.post(`/s/${slug}/join`, {
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || null,
        message: form.message.trim() || null,
      }),
    onSuccess: () => setState('success'),
    onError: (err: any) => {
      const detail = err?.response?.data?.detail ?? 'Something went wrong. Please try again.'
      setErrorMsg(detail)
      setState('error')
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.phone.trim()) return
    submit.mutate()
  }

  const headerEl = (
    <header className="border-b border-gray-800 bg-gray-950/90 backdrop-blur sticky top-0 z-20">
      <div className="mx-auto flex max-w-sm items-center justify-between gap-2.5 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="text-xl">🌍</span>
          <div className="leading-none">
            <span className="block text-xs text-brand-400 font-medium">KafoTech</span>
            <span className="block text-sm font-bold text-white">ChipIn · Susu</span>
          </div>
        </div>
        <Link
          to={`/s/${slug}`}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          ← Group page
        </Link>
      </div>
    </header>
  )

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

  if (!group || group.status !== 'forming') {
    return (
      <div className="min-h-screen bg-gray-950">
        {headerEl}
        <div className="mx-auto max-w-sm px-4 py-16 text-center">
          <span className="text-4xl block mb-4">🔒</span>
          <h1 className="text-xl font-bold text-white mb-2">Not Accepting Requests</h1>
          <p className="text-sm text-gray-400">
            {!group
              ? 'This Susu group could not be found.'
              : 'This group is no longer accepting new join requests.'}
          </p>
          <Link
            to={`/s/${slug}`}
            className="inline-block mt-6 text-sm px-4 py-2 rounded-lg bg-brand-700/30 text-brand-300 hover:bg-brand-700/50 border border-brand-700/40 transition-colors"
          >
            View group
          </Link>
        </div>
      </div>
    )
  }

  if (state === 'success') {
    return (
      <div className="min-h-screen bg-gray-950">
        {headerEl}
        <div className="mx-auto max-w-sm px-4 py-16 text-center">
          <span className="text-5xl block mb-4">✅</span>
          <h1 className="text-xl font-bold text-white mb-2">Request Sent!</h1>
          <p className="text-sm text-gray-400 mb-6">
            Your request to join <span className="text-white font-medium">{group.name}</span> has been submitted.
            The organiser will review it and add you to the group.
          </p>
          <Link
            to={`/s/${slug}`}
            className="text-sm px-4 py-2 rounded-lg bg-brand-700/30 text-brand-300 hover:bg-brand-700/50 border border-brand-700/40 transition-colors"
          >
            View group page
          </Link>
        </div>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div className="min-h-screen bg-gray-950">
        {headerEl}
        <div className="mx-auto max-w-sm px-4 py-16 text-center">
          <span className="text-5xl block mb-4">⚠️</span>
          <h1 className="text-xl font-bold text-white mb-2">Request Failed</h1>
          <p className="text-sm text-gray-400 mb-6">{errorMsg}</p>
          <button
            onClick={() => setState('form')}
            className="text-sm px-4 py-2 rounded-lg bg-brand-700/30 text-brand-300 hover:bg-brand-700/50 border border-brand-700/40 transition-colors"
          >
            Try again
          </button>
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
          <h1 className="text-xl font-bold text-white">{group.name}</h1>
          <p className="text-sm text-gray-400 mt-1">
            {FREQ_LABELS[group.frequency]} · {fmt(parseFloat(group.contribution_amount))}/member
          </p>
          <p className="text-xs text-gray-600 mt-1">{group.total_members} member{group.total_members !== 1 ? 's' : ''} so far</p>
        </div>

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
              <label className="block text-xs text-gray-400 mb-1.5">Email (optional)</label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="you@example.com"
                className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:border-brand-500 focus:outline-none"
              />
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
              {submit.isPending ? 'Submitting…' : 'Send Join Request'}
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
