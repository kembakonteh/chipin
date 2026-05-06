import { useState } from 'react'
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
  { value: 'cash',    label: 'Cash' },
  { value: 'zelle',   label: 'Zelle' },
  { value: 'cashapp', label: 'CashApp' },
  { value: 'card',    label: 'Card' },
]

// ── Contribution row ──────────────────────────────────────────────────────────

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

// ── Cycle summary row ─────────────────────────────────────────────────────────

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

// ── History tab ───────────────────────────────────────────────────────────────

interface HistoryRow {
  member_id: string
  member_name: string
  payout_position: number | null
  total_contributed: string
  cycles: { cycle_number: number; paid: boolean; paid_via: string | null }[]
}

interface HistoryData {
  total_cycles: number
  current_cycle: number
  members: HistoryRow[]
}

function HistoryTab({ groupSlug }: { groupSlug: string }) {
  const { data, isLoading } = useQuery<HistoryData>({
    queryKey: ['susu-history', groupSlug],
    queryFn: () => api.get<HistoryData>(`/susu/${groupSlug}/history`).then(getData),
  })

  if (isLoading) return <div className="text-center py-10 text-gray-500 text-sm">Loading…</div>
  if (!data || data.members.length === 0) return (
    <div className="text-center py-10 text-gray-500 text-sm">No history yet.</div>
  )

  const visibleCycles = data.members[0]?.cycles ?? []

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-800">
            <th className="text-left px-3 py-2.5 font-medium text-gray-400 whitespace-nowrap">Member</th>
            {visibleCycles.map(c => (
              <th
                key={c.cycle_number}
                className={`px-2 py-2.5 font-medium text-center whitespace-nowrap ${
                  c.cycle_number === data.current_cycle ? 'text-brand-300' : 'text-gray-500'
                }`}
              >
                #{c.cycle_number}
                {c.cycle_number === data.current_cycle && (
                  <span className="block text-brand-500/60 text-[10px]">now</span>
                )}
              </th>
            ))}
            <th className="text-right px-3 py-2.5 font-medium text-gray-400">Total paid</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800/60">
          {data.members.map(m => {
            const paidCount = m.cycles.filter(c => c.paid).length
            const doneCycles = m.cycles.filter(c => c.cycle_number <= data.current_cycle)
            const doneCount = doneCycles.length
            return (
              <tr key={m.member_id} className="hover:bg-gray-800/30 transition-colors">
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <span className="text-white font-medium">{m.member_name}</span>
                  {m.payout_position && (
                    <span className="text-gray-600 ml-1.5">#{m.payout_position}</span>
                  )}
                </td>
                {m.cycles.map(c => (
                  <td key={c.cycle_number} className="px-2 py-2.5 text-center">
                    {c.cycle_number > data.current_cycle ? (
                      <span className="text-gray-700">–</span>
                    ) : c.paid ? (
                      <span className="text-emerald-400" title={c.paid_via ?? ''}>✓</span>
                    ) : (
                      <span className="text-red-400/70">✗</span>
                    )}
                  </td>
                ))}
                <td className="px-3 py-2.5 text-right whitespace-nowrap">
                  <span className={`font-semibold ${
                    paidCount === doneCount && doneCount > 0
                      ? 'text-emerald-400'
                      : paidCount === 0 && doneCount > 0
                        ? 'text-red-400'
                        : 'text-yellow-400'
                  }`}>
                    {paidCount}/{doneCount}
                  </span>
                  <span className="text-gray-600 ml-1">{fmt(parseFloat(m.total_contributed))}</span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

type DetailTab = 'current' | 'schedule' | 'members' | 'history'

interface AddMemberForm {
  name: string
  phone: string
  email: string
}

export default function SusuDetail() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [tab, setTab] = useState<DetailTab>('current')
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState<AddMemberForm>({ name: '', phone: '', email: '' })
  const [addError, setAddError] = useState('')

  const addMember = useMutation({
    mutationFn: () =>
      api.post(`/susu/${slug}/members`, {
        name: addForm.name.trim(),
        phone: addForm.phone.trim(),
        email: addForm.email.trim() || null,
      }).then(getData),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['susu', slug] })
      setAddForm({ name: '', phone: '', email: '' })
      setAddError('')
      setShowAdd(false)
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setAddError(msg ?? 'Failed to add member.')
    },
  })

  const { data: group, isLoading } = useQuery<SusuDetail>({
    queryKey: ['susu', slug],
    queryFn: () => api.get<SusuDetail>(`/susu/${slug}`).then(getData),
    refetchInterval: 30_000,
  })

  const startGroup = useMutation({
    mutationFn: () => api.post<SusuDetail>(`/susu/${slug}/start`).then(getData),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['susu', slug] }),
  })

  const markPayoutSent = useMutation({
    mutationFn: (cycleNum: number) =>
      api.post(`/susu/${slug}/cycles/${cycleNum}/mark-paid-out`).then(getData),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['susu', slug] }),
  })

  const advanceCycle = useMutation({
    mutationFn: () => api.post<SusuDetail>(`/susu/${slug}/advance`).then(getData),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['susu', slug] })
      qc.invalidateQueries({ queryKey: ['susu-history', slug] })
    },
  })

  if (isLoading) {
    return <Layout><div className="text-center py-20 text-gray-500">Loading…</div></Layout>
  }
  if (!group) {
    return <Layout><div className="text-center py-20 text-gray-500">Group not found.</div></Layout>
  }

  const cycle = group.current_cycle_detail
  const potAmount = cycle ? parseFloat(cycle.pot_amount) : 0
  const collectedAmount = cycle ? parseFloat(cycle.collected_amount) : 0
  const pct = potAmount > 0 ? Math.min((collectedAmount / potAmount) * 100, 100) : 0
  const paidCount = cycle ? cycle.contributions.filter(c => c.paid).length : 0
  const totalCount = cycle ? cycle.contributions.length : 0
  const cycleIsPaidOut = cycle?.status === 'paid_out'
  const isLastCycle = group.current_cycle >= group.total_cycles

  const TABS: { key: DetailTab; label: string }[] = [
    { key: 'current',  label: 'Current Cycle' },
    { key: 'history',  label: 'History' },
    { key: 'schedule', label: 'Schedule' },
    { key: 'members',  label: 'Members' },
  ]

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
              group.status === 'active'    ? 'bg-emerald-900/40 text-emerald-300 border border-emerald-800/40'
              : group.status === 'forming' ? 'bg-yellow-900/40 text-yellow-300 border border-yellow-800/40'
              : group.status === 'completed' ? 'bg-purple-900/40 text-purple-300 border border-purple-800/40'
              : 'bg-gray-800 text-gray-400 border border-gray-700'
            }`}>
              {group.status}
            </span>
            <div className="text-xs text-gray-500 mt-1.5">
              Cycle {group.current_cycle} of {group.total_cycles}
            </div>
          </div>
        </div>

        {/* Start button for forming groups */}
        {group.status === 'forming' && (
          <div className="rounded-xl border border-yellow-800/50 bg-yellow-900/10 p-5">
            <p className="text-sm font-semibold text-yellow-300 mb-1">Ready to start?</p>
            <p className="text-xs text-gray-400 mb-4">
              {group.total_members} member{group.total_members !== 1 ? 's' : ''} added.
              Starting will lock the member list and create all {group.total_cycles} cycle records.
            </p>
            <button
              onClick={() => startGroup.mutate()}
              disabled={startGroup.isPending || group.total_members < 2}
              className="px-5 py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-lg
                hover:bg-brand-500 disabled:opacity-50 transition-colors"
            >
              {startGroup.isPending ? 'Starting…' : '▶ Start Susu'}
            </button>
            {group.total_members < 2 && (
              <p className="text-xs text-yellow-600 mt-2">Need at least 2 members to start.</p>
            )}
          </div>
        )}

        {/* Tabs */}
        {group.status === 'active' && (
          <div className="flex gap-1 border-b border-gray-800">
            {TABS.map(t => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  tab === t.key
                    ? 'border-brand-500 text-brand-300'
                    : 'border-transparent text-gray-500 hover:text-gray-300'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {/* Current cycle tab */}
        {(tab === 'current' || group.status !== 'active') && cycle && (
          <div className="rounded-xl border border-gray-700 bg-gray-900 p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-semibold text-white">Cycle {cycle.cycle_number}</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Due {formatDate(cycle.due_date)} · Recipient:{' '}
                  <span className="text-brand-300 font-medium">{cycle.recipient_name}</span>
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

            {/* Mark payout sent */}
            {cycle.status === 'collected' && !cycle.payout_sent_at && (
              <button
                onClick={() => markPayoutSent.mutate(cycle.cycle_number)}
                disabled={markPayoutSent.isPending}
                className="mt-4 w-full py-2.5 bg-purple-700 text-white text-sm font-semibold rounded-lg
                  hover:bg-purple-600 disabled:opacity-50 transition-colors"
              >
                {markPayoutSent.isPending ? 'Marking…' : `💸 Mark Payout Sent to ${cycle.recipient_name}`}
              </button>
            )}
            {cycle.payout_sent_at && (
              <p className="mt-3 text-center text-xs text-purple-400">
                Payout sent {new Date(cycle.payout_sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </p>
            )}

            {/* Advance to next cycle */}
            {cycleIsPaidOut && !isLastCycle && (
              <button
                onClick={() => advanceCycle.mutate()}
                disabled={advanceCycle.isPending}
                className="mt-3 w-full py-2.5 bg-brand-700 text-white text-sm font-semibold rounded-lg
                  hover:bg-brand-600 disabled:opacity-50 transition-colors"
              >
                {advanceCycle.isPending
                  ? 'Advancing…'
                  : `→ Advance to Cycle ${group.current_cycle + 1}`}
              </button>
            )}
            {cycleIsPaidOut && isLastCycle && (
              <button
                onClick={() => advanceCycle.mutate()}
                disabled={advanceCycle.isPending}
                className="mt-3 w-full py-2.5 bg-gray-700 text-gray-300 text-sm font-semibold rounded-lg
                  hover:bg-gray-600 disabled:opacity-50 transition-colors"
              >
                {advanceCycle.isPending ? 'Completing…' : '🏁 Complete Susu'}
              </button>
            )}
          </div>
        )}

        {/* History tab */}
        {tab === 'history' && group.status === 'active' && (
          <div className="rounded-xl border border-gray-700 bg-gray-900 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-800">
              <h2 className="font-semibold text-white">Contribution History</h2>
              <p className="text-xs text-gray-500 mt-0.5">✓ paid · ✗ missed · – future</p>
            </div>
            <div className="p-4">
              <HistoryTab groupSlug={slug!} />
            </div>
          </div>
        )}

        {/* Schedule tab */}
        {(tab === 'schedule' || group.status !== 'active') && group.cycle_summaries.length > 0 && (
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

        {/* Members tab */}
        {(tab === 'members' || group.status !== 'active') && (
          <div className="rounded-xl border border-gray-700 bg-gray-900 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
              <h2 className="font-semibold text-white">Members ({group.total_members})</h2>
              <div className="flex items-center gap-3">
                {group.status !== 'completed' && (
                  <button
                    onClick={() => { setShowAdd(s => !s); setAddError('') }}
                    className="text-xs px-3 py-1.5 rounded-lg bg-brand-700/40 text-brand-300
                      hover:bg-brand-700/70 border border-brand-700/50 transition-colors"
                  >
                    {showAdd ? '✕ Cancel' : '＋ Add member'}
                  </button>
                )}
                <button
                  onClick={() => navigate(`/s/${slug}`)}
                  className="text-xs text-brand-400 hover:text-brand-300 transition-colors"
                >
                  Public page →
                </button>
              </div>
            </div>

            {/* Inline add-member form */}
            {showAdd && (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  if (!addForm.name.trim() || !addForm.phone.trim()) return
                  setAddError('')
                  addMember.mutate()
                }}
                className="px-5 py-4 border-b border-gray-800 bg-gray-800/40 space-y-3"
              >
                <p className="text-xs font-medium text-gray-400">New member</p>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    required
                    type="text"
                    placeholder="Full name *"
                    value={addForm.name}
                    onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
                    className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2
                      text-sm text-white placeholder-gray-600 focus:border-brand-500 focus:outline-none"
                  />
                  <input
                    required
                    type="tel"
                    placeholder="Phone *"
                    value={addForm.phone}
                    onChange={e => setAddForm(f => ({ ...f, phone: e.target.value }))}
                    className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2
                      text-sm text-white placeholder-gray-600 focus:border-brand-500 focus:outline-none"
                  />
                </div>
                <input
                  type="email"
                  placeholder="Email (optional)"
                  value={addForm.email}
                  onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2
                    text-sm text-white placeholder-gray-600 focus:border-brand-500 focus:outline-none"
                />
                {addError && <p className="text-xs text-red-400">{addError}</p>}
                <button
                  type="submit"
                  disabled={addMember.isPending}
                  className="px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-lg
                    hover:bg-brand-500 disabled:opacity-50 transition-colors"
                >
                  {addMember.isPending ? 'Adding…' : 'Add member'}
                </button>
              </form>
            )}

            <div className="divide-y divide-gray-800">
              {group.members.length === 0 && !showAdd && (
                <div className="px-5 py-8 text-center text-sm text-gray-500">
                  No members yet. Click "＋ Add member" to get started.
                </div>
              )}
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
                      <div className="text-xs text-gray-600">
                        Total: {fmt(parseFloat(m.total_contributed))}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Completed state */}
        {group.status === 'completed' && (
          <div className="rounded-xl border border-purple-800/40 bg-purple-900/10 px-5 py-4 text-center">
            <p className="text-purple-300 font-semibold text-sm">🏁 Susu completed</p>
            <p className="text-xs text-gray-500 mt-1">
              All {group.total_cycles} cycles have been paid out.
            </p>
          </div>
        )}
      </div>
    </Layout>
  )
}
