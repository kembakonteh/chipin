import { useParams, useSearchParams } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { BASE_URL } from '../lib/api'
import type { CampaignType } from '../types'
import { fmt } from '../types'
import ProgressRing from '../components/ProgressRing'

// ── Types ───────────────────────────────────────────────────────────────────

interface PublicContributor {
  display_name: string
  amount: string
  paid: boolean
  paid_at: string | null
}

interface PublicCampaign {
  slug: string
  title: string
  description: string | null
  emoji: string
  campaign_type: CampaignType
  goal_amount: string
  amount_per_person: string | null
  currency: string
  allow_anonymous_contributions: boolean
  total_raised: string
  contributor_count: number
  paid_count: number
  contributors: PublicContributor[]
  status: string
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

  // Animated progress: start at 0 then transition to real value
  const realProgress = live
    ? live.progress_pct
    : campaign
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
    })
    es.onerror = () => es.close()
    return () => {
      es.close()
      clearTimeout(newPayerTimer.current)
    }
  }, [slug, campaign?.slug])

  // Derived display values
  const totalRaised   = live ? parseFloat(live.total_raised) : parseFloat(campaign?.total_raised ?? '0')
  const goalAmount    = parseFloat(campaign?.goal_amount ?? '0')
  const paidCount     = live?.paid_count     ?? campaign?.paid_count ?? 0
  const totalCount    = live?.contributor_count ?? campaign?.contributor_count ?? 0
  const pendingCount  = Math.max(0, totalCount - paidCount)
  const remaining     = Math.max(0, goalAmount - totalRaised)
  const amountPer     = campaign?.amount_per_person ? parseFloat(campaign.amount_per_person) : null

  // Payment form
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [amount, setAmount] = useState(campaign?.amount_per_person ?? '')
  const [isAnon, setIsAnon] = useState(false)
  const [paying, setPaying] = useState(false)
  const [payError, setPayError] = useState('')

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
          <ProgressRing
            percent={animProgress}
            size={160}
            strokeWidth={14}
            color="white"
            trackColor="rgba(255,255,255,0.2)"
          />
          <p className="mt-4 text-4xl font-bold tabular-nums">
            {fmt(totalRaised, campaign.currency)}
          </p>
          <p className="text-brand-100 text-sm mt-1">
            of {fmt(goalAmount, campaign.currency)} goal
            {amountPer && (
              <> · <span className="font-semibold">{fmt(amountPer, campaign.currency)}</span> per person</>
            )}
          </p>
        </div>

        {/* Stat pills */}
        <div className="flex justify-center gap-2 flex-wrap">
          <Pill label="Paid" value={String(paidCount)} />
          <Pill label="Pending" value={String(pendingCount)} />
          <Pill label="Remaining" value={fmt(remaining, campaign.currency)} />
        </div>
      </div>

      {/* ── Pay section ── */}
      <div className="px-4 py-6 bg-white border-b border-gray-100">
        {!isActive && (
          <div className="mb-4 rounded-xl bg-gray-100 px-4 py-3 text-center text-sm text-gray-500">
            This campaign is no longer accepting contributions.
          </div>
        )}

        {isActive && !showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="w-full rounded-2xl bg-brand-600 py-4 text-base font-bold text-white
              hover:bg-brand-500 active:scale-[0.98] transition-all shadow-md shadow-brand-600/30"
          >
            Chip In{amountPer ? ` ${fmt(amountPer, campaign.currency)}` : ''}
          </button>
        )}

        {isActive && showForm && (
          <form onSubmit={handlePay} className="space-y-3">
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
                  <span className="text-sm text-gray-700">
                    Keep my name private on the public board
                  </span>
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

            {payError && (
              <p className="text-sm text-red-500 text-center">{payError}</p>
            )}

            <button
              type="submit"
              disabled={paying}
              className="w-full rounded-2xl bg-brand-600 py-4 text-base font-bold text-white
                hover:bg-brand-500 active:scale-[0.98] disabled:opacity-60 transition-all
                shadow-md shadow-brand-600/30"
            >
              {paying ? 'Redirecting to Stripe…' : 'Pay by Card 💳'}
            </button>

            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="w-full py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors"
            >
              Cancel
            </button>
          </form>
        )}

        <p className="mt-3 text-center text-xs text-gray-400">
          Secured by Stripe · 2.5% platform fee applies
        </p>
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

      {/* Name + time */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${c.paid ? 'text-gray-800' : 'text-gray-400'}`}>
          {c.display_name}
        </p>
        {c.paid && c.paid_at && (
          <p className="text-xs text-gray-400 mt-0.5">{timeAgo(c.paid_at)}</p>
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
