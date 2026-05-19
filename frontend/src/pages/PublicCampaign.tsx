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
  party_name: string | null
  office_sought: string | null
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
  event_date: string | null
  event_time: string | null
  event_location: string | null
  event_rsvp: string | null
  party_color: string | null
  platform_fee_pct: string | null
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
  political:   'Campaign Supporters 🗳️',
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
  const [email] = useState('')
  const [amount, setAmount] = useState(campaign?.amount_per_person ?? '')
  const [isAnon, setIsAnon] = useState(false)
  const [paying, setPaying] = useState(false)
  const [payError, setPayError] = useState('')
  const [manualSent, setManualSent] = useState(false)

  // RSVP flow (invitation-only celebrations)
  const [rsvpName, setRsvpName] = useState('')
  const [rsvpPhone, setRsvpPhone] = useState('')
  const [rsvpEmail, setRsvpEmail] = useState('')
  const [rsvpMessage, setRsvpMessage] = useState('')
  const [rsvpSubmitting, setRsvpSubmitting] = useState(false)
  const [rsvpDone, setRsvpDone] = useState(false)
  const [rsvpError, setRsvpError] = useState('')

  useEffect(() => {
    if (!campaign) return
    setAmount(campaign.amount_per_person ?? '')
    const defaultAnon = campaign.campaign_type === 'memorial' || campaign.campaign_type === 'charity'
    setIsAnon(defaultAnon)
  }, [campaign?.campaign_type, campaign?.amount_per_person])

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

  // Invitation-only: celebration with no contribution amount and no goal
  const isInvitationOnly = campaign.campaign_type === 'celebration' &&
    campaign.goal_amount == null &&
    parseFloat(campaign.amount_per_person ?? '0') === 0

  // Party meeting: political campaign with event details
  const hasEvent = !!(campaign.event_date || campaign.event_time || campaign.event_location)
  const isPartyMeeting = campaign.campaign_type === 'political' && hasEvent
  const pc = campaign.party_color ?? '#16a34a'

  // Hide pay section for party meetings with no dues and no fundraising goal
  const hidePayForMeeting = isPartyMeeting &&
    campaign.goal_amount == null &&
    parseFloat(campaign.amount_per_person ?? '0') === 0

  const showPaySection = !isInvitationOnly && !hidePayForMeeting

  // ── Party Meeting: dedicated RSVP page ───────────────────────────────────
  if (isPartyMeeting) {
    const fmtMeetingDate = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    })
    const allAttendees = [...campaign.contributors].sort((a, b) =>
      a.paid === b.paid ? 0 : a.paid ? -1 : 1
    )
    const rsvpCount = totalCount

    const submitRsvp = async (e: React.FormEvent) => {
      e.preventDefault()
      if (!rsvpName.trim()) { setRsvpError('Name is required.'); return }
      setRsvpError('')
      setRsvpSubmitting(true)
      try {
        await http.post(`/p/${slug}/rsvp`, {
          name: rsvpName.trim(),
          phone: rsvpPhone.trim() || null,
          email: rsvpEmail.trim() || null,
          note: rsvpMessage.trim() || null,
        })
        setRsvpDone(true)
        qc.invalidateQueries({ queryKey: ['public', slug] })
      } catch (err: unknown) {
        const msg = axios.isAxiosError(err)
          ? (err.response?.data as { detail?: string })?.detail ?? 'Could not submit. Please try again.'
          : 'Could not submit. Please try again.'
        setRsvpError(msg)
      } finally {
        setRsvpSubmitting(false)
      }
    }

    return (
      <div className="min-h-screen font-sans" style={{ backgroundColor: '#0f172a' }}>

        {/* ── New-payer flash ── */}
        {newPayer && (
          <div className="fixed bottom-4 inset-x-4 z-50 flex justify-center pointer-events-none">
            <style>{`@keyframes partySlideUp{from{transform:translateY(120%);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>
            <div
              className="rounded-2xl px-5 py-3 text-sm font-semibold text-white shadow-2xl"
              style={{ backgroundColor: pc, animation: 'partySlideUp 0.35s cubic-bezier(0.16,1,0.3,1)' }}
            >
              🏛️ {newPayer} just RSVP'd!
            </div>
          </div>
        )}

        {/* ── Hero ── */}
        <div
          className="relative px-4 pb-10 pt-12 overflow-hidden"
          style={{ backgroundImage: 'linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #0f172a 100%)' }}
        >
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: `radial-gradient(ellipse at top, ${pc}33 0%, transparent 60%)` }}
          />
          <div className="relative max-w-sm mx-auto text-center">
            <span className="text-7xl block mb-4">{campaign.emoji}</span>
            <h1 className="text-2xl font-bold leading-tight text-white mb-6">{campaign.title}</h1>

            {(campaign.event_date || campaign.event_time || campaign.event_location) && (
              <div
                className="rounded-2xl px-5 py-4 space-y-3 text-left"
                style={{ backgroundColor: pc + '15', border: `1px solid ${pc}44` }}
              >
                {campaign.event_date && (
                  <div className="flex items-start gap-3">
                    <span className="text-lg leading-none mt-0.5">📅</span>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wider" style={{ color: pc + 'cc' }}>Date</p>
                      <p className="text-white text-sm">{fmtMeetingDate(campaign.event_date)}</p>
                    </div>
                  </div>
                )}
                {campaign.event_time && (
                  <div className="flex items-start gap-3">
                    <span className="text-lg leading-none mt-0.5">🕐</span>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wider" style={{ color: pc + 'cc' }}>Time</p>
                      <p className="text-white text-sm">{campaign.event_time}</p>
                    </div>
                  </div>
                )}
                {campaign.event_location && (
                  <div className="flex items-start gap-3">
                    <span className="text-lg leading-none mt-0.5">📍</span>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wider" style={{ color: pc + 'cc' }}>Location</p>
                      <p className="text-white text-sm">{campaign.event_location}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── About This Meeting ── */}
        {campaign.description && (
          <div className="px-4 py-5" style={{ backgroundColor: '#1e293b', borderBottom: '1px solid #334155' }}>
            <div className="max-w-sm mx-auto border-l-4 pl-4" style={{ borderLeftColor: pc }}>
              <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: pc }}>
                About This Meeting
              </h3>
              <p className="text-gray-200 text-sm leading-relaxed">{campaign.description}</p>
            </div>
          </div>
        )}

        {/* ── RSVP section ── */}
        <div className="px-4 py-6" style={{ backgroundColor: '#1e293b', borderBottom: '1px solid #334155' }}>
          <div className="max-w-sm mx-auto">
            {rsvpCount > 0 && !rsvpDone && (
              <div className="flex justify-center mb-5">
                <div
                  className="rounded-full px-4 py-1.5 text-sm font-medium"
                  style={{ backgroundColor: pc + '22', color: pc, border: `1px solid ${pc}44` }}
                >
                  🏛️ {rsvpCount} {rsvpCount === 1 ? 'person has' : 'people have'} RSVP'd
                </div>
              </div>
            )}

            {rsvpDone ? (
              <div
                className="rounded-2xl px-6 py-8 text-center"
                style={{ backgroundColor: pc + '11', border: `1px solid ${pc}33` }}
              >
                <span className="text-5xl block mb-3">✅</span>
                <p className="font-bold text-white text-lg mb-1">You're on the list!</p>
                <p className="text-sm text-gray-400">See you at the meeting.</p>
              </div>
            ) : isActive ? (
              <form className="space-y-3" onSubmit={submitRsvp}>
                <h3 className="text-center text-base font-bold text-white mb-2">RSVP to This Meeting</h3>
                <input
                  required
                  placeholder="Full name *"
                  value={rsvpName}
                  onChange={e => setRsvpName(e.target.value)}
                  className="w-full rounded-xl border px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none"
                  style={{ backgroundColor: '#0f172a', borderColor: '#475569' }}
                />
                <input
                  placeholder="Phone (optional)"
                  value={rsvpPhone}
                  onChange={e => setRsvpPhone(e.target.value)}
                  className="w-full rounded-xl border px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none"
                  style={{ backgroundColor: '#0f172a', borderColor: '#475569' }}
                />
                <input
                  placeholder="Email (optional)"
                  value={rsvpEmail}
                  onChange={e => setRsvpEmail(e.target.value)}
                  className="w-full rounded-xl border px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none"
                  style={{ backgroundColor: '#0f172a', borderColor: '#475569' }}
                />
                <textarea
                  placeholder="Note (optional)"
                  value={rsvpMessage}
                  onChange={e => setRsvpMessage(e.target.value)}
                  rows={2}
                  className="w-full rounded-xl border px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none resize-none"
                  style={{ backgroundColor: '#0f172a', borderColor: '#475569' }}
                />
                {rsvpError && <p className="text-xs text-red-400">{rsvpError}</p>}
                <button
                  type="submit"
                  disabled={rsvpSubmitting}
                  className="w-full rounded-xl py-3.5 text-sm font-bold text-white disabled:opacity-50 transition-opacity hover:opacity-90"
                  style={{ backgroundColor: pc }}
                >
                  {rsvpSubmitting ? 'Submitting…' : 'RSVP — Count Me In 🏛️'}
                </button>
              </form>
            ) : (
              <div className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-4 text-center text-sm text-gray-400">
                This meeting is no longer accepting RSVPs.
              </div>
            )}

            {amountPer != null && amountPer > 0 && (
              <div
                className="mt-4 rounded-xl px-4 py-3 text-sm"
                style={{ backgroundColor: pc + '11', border: `1px solid ${pc}33` }}
              >
                <p style={{ color: pc }}>
                  📋 Meeting dues: {fmt(amountPer, campaign.currency)} — payment details will be shared by the organizer.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ── Confirmed Attendees ── */}
        <div className="px-4 py-6" style={{ backgroundColor: '#0f172a' }}>
          <div className="max-w-sm mx-auto">
            <h2 className="text-base font-bold text-white mb-4">
              ✅ Confirmed Attendees ({rsvpCount})
            </h2>
            {allAttendees.length === 0 ? (
              <div className="rounded-xl py-10 text-center" style={{ border: '1px dashed #334155' }}>
                <p className="text-gray-500 text-sm">Be the first to RSVP! 🏛️</p>
              </div>
            ) : (
              <div className="space-y-2">
                {allAttendees.map((c, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 rounded-xl px-4 py-3"
                    style={{ backgroundColor: '#1e293b', border: '1px solid #334155' }}
                  >
                    <div
                      className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-xs font-bold text-white"
                      style={{ backgroundColor: pc + '55' }}
                    >
                      {initials(c.display_name)}
                    </div>
                    <p className="flex-1 text-sm font-medium text-white truncate">{c.display_name}</p>
                    {c.paid ? (
                      <span
                        className="shrink-0 text-xs font-semibold px-2.5 py-0.5 rounded-full"
                        style={{ backgroundColor: pc + '22', color: pc }}
                      >
                        Dues paid
                      </span>
                    ) : (
                      <span className="shrink-0 text-xs font-medium text-gray-500 px-2.5 py-0.5 rounded-full bg-slate-700">
                        RSVP'd
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="px-4 pb-10 pt-4 text-center" style={{ backgroundColor: '#0f172a' }}>
          <p className="text-xs text-gray-600">
            Powered by <span className="font-semibold text-brand-600">ChipIn</span>
            {' · '}
            <span className="text-gray-600">kafotech.io</span>
          </p>
        </div>
      </div>
    )
  }

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
      {newPayer && campaign.campaign_type !== 'political' && (
        <div className="animate-pulse fixed top-0 inset-x-0 z-50 px-4 py-3 text-center text-sm
          font-medium text-white bg-brand-500 shadow-lg">
          💚 {newPayer} just chipped in!
        </div>
      )}
      {newPayer && campaign.campaign_type === 'political' && (
        <div className="fixed bottom-4 inset-x-4 z-50 flex justify-center pointer-events-none">
          <style>{`@keyframes politicalSlideUp{from{transform:translateY(120%);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>
          <div
            className="rounded-2xl px-5 py-3 text-sm font-semibold text-white shadow-2xl"
            style={{
              backgroundColor: campaign.party_color ?? '#16a34a',
              animation: 'politicalSlideUp 0.35s cubic-bezier(0.16,1,0.3,1)',
            }}
          >
            {isPartyMeeting ? `🏛️ ${newPayer} just RSVP'd!` : `🎉 ${newPayer} just contributed!`}
          </div>
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

      {/* ── Hero ── */}
      {campaign.campaign_type === 'celebration' ? (
        <>
          <CelebrationHero campaign={campaign} />
          {campaign.campaign_type === 'celebration' && isActive && (
            <div className="px-4 py-6 bg-gray-950 border-b border-gray-800">
              {rsvpDone ? (
                <div className="text-center space-y-2 py-4">
                  <span className="text-4xl block">🎉</span>
                  <p className="font-semibold text-white">You're on the guest list!</p>
                  <p className="text-sm text-gray-400">The host will be in touch.</p>
                </div>
              ) : (
                <form className="space-y-3 max-w-sm mx-auto" onSubmit={async (e) => {
                  e.preventDefault()
                  if (!rsvpName.trim()) { setRsvpError('Name is required.'); return }
                  setRsvpError('')
                  setRsvpSubmitting(true)
                  try {
                    await http.post(`/p/${slug}/rsvp`, {
                      name: rsvpName.trim(),
                      phone: rsvpPhone.trim() || null,
                      email: rsvpEmail.trim() || null,
                      note: rsvpMessage.trim() || null,
                    })
                    setRsvpDone(true)
                  } catch (err: unknown) {
                    const msg = axios.isAxiosError(err)
                      ? (err.response?.data as { detail?: string })?.detail ?? 'Could not submit. Please try again.'
                      : 'Could not submit. Please try again.'
                    setRsvpError(msg)
                  } finally {
                    setRsvpSubmitting(false)
                  }
                }}>
                  <p className="text-center text-sm font-semibold text-white mb-3">RSVP</p>
                  <input
                    required
                    placeholder="Your name *"
                    value={rsvpName}
                    onChange={e => setRsvpName(e.target.value)}
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-brand-500 focus:outline-none"
                  />
                  <input
                    placeholder="Phone (optional)"
                    value={rsvpPhone}
                    onChange={e => setRsvpPhone(e.target.value)}
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-brand-500 focus:outline-none"
                  />
                  <input
                    placeholder="Email (optional)"
                    value={rsvpEmail}
                    onChange={e => setRsvpEmail(e.target.value)}
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-brand-500 focus:outline-none"
                  />
                  <textarea
                    placeholder="Anything you'd like to say? (optional)"
                    value={rsvpMessage}
                    onChange={e => setRsvpMessage(e.target.value)}
                    rows={2}
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-brand-500 focus:outline-none resize-none"
                  />
                  {rsvpError && <p className="text-xs text-red-400">{rsvpError}</p>}
                  <button
                    type="submit"
                    disabled={rsvpSubmitting}
                    className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-50 transition-colors"
                  >
                    {rsvpSubmitting ? 'Submitting…' : '✓ Count me in!'}
                  </button>
                </form>
              )}
            </div>
          )}
        </>
      ) : campaign.campaign_type === 'political' ? (
        <PoliticalHero
          campaign={campaign}
          totalRaised={totalRaised}
          goalAmount={goalAmount}
          animProgress={animProgress}
          paidCount={paidCount}
        />
      ) : (
        <>
          <div className="bg-gradient-to-b from-brand-700 via-brand-600 to-brand-500 px-4 pb-8 pt-10 text-white">

            {/* Emoji + title */}
            <div className="text-center mb-6">
              <span className="text-6xl block mb-3">{campaign.emoji}</span>
              <h1 className="text-2xl font-bold leading-tight">{campaign.title}</h1>
              {campaign.description && campaign.campaign_type !== 'charity' && (
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
        </>
      )}


      {/* ── About This Collection / Campaign — charity & political public page ── */}
      {(campaign.campaign_type === 'charity' || campaign.campaign_type === 'political') && campaign.description && (
        <div className={`px-4 py-5 border-b ${campaign.campaign_type === 'political' ? 'bg-slate-800 border-slate-700' : 'bg-gray-950 border-gray-800'}`}>
          <div className="border-l-4 border-brand-500 pl-4">
            <h3 className="text-xs font-semibold text-brand-400 uppercase tracking-wider mb-2">
              {campaign.campaign_type === 'political' ? 'About This Campaign' : 'About This Collection'}
            </h3>
            <p className="text-gray-200 text-base leading-relaxed">{campaign.description}</p>
          </div>
        </div>
      )}

      {/* ── Political party meeting RSVP ── */}
      {campaign.campaign_type === 'political' && hasEvent && isActive && (
        <div className="px-4 py-6 bg-slate-900 border-b border-slate-700">
          {rsvpDone ? (
            <div className="text-center space-y-2 py-4">
              <span className="text-4xl block">✅</span>
              <p className="font-semibold text-white">You're on the list!</p>
              <p className="text-sm text-gray-400">We'll see you at the meeting.</p>
            </div>
          ) : (
            <form className="space-y-3 max-w-sm mx-auto" onSubmit={async (e) => {
              e.preventDefault()
              if (!rsvpName.trim()) { setRsvpError('Name is required.'); return }
              setRsvpError('')
              setRsvpSubmitting(true)
              try {
                await http.post(`/p/${slug}/rsvp`, {
                  name: rsvpName.trim(),
                  phone: rsvpPhone.trim() || null,
                  email: rsvpEmail.trim() || null,
                  note: rsvpMessage.trim() || null,
                })
                setRsvpDone(true)
              } catch (err: unknown) {
                const msg = axios.isAxiosError(err)
                  ? (err.response?.data as { detail?: string })?.detail ?? 'Could not submit. Please try again.'
                  : 'Could not submit. Please try again.'
                setRsvpError(msg)
              } finally {
                setRsvpSubmitting(false)
              }
            }}>
              <p className="text-center text-sm font-semibold text-white mb-3">RSVP to this Meeting</p>
              <input
                required
                placeholder="Your name *"
                value={rsvpName}
                onChange={e => setRsvpName(e.target.value)}
                className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-brand-500 focus:outline-none"
              />
              <input
                placeholder="Phone (optional)"
                value={rsvpPhone}
                onChange={e => setRsvpPhone(e.target.value)}
                className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-brand-500 focus:outline-none"
              />
              <input
                placeholder="Email (optional)"
                value={rsvpEmail}
                onChange={e => setRsvpEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-brand-500 focus:outline-none"
              />
              <textarea
                placeholder="Anything you'd like to say? (optional)"
                value={rsvpMessage}
                onChange={e => setRsvpMessage(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-brand-500 focus:outline-none resize-none"
              />
              {rsvpError && <p className="text-xs text-red-400">{rsvpError}</p>}
              <button
                type="submit"
                disabled={rsvpSubmitting}
                className="w-full rounded-lg py-2.5 text-sm font-semibold text-white disabled:opacity-50 transition-opacity hover:opacity-90"
                style={{ backgroundColor: pc }}
              >
                {rsvpSubmitting ? 'Submitting…' : '✓ Count me in!'}
              </button>
            </form>
          )}
        </div>
      )}

      {/* ── Pay section ── */}
      {showPaySection && <div id="pay-section" className="px-4 py-6 bg-white border-b border-gray-100">
        {!isActive && (
          <div className="mb-4 rounded-xl bg-gray-100 px-4 py-3 text-center text-sm text-gray-500">
            This campaign is no longer accepting contributions.
          </div>
        )}

        {/* Step 1: Choose payment method */}
        {isActive && payMode === null && (
          <div className="space-y-3">
            <p className="text-center text-sm font-medium text-gray-600 mb-1">
              {campaign.campaign_type === 'political' ? 'Make Your Contribution' : 'How would you like to pay?'}
            </p>
            {campaign.campaign_type === 'political' && (() => {
              const gross = parseFloat(amount) || 0
              if (gross <= 0) return null
              const stripeFee = Math.round((gross * 0.029 + 0.30) * 100) / 100
              const platformFee = Math.round(gross * (parseFloat(campaign.platform_fee_pct ?? '2') / 100) * 100) / 100
              const net = Math.round((gross - stripeFee - platformFee) * 100) / 100
              return (
                <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-xs text-slate-600 space-y-1">
                  <p className="font-semibold text-slate-700 mb-1.5">Fee breakdown</p>
                  <div className="flex justify-between"><span>Your contribution</span><span className="font-medium text-slate-900">{fmt(gross, campaign.currency)}</span></div>
                  <div className="flex justify-between"><span>Platform fee ({campaign.platform_fee_pct ?? '2'}%)</span><span>− {fmt(platformFee, campaign.currency)}</span></div>
                  <div className="flex justify-between"><span>Processing fee (Stripe 2.9% + $0.30)</span><span>− {fmt(stripeFee, campaign.currency)}</span></div>
                  <div className="flex justify-between border-t border-slate-200 pt-1 mt-1 font-semibold text-slate-800"><span>Net to campaign</span><span>{fmt(Math.max(0, net), campaign.currency)}</span></div>
                </div>
              )
            })()}
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

        {/* Step 2a: Card payment — coming soon */}
        {isActive && payMode === 'card' && (
          <div className="space-y-3">
            <div className="rounded-2xl border border-gray-200 bg-gray-50 px-6 py-8 text-center">
              <p className="text-2xl mb-3">🔒</p>
              <p className="text-sm font-semibold text-gray-700">Card payments coming soon</p>
              <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
                We're working on it. For now, please use Zelle or CashApp to contribute.
              </p>
            </div>
            <button type="button" onClick={() => setPayMode(null)}
              className="w-full py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors">
              ← Back
            </button>
          </div>
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
            Card payments secured by Stripe
          </p>
        )}
      </div>}

      {/* ── Board ── */}
      <div className="px-4 py-6">
        <div className="flex items-baseline gap-2 mb-4">
          <h2 className="text-base font-bold text-gray-800">
            {isPartyMeeting ? 'Members & RSVPs 🏛️' : (BOARD_TITLE[campaign.campaign_type] ?? 'Contributors')}
          </h2>
          {campaign.campaign_type === 'political' && !isPartyMeeting && paidCount > 0 && (
            <span className="text-sm font-semibold text-brand-600">{paidCount} and counting</span>
          )}
          {isPartyMeeting && (paidCount + pendingCount) > 0 && (
            <span className="text-sm font-semibold text-brand-600">{paidCount + pendingCount} RSVP'd</span>
          )}
        </div>

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

      {/* ── Top Supporters Leaderboard — political fundraisers only ── */}
      {campaign.campaign_type === 'political' && !isPartyMeeting && (() => {
        const topFive = [...campaign.contributors]
          .filter(c => c.paid)
          .sort((a, b) => parseFloat(b.amount) - parseFloat(a.amount))
          .slice(0, 5)
        if (topFive.length === 0) return null
        const pc = campaign.party_color ?? '#16a34a'
        const rankEmojis = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣']
        return (
          <div className="px-4 py-6 bg-slate-900 border-t border-slate-700">
            <h2 className="text-base font-bold text-white mb-4">🏆 Top Supporters</h2>
            <div className="space-y-2">
              {topFive.map((c, i) => {
                const isAnon = c.display_name === 'Anonymous'
                return (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-xl px-4 py-3"
                    style={{
                      backgroundColor: i === 0 ? pc + '22' : 'rgba(30,41,59,0.6)',
                      border: i === 0 ? `1px solid ${pc}44` : '1px solid rgba(71,85,105,0.3)',
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{rankEmojis[i]}</span>
                      <span className={`text-sm font-medium ${isAnon ? 'text-gray-500 italic' : 'text-white'}`}>
                        {isAnon ? 'Anonymous' : c.display_name}
                      </span>
                    </div>
                    <span className="text-sm font-bold tabular-nums" style={{ color: pc }}>
                      {fmt(parseFloat(c.amount), campaign.currency)}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

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

// ── Celebration invitation hero ───────────────────────────────────────────────

function CelebrationHero({ campaign }: { campaign: PublicCampaign }) {
  const b = campaign.beneficiary

  function fmtEventDate(iso: string): string {
    return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    })
  }

  return (
    <div className="bg-black px-4 pb-10 pt-10">
      <div className="max-w-sm mx-auto">
        {/* You are invited */}
        <p className="text-center text-xs font-semibold tracking-[0.25em] uppercase text-yellow-400 mb-3">
          You Are Invited To
        </p>

        {/* Event title */}
        <h1 className="text-center text-3xl font-bold text-white leading-tight mb-6">
          {campaign.title}
        </h1>

        {/* Beneficiary circle + ribbon */}
        {b && (
          <div className="flex flex-col items-center mb-6">
            <div className="h-28 w-28 rounded-full overflow-hidden border-4 border-yellow-400 bg-gray-800 mb-3">
              {b.photo_url ? (
                <img src={b.photo_url} alt={b.display_name} className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-5xl">🎉</div>
              )}
            </div>
            <div className="bg-yellow-400 rounded-full px-4 py-0.5 mb-2">
              <span className="text-black text-xs font-bold uppercase tracking-widest">Celebrating {b.display_name}</span>
            </div>
            {b.location && (
              <p className="text-yellow-300/70 text-xs mt-1">📍 {b.location}</p>
            )}
          </div>
        )}

        {/* Event details */}
        {(campaign.event_date || campaign.event_time || campaign.event_location || campaign.event_rsvp) && (
          <div className="border border-yellow-400/30 rounded-2xl px-5 py-4 space-y-3 mb-6 bg-white/5">
            {campaign.event_date && (
              <div className="flex items-start gap-3">
                <span className="text-yellow-400 text-lg leading-none mt-0.5">📅</span>
                <div>
                  <p className="text-xs text-yellow-400/70 uppercase tracking-wider font-medium">Date</p>
                  <p className="text-white text-sm">{fmtEventDate(campaign.event_date)}</p>
                </div>
              </div>
            )}
            {campaign.event_time && (
              <div className="flex items-start gap-3">
                <span className="text-yellow-400 text-lg leading-none mt-0.5">🕐</span>
                <div>
                  <p className="text-xs text-yellow-400/70 uppercase tracking-wider font-medium">Time</p>
                  <p className="text-white text-sm">{campaign.event_time}</p>
                </div>
              </div>
            )}
            {campaign.event_location && (
              <div className="flex items-start gap-3">
                <span className="text-yellow-400 text-lg leading-none mt-0.5">📍</span>
                <div>
                  <p className="text-xs text-yellow-400/70 uppercase tracking-wider font-medium">Location</p>
                  <p className="text-white text-sm">{campaign.event_location}</p>
                </div>
              </div>
            )}
            {campaign.event_rsvp && (
              <div className="flex items-start gap-3">
                <span className="text-yellow-400 text-lg leading-none mt-0.5">✉️</span>
                <div>
                  <p className="text-xs text-yellow-400/70 uppercase tracking-wider font-medium">RSVP</p>
                  <p className="text-white text-sm">{campaign.event_rsvp}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Description */}
        {campaign.description && (
          <p className="text-center text-yellow-100/70 text-sm leading-relaxed mb-2">
            {campaign.description}
          </p>
        )}

        {/* Decorative divider */}
        <div className="flex items-center gap-3 my-6">
          <div className="flex-1 h-px bg-yellow-400/20" />
          <span className="text-yellow-400 text-lg">✦</span>
          <div className="flex-1 h-px bg-yellow-400/20" />
        </div>
      </div>
    </div>
  )
}

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

// ── Political hero ────────────────────────────────────────────────────────────

function isLightColor(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 > 155
}

function PoliticalHero({
  campaign,
  totalRaised,
  goalAmount,
  animProgress,
  paidCount,
}: {
  campaign: PublicCampaign
  totalRaised: number
  goalAmount: number | null
  animProgress: number
  paidCount: number
}) {
  const b = campaign.beneficiary
  const dl = deadlineInfo(campaign.due_date)
  const remaining = goalAmount != null ? Math.max(0, goalAmount - totalRaised) : null
  const pc = campaign.party_color ?? '#16a34a'
  const pcText = isLightColor(pc) ? '#1e293b' : '#ffffff'
  const [linkCopied, setLinkCopied] = useState(false)
  const heroHasEvent = !!(campaign.event_date || campaign.event_time || campaign.event_location || campaign.event_rsvp)

  function fmtEventDate(iso: string): string {
    return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    })
  }

  function copyLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2000)
    })
  }

  function scrollToPay() {
    document.getElementById('pay-section')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div
      className="relative bg-slate-900 px-4 pb-10 pt-10 text-white overflow-hidden"
      style={{ backgroundImage: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)' }}
    >
      {/* Subtle diagonal stripe overlay */}
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{ backgroundImage: 'repeating-linear-gradient(45deg, white 0px, white 1px, transparent 1px, transparent 14px)' }}
      />
      {/* Party color radial tint */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: `radial-gradient(ellipse at top, ${pc}1a 0%, transparent 65%)` }}
      />

      <div className="relative max-w-sm mx-auto">
        {/* Emoji */}
        <p className="text-center text-5xl mb-5">{campaign.emoji}</p>

        {/* Candidate / party section */}
        {b && (
          <div className="flex flex-col items-center mb-6">
            <div
              className="h-36 w-36 rounded-full overflow-hidden border-4 bg-slate-700 mb-3 shadow-lg"
              style={{ borderColor: pc, boxShadow: `0 10px 25px ${pc}33` }}
            >
              {b.photo_url ? (
                <img src={b.photo_url} alt={b.display_name} className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-5xl">🗳️</div>
              )}
            </div>
            <h2 className="text-2xl font-bold text-white text-center leading-tight">{b.display_name}</h2>
            {b.location && (
              <p className="text-xs mt-1 text-center" style={{ color: pc + 'cc' }}>📍 {b.location}</p>
            )}
            {b.story && (
              <p className="text-gray-300 text-sm mt-2 text-center leading-relaxed">
                {b.story}
              </p>
            )}
          </div>
        )}

        {/* Campaign title */}
        <h1 className={`font-bold text-white text-center leading-tight mb-6 ${b ? 'text-lg' : 'text-2xl'}`}>
          {campaign.title}
        </h1>

        {/* Progress section */}
        <div className="bg-slate-800/70 rounded-2xl p-5 mb-5 border border-slate-700/60">
          <p className="text-3xl font-bold tabular-nums text-center" style={{ color: pc }}>
            {fmt(totalRaised, campaign.currency)}
          </p>
          {goalAmount != null ? (
            <>
              <p className="text-gray-400 text-sm text-center mt-1">
                of {fmt(goalAmount, campaign.currency)} goal
              </p>
              <div className="mt-4 h-3 w-full rounded-full bg-slate-700 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-1000 ease-out"
                  style={{ width: `${Math.min(animProgress, 100)}%`, backgroundColor: pc }}
                />
              </div>
              <p className="text-xs text-gray-500 text-right mt-1">{Math.round(animProgress)}% funded</p>
            </>
          ) : (
            <p className="text-gray-400 text-sm text-center mt-1">raised so far</p>
          )}
        </div>

        {/* Event details card — party meeting */}
        {heroHasEvent && (
          <div
            className="rounded-2xl px-5 py-4 space-y-3 mb-5 border"
            style={{ backgroundColor: pc + '11', borderColor: pc + '44' }}
          >
            {campaign.event_date && (
              <div className="flex items-start gap-3">
                <span className="text-lg leading-none mt-0.5">📅</span>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider" style={{ color: pc + 'bb' }}>Date</p>
                  <p className="text-white text-sm">{fmtEventDate(campaign.event_date)}</p>
                </div>
              </div>
            )}
            {campaign.event_time && (
              <div className="flex items-start gap-3">
                <span className="text-lg leading-none mt-0.5">🕐</span>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider" style={{ color: pc + 'bb' }}>Time</p>
                  <p className="text-white text-sm">{campaign.event_time}</p>
                </div>
              </div>
            )}
            {campaign.event_location && (
              <div className="flex items-start gap-3">
                <span className="text-lg leading-none mt-0.5">📍</span>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider" style={{ color: pc + 'bb' }}>Location</p>
                  <p className="text-white text-sm">{campaign.event_location}</p>
                </div>
              </div>
            )}
            {campaign.event_rsvp && (
              <div className="flex items-start gap-3">
                <span className="text-lg leading-none mt-0.5">✉️</span>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider" style={{ color: pc + 'bb' }}>RSVP Contact</p>
                  <p className="text-white text-sm">{campaign.event_rsvp}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Milestone badge */}
        {goalAmount != null && paidCount > 0 && (() => {
          const pct = animProgress
          let badge: { emoji: string; text: string } | null = null
          if (pct >= 100)      badge = { emoji: '🏆', text: 'Goal Reached!' }
          else if (pct >= 75)  badge = { emoji: '⚡', text: 'Almost There!' }
          else if (pct >= 50)  badge = { emoji: '🔥', text: 'Halfway There!' }
          else if (pct >= 25)  badge = { emoji: '🌱', text: 'Gaining Momentum!' }
          if (!badge) return null
          return (
            <div className="flex justify-center mb-3">
              <div
                className="rounded-full px-4 py-2 text-sm font-bold"
                style={{
                  backgroundColor: pc + '22',
                  color: pc,
                  border: `1.5px solid ${pc}66`,
                  boxShadow: `0 0 12px ${pc}33`,
                }}
              >
                {badge.emoji} {badge.text}
              </div>
            </div>
          )
        })()}

        {/* Countdown */}
        {campaign.due_date && (() => {
          const daysLeft = dl.daysLeft
          let label: string
          if (daysLeft == null || daysLeft < 0) label = '🏁 Campaign ended'
          else if (daysLeft === 0)              label = '🗳️ Last day to contribute!'
          else if (daysLeft === 1)              label = '🗳️ Election day is tomorrow!'
          else                                  label = `⏳ ${daysLeft} days remaining`
          return (
            <div className="flex justify-center mb-4">
              <div className="rounded-full px-4 py-1.5 text-xs font-medium bg-slate-700/60 text-gray-300 border border-slate-600/40">
                {label}
              </div>
            </div>
          )
        })()}

        {/* Stat pills */}
        <div className="flex justify-center gap-2 flex-wrap mb-6">
          <PoliticalPill label={heroHasEvent ? 'Attending' : 'Supporters'} value={String(paidCount)} partyColor={pc} />
          {dl.daysLeft != null && dl.daysLeft >= 0 && (
            <PoliticalPill label="Days left" value={String(dl.daysLeft)} partyColor={pc} />
          )}
          {remaining != null && remaining > 0 && (
            <PoliticalPill label="Remaining" value={fmt(remaining, campaign.currency)} partyColor={pc} />
          )}
        </div>

        {/* Share buttons */}
        {(() => {
          const shareUrl = encodeURIComponent(window.location.href)
          const candidateName = b?.display_name ?? campaign.title
          const officeSought = b?.office_sought
          const waText = encodeURIComponent(
            officeSought
              ? `Support ${candidateName} for ${officeSought}! Chip in here: ${window.location.href}`
              : `Support ${candidateName}'s campaign! Chip in here: ${window.location.href}`
          )
          const xText = encodeURIComponent(`Support ${candidateName}'s campaign!`)
          return (
            <div className="flex gap-2 mb-6">
              <a
                href={`https://wa.me/?text=${waText}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: '#25D366' }}
              >
                <span>📱</span><span>WhatsApp</span>
              </a>
              <button
                type="button"
                onClick={copyLink}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: '#1877F2' }}
              >
                <span>{linkCopied ? '✓' : '📋'}</span><span>{linkCopied ? 'Link Copied! Paste on Facebook' : 'Copy & Share'}</span>
              </button>
              <a
                href={`https://twitter.com/intent/tweet?text=${xText}&url=${shareUrl}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: '#000000' }}
              >
                <span className="font-bold">𝕏</span><span>Twitter</span>
              </a>
            </div>
          )
        })()}

        {/* CTA */}
        <button
          type="button"
          onClick={scrollToPay}
          className="w-full rounded-2xl py-4 text-base font-bold active:scale-[0.98] transition-all shadow-lg"
          style={{ backgroundColor: pc, color: pcText, boxShadow: `0 10px 25px ${pc}4d` }}
        >
          Support This Campaign →
        </button>

        {/* Social proof bar */}
        {paidCount > 0 && (
          <div className="mt-4 flex justify-center">
            <div
              className="rounded-full px-4 py-1.5 text-xs font-medium"
              style={{ backgroundColor: pc + '22', color: pc, border: `1px solid ${pc}44` }}
            >
              {heroHasEvent
                ? `🏛️ ${paidCount} member${paidCount !== 1 ? 's' : ''} attending`
                : `🇬🇲 ${paidCount} Gambian${paidCount !== 1 ? 's' : ''} have contributed`
              }
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function PoliticalPill({ label, value, partyColor }: { label: string; value: string; partyColor?: string }) {
  const pc = partyColor ?? '#16a34a'
  return (
    <div
      className="flex items-center gap-1.5 rounded-full bg-slate-700/60 px-3 py-1.5 border"
      style={{ borderColor: pc + '50' }}
    >
      <span className="text-xs text-gray-400">{label}</span>
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
        {campaignType === 'celebration' ? (
          c.paid ? (
            <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
              Attending
            </span>
          ) : (
            <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-500">
              Pending
            </span>
          )
        ) : (
          <>
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
          </>
        )}
      </div>
    </div>
  )
}
