import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { AxiosResponse } from 'axios'
import { api } from '../lib/api'
import type { SusuDetail, SusuContribution, SusuCycleSummary, SusuCycleStatus, SusuPaidVia } from '../types'
import Layout from '../components/Layout'
import { fmt } from '../types'

function getData<T>(r: AxiosResponse<T>): T { return r.data }

function formatDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

const CYCLE_STATUS_STYLES: Record<SusuCycleStatus, string> = {
  collecting: 'bg-blue-900/40 text-blue-300 border border-blue-800/40',
  collected:  'bg-emerald-900/40 text-emerald-300 border border-emerald-800/40',
  paid_out:   'bg-purple-900/40 text-purple-300 border border-purple-800/40',
  missed:     'bg-red-900/40 text-red-400 border border-red-800/40',
}

const PAID_VIA_OPTIONS: { value: SusuPaidVia; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'zelle', label: 'Zelle' },
  { value: 'cashapp', label: 'CashApp' },
  { value: 'card', label: 'Card' },
]

function ContributionRow({
  contribution,
  cycleNumber,
  groupSlug,
  isCurrentCycle,
}: {
  contribution: SusuContribution
  cycleNumber: number
  groupSlug: string
  isCurrentCycle: boolean
}) {
  const qc = useQueryClient()
  const [payVia, setPayVia] = useState<SusuPaidVia>('cash')

  const markPaid = useMutation({
    mutationFn: () =>
      api.post(`/susu/${groupSlug}/cycles/${cycleNumber}/members/${contribution.member_id}/mark-paid`, {
        paid_via: payVia,
      }).then(getData),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['susu', groupSlug] }),
  })

  return (
    <div className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm ${
      contribution.paid ? 'bg-emerald-900/20 border border-emerald-800/30' : 'bg-gray-800 border border-gray-700'
    }`}>
      <div className="flex items-center gap-2">
        <span className={`text-base ${contribution.paid ? '' : 'opacity-30'}`}>
          {contribution.paid ? '✓' : '○'}
        </span>
        <span className={contribution.paid ? 'text-white' : 'text-gray-400'}>
          {contribution.member_name}
        </span>
        {contribution.paid && contribution.paid_via && (
          <span className="text-xs text-gray-500 capitalize">via {contribution.paid_via}</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className={contribution.paid ? 'text-emerald-400 font-medium text-xs' : 'text-gray-500 text-xs'}>
          {fmt(parseFloat(contribution.amount))}
        </span>
        {!contribution.paid && isCurrentCycle && (
          <div className="flex items-center gap-1">
            <select
              value={payVia}
              onChange={e => setPayVia(e.target.value as SusuPaidVia)}
              onClick={e => e.stopPropagation()}
              className="rounded bg-gray-700 border border-gray-600 text-xs text-gray-300 px-1 py-1 focus:outline-none"
            >
              {PAID_VIA_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <button
              onClick={() => markPaid.mutate()}
              disabled={markPaid.isPending}
              className="text-xs px-2 py-1 rounded bg-brand-700 text-brand-200 hover:bg-brand-600 disabled:opacity-50 transition-colors"
            >
              {markPaid.isPending ? '…' : 'Mark paid'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function CycleSummaryRow({ cycle, isCurrent }: { cycle: SusuCycleSummary; isCurrent: boolean }) {
  const pct = parseFloat(cycle.pot_amount) > 0
    ? Math.min((parseFloat(cycle.collected_amount) / parseFloat(cycle.pot_amount)) * 100, 100)
    : 0

  return (
    <div className={`flex items-center gap-3 px-4 py-3 text-sm ${isCurrent ? 'bg-brand-900/20' : ''}`}>
      <span className="text-gray-500 w-8 text-center text-xs">#{cycle.cycle_number}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-gray-300 truncate">{cycle.recipient_name}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${CYCLE_STATUS_STYLES[cycle.status]}`}>
            {cycle.status.replace('_', ' ')}
          </span>
        </div>
        <div className="h-1 rounded-full bg-gray-700 overflow-hidden">
          <div
            className="h-full rounded-full bg-brand-500 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <div className="text-right text-xs text-gray-500 flex-shrink-0">
        <div>{formatDate(cycle.due_date)}</div>
        <div className="text-gray-600">{fmt(parseFloat(cycle.pot_amount))}</div>
      </div>
    </div>
  )
}

// Import useState at the top
import { useState } from 'react'

export default function SusuDetail() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data: group, isLoading } = useQuery<SusuDetail>({
    queryKey: ['susu', slug],
    queryFn: () => api.get<SusuDetail>(`/susu/${slug}`).then(getData),
    refetchInterval: 30_000,
  })

  const markPayoutSent = useMutation({
    mutationFn: (cycleNum: number) =>
      api.post(`/susu/${slug}/cycles/${cycleNum}/mark-paid-out`).then(getData),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['susu', slug] }),
  })

  if (isLoading) {
    return (
      <Layout>
        <div className="text-center py-20 text-gray-500">Loading…</div>
      </Layout>
    )
  }

  if (!group) {
    return (
      <Layout>
        <div className="text-center py-20 text-gray-500">Group not found.</div>
      </Layout>
    )
  }

  const cycle = group.current_cycle_detail
  const potAmount = cycle ? parseFloat(cycle.pot_amount) : 0
  const collectedAmount = cycle ? parseFloat(cycle.collected_amount) : 0
  const pct = potAmount > 0 ? Math.min((collectedAmount / potAmount) * 100, 100) : 0
  const paidCount = cycle ? cycle.contributions.filter(c => c.paid).length : 0
  const totalCount = cycle ? cycle.contributions.length : 0

  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <button
              onClick={() => navigate('/susu')}
              className="text-xs text-gray-500 hover:text-gray-300 mb-2 transition-colors"
            >
              ← Susu Groups
            </button>
            <h1 className="text-2xl font-bold text-white">{group.name}</h1>
            <p className="text-sm text-gray-500 mt-1">
              {fmt(parseFloat(group.contribution_amount))} · {group.frequency} · {group.total_members} members
            </p>
          </div>
          <div className="text-right">
            <span className={`inline-block text-xs px-3 py-1.5 rounded-full capitalize font-medium ${
              group.status === 'active' ? 'bg-emerald-900/40 text-emerald-300 border border-emerald-800/40'
              : group.status === 'forming' ? 'bg-yellow-900/40 text-yellow-300 border border-yellow-800/40'
              : 'bg-gray-800 text-gray-400 border border-gray-700'
            }`}>
              {group.status}
            </span>
            <div className="text-xs text-gray-500 mt-1.5">
              Cycle {group.current_cycle} of {group.total_cycles}
            </div>
          </div>
        </div>

        {/* Current cycle */}
        {cycle && (
          <div className="rounded-xl border border-gray-700 bg-gray-900 p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-semibold text-white">Cycle {cycle.cycle_number} — Current</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Due {formatDate(cycle.due_date)} · Recipient: <span className="text-brand-300 font-medium">{cycle.recipient_name}</span>
                </p>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-white">{fmt(collectedAmount)}</div>
                <div className="text-xs text-gray-500">of {fmt(potAmount)}</div>
              </div>
            </div>

            <div className="mb-4">
              <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                <span>{paidCount} of {totalCount} paid</span>
                <span>{Math.round(pct)}%</span>
              </div>
              <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-brand-500 transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>

            <div className="space-y-2">
              {cycle.contributions.map(c => (
                <ContributionRow
                  key={c.id}
                  contribution={c}
                  cycleNumber={cycle.cycle_number}
                  groupSlug={slug!}
                  isCurrentCycle={true}
                />
              ))}
            </div>

            {cycle.status === 'collected' && !cycle.payout_sent_at && (
              <button
                onClick={() => markPayoutSent.mutate(cycle.cycle_number)}
                disabled={markPayoutSent.isPending}
                className="mt-4 w-full py-2.5 bg-purple-700 text-white text-sm font-semibold rounded-lg hover:bg-purple-600 disabled:opacity-50 transition-colors"
              >
                {markPayoutSent.isPending ? 'Marking…' : '💸 Mark Payout Sent to ' + cycle.recipient_name}
              </button>
            )}
            {cycle.payout_sent_at && (
              <div className="mt-4 text-center text-xs text-purple-400">
                Payout sent {new Date(cycle.payout_sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </div>
            )}
          </div>
        )}

        {/* Payout schedule */}
        {group.cycle_summaries.length > 0 && (
          <div className="rounded-xl border border-gray-700 bg-gray-900 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-800">
              <h2 className="font-semibold text-white">Payout Schedule</h2>
            </div>
            <div className="divide-y divide-gray-800">
              {group.cycle_summaries.map(s => (
                <CycleSummaryRow
                  key={s.id}
                  cycle={s}
                  isCurrent={s.cycle_number === group.current_cycle}
                />
              ))}
            </div>
          </div>
        )}

        {/* Members */}
        <div className="rounded-xl border border-gray-700 bg-gray-900 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
            <h2 className="font-semibold text-white">Members ({group.total_members})</h2>
            <button
              onClick={() => navigate(`/s/${slug}`)}
              className="text-xs text-brand-400 hover:text-brand-300 transition-colors"
            >
              Public page →
            </button>
          </div>
          <div className="divide-y divide-gray-800">
            {group.members.map(m => {
              const currentContrib = cycle?.contributions.find(c => c.member_id === m.id)
              const isPaid = currentContrib?.paid ?? false
              const isRecipient = cycle?.recipient_member_id === m.id
              return (
                <div key={m.id} className="flex items-center justify-between px-5 py-3">
                  <div className="flex items-center gap-3">
                    {isRecipient && (
                      <span className="text-sm" title="This cycle's recipient">🏆</span>
                    )}
                    <div>
                      <div className="text-sm text-white font-medium">{m.name}</div>
                      <div className="text-xs text-gray-500">{m.phone}</div>
                    </div>
                    {m.payout_position && (
                      <span className="text-xs text-gray-600">#{m.payout_position}</span>
                    )}
                  </div>
                  <div className="text-right">
                    <div className={`text-xs font-medium ${isPaid ? 'text-emerald-400' : 'text-gray-500'}`}>
                      {isPaid ? '✓ Paid this cycle' : '○ Pending'}
                    </div>
                    <div className="text-xs text-gray-600">Total: {fmt(parseFloat(m.total_contributed))}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </Layout>
  )
}
