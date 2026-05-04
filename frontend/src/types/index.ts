export type CampaignType = 'general' | 'memorial' | 'charity' | 'celebration'
export type VisibilityMode = 'full_name' | 'first_name_only' | 'anonymous'
export type CampaignStatus = 'active' | 'paused' | 'completed' | 'archived'
export type PaidVia = 'card' | 'zelle' | 'cash' | 'cashapp' | 'manual'

export interface Campaign {
  id: string
  slug: string
  title: string
  description: string | null
  emoji: string
  campaign_type: CampaignType
  goal_amount: string
  amount_per_person: string | null
  currency: string
  visibility_mode: VisibilityMode
  allow_anonymous_contributions: boolean
  status: CampaignStatus
  whatsapp_reminders_enabled: boolean
  platform_fee_pct: string
  org_id: string | null
  created_at: string
  updated_at: string
}

export interface Contributor {
  id: string
  campaign_id: string
  name: string
  phone: string | null
  email: string | null
  amount: string
  paid: boolean
  paid_via: PaidVia | null
  paid_at: string | null
  added_by_organizer: boolean
  is_anonymous: boolean
  created_at: string
  privacy_note: string | null
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  size: number
  pages: number
}

export interface TokenResponse {
  access_token: string
  refresh_token: string
}

export interface CampaignStats {
  totalRaised: number
  goalAmount: number
  progress: number
  paidCount: number
  totalCount: number
  platformFees: number
  net: number
}

export function computeStats(campaign: Campaign, contributors: Contributor[]): CampaignStats {
  const paid = contributors.filter(c => c.paid)
  const totalRaised = paid.reduce((s, c) => s + parseFloat(c.amount), 0)
  const goalAmount = parseFloat(campaign.goal_amount)
  const progress = goalAmount > 0 ? Math.min((totalRaised / goalAmount) * 100, 100) : 0
  const feeRate = parseFloat(campaign.platform_fee_pct) / 100
  const platformFees = totalRaised * feeRate
  const net = totalRaised - platformFees
  return {
    totalRaised,
    goalAmount,
    progress,
    paidCount: paid.length,
    totalCount: contributors.length,
    platformFees,
    net,
  }
}

export function fmt(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}
