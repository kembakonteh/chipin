import { useParams, useSearchParams } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { BASE_URL } from '../lib/api'
import type { CampaignType } from '../types'
import { deadlineInfo, fmt } from '../types'
import ProgressRing from '../components/ProgressRing'

const MILESTONES = [25, 50, 75, 100] as const

// ── Types ───────────────────────────────────────────────────────────────────

interface PublicContributor {
  display_name: string
  amount: string
  paid: boolean
  paid_at: string | null
  message: string | null
}

interface PublicBeneficiary {
  display_name: string
  photo_url: string | null
  story: string | null
  location: string | null
}

interface PublicCampaign {
  slug: string
  title: string
  description: string | null
  emoji: string
  campaign_type: CampaignType
  goal_amount: string | null
  contribution_note: string | null
  due_date: string | null
  amount_per_person: string | null
  currency: string
  allow_anonymous_contributions: boolean
  total_raised: string
  contributor_count: number
  paid_count: number
  contributors: PublicContributor[]
  status: string
  zelle_info: string | null
  cashapp_handle: string | null
  beneficiary: PublicBeneficiary | null
}

interface LiveStats {
  total_raised: string
  paid_count: number
  contributor_count: number
  progress_pct: number
  latest_payer_display_name: string | null
}

const http = axios.create({ baseURL: BASE_URL })

// ── Helpers ─────────────────────────────────────────────────────────────────

const BOARD_TITLE: Record<CampaignType, string> = {
  general:     "Who's In 🔥",
  memorial:    'Contributors',
  charity:     'Supporters',
  celebration: "Who's Celebrating 🎉",
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

const AVATAR_COLORS = [
  'bg-brand-600', 'bg-blue-600', 'bg-purple-600',
  'bg-orange-500', 'bg-pink-600', 'bg-teal-600',
]
function avatarColor(name: string): string {
  let h = 0
  for (const c of name) h = h * 31 + c.charCodeAt(0)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?'
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function hideAmount(ct: CampaignType): boolean {
  return ct === 'memorial' || ct === 'charity'
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function PublicCampaign() {
  const { slug } = useParams<{ slug: string }>()
  const [sp] = useSearchParams()
  const qc = useQueryClient()

  const isPaid      = sp.get('paid') === 'true'
  const isAnonPaid  = sp.get('anon') === 'true'
  const isCancelled = sp.get('cancelled') === 'true'

  const { data: campaign, isLoading, isError } = useQuery({
    queryKey: ['public', slug],
    queryFn: () => http.get<PublicCampaign>(`/p/${slug}`).then(r => r.data),
    enabled: !!slug,
    staleTime: 15_000,
  })

  // Live stats from SSE (overrides REST data when set)
  const [live, setLive] = useState<LiveStats | null>(null)
  // New-payer flash banner
  const [newPayer, setNewPayer] = useState<string | null>(null)
  const newPayerTimer = useRef<ReturnType<typeof setTimeout>>()

  // Milestone banner
  const [milestonePct, setMilestonePct] = useState<number | null>(null)
  const milestoneTimer = useRef<ReturnType<typeof setTimeout>>()
  const shownMilestones = useRef<Set<number>>(new Set())

  // Animated progress: start at 0 then transition to real value
  const realProgress = live
    ? live.progress_pct
    : campaign && campaign.goal_amount
      ? (parseFloat(campaign.total_raised) / parseFloat(campaign.goal_amount)) * 100
      : 0
  const [animProgress, setAnimProgress] = useState(0)
  useEffect(() => {
    const t = setTimeout(() => setAnimProgress(realProgress), 120)
    return () => clearTimeout(t)
  }, [realProgress])

  // SSE connection (starts once campaign is confirmed to exist)
  useEffect(() => {
    if (!slug || !campaign) return
    const es = new EventSource(`${BASE_URL}/p/${slug}/stream`)
    es.addEventListener('campaign_update', (e: MessageEvent) => {
      const data = JSON.parse(e.data as string) as LiveStats
      setLive(data)
      setAnimProgress(data.progress_pct)
      qc.invalidateQueries({ queryKey: ['public', slug] })
      if (data.latest_payer_display_name) {
        clearTimeout(newPayerTimer.current)
        setNewPayer(data.latest_payer_display_name)
        newPayerTimer.current = setTimeout(() => setNewPayer(null), 4_000)
      }

      // Milestone detection (highest new milestone wins)
      for (const m of [...MILESTONES].reverse()) {
        if (data.progress_pct >= m && !shownMilestones.current.has(m)) {
          shownMilestones.current.add(m)
          clearTimeout(milestoneTimer.current)
          setMilestonePct(m)
          milestoneTimer.current = setTimeout(() => setMilestonePct(null), 10_000)
          break
        }
      }
    })
    es.onerror = () => es.close()
    return () => {
      es.close()
      clearTimeout(newPayerTimer.current)
      clearTimeout(milestoneTimer.current)
    }
  }, [slug, campaign?.slug])

  // Derived display values
  const totalRaised   = live ? parseFloat(live.total_raised) : parseFloat(campaign?.total_raised ?? '0')
  const goalAmount    = campaign?.goal_amount != null ? parseFloat(campaign.goal_amount) : null
  const paidCount     = live?.paid_count     ?? campaign?.paid_count ?? 0
  const totalCount    = live?.contributor_count ?? campaign?.contributor_count ?? 0
  const pendingCount  = Math.max(0, totalCount - paidCount)
  const remaining     = goalAmount != null ? Math.max(0, goalAmount - totalRaised) : null
  const amountPer     = campaign?.amount_per_person ? parseFloat(campaign.amount_per_person) : null

  // Payment flow
  const [payMode, setPayMode] = useState<null | 'card' | 'manual'>(null)
  const [manualMethod, setManualMethod] = useState<null | 'zelle' | 'cashapp'>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [amount, setAmount] = useState(campaign?.amount_per_person ?? '')
  const [message, setMessage] = useState('')
  const [isAnon, setIsAnon] = useState(false)
  const [paying, setPaying] = useState(false)
  const [payError, setPayError] = useState('')
  const [manualSent, setManualSent] = useState(false)

  useEffect(() => {
    if (!campaign) return
    setAmount(campaign.amount_per_person ?? '')
    const defaultAnon = campaign.campaign_type === 'memorial' || campaign.campaign_type === 'charity'
    setIsAnon(defaultAnon)
  }, [campaign?.campaign_type, campaign?.amount_per_person])

  async function handlePay(e: React.FormEvent) {
    e.preventDefault()
    if (!campaign || !name.trim() || !email.trim()) return
    const parsed = parseFloat(amount)
    if (!amount || isNaN(parsed) || parsed <= 0) {
      setPayError('Enter a valid amount.')
      return
    }
    setPayError('')
    setPaying(true)
    try {
      const res = await http.post<{ checkout_url: string }>(`/p/${slug}/pay`, {
        contributor_name: name.trim(),
        contributor_email: email.trim(),
        amount: parsed,
        is_anonymous: isAnon,
        message: message.trim() || null,
      })
      window.location.href = res.data.checkout_url
    } catch (err: unknown) {
      const msg =
        axios.isAxiosError(err)
          ? (err.response?.data as { detail?: string })?.detail ?? 'Payment failed.'
          : 'Payment failed.'
      setPayError(msg)
      setPaying(false)
    }
  }

  // Page title
  useEffect(() => {
    if (campaign) document.title = `${campaign.emoji} ${campaign.title} — ChipIn`
    return () => { document.title = 'ChipIn' }
  }, [campaign?.title])

  // ── Render ────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="min-h-screen bg-brand-600 flex items-center justify-center">
        <div className="h-10 w-10 rounded-full border-4 border-white border-t-transparent animate-spin" />
      </div>
    )
  }

  if (isError || !campaign) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-4xl mb-4">😕</p>
          <p className="text-white font-semibold mb-1">Campaign not found</p>
          <p className="text-gray-400 text-sm">This link may be expired or incorrect.</p>
        </div>
      </div>
    )
  }

  const isActive = campaign.status === 'active'
  const sorted = [...campaign.contributors].sort((a, b) => {
    if (a.paid === b.paid) return 0
    return a.paid ? -1 : 1
  })

  return (
    <div className="min-h-screen bg-gray-50 font-sans">

      {/* ── Status banners ── */}
      {isPaid && (
        <div className={`px-4 py-3 text-center text-sm font-medium text-white
          ${isAnonPaid ? 'bg-brand-700' : 'bg-brand-600'}`}>
          {isAnonPaid
            ? 'Payment received. Your contribution is private 🔒 Thank you!'
            : "Payment received! You're on the board. 🎉"}
        </div>
      )}
      {isCancelled && (
        <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-3 text-center text-sm text-yellow-800">
          Payment cancelled — no charge was made.
        </div>
      )}

      {/* ── New-payer flash ── */}
      {newPayer && (
        <div className="animate-pulse fixed top-0 inset-x-0 z-50 px-4 py-3 text-center text-sm
          font-medium text-white bg-brand-500 shadow-lg">
          💚 {newPayer} just chipped in!
        </div>
      )}

      {/* ── Milestone banner ── */}
      {milestonePct && slug && (
        <div className="fixed top-0 inset-x-0 z-50 bg-gradient-to-r from-brand-700 to-brand-500
          px-4 py-3 shadow-lg">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 text-white">
            <span className="text-sm font-bold">
              🎉 {milestonePct}% funded! Amazing momentum!
            </span>
            <div className="flex items-center gap-2">
              <a
                href={`${BASE_URL}/p/${slug}/share-card?milestone=${milestonePct}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-semibold bg-white/20 hover:bg-white/30 rounded-full
                  px-3 py-1 transition-colors"
              >
                View share card ↗
              </a>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(
                  `🎉 ${milestonePct}% funded! Help us reach our goal — ${window.location.href}`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-semibold bg-white/20 hover:bg-white/30 rounded-full
                  px-3 py-1 transition-colors"
              >
                Share on WhatsApp
              </a>
            </div>
          </div>
        </div>
      )}

      {/* ── Hero (green gradient) ── */}
      <div className="bg-gradient-to-b from-brand-700 via-brand-600 to-brand-500 px-4 pb-8 pt-10 text-white">

        {/* Emoji + title */}
        <div className="text-center mb-6">
          <span className="text-6xl block mb-3">{campaign.emoji}</span>
          <h1 className="text-2xl font-bold leading-tight">{campaign.title}</h1>
          {campaign.description && (
            <p className="mt-2 text-brand-100 text-sm leading-relaxed max-w-xs mx-auto">
              {campaign.description}
            </p>
          )}
        </div>

        {/* Progress ring + raised */}
        <div className="flex flex-col items-center mb-6">
          {goalAmount != null && (
            <ProgressRing
              percent={animProgress}
              size={160}
              strokeWidth={14}
              color="white"
              trackColor="rgba(255,255,255,0.2)"
            />
          )}
          <p className="mt-4 text-4xl font-bold tabular-nums">
            {fmt(totalRaised, campaign.currency)}
          </p>
          <p className="text-brand-100 text-sm mt-1">
            {goalAmount != null
              ? <>of {fmt(goalAmount, campaign.currency)} goal</>
              : <>raised so far</>
            }
            {amountPer && (
              <> · <span className="font-semibold">{fmt(amountPer, campaign.currency)}</span> per person</>
            )}
          </p>
          {goalAmount == null && campaign.contribution_note && (
            <p className="text-brand-200 text-xs mt-1.5 italic max-w-xs mx-auto text-center leading-relaxed">
              {campaign.contribution_note}
            </p>
          )}
          {/* Local-currency conversion line (e.g. ~GMD 42,000) */}
          {(campaign as any).payout_currency && (campaign as any).goal_amount_local && (
            <p className="text-brand-200 text-xs mt-0.5">
              ~{(campaign as any).payout_currency}{' '}
              {Number((campaign as any).goal_amount_local).toLocaleString()} goal
              {(campaign as any).total_raised_local && (
                <> · {(campaign as any).payout_currency}{' '}
                {Number((campaign as any).total_raised_local).toLocaleString()} raised</>
              )}
            </p>
          )}
        </div>

        {/* Deadline banner */}
        {(() => {
          const dl = deadlineInfo(campaign.due_date)
          if (!dl.urgency || !isActive) return null
          const styles = {
            overdue:  'bg-red-500/20 border-red-400/30 text-red-200',
            today:    'bg-red-500/20 border-red-400/30 text-red-200',
            tomorrow: 'bg-yellow-500/20 border-yellow-400/30 text-yellow-200',
            soon:     'bg-yellow-500/20 border-yellow-400/30 text-yellow-200',
            upcoming: 'bg-white/10 border-white/20 text-brand-100',
          }
          const icons = { overdue: '⚠️', today: '🔴', tomorrow: '🟡', soon: '⏰', upcoming: '📅' }
          return (
            <div className={`mx-auto mb-4 max-w-xs rounded-xl border px-4 py-2 text-center text-sm font-medium ${styles[dl.urgency]}`}>
              {icons[dl.urgency]} {dl.label}
            </div>
          )
        })()}

        {/* Stat pills */}
        <div className="flex justify-center gap-2 flex-wrap">
          <Pill label="Paid" value={String(paidCount)} />
          <Pill label="Pending" value={String(pendingCount)} />
          {remaining != null && <Pill label="Remaining" value={fmt(remaining, campaign.currency)} />}
        </div>
      </div>

      {/* ── Beneficiary section ── */}
      {campaign.beneficiary && (
        <BeneficiarySection
          beneficiary={campaign.beneficiary}
          campaignType={campaign.campaign_type}
        />
      )}

      {/* ── Pay section ── */}
      <div className="px-4 py-6 bg-white border-b border-gray-100">
        {!isActive && (
          <div className="mb-4 rounded-xl bg-gray-100 px-4 py-3 text-center text-sm text-gray-500">
            This campaign is no longer accepting contributions.
          </div>
        )}

        {/* Step 1: Choose payment method */}
        {isActive && payMode === null && (
          <div className="space-y-3">
            <p className="text-center text-sm font-medium text-gray-600 mb-1">
              How would you like to pay?
            </p>
            <button
              type="button"
              onClick={() => setPayMode('card')}
              className="w-full flex items-center gap-3 rounded-2xl border-2 border-brand-500
                bg-brand-50 px-5 py-4 text-left hover:bg-brand-100 active:scale-[0.98]
                transition-all"
            >
              <span className="text-2xl">💳</span>
              <div>
                <p className="font-semibold text-brand-700 text-sm">Pay by Debit Card</p>
                <p className="text-xs text-brand-500 mt-0.5">Secure checkout via Stripe · debit cards only</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setPayMode('manual')}
              className="w-full flex items-center gap-3 rounded-2xl border-2 border-gray-200
                bg-gray-50 px-5 py-4 text-left hover:border-gray-300 hover:bg-gray-100
                active:scale-[0.98] transition-all"
            >
              <span className="text-2xl">💸</span>
              <div>
                <p className="font-semibold text-gray-700 text-sm">Zelle / CashApp / Cash</p>
                <p className="text-xs text-gray-500 mt-0.5">Transfer directly · organizer marks you as paid</p>
              </div>
            </button>
          </div>
        )}

        {/* Step 2a: Card payment form */}
        {isActive && payMode === 'card' && (
          <form onSubmit={handlePay} className="space-y-3">
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-amber-500 text-sm">⚠️</span>
                <p className="text-xs text-amber-700 font-medium">Debit cards only — credit cards are not accepted.</p>
              </div>
              <p className="text-xs text-amber-600 pl-6">
                A <span className="font-semibold">2.5% platform fee</span> is added to card payments.
                {(() => {
                  const parsed = parseFloat(amount)
                  if (!amount || isNaN(parsed) || parsed <= 0) return null
                  const fee = parsed * 0.025
                  const total = parsed + fee
                  return (
                    <span className="text-amber-700 font-medium">
                      {' '}You'll be charged <span className="font-bold">${total.toFixed(2)}</span> (${parsed.toFixed(2)} + ${fee.toFixed(2)} fee).
                    </span>
                  )
                })()}
              </p>
            </div>

            <input
              required
              type="text"
              placeholder="Your full name *"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3
                text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500
                focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            <input
              required
              type="email"
              placeholder="Email address *"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3
                text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500
                focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">
                {campaign.currency === 'USD' ? '$' : campaign.currency}
              </span>
              <input
                required
                type="number"
                min="1"
                step="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="Amount"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 pl-8 pr-4 py-3
                  text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500
                  focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>

            {campaign.allow_anonymous_contributions && (
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isAnon}
                    onChange={e => setIsAnon(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-600
                      focus:ring-brand-500"
                  />
                  <span className="text-sm text-gray-700">Keep my name private on the public board</span>
                </label>
                {isAnon && (
                  <p className="mt-2 ml-7 text-xs text-gray-500 leading-relaxed">
                    Your contribution will show as{' '}
                    <span className="font-medium text-gray-600">Anonymous</span>.
                    The organizer will still know it's you.
                  </p>
                )}
              </div>
            )}

            {/* Optional message */}
            <div>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                maxLength={300}
                rows={2}
                placeholder={
                  campaign.campaign_type === 'memorial'
                    ? 'Leave a message of condolence (optional) — e.g. "May he rest in peace. Our thoughts are with the family."'
                    : 'Leave a message (optional)'
                }
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3
                  text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500
                  focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
              />
              {message.length > 0 && (
                <p className="text-right text-xs text-gray-400 mt-0.5">{message.length}/300</p>
              )}
            </div>

            {payError && <p className="text-sm text-red-500 text-center">{payError}</p>}

            <button
              type="submit"
              disabled={paying}
              className="w-full rounded-2xl bg-brand-600 py-4 text-base font-bold text-white
                hover:bg-brand-500 active:scale-[0.98] disabled:opacity-60 transition-all
                shadow-md shadow-brand-600/30"
            >
              {paying ? 'Redirecting to Stripe…' : 'Pay by Debit Card 💳'}
            </button>
            <button type="button" onClick={() => setPayMode(null)}
              className="w-full py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors">
              ← Back
            </button>
          </form>
        )}

        {/* Step 2b: Zelle / CashApp */}
        {isActive && payMode === 'manual' && !manualSent && (
          <div className="space-y-4">
            {/* Method picker */}
            {manualMethod === null && (
              <div className="space-y-3">
                <p className="text-center text-sm font-medium text-gray-600 mb-1">
                  Which method will you use?
                </p>
                {campaign.zelle_info && (
                  <button
                    type="button"
                    onClick={() => setManualMethod('zelle')}
                    className="w-full flex items-center gap-3 rounded-2xl border-2 border-blue-200
                      bg-blue-50 px-5 py-4 text-left hover:bg-blue-100 active:scale-[0.98] transition-all"
                  >
                    <span className="text-2xl">💜</span>
                    <div>
                      <p className="font-semibold text-blue-700 text-sm">Zelle</p>
                      <p className="text-xs text-blue-500 mt-0.5">Send to: {campaign.zelle_info}</p>
                    </div>
                  </button>
                )}
                {campaign.cashapp_handle && (
                  <button
                    type="button"
                    onClick={() => setManualMethod('cashapp')}
                    className="w-full flex items-center gap-3 rounded-2xl border-2 border-green-200
                      bg-green-50 px-5 py-4 text-left hover:bg-green-100 active:scale-[0.98] transition-all"
                  >
                    <span className="text-2xl">💵</span>
                    <div>
                      <p className="font-semibold text-green-700 text-sm">CashApp</p>
                      <p className="text-xs text-green-600 mt-0.5">Send to: {campaign.cashapp_handle}</p>
                    </div>
                  </button>
                )}
                {!campaign.zelle_info && !campaign.cashapp_handle && (
                  <div className="rounded-xl bg-gray-50 border border-gray-200 p-4 space-y-2">
                    <p className="text-sm font-semibold text-gray-800">Pay directly</p>
                    <p className="text-sm text-gray-600">
                      Send your payment via Zelle, CashApp, or cash to the organizer, then let them know so they can mark you as paid.
                    </p>
                  </div>
                )}
                <button type="button" onClick={() => setPayMode(null)}
                  className="w-full py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors">
                  ← Back
                </button>
              </div>
            )}

            {/* Self-report form */}
            {manualMethod !== null && (
              <form
                className="space-y-3"
                onSubmit={async (e) => {
                  e.preventDefault()
                  if (!name.trim() || !phone.trim()) return
                  const parsed = parseFloat(amount)
                  if (!amount || isNaN(parsed) || parsed <= 0) {
                    setPayError('Enter a valid amount.')
                    return
                  }
                  setPayError('')
                  setPaying(true)
                  try {
                    await http.post(`/p/${slug}/manual-pay`, {
                      name: name.trim(),
                      phone: phone.trim(),
                      email: email.trim() || null,
                      amount: parsed,
                      method: manualMethod,
                      is_anonymous: isAnon,
                    })
                    setManualSent(true)
                  } catch (err: unknown) {
                    const msg = axios.isAxiosError(err)
                      ? (err.response?.data as { detail?: string })?.detail ?? 'Could not submit.'
                      : 'Could not submit.'
                    setPayError(msg)
                  } finally {
                    setPaying(false)
                  }
                }}
              >
                <div className={`rounded-xl p-3 text-sm ${manualMethod === 'zelle'
                  ? 'bg-blue-50 border border-blue-200 text-blue-700'
                  : 'bg-green-50 border border-green-200 text-green-700'}`}>
                  <p className="font-semibold mb-1">
                    {manualMethod === 'zelle' ? '💜 Zelle' : '💵 CashApp'}
                  </p>
                  <p className="text-xs">
                    Send {amountPer ? fmt(amountPer, campaign.currency) : 'your amount'} to{' '}
                    <span className="font-bold">
                      {manualMethod === 'zelle' ? campaign.zelle_info : campaign.cashapp_handle}
                    </span>
                    , then fill out your details below so the organizer knows to confirm you.
                  </p>
                </div>

                <input required type="text" placeholder="Your full name *" value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3
                    text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500
                    focus:outline-none focus:ring-1 focus:ring-brand-500" />
                <input required type="tel" placeholder="Your phone number *" value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3
                    text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500
                    focus:outline-none focus:ring-1 focus:ring-brand-500" />
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">
                    {campaign.currency === 'USD' ? '$' : campaign.currency}
                  </span>
                  <input required type="number" min="1" step="0.01" value={amount}
                    onChange={e => setAmount(e.target.value)} placeholder="Amount"
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 pl-8 pr-4 py-3
                      text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500
                      focus:outline-none focus:ring-1 focus:ring-brand-500" />
                </div>

                {payError && <p className="text-sm text-red-500 text-center">{payError}</p>}

                <button type="submit" disabled={paying}
                  className="w-full rounded-2xl bg-brand-600 py-4 text-base font-bold text-white
                    hover:bg-brand-500 active:scale-[0.98] disabled:opacity-60 transition-all
                    shadow-md shadow-brand-600/30">
                  {paying ? 'Submitting…' : "I've sent the payment ✓"}
                </button>
                <button type="button" onClick={() => setManualMethod(null)}
                  className="w-full py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors">
                  ← Back
                </button>
              </form>
            )}
          </div>
        )}

        {/* Manual pay success */}
        {isActive && payMode === 'manual' && manualSent && (
          <div className="text-center space-y-3 py-4">
            <span className="text-4xl block">🎉</span>
            <p className="font-semibold text-gray-800">Thanks, {name}!</p>
            <p className="text-sm text-gray-500">
              We've notified the organizer. Once they confirm your payment, your name will appear on the board.
            </p>
          </div>
        )}

        {payMode === null && (
          <p className="mt-3 text-center text-xs text-gray-400">
            Card payments secured by Stripe · 2.5% platform fee applies
          </p>
        )}
      </div>

      {/* ── Board ── */}
      <div className="px-4 py-6">
        <h2 className="text-base font-bold text-gray-800 mb-4">
          {BOARD_TITLE[campaign.campaign_type] ?? 'Contributors'}
        </h2>

        {sorted.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 py-10 text-center">
            <p className="text-gray-400 text-sm">Be the first to chip in! 💚</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sorted.map((c, i) => (
              <BoardRow
                key={i}
                contributor={c}
                campaignType={campaign.campaign_type}
                currency={campaign.currency}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="px-4 pb-10 pt-4 text-center">
        <p className="text-xs text-gray-400">
          Powered by{' '}
          <span className="font-semibold text-brand-600">ChipIn</span>
          {' '}·{' '}
          <span className="text-gray-400">kafotech.io</span>
        </p>
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

// ── Beneficiary section ───────────────────────────────────────────────────────

function BeneficiarySection({
  beneficiary: b,
  campaignType,
}: {
  beneficiary: PublicBeneficiary
  campaignType: CampaignType
}) {
  const [expanded, setExpanded] = useState(false)
  const isMemorial = campaignType === 'memorial'

  const bgClass = isMemorial
    ? 'bg-slate-50 border-b border-slate-200'
    : 'bg-amber-50 border-b border-amber-100'
  const nameClass = isMemorial ? 'text-slate-800' : 'text-amber-900'
  const locationClass = isMemorial ? 'text-slate-500' : 'text-amber-700'
  const storyClass = isMemorial ? 'text-slate-600' : 'text-amber-800'
  const readMoreClass = isMemorial ? 'text-slate-500 hover:text-slate-700' : 'text-amber-600 hover:text-amber-800'

  const story = b.story ?? ''
  const needsTruncate = story.length > 180

  return (
    <div className={`px-4 py-5 ${bgClass}`}>
      <div className="flex items-start gap-4">
        {/* Photo */}
        <div className={`h-20 w-20 shrink-0 rounded-full overflow-hidden border-2
          ${isMemorial ? 'border-slate-300' : 'border-amber-300'} bg-gray-200`}>
          {b.photo_url ? (
            <img src={b.photo_url} alt={b.display_name} className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full flex items-center justify-center text-3xl">
              {isMemorial ? '🕊' : '❤️'}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className={`font-semibold text-base ${nameClass}`}>{b.display_name}</p>
          {b.location && (
            <p className={`text-xs mt-0.5 ${locationClass}`}>📍 {b.location}</p>
          )}
          {story && (
            <div className="mt-2">
              <p className={`text-sm leading-relaxed ${storyClass} ${!expanded && needsTruncate ? 'line-clamp-3' : ''}`}>
                {story}
              </p>
              {needsTruncate && (
                <button
                  type="button"
                  onClick={() => setExpanded(e => !e)}
                  className={`text-xs mt-1 underline underline-offset-2 transition-colors ${readMoreClass}`}
                >
                  {expanded ? 'Show less' : 'Read more'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1.5">
      <span className="text-xs text-brand-100">{label}</span>
      <span className="text-sm font-bold text-white">{value}</span>
    </div>
  )
}

function BoardRow({
  contributor: c,
  campaignType,
  currency,
}: {
  contributor: PublicContributor
  campaignType: CampaignType
  currency: string
}) {
  const isAnon    = c.display_name === 'Anonymous'
  const hideMoney = isAnon && hideAmount(campaignType)

  return (
    <div className={`flex items-center gap-3 rounded-xl px-4 py-3 border
      ${c.paid
        ? 'bg-white border-gray-100 shadow-sm'
        : 'bg-gray-50 border-dashed border-gray-200'
      }`}>
      {/* Avatar */}
      {isAnon ? (
        <div className="h-9 w-9 shrink-0 rounded-full bg-gray-200 flex items-center justify-center text-gray-400 text-sm">
          🛡
        </div>
      ) : (
        <div className={`h-9 w-9 shrink-0 rounded-full ${c.paid ? avatarColor(c.display_name) : 'bg-gray-200'}
          flex items-center justify-center text-xs font-bold text-white`}>
          {c.paid ? initials(c.display_name) : <span className="text-gray-400">{initials(c.display_name)}</span>}
        </div>
      )}

      {/* Name + time + message */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${c.paid ? 'text-gray-800' : 'text-gray-400'}`}>
          {c.display_name}
        </p>
        {c.paid && c.paid_at && (
          <p className="text-xs text-gray-400 mt-0.5">{timeAgo(c.paid_at)}</p>
        )}
        {c.paid && c.message && (
          <p className={`text-xs mt-1 leading-relaxed italic ${
            campaignType === 'memorial' ? 'text-slate-500' : 'text-gray-500'
          }`}>
            "{c.message}"
          </p>
        )}
      </div>

      {/* Status + amount */}
      <div className="flex items-center gap-2 shrink-0">
        {!hideMoney && (
          <span className={`text-sm font-semibold tabular-nums
            ${c.paid ? 'text-brand-600' : 'text-gray-300'}`}>
            {fmt(parseFloat(c.amount), currency)}
          </span>
        )}
        {c.paid ? (
          <span className="flex h-6 w-6 items-center justify-center rounded-full
            bg-brand-100 text-brand-600 text-xs font-bold">
            ✓
          </span>
        ) : (
          <span className="flex h-6 w-6 items-center justify-center rounded-full
            border-2 border-dashed border-gray-300 text-gray-300 text-xs">
            ○
          </span>
        )}
      </div>
    </div>
  )
}
