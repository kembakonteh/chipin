import { useParams, useSearchParams, Link } from 'react-router-dom'
import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import type { AxiosResponse } from 'axios'
import { api } from '../lib/api'
import type { SusuDetail, SusuFrequency, SusuMember } from '../types'
import { fmt } from '../types'

function getData<T>(r: AxiosResponse<T>): T { return r.data }

const FREQ_LABELS: Record<SusuFrequency, string> = {
  weekly: 'Weekly',
  biweekly: 'Biweekly',
  monthly: 'Monthly',
}

function formatDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function paymentWindowLabel(frequency: SusuFrequency, days: number): string {
  if (frequency === 'monthly') return `Last ${days} days of each month`
  if (frequency === 'biweekly') return `Last ${days} days of each 2-week period`
  return `Last ${days} days of each week`
}

function PayModal({
  member,
  groupSlug,
  amount,
  onClose,
}: {
  member: SusuMember
  groupSlug: string
  amount: string
  onClose: () => void
}) {
  const [email, setEmail] = useState(member.email ?? '')
  const [error, setError] = useState<string | null>(null)

  const checkout = useMutation({
    mutationFn: () =>
      api.post<{ checkout_url: string }>(`/s/${groupSlug}/pay`, {
        member_id: member.id,
        email: email || undefined,
      }).then(getData),
    onSuccess: (data) => {
      window.location.href = data.checkout_url
    },
    onError: (e: any) => setError(e?.response?.data?.detail ?? 'Payment error'),
  })

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-sm rounded-2xl border border-gray-700 bg-gray-900 p-6 shadow-xl">
        <h2 className="text-lg font-bold text-white mb-1">Pay Contribution</h2>
        <p className="text-sm text-gray-500 mb-5">
          {member.name} · {fmt(parseFloat(amount))}
          {member.slots > 1 && <span className="ml-1 text-xs text-brand-400">({member.slots} hands)</span>}
        </p>

        {error && (
          <div className="mb-4 rounded-lg bg-red-900/30 border border-red-800 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="mb-4">
          <label className="block text-xs text-gray-400 mb-1.5">Email for receipt (optional)</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:border-brand-500 focus:outline-none"
          />
        </div>

        <button
          onClick={() => checkout.mutate()}
          disabled={checkout.isPending}
          className="w-full py-3 bg-brand-600 text-white font-semibold rounded-lg hover:bg-brand-500 disabled:opacity-50 transition-colors"
        >
          {checkout.isPending ? 'Redirecting…' : `Pay ${fmt(parseFloat(amount))} with Card`}
        </button>

        <button
          type="button"
          onClick={onClose}
          className="mt-3 w-full py-2 text-sm text-gray-500 hover:text-gray-300 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

export default function PublicSusu() {
  const { slug } = useParams<{ slug: string }>()
  const [searchParams] = useSearchParams()
  const justPaid = searchParams.get('paid') === '1'
  const [payingMember, setPayingMember] = useState<SusuMember | null>(null)

  const { data: group, isLoading } = useQuery<SusuDetail>({
    queryKey: ['public-susu', slug],
    queryFn: () => api.get<SusuDetail>(`/s/${slug}`).then(getData),
    refetchInterval: 60_000,
  })

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-500">Loading…</p>
      </div>
    )
  }

  if (!group) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-400">Susu group not found.</p>
      </div>
    )
  }

  const cycle = group.current_cycle_detail
  const potAmount = cycle ? parseFloat(cycle.pot_amount) : 0
  const collectedAmount = cycle ? parseFloat(cycle.collected_amount) : 0
  const pct = potAmount > 0 ? Math.min((collectedAmount / potAmount) * 100, 100) : 0
  const payWindow = group.payment_window_days ?? 5

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-950/90 backdrop-blur sticky top-0 z-20">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-2.5 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🌍</span>
            <div className="leading-none">
              <span className="block text-xs text-brand-400 font-medium">KafoTech</span>
              <span className="block text-sm font-bold text-white">ChipIn · Susu</span>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-4 py-8 space-y-6">
        {justPaid && (
          <div className="rounded-xl bg-emerald-900/30 border border-emerald-700 px-4 py-3 text-sm text-emerald-300 text-center">
            Payment received! Thank you.
          </div>
        )}

        {/* Group info */}
        <div className="text-center">
          <div className="text-4xl mb-3">🤝</div>
          <h1 className="text-2xl font-bold text-white">{group.name}</h1>
          {group.organizer_first_name && (
            <p className="text-xs text-gray-500 mt-1">
              Organised by <span className="text-gray-300">{group.organizer_first_name}</span>
            </p>
          )}
        </div>

        {/* Details card */}
        <div className="rounded-xl border border-gray-700 bg-gray-900 divide-y divide-gray-800">
          <div className="flex items-center gap-3 px-5 py-3.5">
            <span className="text-base">💰</span>
            <div className="flex-1 flex items-center justify-between">
              <span className="text-xs text-gray-400">Contribution</span>
              <span className="text-sm text-white font-medium">
                {fmt(parseFloat(group.contribution_amount))} per member
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3 px-5 py-3.5">
            <span className="text-base">📅</span>
            <div className="flex-1 flex items-center justify-between">
              <span className="text-xs text-gray-400">Frequency</span>
              <span className="text-sm text-white font-medium">{FREQ_LABELS[group.frequency]}</span>
            </div>
          </div>
          <div className="flex items-center gap-3 px-5 py-3.5">
            <span className="text-base">👥</span>
            <div className="flex-1 flex items-center justify-between">
              <span className="text-xs text-gray-400">Members</span>
              <span className="text-sm text-white font-medium">{group.total_members}</span>
            </div>
          </div>
          <div className="flex items-center gap-3 px-5 py-3.5">
            <span className="text-base">🔄</span>
            <div className="flex-1 flex items-center justify-between">
              <span className="text-xs text-gray-400">Cycles</span>
              <span className="text-sm text-white font-medium">
                {group.total_cycles > 0 ? `${group.current_cycle} of ${group.total_cycles}` : '—'}
              </span>
            </div>
          </div>
        </div>

        {/* Payment window */}
        <div className="rounded-xl border border-gray-700 bg-gray-900 px-5 py-4 flex items-start gap-3">
          <span className="text-base mt-0.5">⏰</span>
          <div>
            <p className="text-sm font-medium text-white mb-0.5">Payment window</p>
            <p className="text-xs text-gray-400">{paymentWindowLabel(group.frequency, payWindow)}</p>
          </div>
        </div>

        {/* Group rules */}
        {group.rules && (
          <div className="rounded-xl border border-gray-700 bg-gray-900 p-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Group Rules</p>
            <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">{group.rules}</p>
          </div>
        )}

        {/* Request to Join */}
        {group.accepting_members && (
          <Link
            to={`/s/${slug}/join`}
            className="block w-full py-3 bg-brand-600 text-white font-semibold rounded-xl text-center hover:bg-brand-500 transition-colors"
          >
            Request to Join
          </Link>
        )}

        {/* Current cycle progress */}
        {cycle && (
          <div className="rounded-xl border border-gray-700 bg-gray-900 p-5">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-semibold text-white">Cycle {cycle.cycle_number} of {group.total_cycles}</h2>
              <span className="text-xs text-gray-500">Due {formatDate(cycle.due_date)}</span>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              Pot goes to: <span className="text-brand-300 font-medium">{cycle.recipient_name}</span>
            </p>

            <div className="flex items-end justify-between mb-2">
              <span className="text-2xl font-bold text-white">{fmt(collectedAmount)}</span>
              <span className="text-sm text-gray-500">of {fmt(potAmount)}</span>
            </div>
            <div className="h-3 rounded-full bg-gray-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-brand-500 transition-all duration-700"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="mt-2 text-xs text-gray-500 text-right">{Math.round(pct)}% collected</div>
          </div>
        )}

        {/* Member list */}
        {cycle && (
          <div className="rounded-xl border border-gray-700 bg-gray-900 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-800">
              <h2 className="font-semibold text-white text-sm">Members</h2>
            </div>
            <div className="divide-y divide-gray-800">
              {group.members.map(m => {
                const contrib = cycle.contributions.find(c => c.member_id === m.id)
                const isPaid = contrib?.paid ?? false
                const isRecipient = cycle.recipient_member_id === m.id
                const isActive = group.status === 'active' && !isPaid
                const memberAmount = parseFloat(contrib?.amount ?? '0') || (m.slots * parseFloat(group.contribution_amount))

                return (
                  <div key={m.id} className={`flex items-center justify-between px-5 py-3.5 ${
                    isRecipient ? 'bg-brand-900/20' : ''
                  }`}>
                    <div className="flex items-center gap-3">
                      <span className={`text-base font-bold w-6 text-center ${
                        isPaid ? 'text-emerald-400' : 'text-gray-600'
                      }`}>
                        {isPaid ? '✓' : '○'}
                      </span>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className={`text-sm font-medium ${isPaid ? 'text-white' : 'text-gray-400'}`}>
                            {m.name}
                          </span>
                          {m.slots > 1 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-brand-900/40 text-brand-300 border border-brand-800/40">
                              {m.slots} hands
                            </span>
                          )}
                          {isRecipient && (
                            <span className="text-xs text-brand-400">🏆 Recipient</span>
                          )}
                        </div>
                        {isPaid && contrib?.paid_via && (
                          <span className="text-xs text-gray-600 capitalize">via {contrib.paid_via}</span>
                        )}
                      </div>
                    </div>
                    {isActive && (
                      <button
                        onClick={() => setPayingMember(m)}
                        className="text-xs px-3 py-1.5 rounded-lg bg-brand-600 text-white hover:bg-brand-500 transition-colors"
                      >
                        Pay {fmt(memberAmount)}
                      </button>
                    )}
                    {isPaid && (
                      <span className="text-xs text-emerald-400 font-medium">Paid</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* All cycles mini schedule */}
        {group.cycle_summaries.length > 1 && (
          <div className="rounded-xl border border-gray-700 bg-gray-900 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-800">
              <h2 className="font-semibold text-white text-sm">Schedule</h2>
            </div>
            <div className="divide-y divide-gray-800">
              {group.cycle_summaries.map(s => (
                <div key={s.id} className={`flex items-center justify-between px-5 py-2.5 text-xs ${
                  s.cycle_number === group.current_cycle ? 'bg-brand-900/10' : ''
                }`}>
                  <div className="flex items-center gap-3">
                    <span className="text-gray-600 w-5 text-center">#{s.cycle_number}</span>
                    <span className={s.cycle_number === group.current_cycle ? 'text-brand-300 font-medium' : 'text-gray-400'}>
                      {s.recipient_name}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-gray-500">
                    <span>{formatDate(s.due_date)}</span>
                    <span className={`capitalize px-1.5 py-0.5 rounded text-xs ${
                      s.status === 'paid_out' ? 'bg-purple-900/40 text-purple-300' :
                      s.status === 'collected' ? 'bg-emerald-900/40 text-emerald-300' :
                      s.status === 'collecting' && s.cycle_number === group.current_cycle ? 'bg-blue-900/40 text-blue-300' :
                      'text-gray-600'
                    }`}>
                      {s.status === 'paid_out' ? 'Paid out' : s.status === 'collected' ? 'Collected' : s.cycle_number === group.current_cycle ? 'Now' : ''}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-center text-xs text-gray-600 pb-4">
          Powered by KafoTech ChipIn
        </p>
      </main>

      {payingMember && (
        <PayModal
          member={payingMember}
          groupSlug={slug!}
          amount={group.contribution_amount}
          onClose={() => setPayingMember(null)}
        />
      )}
    </div>
  )
}
