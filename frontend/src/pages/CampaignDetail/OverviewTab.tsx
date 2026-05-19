import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import type { Beneficiary, Campaign, Contributor, Payout, PayoutMethod } from '../../types'
import { computeStats, fmt } from '../../types'
import ProgressRing from '../../components/ProgressRing'
import CopyLinkBar from '../../components/CopyLinkBar'
import { api } from '../../lib/api'

interface PurchaseRecord {
  id: string
  description: string
  amount: string
  note: string | null
  purchased_at: string
}

interface EarningsData {
  total_gross: string
  total_stripe_fees: string
  total_platform_fees: string
  total_net: string
  payment_count: number
}

interface Props {
  campaign: Campaign
  contributors: Contributor[]
}

function fmtEventDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })
}

export default function OverviewTab({ campaign, contributors }: Props) {
  const stats = computeStats(campaign, contributors)
  const isInvitationOnly = campaign.campaign_type === 'celebration' &&
    parseFloat(campaign.amount_per_person ?? '0') === 0 &&
    campaign.goal_amount == null
  const isPartyMeeting = campaign.campaign_type === 'political' &&
    !!(campaign.event_date || campaign.event_location)

  const { data: overviewPurchases = [] } = useQuery<PurchaseRecord[]>({
    queryKey: ['purchases', campaign.slug],
    queryFn: () => api.get<PurchaseRecord[]>(`/campaigns/${campaign.slug}/purchases`).then(r => r.data),
  })

  const { data: overviewPayouts = [] } = useQuery<Payout[]>({
    queryKey: ['payouts', campaign.slug],
    queryFn: () => api.get<Payout[]>(`/campaigns/${campaign.slug}/payouts`).then(r => r.data),
  })

  const { data: overviewPayoutMethods = [] } = useQuery<PayoutMethod[]>({
    queryKey: ['payout-methods'],
    queryFn: () => api.get<PayoutMethod[]>('/users/payout-methods').then(r => r.data),
  })

  const { data: earnings } = useQuery<EarningsData>({
    queryKey: ['earnings', campaign.slug],
    queryFn: () => api.get<EarningsData>(`/campaigns/${campaign.slug}/earnings`).then(r => r.data),
    enabled: !isInvitationOnly && !isPartyMeeting,
  })

  const { data: overviewBeneficiary } = useQuery<Beneficiary | null>({
    queryKey: ['beneficiary', campaign.slug],
    queryFn: () =>
      api.get<Beneficiary>(`/campaigns/${campaign.slug}/beneficiary`)
        .then(r => r.data)
        .catch(e => e?.response?.status === 404 ? null : Promise.reject(e)),
    enabled: campaign.campaign_type === 'celebration' || campaign.campaign_type === 'political',
    staleTime: 30_000,
  })

  function handleShareStandings() {
    const isCelebration = campaign.campaign_type === 'celebration'
    const guestList = isCelebration ? contributors : contributors.filter(c => c.paid)

    const lines: string[] = []

    if (isCelebration) {
      lines.push(`📋 *${campaign.title} — Standings*`)
      lines.push('')
      lines.push(`👥 *Guests (${guestList.length}):*`)
      guestList.forEach((c, i) => {
        lines.push(`${i + 1}. ${c.name}`)
      })
    } else {
      lines.push(`*${campaign.title}* – Standings 💚`)
      lines.push('')
      guestList.forEach((c, i) => {
        lines.push(`${i + 1}. ${c.name} — ${fmt(parseFloat(c.amount), campaign.currency)}`)
      })
    }

    if (stats.totalRaised > 0) {
      lines.push('')
      lines.push(`*Total collected: ${fmt(stats.totalRaised, campaign.currency)}*`)
      if (stats.goalAmount != null) {
        const remaining = stats.goalAmount - stats.totalRaised
        if (remaining <= 0) {
          lines.push('🎉 Goal reached!')
        } else {
          lines.push(`*${fmt(remaining, campaign.currency)} still needed*`)
        }
      }
    }

    if (overviewPurchases.length > 0 && stats.totalRaised > 0) {
      lines.push('')
      lines.push('*Purchases:*')
      overviewPurchases.forEach(p => {
        const entry = `• ${p.description} — ${fmt(parseFloat(p.amount), campaign.currency)}`
        lines.push(p.note ? `${entry} (${p.note})` : entry)
      })
      const totalSpent = overviewPurchases.reduce((s, p) => s + parseFloat(p.amount), 0)
      const balance = stats.net - totalSpent
      lines.push(`*Total spent: ${fmt(totalSpent, campaign.currency)}*`)
      lines.push(`*Remaining balance: ${fmt(balance, campaign.currency)}*`)
    }

    const completedPayouts = overviewPayouts.filter(p => p.status === 'completed')
    if (completedPayouts.length > 0) {
      lines.push('')
      lines.push('💸 *Funds Disbursed:*')
      completedPayouts.forEach(p => {
        const date = new Date(p.initiated_at).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })
        const method = overviewPayoutMethods.find(m => m.id === p.payout_method_id)
        const methodLabel = method ? `${method.network_name} — ${method.account_name}` : 'Manual'
        lines.push(`• $${p.payout_amount_local} sent via ${methodLabel} on ${date}`)
      })
    }

    window.open(`https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`, '_blank')
  }

  const pc = campaign.party_color ?? '#16a34a'

  return (
    <div className="space-y-6">
      {/* Party meeting event details card — shown first */}
      {isPartyMeeting && (
        <div
          className="rounded-xl border border-gray-800 bg-gray-900 p-6 border-l-4"
          style={{ borderLeftColor: pc }}
        >
          <h3 className="text-sm font-semibold text-white mb-4">📅 Meeting Details</h3>
          <div className="space-y-3">
            {campaign.event_date && (
              <div className="flex items-start gap-3">
                <span className="text-lg leading-none mt-0.5">📅</span>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider mb-0.5" style={{ color: pc }}>Date</p>
                  <p className="text-sm text-white">{fmtEventDate(campaign.event_date)}</p>
                </div>
              </div>
            )}
            {campaign.event_time && (
              <div className="flex items-start gap-3">
                <span className="text-lg leading-none mt-0.5">🕐</span>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider mb-0.5" style={{ color: pc }}>Time</p>
                  <p className="text-sm text-white">{campaign.event_time}</p>
                </div>
              </div>
            )}
            {campaign.event_location && (
              <div className="flex items-start gap-3">
                <span className="text-lg leading-none mt-0.5">📍</span>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider mb-0.5" style={{ color: pc }}>Location</p>
                  <p className="text-sm text-white">{campaign.event_location}</p>
                </div>
              </div>
            )}
            {campaign.event_rsvp && (
              <div className="flex items-start gap-3">
                <span className="text-lg leading-none mt-0.5">✉️</span>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider mb-0.5" style={{ color: pc }}>RSVP Contact</p>
                  <p className="text-sm text-white">{campaign.event_rsvp}</p>
                </div>
              </div>
            )}
          </div>
          {/* Attendance summary */}
          <div className="mt-4 pt-4 border-t border-gray-800">
            <p className="text-xs text-gray-500">Total RSVPs</p>
            <p className="text-xl font-bold text-white mt-0.5">{stats.totalCount}</p>
          </div>
        </div>
      )}

      {/* Political hero card — hide for party meetings */}
      {campaign.campaign_type === 'political' && !isPartyMeeting && (
        <PoliticalHeroCard campaign={campaign} beneficiary={overviewBeneficiary} stats={stats} />
      )}

      {/* Progress + key stats — hide for party meetings */}
      {!isPartyMeeting && (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
          <div className="flex flex-col sm:flex-row items-center gap-8">
            {isInvitationOnly ? (
              <div className="h-40 w-40 shrink-0 rounded-full overflow-hidden border-4 border-yellow-600/60 bg-gray-800 flex items-center justify-center">
                {overviewBeneficiary?.photo_url ? (
                  <img src={overviewBeneficiary.photo_url} alt={overviewBeneficiary.display_name} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-5xl">{campaign.emoji}</span>
                )}
              </div>
            ) : stats.goalAmount != null ? (
              <ProgressRing percent={stats.progress} size={160} strokeWidth={14} label="funded" />
            ) : (
              <div className="flex flex-col items-center justify-center w-40 h-40 rounded-full
                border-4 border-gray-800 shrink-0">
                <span className="text-3xl">{campaign.emoji}</span>
                <span className="text-xs text-gray-500 mt-1">open goal</span>
              </div>
            )}

            {isInvitationOnly ? (
              <div className="grid grid-cols-2 gap-x-10 gap-y-4 flex-1 w-full sm:w-auto">
                <Stat label="Total guests" value={String(stats.totalCount)} />
                <Stat label="Attending" value={String(stats.paidCount)} />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-x-10 gap-y-4 flex-1 w-full sm:w-auto">
                <Stat label="Total raised" value={fmt(stats.totalRaised, campaign.currency)} accent />
                <Stat label="Goal" value={stats.goalAmount != null ? fmt(stats.goalAmount, campaign.currency) : '—'} />
                <Stat label={campaign.campaign_type === 'celebration' ? 'Attending' : 'Paid'} value={String(stats.paidCount)} />
                <Stat label={campaign.campaign_type === 'celebration' ? 'Total guests' : 'Total contributors'} value={String(stats.totalCount)} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* About section */}
      {(campaign.campaign_type === 'charity' || campaign.campaign_type === 'political') && campaign.description && (
        <div
          className={`rounded-xl border border-gray-800 bg-gray-900 p-6 border-l-4 ${campaign.campaign_type === 'political' ? '' : 'border-l-brand-500'}`}
          style={campaign.campaign_type === 'political' ? { borderLeftColor: pc } : undefined}
        >
          <h3 className="text-sm font-semibold text-white mb-3">
            {isPartyMeeting ? 'About This Meeting' : campaign.campaign_type === 'political' ? 'About This Campaign' : 'About This Collection'}
          </h3>
          <p className="text-sm text-gray-200 leading-relaxed">{campaign.description}</p>
        </div>
      )}

      {/* Shareable link */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
        <h3 className="text-sm font-semibold text-white mb-3">Shareable link</h3>
        <CopyLinkBar campaign={campaign} contributors={contributors} />
        {campaign.campaign_type !== 'political' && (
          <div className="mt-2">
            <button
              type="button"
              onClick={handleShareStandings}
              className="flex items-center justify-center gap-2 rounded-lg border border-green-700
                bg-green-900/40 px-4 py-2 text-sm font-medium text-green-300
                hover:bg-green-800/60 transition-colors w-full sm:w-auto"
            >
              <span>📊</span>
              <span>Share Standings</span>
            </button>
          </div>
        )}
      </div>

      {/* QR collection card */}
      {!isInvitationOnly && campaign.campaign_type !== 'political' && <QrCardDownload slug={campaign.slug} />}

      {campaign.payout_enabled === false && campaign.campaign_type !== 'political' && (
        <RecordPurchasePanel
          campaign={campaign}
          totalCollected={stats.net}
          purchases={overviewPurchases}
        />
      )}

      {/* Candidate / Party Profile — hide for party meetings */}
      {(campaign.campaign_type === 'memorial' || (campaign.campaign_type === 'political' && !isPartyMeeting)) && (
        <BeneficiaryCard campaign={campaign} />
      )}

      {/* Send Funds — hide for party meetings */}
      {!isInvitationOnly && !isPartyMeeting && <SendFundsPanel campaign={campaign} netBalance={stats.net} earnings={earnings} />}

      {/* Fundraising Summary — hide for party meetings */}
      {!isInvitationOnly && !isPartyMeeting && (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
          <h3 className="text-sm font-semibold text-white mb-4">
            {campaign.campaign_type === 'political' ? 'Fundraising Summary' : 'Earnings summary'}
          </h3>
          <div className="space-y-3">
            <EarningsRow label="Total raised" value={fmt(stats.totalRaised, campaign.currency)} />
            {campaign.campaign_type !== 'political' && earnings && parseFloat(earnings.total_platform_fees) > 0 && (
              <EarningsRow
                label={`Platform fee (${campaign.platform_fee_pct}%)`}
                value={`− ${fmt(parseFloat(earnings.total_platform_fees), campaign.currency)}`}
                muted
              />
            )}
            {campaign.campaign_type !== 'political' && earnings && parseFloat(earnings.total_stripe_fees) > 0 && (
              <EarningsRow
                label="Processing fees (Stripe)"
                value={`− ${fmt(parseFloat(earnings.total_stripe_fees), campaign.currency)}`}
                muted
              />
            )}
            {campaign.campaign_type !== 'political' && (
              <div className="border-t border-gray-800 pt-3">
                <EarningsRow label="Net to organizer" value={fmt(stats.net, campaign.currency)} accent />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function QrCardDownload({ slug }: { slug: string }) {
  const [loadingPng, setLoadingPng] = useState(false)
  const [loadingPdf, setLoadingPdf] = useState(false)

  async function download(format: 'png' | 'pdf') {
    const set = format === 'png' ? setLoadingPng : setLoadingPdf
    set(true)
    try {
      const res = await api.get(`/campaigns/${slug}/qr-card?format=${format}`, {
        responseType: 'blob',
      })
      const url = URL.createObjectURL(res.data as Blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `chipin-${slug}-qr.${format}`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      // silent — user can retry
    } finally {
      set(false)
    }
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
      <h3 className="text-sm font-semibold text-white mb-1">Collection card</h3>
      <p className="text-xs text-gray-500 mb-4">
        Print this A5 card and display at collection points — contributors scan the QR to chip in
      </p>
      <div className="flex gap-3">
        <button
          onClick={() => download('png')}
          disabled={loadingPng}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-800 text-sm
            text-white hover:bg-gray-700 disabled:opacity-50 transition-colors"
        >
          {loadingPng ? '…' : '↓'} PNG
        </button>
        <button
          onClick={() => download('pdf')}
          disabled={loadingPdf}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-700 text-sm
            text-white hover:bg-brand-600 disabled:opacity-50 transition-colors"
        >
          {loadingPdf ? '…' : '↓'} PDF
        </button>
      </div>
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-xl font-bold mt-0.5 ${accent ? 'text-brand-300' : 'text-white'}`}>{value}</p>
    </div>
  )
}

function EarningsRow({ label, value, accent, muted }: {
  label: string; value: string; accent?: boolean; muted?: boolean
}) {
  return (
    <div className="flex justify-between items-center">
      <span className={`text-sm ${muted ? 'text-gray-500' : 'text-gray-300'}`}>{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${accent ? 'text-brand-300' : muted ? 'text-gray-500' : 'text-white'}`}>
        {value}
      </span>
    </div>
  )
}

// ── Beneficiary card ──────────────────────────────────────────────────────────

// ── Payout status badge ───────────────────────────────────────────────────────

function PayoutStatusBadge({ status }: { status: string }) {
  const cfg: Record<string, string> = {
    pending:    'bg-yellow-900/40 text-yellow-400 border-yellow-800',
    processing: 'bg-blue-900/40 text-blue-400 border-blue-800',
    completed:  'bg-green-900/40 text-green-400 border-green-800',
    failed:     'bg-red-900/40 text-red-400 border-red-800',
  }
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs capitalize ${cfg[status] ?? cfg.pending}`}>
      {status}
    </span>
  )
}

// ── Send Funds panel ──────────────────────────────────────────────────────────

function SendFundsPanel({ campaign, netBalance, earnings }: { campaign: Campaign; netBalance: number; earnings?: EarningsData }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [selectedMethod, setSelectedMethod] = useState('')
  const [localPreview, setLocalPreview] = useState<string | null>(null)

  const { data: methods = [] } = useQuery<PayoutMethod[]>({
    queryKey: ['payout-methods'],
    queryFn: () => api.get<PayoutMethod[]>('/users/payout-methods').then(r => r.data),
  })

  const { data: payouts = [] } = useQuery<Payout[]>({
    queryKey: ['payouts', campaign.slug],
    queryFn: () => api.get<Payout[]>(`/campaigns/${campaign.slug}/payouts`).then(r => r.data),
  })

  const verifiedMethods = methods.filter(m => m.is_verified)

  const togglePayoutMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      api.patch(`/campaigns/${campaign.slug}/payout-enabled`, { payout_enabled: enabled }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaign', campaign.slug] }),
    onError: () => toast.error('Failed to update payout setting'),
  })

  const markSentMutation = useMutation({
    mutationFn: (payoutId: string) =>
      api.post(`/campaigns/${campaign.slug}/payouts/${payoutId}/mark-sent`).then(r => r.data),
    onSuccess: () => {
      toast.success('Payout marked as sent!')
      qc.invalidateQueries({ queryKey: ['payouts', campaign.slug] })
    },
    onError: () => toast.error('Failed to mark payout as sent'),
  })

  const payoutMutation = useMutation({
    mutationFn: () =>
      api.post(`/campaigns/${campaign.slug}/payout`, { payout_method_id: selectedMethod })
        .then(r => r.data),
    onSuccess: (data) => {
      toast.success(
        `Payout of ${data.payout_currency} ${Number(data.payout_amount_local).toLocaleString()} initiated!`
      )
      qc.invalidateQueries({ queryKey: ['payouts', campaign.slug] })
      setOpen(false)
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.detail ?? 'Payout failed'),
  })

  // Preview local amount when method is selected
  async function handleMethodChange(id: string) {
    setSelectedMethod(id)
    setLocalPreview(null)
    if (!id || !campaign.payout_currency) return
    try {
      const res = await api.get<{ payout_amount_local: string; payout_currency: string }>(
        `/campaigns/${campaign.slug}/payout-preview?payout_method_id=${id}`
      ).then(r => r.data).catch(() => null)
      if (res) setLocalPreview(`${res.payout_currency} ${Number(res.payout_amount_local).toLocaleString()}`)
    } catch { /* no-op */ }
  }

  const sentAmount = payouts
    .filter(p => p.status === 'completed' || p.status === 'processing')
    .reduce((sum, p) => sum + parseFloat(p.gross_amount_usd), 0)
  const baseBalance = campaign.campaign_type === 'political' && earnings
    ? parseFloat(earnings.total_gross)
    : netBalance
  const displayBalance = baseBalance - sentAmount

  if (displayBalance <= 0 && payouts.length === 0) return null

  const collectionCur = campaign.collection_currency ?? campaign.currency

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => togglePayoutMutation.mutate(!campaign.payout_enabled)}
            disabled={togglePayoutMutation.isPending}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent
              transition-colors duration-200 disabled:opacity-50
              ${campaign.payout_enabled ? 'bg-green-500' : 'bg-gray-600'}`}
          >
            <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform duration-200
              ${campaign.payout_enabled ? 'translate-x-4' : 'translate-x-0'}`} />
          </button>
          <h3 className="text-sm font-semibold text-white">Send Funds</h3>
        </div>
        {campaign.payout_enabled && displayBalance > 0 && !open && (
          <button
            onClick={() => setOpen(true)}
            className="rounded-lg bg-brand-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-brand-500 transition-colors"
          >
            Send Funds
          </button>
        )}
      </div>

      {/* Balance summary */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="rounded-lg bg-gray-800 p-3">
          <p className="text-xs text-gray-500">Available balance</p>
          <p className="text-base font-bold text-white mt-0.5">
            {fmt(displayBalance, collectionCur)}
          </p>
        </div>
        {campaign.payout_currency && (
          <div className="rounded-lg bg-gray-800 p-3">
            <p className="text-xs text-gray-500">Est. in {campaign.payout_currency}</p>
            <p className="text-base font-bold text-brand-300 mt-0.5">
              {localPreview ?? '—'}
            </p>
          </div>
        )}
      </div>

      {/* Fee breakdown — political campaigns, shown before initiating payout */}
      {campaign.campaign_type === 'political' && earnings && parseFloat(earnings.total_gross) > 0 && (
        <div className="mb-4 rounded-lg border border-gray-700 bg-gray-800 p-4 space-y-2">
          <p className="text-xs font-semibold text-gray-300 mb-1">Fee breakdown</p>
          <div className="flex justify-between text-xs">
            <span className="text-gray-400">Total raised</span>
            <span className="text-white font-medium">{fmt(parseFloat(earnings.total_gross), campaign.currency)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-400">Platform fee ({campaign.platform_fee_pct}%)</span>
            <span className="text-gray-400">− {fmt(parseFloat(earnings.total_platform_fees), campaign.currency)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-400">Processing fees (Stripe)</span>
            <span className="text-gray-400">− {fmt(parseFloat(earnings.total_stripe_fees), campaign.currency)}</span>
          </div>
          <div className="flex justify-between text-xs border-t border-gray-700 pt-2">
            <span className="text-white font-semibold">Net to campaign</span>
            <span className="text-brand-300 font-semibold">{fmt(parseFloat(earnings.total_net), campaign.currency)}</span>
          </div>
        </div>
      )}

      {/* Initiate payout form */}
      {open && (
        <div className="space-y-3 border-t border-gray-800 pt-4">
          {verifiedMethods.length === 0 ? (
            <p className="text-sm text-gray-400">
              No verified payout methods.{' '}
              <a href="/settings/payout" className="text-brand-400 hover:underline">Add one</a> first.
            </p>
          ) : (
            <>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Payout method</label>
                <select
                  value={selectedMethod}
                  onChange={e => handleMethodChange(e.target.value)}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-brand-500 focus:outline-none"
                >
                  <option value="">Select method…</option>
                  {verifiedMethods.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.network_name} — {m.account_name} ({m.account_number})
                    </option>
                  ))}
                </select>
              </div>

              {localPreview && (
                <p className="text-xs text-gray-400">
                  You'll receive approximately <span className="text-white font-medium">{localPreview}</span>
                </p>
              )}

              <p className="text-xs text-yellow-400 bg-yellow-900/20 border border-yellow-800 rounded-lg px-3 py-2">
                ⚠️ After confirming, you must manually send the funds via Zelle. ChipIn records this for accountability only.
              </p>

              <div className="flex gap-2">
                <button
                  onClick={() => setOpen(false)}
                  className="flex-1 rounded-lg border border-gray-700 py-2 text-xs text-gray-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => payoutMutation.mutate()}
                  disabled={!selectedMethod || payoutMutation.isPending}
                  className="flex-1 rounded-lg bg-brand-600 py-2 text-xs font-semibold text-white hover:bg-brand-500 disabled:opacity-50 transition-colors"
                >
                  {payoutMutation.isPending ? 'Sending…' : 'Confirm payout'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Payout history */}
      {payouts.length > 0 && (
        <div className="border-t border-gray-800 pt-4 mt-2">
          <p className="text-xs font-medium text-gray-400 mb-3">Payout history</p>
          <div className="space-y-2">
            {payouts.map(p => (
              <div key={p.id} className="flex items-center justify-between text-xs">
                <div>
                  <span className="text-white font-medium">
                    {p.payout_currency} {Number(p.payout_amount_local).toLocaleString()}
                  </span>
                  <span className="text-gray-500 ml-2">
                    {new Date(p.initiated_at).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {p.status === 'processing' && (
                    <button
                      onClick={() => markSentMutation.mutate(p.id)}
                      disabled={markSentMutation.isPending}
                      className="rounded px-2 py-0.5 text-xs font-medium text-green-400 border border-green-800
                        hover:bg-green-900/40 disabled:opacity-50 transition-colors"
                    >
                      ✓ Mark Sent
                    </button>
                  )}
                  <PayoutStatusBadge status={p.status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function BeneficiaryCard({ campaign }: { campaign: Campaign }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ display_name: '', story: '', location: '', party_name: '', office_sought: '' })
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const qc = useQueryClient()

  const { data: beneficiary, isLoading } = useQuery<Beneficiary | null>({
    queryKey: ['beneficiary', campaign.slug],
    queryFn: () =>
      api.get<Beneficiary>(`/campaigns/${campaign.slug}/beneficiary`)
        .then(r => r.data)
        .catch(e => e?.response?.status === 404 ? null : Promise.reject(e)),
    staleTime: 30_000,
  })

  const isMemorial = campaign.campaign_type === 'memorial'
  const isPolitical = campaign.campaign_type === 'political'

  function startEdit(b?: Beneficiary | null) {
    setForm({
      display_name: b?.display_name ?? '',
      story: b?.story ?? '',
      location: b?.location ?? '',
      party_name: b?.party_name ?? '',
      office_sought: b?.office_sought ?? '',
    })
    setPhotoPreview(b?.photo_url ?? null)
    setPhoto(null)
    setEditing(true)
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const fd = new FormData()
      if (form.display_name) fd.append('display_name', form.display_name)
      if (form.story) fd.append('story', form.story)
      if (form.location) fd.append('location', form.location)
      if (form.party_name) fd.append('party_name', form.party_name)
      if (form.office_sought) fd.append('office_sought', form.office_sought)
      if (photo) fd.append('photo', photo)
      if (beneficiary) {
        await api.patch(`/campaigns/${campaign.slug}/beneficiary`, fd)
      } else {
        await api.post(`/campaigns/${campaign.slug}/beneficiary`, fd)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['beneficiary', campaign.slug] })
      toast.success('Profile saved!')
      setEditing(false)
    },
    onError: () => toast.error('Failed to save profile'),
  })

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/campaigns/${campaign.slug}/beneficiary`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['beneficiary', campaign.slug] })
      toast.success('Profile removed')
      setEditing(false)
    },
    onError: () => toast.error('Failed to remove profile'),
  })

  if (isLoading) return null

  const pc = campaign.party_color ?? '#16a34a'

  return (
    <div
      className={`rounded-xl border border-gray-800 bg-gray-900 p-6 ${isPolitical ? 'border-l-4' : ''}`}
      style={isPolitical ? { borderLeftColor: pc } : undefined}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-white">
          {isPolitical ? 'Candidate / Party Profile' : 'Beneficiary Profile'}
        </h3>
        {beneficiary && !editing && (
          <button
            type="button"
            onClick={() => startEdit(beneficiary)}
            className="text-xs text-gray-400 hover:text-white transition-colors"
          >
            Edit
          </button>
        )}
      </div>

      {!editing && !beneficiary && (
        <div className={`rounded-lg border border-dashed p-4 text-center
          ${isMemorial ? 'border-slate-700' : isPolitical ? 'border-blue-900/40' : 'border-amber-900/40'}`}>
          <p className="text-sm text-gray-400 mb-3">
            {isMemorial
              ? 'Add a profile for the person being remembered to build emotional connection.'
              : isPolitical
                ? 'Add a candidate or party profile to show supporters who they are backing.'
                : 'Add a beneficiary profile to show contributors who they are helping.'}
          </p>
          <button
            type="button"
            onClick={() => startEdit()}
            className="rounded-lg bg-gray-800 px-4 py-2 text-xs font-medium text-white
              hover:bg-gray-700 transition-colors"
          >
            {isMemorial ? '🕊 Add Profile' : isPolitical ? '🗳️ Add Profile' : '❤️ Add Profile'}
          </button>
        </div>
      )}

      {!editing && beneficiary && (
        <div className="flex items-start gap-4">
          <div className="h-14 w-14 shrink-0 rounded-full overflow-hidden bg-gray-800 border border-gray-700">
            {beneficiary.photo_url
              ? <img src={beneficiary.photo_url} alt={beneficiary.display_name} className="h-full w-full object-cover" />
              : <div className="h-full w-full flex items-center justify-center text-2xl">
                  {isMemorial ? '🕊' : '❤️'}
                </div>
            }
          </div>
          <div className="flex-1 min-w-0">
            <p className={isPolitical ? 'text-lg font-bold text-white' : isMemorial ? 'text-base font-bold text-white' : 'text-sm font-semibold text-white'}>
              {beneficiary.display_name}
            </p>
            {isPolitical && beneficiary.party_name && (
              <p className="text-xs mt-0.5 text-gray-400">🏛️ {beneficiary.party_name}</p>
            )}
            {isPolitical && beneficiary.office_sought && (
              <p className="text-xs mt-0.5 text-gray-400">🗳️ {beneficiary.office_sought}</p>
            )}
            {!isPolitical && beneficiary.location && (
              <p className={`text-xs mt-0.5 ${isMemorial ? 'text-gray-300' : 'text-gray-400'}`}>
                📍 {beneficiary.location}
              </p>
            )}
            {beneficiary.story && (
              <p className={`text-xs mt-2 ${isMemorial
                ? 'text-gray-200 border-t border-gray-700 pt-2'
                : isPolitical
                  ? 'text-gray-300 leading-relaxed'
                  : 'text-gray-500 line-clamp-2'}`}>
                {beneficiary.story}
              </p>
            )}
          </div>
        </div>
      )}

      {editing && (
        <div className="space-y-4">
          {/* Photo */}
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 shrink-0 rounded-full overflow-hidden bg-gray-800 border border-gray-700">
              {photoPreview
                ? <img src={photoPreview} alt="" className="h-full w-full object-cover" />
                : <div className="h-full w-full flex items-center justify-center text-2xl">
                    {isMemorial ? '🕊' : '❤️'}
                  </div>
              }
            </div>
            <label className="cursor-pointer rounded-lg border border-gray-700 px-3 py-1.5
              text-xs text-gray-300 hover:border-brand-500 hover:text-white transition-colors">
              Upload photo
              <input type="file" accept="image/*" className="hidden" onChange={e => {
                const f = e.target.files?.[0] ?? null
                setPhoto(f)
                if (f) setPhotoPreview(URL.createObjectURL(f))
              }} />
            </label>
          </div>

          <input
            value={form.display_name}
            onChange={e => setForm(p => ({ ...p, display_name: e.target.value }))}
            placeholder="Full name *"
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5
              text-sm text-white placeholder-gray-600 focus:border-brand-500 focus:outline-none"
          />
          {isPolitical ? (
            <>
              <input
                value={form.party_name}
                onChange={e => setForm(p => ({ ...p, party_name: e.target.value }))}
                placeholder="Party Name (optional)"
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5
                  text-sm text-white placeholder-gray-600 focus:border-brand-500 focus:outline-none"
              />
              <input
                value={form.office_sought}
                onChange={e => setForm(p => ({ ...p, office_sought: e.target.value }))}
                placeholder="Office Sought (optional)"
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5
                  text-sm text-white placeholder-gray-600 focus:border-brand-500 focus:outline-none"
              />
            </>
          ) : (
            <input
              value={form.location}
              onChange={e => setForm(p => ({ ...p, location: e.target.value }))}
              placeholder="Location (optional)"
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5
                text-sm text-white placeholder-gray-600 focus:border-brand-500 focus:outline-none"
            />
          )}
          <textarea
            value={form.story}
            onChange={e => setForm(p => ({ ...p, story: e.target.value }))}
            rows={3}
            maxLength={isPolitical ? 5000 : 1000}
            placeholder="Story (optional)"
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5
              text-sm text-white placeholder-gray-600 focus:border-brand-500 focus:outline-none resize-none"
          />

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="flex-1 rounded-lg border border-gray-700 py-2 text-xs text-gray-400
                hover:text-white transition-colors"
            >
              Cancel
            </button>
            {beneficiary && (
              <button
                type="button"
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="rounded-lg border border-red-900 py-2 px-3 text-xs text-red-400
                  hover:border-red-700 hover:text-red-300 transition-colors disabled:opacity-50"
              >
                Remove
              </button>
            )}
            <button
              type="button"
              disabled={!form.display_name.trim() || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
              className="flex-1 rounded-lg bg-brand-600 py-2 text-xs font-semibold text-white
                hover:bg-brand-500 disabled:opacity-60 transition-colors"
            >
              {saveMutation.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Political hero card ───────────────────────────────────────────────────────

function PoliticalHeroCard({
  campaign,
  beneficiary,
  stats,
}: {
  campaign: Campaign
  beneficiary: Beneficiary | null | undefined
  stats: ReturnType<typeof computeStats>
}) {
  const pc = campaign.party_color ?? '#16a34a'

  return (
    <div
      className="relative rounded-xl overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)' }}
    >
      {/* Party color radial tint */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: `radial-gradient(ellipse at top, ${pc}22 0%, transparent 65%)` }}
      />

      <div className="relative p-6">
        {beneficiary && (
          <div className="flex flex-col items-center mb-5">
            <div
              className="h-28 w-28 rounded-full overflow-hidden border-4 bg-slate-700 mb-3 shadow-lg"
              style={{ borderColor: pc, boxShadow: `0 8px 20px ${pc}33` }}
            >
              {beneficiary.photo_url
                ? <img src={beneficiary.photo_url} alt={beneficiary.display_name} className="h-full w-full object-cover" />
                : <div className="h-full w-full flex items-center justify-center text-4xl">🗳️</div>
              }
            </div>
            <h2 className="text-xl font-bold text-white text-center leading-tight">{beneficiary.display_name}</h2>
            {beneficiary.party_name && (
              <p className="text-sm mt-1 text-center font-medium" style={{ color: pc }}>{beneficiary.party_name}</p>
            )}
            {beneficiary.office_sought && (
              <p className="text-xs mt-0.5 text-center text-gray-400">{beneficiary.office_sought}</p>
            )}
          </div>
        )}

        <h1 className={`font-bold text-white text-center leading-tight mb-4 ${beneficiary ? 'text-base' : 'text-xl'}`}>
          {campaign.title}
        </h1>

        <div className="bg-slate-800/70 rounded-xl p-4 border border-slate-700/60">
          <p className="text-2xl font-bold tabular-nums text-center" style={{ color: pc }}>
            {fmt(stats.totalRaised, campaign.currency)}
          </p>
          {stats.goalAmount != null ? (
            <>
              <p className="text-gray-400 text-sm text-center mt-1">
                of {fmt(stats.goalAmount, campaign.currency)} goal
              </p>
              <div className="mt-3 h-2.5 w-full rounded-full bg-slate-700 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${Math.min(stats.progress, 100)}%`, backgroundColor: pc }}
                />
              </div>
              <p className="text-xs text-gray-500 text-right mt-1">{Math.round(stats.progress)}% funded</p>
            </>
          ) : (
            <p className="text-gray-400 text-sm text-center mt-1">
              raised so far · {stats.paidCount} supporter{stats.paidCount !== 1 ? 's' : ''}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Record Purchase panel ─────────────────────────────────────────────────────

interface RecordPurchasePanelProps {
  campaign: Campaign
  totalCollected: number
  purchases: PurchaseRecord[]
}

function RecordPurchasePanel({ campaign, totalCollected, purchases }: RecordPurchasePanelProps) {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ description: '', amount: '', note: '' })

  const addMutation = useMutation({
    mutationFn: () =>
      api.post(`/campaigns/${campaign.slug}/purchases`, {
        description: form.description,
        amount: parseFloat(form.amount),
        note: form.note || null,
      }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchases', campaign.slug] })
      setForm({ description: '', amount: '', note: '' })
      setShowForm(false)
      toast.success('Purchase recorded!')
    },
    onError: () => toast.error('Failed to record purchase'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      api.delete(`/campaigns/${campaign.slug}/purchases/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchases', campaign.slug] })
    },
    onError: () => toast.error('Failed to delete purchase'),
  })

  const totalSpent = purchases.reduce((s, p) => s + parseFloat(p.amount), 0)
  const balance = totalCollected - totalSpent

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-white">Purchases</h3>
        {!showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="text-xs rounded-lg border border-gray-700 px-3 py-1 text-gray-300
              hover:text-white hover:border-gray-500 transition-colors"
          >
            + Add
          </button>
        )}
      </div>
      <p className="text-xs text-gray-500 mb-4">Record what the funds were spent on</p>

      {showForm && (
        <div className="mb-4 space-y-3 rounded-lg border border-gray-700 bg-gray-800 p-4">
          <input
            value={form.description}
            onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
            placeholder="Description *"
            className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm
              text-white placeholder-gray-600 focus:border-brand-500 focus:outline-none"
          />
          <input
            type="number"
            value={form.amount}
            onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
            placeholder="Amount *"
            min="0"
            step="0.01"
            className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm
              text-white placeholder-gray-600 focus:border-brand-500 focus:outline-none"
          />
          <input
            value={form.note}
            onChange={e => setForm(p => ({ ...p, note: e.target.value }))}
            placeholder="Note (optional)"
            className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm
              text-white placeholder-gray-600 focus:border-brand-500 focus:outline-none"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setShowForm(false); setForm({ description: '', amount: '', note: '' }) }}
              className="flex-1 rounded-lg border border-gray-700 py-2 text-xs text-gray-400
                hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => addMutation.mutate()}
              disabled={!form.description.trim() || !form.amount || addMutation.isPending}
              className="flex-1 rounded-lg bg-brand-600 py-2 text-xs font-semibold text-white
                hover:bg-brand-500 disabled:opacity-50 transition-colors"
            >
              {addMutation.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {purchases.length === 0 && !showForm && (
        <p className="text-xs text-gray-600 mb-4">No purchases recorded yet.</p>
      )}

      {purchases.length > 0 && (
        <div className="space-y-2 mb-4">
          {purchases.map(p => (
            <div key={p.id} className="flex items-center justify-between gap-2 text-sm">
              <div className="flex-1 min-w-0">
                <span className="text-white font-medium">{p.description}</span>
                <span className="text-gray-400 ml-2 tabular-nums">
                  {fmt(parseFloat(p.amount), campaign.currency)}
                </span>
                {p.note && (
                  <span className="text-gray-500 ml-1 text-xs">({p.note})</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => deleteMutation.mutate(p.id)}
                disabled={deleteMutation.isPending}
                className="shrink-0 text-gray-600 hover:text-red-400 transition-colors text-xs px-1"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="border-t border-gray-800 pt-3 space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-500">Total spent</span>
          <span className="text-sm font-semibold text-white tabular-nums">
            {fmt(totalSpent, campaign.currency)}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-500">Remaining balance</span>
          <span className={`text-sm font-semibold tabular-nums ${balance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {fmt(balance, campaign.currency)}
          </span>
        </div>
      </div>
    </div>
  )
}
