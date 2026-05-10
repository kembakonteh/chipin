import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { AxiosResponse } from 'axios'
import toast from 'react-hot-toast'
import { api } from '../lib/api'
import type { SusuDetail, SusuContribution, SusuCycleSummary, SusuCycleStatus, SusuPaidVia, SusuJoinRequest } from '../types'
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

  // Feature 4: mark-missed
  const markMissed = useMutation({
    mutationFn: () =>
      api.post(`/susu/${groupSlug}/cycles/${cycleNumber}/members/${contribution.member_id}/mark-missed`).then(getData),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['susu', groupSlug] }),
  })

  const confirmPayment = useMutation({
    mutationFn: () =>
      api.post(`/susu/${groupSlug}/contributions/${contribution.id}/confirm`).then(getData),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['susu', groupSlug] }),
    onError: (err: any) => toast.error(err?.response?.data?.detail ?? 'Failed to confirm'),
  })

  const rejectPayment = useMutation({
    mutationFn: () =>
      api.post(`/susu/${groupSlug}/contributions/${contribution.id}/reject`).then(getData),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['susu', groupSlug] }),
    onError: (err: any) => toast.error(err?.response?.data?.detail ?? 'Failed to reject'),
  })

  const isPending = contribution.pending_verification

  const rowClass = isPending
    ? 'bg-amber-950 border border-amber-800'
    : contribution.missed
      ? 'bg-red-950 border border-red-800'
      : contribution.paid
        ? 'bg-emerald-950 border border-emerald-800'
        : 'bg-gray-800 border border-gray-700'

  return (
    <div className={`rounded-lg text-sm ${rowClass}`}>
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className={`text-base ${contribution.paid ? 'text-emerald-400' : isPending ? 'text-amber-400' : contribution.missed ? 'text-red-400' : 'text-gray-600'}`}>
            {contribution.paid ? '✓' : isPending ? '⏳' : contribution.missed ? '✗' : '○'}
          </span>
          <span className={contribution.paid ? 'text-white' : isPending ? 'text-amber-200' : contribution.missed ? 'text-red-300' : 'text-gray-400'}>
            {contribution.member_name}
          </span>
          {isPending && (
            <span className="text-xs text-amber-400 font-medium">
              Pending · via {contribution.paid_via ?? '?'}
            </span>
          )}
          {contribution.missed && !isPending && (
            <span className="text-xs text-red-400 font-medium">Missed</span>
          )}
          {contribution.paid && contribution.paid_via && (
            <span className="text-xs text-gray-500 capitalize">via {contribution.paid_via}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={
            contribution.paid ? 'text-emerald-400 font-medium text-xs'
            : isPending ? 'text-amber-400 text-xs'
            : contribution.missed ? 'text-red-400 text-xs'
            : 'text-gray-500 text-xs'
          }>
            {fmt(parseFloat(contribution.amount))}
          </span>
          {!contribution.paid && !contribution.missed && !isPending && isCurrentCycle && (
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
              <button
                onClick={() => markMissed.mutate()}
                disabled={markMissed.isPending}
                className="text-xs px-2 py-1 rounded bg-red-900 text-red-300 hover:bg-red-800 disabled:opacity-50 transition-colors"
                title="Mark as missed"
              >
                {markMissed.isPending ? '…' : '✗'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Pending verification: confirm / reject bar */}
      {isPending && isCurrentCycle && (
        <div className="flex gap-2 px-3 pb-2.5">
          <button
            onClick={() => confirmPayment.mutate()}
            disabled={confirmPayment.isPending || rejectPayment.isPending}
            className="flex-1 py-1.5 text-xs font-semibold rounded bg-emerald-700 text-white hover:bg-emerald-600 disabled:opacity-50 transition-colors"
          >
            {confirmPayment.isPending ? 'Confirming…' : '✓ Confirm Receipt'}
          </button>
          <button
            onClick={() => rejectPayment.mutate()}
            disabled={confirmPayment.isPending || rejectPayment.isPending}
            className="flex-1 py-1.5 text-xs font-semibold rounded bg-red-900 text-red-200 hover:bg-red-800 disabled:opacity-50 transition-colors"
          >
            {rejectPayment.isPending ? 'Rejecting…' : '✗ Reject'}
          </button>
        </div>
      )}
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
        {cycle.status === 'paid_out' && cycle.payout_method && (
          <div className="text-purple-500 capitalize">{cycle.payout_method.replace('_', ' ')}</div>
        )}
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
  reliability_pct: number | null  // Feature 3
  cycles: { cycle_number: number; paid: boolean; missed: boolean; paid_via: string | null }[]
}

interface HistoryData {
  total_cycles: number
  current_cycle: number
  members: HistoryRow[]
}

// Feature 3: Reliability badge
function ReliabilityBadge({ pct }: { pct: number | null }) {
  if (pct === null) return null
  const color = pct >= 90 ? 'text-emerald-400' : pct >= 60 ? 'text-yellow-400' : 'text-red-400'
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-medium ${color}`} title={`Reliability: ${pct}%`}>
      ●{pct}%
    </span>
  )
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
                  <div className="flex items-center gap-1.5">
                    <span className="text-white font-medium">{m.member_name}</span>
                    {m.payout_position && (
                      <span className="text-gray-600">#{m.payout_position}</span>
                    )}
                    <ReliabilityBadge pct={m.reliability_pct} />
                  </div>
                </td>
                {m.cycles.map(c => (
                  <td key={c.cycle_number} className="px-2 py-2.5 text-center">
                    {c.cycle_number > data.current_cycle ? (
                      <span className="text-gray-700">–</span>
                    ) : c.paid ? (
                      <span className="text-emerald-400" title={c.paid_via ?? ''}>✓</span>
                    ) : c.missed ? (
                      <span className="text-red-500" title="Missed">✗</span>
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

// ── Payout modal ──────────────────────────────────────────────────────────────

const PAYOUT_METHODS = [
  { value: 'zelle',         label: 'Zelle',          placeholder: 'Phone or email used' },
  { value: 'cashapp',       label: 'CashApp',         placeholder: '$cashtag' },
  { value: 'venmo',         label: 'Venmo',           placeholder: '@handle' },
  { value: 'bank_transfer', label: 'Bank Transfer',   placeholder: 'Confirmation #' },
  { value: 'cash',          label: 'Cash',            placeholder: 'Optional note' },
  { value: 'check',         label: 'Check',           placeholder: 'Check #' },
]

function PayoutModal({
  recipientName,
  potAmount,
  onConfirm,
  onClose,
  isPending,
}: {
  recipientName: string
  potAmount: number
  onConfirm: (method: string, reference: string) => void
  onClose: () => void
  isPending: boolean
}) {
  const [method, setMethod] = useState('zelle')
  const [reference, setReference] = useState('')
  const selected = PAYOUT_METHODS.find(m => m.value === method)!

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-sm rounded-2xl border border-gray-700 bg-gray-900 p-6 shadow-xl">
        <h2 className="text-lg font-bold text-white mb-1">Mark Payout Sent</h2>
        <p className="text-sm text-gray-500 mb-5">
          {recipientName} · {fmt(potAmount)}
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Payment method</label>
            <select
              value={method}
              onChange={e => { setMethod(e.target.value); setReference('') }}
              className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2.5 text-sm text-white focus:border-brand-500 focus:outline-none"
            >
              {PAYOUT_METHODS.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1.5">
              Reference {method === 'cash' ? '(optional)' : ''}
            </label>
            <input
              type="text"
              value={reference}
              onChange={e => setReference(e.target.value)}
              placeholder={selected.placeholder}
              className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:border-brand-500 focus:outline-none"
            />
          </div>
        </div>

        <button
          onClick={() => onConfirm(method, reference)}
          disabled={isPending || (method !== 'cash' && !reference.trim())}
          className="mt-6 w-full py-3 bg-purple-700 text-white font-semibold rounded-lg hover:bg-purple-600 disabled:opacity-50 transition-colors"
        >
          {isPending ? 'Saving…' : `Confirm Payout via ${selected.label}`}
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

type DetailTab = 'current' | 'schedule' | 'members' | 'history'

interface AddMemberForm {
  name: string
  phone: string
  email: string
  slots: string
}

export default function SusuDetail() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [tab, setTab] = useState<DetailTab>('current')
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState<AddMemberForm>({ name: '', phone: '', email: '', slots: '1' })
  const [addError, setAddError] = useState('')
  const [showPayoutModal, setShowPayoutModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  // Feature 4: rules edit mode
  const [editingRules, setEditingRules] = useState(false)
  const [rulesText, setRulesText] = useState('')
  // Payment settings
  const [editingPaymentSettings, setEditingPaymentSettings] = useState(false)
  const [paySettings, setPaySettings] = useState({ allow_card: true, allow_cashapp: false, allow_zelle: false, cashapp_handle: '', zelle_handle: '' })

  const addMember = useMutation({
    mutationFn: () =>
      api.post(`/susu/${slug}/members`, {
        name: addForm.name.trim(),
        phone: addForm.phone.trim(),
        email: addForm.email.trim() || null,
        slots: parseInt(addForm.slots) || 1,
      }).then(getData),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['susu', slug] })
      setAddForm({ name: '', phone: '', email: '', slots: '1' })
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
    mutationFn: ({ cycleNum, method, reference }: { cycleNum: number; method: string; reference: string }) =>
      api.post(`/susu/${slug}/cycles/${cycleNum}/mark-paid-out`, {
        payout_method: method,
        payout_reference: reference || null,
      }).then(getData),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['susu', slug] })
      setShowPayoutModal(false)
    },
  })

  const advanceCycle = useMutation({
    mutationFn: () => api.post<SusuDetail>(`/susu/${slug}/advance`).then(getData),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['susu', slug] })
      qc.invalidateQueries({ queryKey: ['susu-history', slug] })
    },
  })

  // Feature 8: Save group rules
  const saveRules = useMutation({
    mutationFn: (newRules: string) =>
      api.patch(`/susu/${slug}`, { rules: newRules || null }).then(getData),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['susu', slug] })
      setEditingRules(false)
    },
  })

  const savePaymentSettings = useMutation({
    mutationFn: () => api.patch(`/susu/${slug}/settings`, {
      allow_card: paySettings.allow_card,
      allow_cashapp: paySettings.allow_cashapp,
      allow_zelle: paySettings.allow_zelle,
      cashapp_handle: paySettings.cashapp_handle.trim() || null,
      zelle_handle: paySettings.zelle_handle.trim() || null,
    }).then(getData),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['susu', slug] })
      setEditingPaymentSettings(false)
      toast.success('Payment settings saved')
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail ?? 'Failed to save settings'),
  })

  const permanentDelete = useMutation({
    mutationFn: () => api.delete(`/susu/${slug}/permanent`),
    onSuccess: () => navigate('/susu'),
    onError: () => toast.error('Failed to delete group'),
  })

  const shareStandings = useMutation({
    mutationFn: () => api.post(`/susu/${slug}/share-standings`),
    onSuccess: () => toast.success('Standings sent to your WhatsApp'),
    onError: (err: any) => {
      const detail: string = err?.response?.data?.detail ?? 'Failed to send standings'
      if (detail.toLowerCase().includes('phone')) {
        toast.error('Add your phone number in Profile to receive standings via WhatsApp', { duration: 5000 })
        setTimeout(() => navigate('/profile'), 2500)
      } else {
        toast.error(detail)
      }
    },
  })

  const { data: joinRequests, refetch: refetchJoinRequests } = useQuery<SusuJoinRequest[]>({
    queryKey: ['susu-join-requests', slug],
    queryFn: () => api.get<SusuJoinRequest[]>(`/susu/${slug}/join-requests`).then(r => r.data),
    enabled: group?.status === 'forming',
  })

  const approveJoinRequest = useMutation({
    mutationFn: (id: string) => api.post(`/susu/${slug}/join-requests/${id}/approve`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['susu', slug] })
      refetchJoinRequests()
      toast.success('Member approved and added')
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail ?? 'Failed to approve'),
  })

  const rejectJoinRequest = useMutation({
    mutationFn: (id: string) => api.post(`/susu/${slug}/join-requests/${id}/reject`),
    onSuccess: () => {
      refetchJoinRequests()
      toast.success('Request rejected')
    },
    onError: () => toast.error('Failed to reject request'),
  })

  // Feature 9: Export CSV — use axios api instance so auth headers are injected
  function handleExportCsv() {
    api.get(`/susu/${slug}/export`, { responseType: 'blob' }).then(response => {
      const blob = new Blob([response.data], { type: 'text/csv' })
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = `susu-${slug}.csv`
      a.click()
      URL.revokeObjectURL(blobUrl)
    }).catch(() => {
      alert('Failed to export CSV')
    })
  }

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

  console.log('[SusuDetail] rendering — status:', group.status, 'slug:', slug, 'showDeleteConfirm:', showDeleteConfirm)

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

        {/* Action bar — always visible */}
        <div className="flex items-center gap-2 flex-wrap border border-gray-800 rounded-xl px-4 py-3 bg-gray-900">
          {group.status === 'active' && (
            <>
              <a
                href={`/s/${slug}/standings`}
                target="_blank"
                rel="noreferrer"
                className="text-xs px-3 py-1.5 rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-600 transition-colors"
              >
                📊 Public Standings
              </a>
              <button
                onClick={() => shareStandings.mutate()}
                disabled={shareStandings.isPending}
                className="text-xs px-3 py-1.5 rounded-lg bg-emerald-800 text-emerald-100 hover:bg-emerald-700 border border-emerald-600 transition-colors disabled:opacity-50"
              >
                {shareStandings.isPending ? 'Sending…' : '📱 Share Standings'}
              </button>
            </>
          )}
          <div className="flex-1" />
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="text-xs px-3 py-1.5 rounded-lg bg-red-900 text-red-200 hover:bg-red-800 border border-red-700 transition-colors"
          >
            🗑 Delete Group
          </button>
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

        {/* Join requests — forming groups only */}
        {group.status === 'forming' && (
          <div className="rounded-xl border border-gray-700 bg-gray-900 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-white">Join Requests</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {joinRequests?.filter(r => r.status === 'pending').length ?? 0} pending
                </p>
              </div>
              <button
                onClick={() => {
                  const link = `${window.location.origin}/s/${slug}/join`
                  navigator.clipboard.writeText(link)
                    .then(() => toast.success('Join link copied!'))
                    .catch(() => toast.error('Could not copy link'))
                }}
                className="text-xs px-3 py-1.5 rounded-lg bg-sky-900/30 text-sky-300 hover:bg-sky-900/50 border border-sky-800/40 transition-colors"
              >
                📋 Copy Join Link
              </button>
            </div>
            {!joinRequests || joinRequests.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-gray-500">
                No join requests yet. Share your join link to invite people.
              </div>
            ) : (
              <div className="divide-y divide-gray-800">
                {joinRequests.map(r => (
                  <div key={r.id} className="flex items-center justify-between px-5 py-3">
                    <div className="flex-1 min-w-0 mr-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-white font-medium truncate">{r.name}</span>
                        <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full ${
                          r.status === 'pending'  ? 'bg-yellow-900/40 text-yellow-300 border border-yellow-800/40'
                          : r.status === 'approved' ? 'bg-emerald-900/40 text-emerald-300 border border-emerald-800/40'
                          : 'bg-gray-800 text-gray-500 border border-gray-700'
                        }`}>
                          {r.status}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500">{r.phone}</div>
                      {r.message && (
                        <div className="text-xs text-gray-400 mt-0.5 italic truncate">"{r.message}"</div>
                      )}
                    </div>
                    {r.status === 'pending' && (
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => approveJoinRequest.mutate(r.id)}
                          disabled={approveJoinRequest.isPending}
                          className="text-xs px-3 py-1.5 rounded-lg bg-brand-700/40 text-brand-300 hover:bg-brand-700/70 border border-brand-700/50 transition-colors disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => rejectJoinRequest.mutate(r.id)}
                          disabled={rejectJoinRequest.isPending}
                          className="text-xs px-3 py-1.5 rounded-lg bg-red-900/30 text-red-400 hover:bg-red-900/50 border border-red-800/40 transition-colors disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
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
                onClick={() => setShowPayoutModal(true)}
                className="mt-4 w-full py-2.5 bg-purple-700 text-white text-sm font-semibold rounded-lg
                  hover:bg-purple-600 transition-colors"
              >
                💸 Mark Payout Sent to {cycle.recipient_name}
              </button>
            )}
            {cycle.payout_sent_at && (
              <div className="mt-3 text-center">
                <p className="text-xs text-purple-400">
                  Payout sent {new Date(cycle.payout_sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  {cycle.payout_method && (
                    <span className="ml-1 capitalize">via {cycle.payout_method.replace('_', ' ')}</span>
                  )}
                  {cycle.payout_reference && (
                    <span className="ml-1 text-purple-500">· {cycle.payout_reference}</span>
                  )}
                </p>
              </div>
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
            <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-white">Contribution History</h2>
                <p className="text-xs text-gray-500 mt-0.5">✓ paid · ✗ missed · – future</p>
              </div>
              {/* Feature 9: Export CSV */}
              <button
                onClick={handleExportCsv}
                className="text-xs px-3 py-1.5 rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700 transition-colors"
              >
                Export CSV
              </button>
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
              <div className="flex items-center gap-3 flex-wrap justify-end">
                {group.status !== 'completed' && (
                  <button
                    onClick={() => { setShowAdd(s => !s); setAddError('') }}
                    className="text-xs px-3 py-1.5 rounded-lg bg-brand-700/40 text-brand-300
                      hover:bg-brand-700/70 border border-brand-700/50 transition-colors"
                  >
                    {showAdd ? '✕ Cancel' : '＋ Add member'}
                  </button>
                )}
                {/* Feature 5: WhatsApp invite */}
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(`Join our Susu group '${group.name}' on ChipIn! Pay your contribution online here: ${window.location.origin}/s/${slug}`)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs px-3 py-1.5 rounded-lg bg-emerald-900/30 text-emerald-300
                    hover:bg-emerald-900/50 border border-emerald-800/40 transition-colors"
                >
                  Invite via WhatsApp
                </a>
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
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="email"
                    placeholder="Email (optional)"
                    value={addForm.email}
                    onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))}
                    className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2
                      text-sm text-white placeholder-gray-600 focus:border-brand-500 focus:outline-none"
                  />
                  {/* Feature 1: slots */}
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-400 whitespace-nowrap">Hands (slots):</label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={addForm.slots}
                      onChange={e => setAddForm(f => ({ ...f, slots: e.target.value }))}
                      className="w-16 rounded-lg border border-gray-700 bg-gray-800 px-2 py-2
                        text-sm text-white text-center focus:border-brand-500 focus:outline-none"
                    />
                  </div>
                </div>
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
                const isMissed = currentContrib?.missed ?? false
                const isRecipient = cycle?.recipient_member_id === m.id
                const memberContrib = parseFloat(currentContrib?.amount ?? '0') || (m.slots * parseFloat(group.contribution_amount))
                return (
                  <div key={m.id} className="flex items-center justify-between px-5 py-3">
                    <div className="flex items-center gap-3">
                      {isRecipient && (
                        <span className="text-sm" title="This cycle's recipient">🏆</span>
                      )}
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm text-white font-medium">{m.name}</span>
                          {/* Feature 1: slots badge */}
                          {m.slots > 1 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-brand-900/40 text-brand-300 border border-brand-800/40">
                              {m.slots} hands
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500">{m.phone}</div>
                      </div>
                      {m.payout_position && (
                        <span className="text-xs text-gray-600">#{m.payout_position}</span>
                      )}
                    </div>
                    <div className="text-right">
                      <div className={`text-xs font-medium ${isPaid ? 'text-emerald-400' : isMissed ? 'text-red-400' : 'text-gray-500'}`}>
                        {isPaid ? '✓ Paid this cycle' : isMissed ? '✗ Missed' : `○ Pending ${fmt(memberContrib)}`}
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

        {/* Payment Settings */}
        {group.status !== 'completed' && (
          <div className="rounded-xl border border-gray-700 bg-gray-900 p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-white text-sm">Payment Methods</h2>
              {!editingPaymentSettings && (
                <button
                  onClick={() => {
                    setPaySettings({
                      allow_card: group.allow_card,
                      allow_cashapp: group.allow_cashapp,
                      allow_zelle: group.allow_zelle,
                      cashapp_handle: group.cashapp_handle ?? '',
                      zelle_handle: group.zelle_handle ?? '',
                    })
                    setEditingPaymentSettings(true)
                  }}
                  className="text-xs text-brand-400 hover:text-brand-300 transition-colors"
                >
                  Edit
                </button>
              )}
            </div>
            {editingPaymentSettings ? (
              <div className="space-y-3">
                <p className="text-xs text-gray-500">Enable the methods members can use to pay their contribution.</p>
                <div className="space-y-2">
                  {[
                    { key: 'allow_card' as const, label: 'Card (Stripe)', icon: '💳' },
                    { key: 'allow_cashapp' as const, label: 'CashApp', icon: '💚' },
                    { key: 'allow_zelle' as const, label: 'Zelle', icon: '🔵' },
                  ].map(m => (
                    <label key={m.key} className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={paySettings[m.key]}
                        onChange={e => setPaySettings(s => ({ ...s, [m.key]: e.target.checked }))}
                        className="w-4 h-4 accent-brand-500"
                      />
                      <span className="text-sm text-gray-200">{m.icon} {m.label}</span>
                    </label>
                  ))}
                </div>
                {paySettings.allow_cashapp && (
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">CashApp $cashtag</label>
                    <input
                      type="text"
                      value={paySettings.cashapp_handle}
                      onChange={e => setPaySettings(s => ({ ...s, cashapp_handle: e.target.value }))}
                      placeholder="$yourname"
                      className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-brand-500 focus:outline-none"
                    />
                  </div>
                )}
                {paySettings.allow_zelle && (
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Zelle phone or email</label>
                    <input
                      type="text"
                      value={paySettings.zelle_handle}
                      onChange={e => setPaySettings(s => ({ ...s, zelle_handle: e.target.value }))}
                      placeholder="phone or email you receive Zelle on"
                      className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-brand-500 focus:outline-none"
                    />
                  </div>
                )}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => savePaymentSettings.mutate()}
                    disabled={savePaymentSettings.isPending || (!paySettings.allow_card && !paySettings.allow_cashapp && !paySettings.allow_zelle)}
                    className="px-3 py-1.5 bg-brand-600 text-white text-xs rounded-lg hover:bg-brand-500 disabled:opacity-50 transition-colors"
                  >
                    {savePaymentSettings.isPending ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    onClick={() => setEditingPaymentSettings(false)}
                    className="px-3 py-1.5 bg-gray-800 text-gray-400 text-xs rounded-lg hover:bg-gray-700 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {group.allow_card && (
                  <span className="text-xs px-2.5 py-1 rounded-full bg-blue-900/40 text-blue-300 border border-blue-800/40">💳 Card</span>
                )}
                {group.allow_cashapp && (
                  <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-900/40 text-emerald-300 border border-emerald-800/40">
                    💚 CashApp{group.cashapp_handle ? ` · ${group.cashapp_handle}` : ''}
                  </span>
                )}
                {group.allow_zelle && (
                  <span className="text-xs px-2.5 py-1 rounded-full bg-indigo-900/40 text-indigo-300 border border-indigo-800/40">
                    🔵 Zelle{group.zelle_handle ? ` · ${group.zelle_handle}` : ''}
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Feature 8: Group Rules */}
        {(group.rules || group.status !== 'completed') && (
          <div className="rounded-xl border border-gray-700 bg-gray-900 p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-white text-sm">Group Rules</h2>
              {!editingRules && (
                <button
                  onClick={() => { setRulesText(group.rules ?? ''); setEditingRules(true) }}
                  className="text-xs text-brand-400 hover:text-brand-300 transition-colors"
                >
                  {group.rules ? 'Edit' : '+ Add rules'}
                </button>
              )}
            </div>
            {editingRules ? (
              <div className="space-y-2">
                <textarea
                  value={rulesText}
                  onChange={e => setRulesText(e.target.value)}
                  rows={4}
                  placeholder="Enter group rules..."
                  className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-brand-500 focus:outline-none resize-none"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => saveRules.mutate(rulesText)}
                    disabled={saveRules.isPending}
                    className="px-3 py-1.5 bg-brand-600 text-white text-xs rounded-lg hover:bg-brand-500 disabled:opacity-50 transition-colors"
                  >
                    {saveRules.isPending ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    onClick={() => setEditingRules(false)}
                    className="px-3 py-1.5 bg-gray-800 text-gray-400 text-xs rounded-lg hover:bg-gray-700 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : group.rules ? (
              <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">{group.rules}</p>
            ) : (
              <p className="text-xs text-gray-600 italic">No rules set yet.</p>
            )}
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

      {showPayoutModal && cycle && (
        <PayoutModal
          recipientName={cycle.recipient_name}
          potAmount={potAmount}
          isPending={markPayoutSent.isPending}
          onConfirm={(method, reference) =>
            markPayoutSent.mutate({ cycleNum: cycle.cycle_number, method, reference })
          }
          onClose={() => setShowPayoutModal(false)}
        />
      )}

      {showDeleteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={e => e.target === e.currentTarget && setShowDeleteConfirm(false)}
        >
          <div className="w-full max-w-sm rounded-2xl border border-red-800/60 bg-gray-900 p-6 shadow-xl">
            <h2 className="text-lg font-bold text-red-400 mb-2">Delete Susu Group?</h2>
            <p className="text-sm text-gray-300 mb-2">
              This will permanently delete{' '}
              <span className="font-medium text-white">{group.name}</span> and all its records.
            </p>
            {group.total_members > 0 && (
              <p className="text-xs text-red-400/80 mb-2">
                {group.total_members} member{group.total_members !== 1 ? 's' : ''}, all cycles, and all contribution records will be removed.
              </p>
            )}
            <p className="text-xs font-semibold text-red-500 mb-5">This cannot be undone.</p>
            <button
              onClick={() => permanentDelete.mutate()}
              disabled={permanentDelete.isPending}
              className="w-full py-3 bg-red-700 text-white font-semibold rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors"
            >
              {permanentDelete.isPending ? 'Deleting…' : 'Yes, delete permanently'}
            </button>
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(false)}
              className="mt-3 w-full py-2 text-sm text-gray-500 hover:text-gray-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </Layout>
  )
}
