export type SusuFrequency = 'weekly' | 'biweekly' | 'monthly'
export type SusuStatus = 'forming' | 'active' | 'completed' | 'paused'
export type SusuPayoutOrder = 'fixed' | 'random' | 'bid'
export type SusuCycleStatus = 'collecting' | 'collected' | 'paid_out' | 'missed'
export type SusuPaidVia = 'card' | 'cash' | 'zelle' | 'cashapp'

export interface SusuMember {
  id: string
  group_id: string
  user_id: string | null
  name: string
  phone: string
  email: string | null
  payout_position: number | null
  has_received_payout: boolean
  total_contributed: string
  joined_at: string
}

export interface SusuContribution {
  id: string
  cycle_id: string
  member_id: string
  member_name: string
  amount: string
  paid: boolean
  paid_via: SusuPaidVia | null
  paid_at: string | null
}

export interface SusuCycleSummary {
  id: string
  cycle_number: number
  due_date: string
  pot_amount: string
  collected_amount: string
  recipient_member_id: string
  recipient_name: string
  payout_sent_at: string | null
  status: SusuCycleStatus
}

export interface SusuCycleDetail extends SusuCycleSummary {
  group_id: string
  contributions: SusuContribution[]
}

export interface SusuGroup {
  id: string
  org_id: string | null
  owner_id: string
  name: string
  slug: string
  contribution_amount: string
  frequency: SusuFrequency
  total_members: number
  current_cycle: number
  total_cycles: number
  status: SusuStatus
  payout_order: SusuPayoutOrder
  start_date: string
  next_contribution_date: string | null
  next_payout_date: string | null
  created_at: string
}

export interface SusuDetail extends SusuGroup {
  members: SusuMember[]
  current_cycle_detail: SusuCycleDetail | null
  cycle_summaries: SusuCycleSummary[]
}

export type CampaignType = 'general' | 'memorial' | 'charity' | 'celebration'
export type VisibilityMode = 'full_name' | 'first_name_only' | 'anonymous'
export type CampaignStatus = 'active' | 'paused' | 'completed' | 'archived'
export type PaidVia = 'card' | 'zelle' | 'cash' | 'cashapp' | 'manual'
export type OrgType = 'sports' | 'religious' | 'community' | 'professional' | 'social'
export type OrgMemberRole = 'admin' | 'treasurer' | 'member'
export type Frequency = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'annual'
export type InstanceStatus = 'upcoming' | 'active' | 'completed' | 'missed'

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
  beneficiary?: Beneficiary | null
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

export interface CampaignTemplate {
  id: string
  name: string
  campaign_type: CampaignType
  emoji: string
  description_template: string
  default_amount_per_person: string | null
  default_visibility_mode: VisibilityMode
  default_anonymous: boolean
  whatsapp_share_text_template: string
  sort_order: number
}

export interface Beneficiary {
  id: string
  campaign_id: string
  display_name: string
  photo_url: string | null
  story: string | null
  location: string | null
  created_at: string
}

export interface Org {
  id: string
  name: string
  slug: string | null
  description: string | null
  logo_url: string | null
  org_type: OrgType | null
  owner_id: string
  whatsapp_group_name: string | null
  created_at: string
  member_count: number
}

export interface OrgMember {
  id: string
  org_id: string
  user_id: string | null
  name: string
  phone: string | null
  email: string | null
  role: OrgMemberRole
  is_active: boolean
  joined_at: string | null
  total_campaigns: number
  paid_campaigns: number
}

export interface OrgStats {
  total_raised: string
  total_campaigns: number
  active_campaigns: number
}

export interface PublicOrgCampaign {
  slug: string
  title: string
  emoji: string
  status: string
  total_raised: string
  goal_amount: string
  paid_count: number
}

export interface PublicOrg {
  name: string
  slug: string
  description: string | null
  logo_url: string | null
  org_type: OrgType | null
  whatsapp_group_name: string | null
  active_campaigns: PublicOrgCampaign[]
  past_campaigns: PublicOrgCampaign[]
  stats: OrgStats
}

export interface RecurringSchedule {
  id: string
  campaign_id: string
  org_id: string | null
  frequency: Frequency
  day_of_month: number | null
  day_of_week: number | null
  start_date: string
  end_date: string | null
  auto_create_days_before: number
  auto_remind_days_before: number
  is_active: boolean
  last_run_at: string | null
  next_run_at: string
  next_due_date: string
  created_at: string
}

export interface RecurringInstance {
  id: string
  schedule_id: string
  campaign_id: string
  due_date: string
  status: InstanceStatus
  created_at: string
}

export interface RecurringScheduleWithCampaign extends RecurringSchedule {
  campaign_slug: string
  campaign_title: string
  campaign_emoji: string
  recent_instances: RecurringInstance[]
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
