export interface UserFeatures {
  campaigns_enabled: boolean
  susu_enabled: boolean
  org_enabled: boolean
  onboarding_completed: boolean
}

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
  slots: number  // Feature 1: multiple slots/hands
  is_split: boolean
  split_partner_name: string | null
  split_partner_phone: string | null
  split_amount: string | null
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
  missed: boolean  // Feature 4: missed payment flag
  pending_verification: boolean
  is_exempt: boolean
  split_primary_paid: boolean
  split_partner_paid: boolean
  split_partner_paid_via: SusuPaidVia | null
  split_partner_pending_verification: boolean
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
  payout_method: string | null
  payout_reference: string | null
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
  // Feature 4: missed payment policy
  missed_policy: string
  late_fee_pct: string | null
  // Feature 8: group rules
  rules: string | null
  // Payment method settings
  allow_card: boolean
  allow_cashapp: boolean
  allow_zelle: boolean
  allow_cash: boolean
  cashapp_handle: string | null
  zelle_handle: string | null
  recipient_must_pay: boolean
  accepting_members: boolean
  payment_window_days: number
  pending_join_requests: number
}

export interface SusuPayPageInfo {
  group_name: string
  slug: string
  member_id: string
  member_name: string
  cycle_number: number
  amount: string
  already_paid: boolean
  pending_verification: boolean
  pending_paid_via: string | null
  allow_card: boolean
  allow_cashapp: boolean
  allow_zelle: boolean
  allow_cash: boolean
  cashapp_handle: string | null
  zelle_handle: string | null
  is_split: boolean
  split_partner_name: string | null
  is_partner_view: boolean
}

export interface SusuDetail extends SusuGroup {
  organizer_first_name?: string | null
  members: SusuMember[]
  current_cycle_detail: SusuCycleDetail | null
  cycle_summaries: SusuCycleSummary[]
}

export type SusuJoinRequestStatus = 'pending' | 'approved' | 'rejected'

export interface SusuJoinRequest {
  id: string
  group_id: string
  name: string
  phone: string
  email: string | null
  message: string | null
  status: SusuJoinRequestStatus
  created_at: string
}

export interface SusuMemberStanding {
  id: string
  name: string
  total_contributed: string
  paid_cycles: number
  reliability_pct: number | null
  has_received_payout: boolean
  payout_position: number | null
  is_split: boolean
  split_partner_name: string | null
  current_cycle_primary_paid: boolean
  current_cycle_partner_paid: boolean
  current_cycle_is_exempt: boolean
}

export interface SusuJoinPageInfo {
  accepting: boolean
  has_started?: boolean
  name?: string | null
  contribution_amount?: string | null
  frequency?: SusuFrequency | null
  total_members?: number | null
  organizer_name?: string | null
  rules?: string | null
  payment_window_days?: number
}

export interface SusuStandingsData {
  id: string
  name: string
  slug: string
  status: SusuStatus
  current_cycle: number
  total_cycles: number
  contribution_amount: string
  frequency: SusuFrequency
  total_members: number
  members: SusuMemberStanding[]
  cycle_summaries?: SusuCycleSummary[]
}

export type CollectionCurrency = 'USD' | 'GBP' | 'EUR' | 'CAD'
export type PayoutCurrency = 'USD' | 'GBP' | 'EUR' | 'GMD' | 'NGN' | 'GHS' | 'XOF'
export type MethodType = 'mobile_money' | 'bank_transfer' | 'stripe_connect'
export type PayoutStatus = 'pending' | 'processing' | 'completed' | 'failed'

export type CampaignType = 'general' | 'memorial' | 'charity' | 'celebration' | 'political'
export type VisibilityMode = 'full_name' | 'first_name_only' | 'anonymous'
export type CampaignStatus = 'active' | 'paused' | 'completed' | 'archived'
export type PaidVia = 'card' | 'zelle' | 'cash' | 'cashapp' | 'manual'
export type ContributorStatus = 'pending' | 'invited' | 'paid' | 'declined'
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
  goal_amount: string | null
  contribution_note: string | null
  amount_per_person: string | null
  currency: string
  collection_currency: CollectionCurrency
  payout_currency: PayoutCurrency | null
  visibility_mode: VisibilityMode
  allow_anonymous_contributions: boolean
  status: CampaignStatus
  whatsapp_reminders_enabled: boolean
  due_date: string | null
  zelle_info: string | null
  cashapp_handle: string | null
  platform_fee_pct: string
  org_id: string | null
  org_name: string | null
  payout_enabled: boolean
  created_at: string
  updated_at: string
  beneficiary?: Beneficiary | null
  event_date: string | null
  event_time: string | null
  event_location: string | null
  event_rsvp: string | null
  party_color: string | null
}

export interface PayoutMethod {
  id: string
  method_type: MethodType
  country_code: string
  network_name: string
  account_number: string
  account_name: string
  is_verified: boolean
  is_default: boolean
  created_at: string
}

export interface Payout {
  id: string
  campaign_id: string
  payout_method_id: string
  gross_amount_usd: string
  exchange_rate: string
  payout_amount_local: string
  payout_currency: string
  transfer_fee: string
  status: PayoutStatus
  provider_reference: string | null
  initiated_at: string
  completed_at: string | null
}

export interface PublicCampaignFx {
  collection_currency: string
  payout_currency: string | null
  goal_amount_local: string | null
  total_raised_local: string | null
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
  payment_note: string | null
  message: string | null
  status: ContributorStatus
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
  phone: string | null
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
  goal_amount: string | null
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
  goalAmount: number | null
  progress: number
  paidCount: number
  totalCount: number
  platformFees: number
  net: number
}

export function computeStats(campaign: Campaign, contributors: Contributor[]): CampaignStats {
  const paid = contributors.filter(c => c.paid)
  const totalRaised = paid.reduce((s, c) => s + parseFloat(c.amount), 0)
  const goalAmount = campaign.goal_amount != null ? parseFloat(campaign.goal_amount) : null
  const progress = goalAmount != null && goalAmount > 0 ? Math.min((totalRaised / goalAmount) * 100, 100) : 0
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

export type DeadlineUrgency = 'overdue' | 'today' | 'tomorrow' | 'soon' | 'upcoming' | null

export function deadlineInfo(due_date: string | null): {
  daysLeft: number | null
  urgency: DeadlineUrgency
  label: string | null
  labelShort: string | null
} {
  if (!due_date) return { daysLeft: null, urgency: null, label: null, labelShort: null }
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const due = new Date(due_date + 'T00:00:00'); due.setHours(0, 0, 0, 0)
  const daysLeft = Math.round((due.getTime() - today.getTime()) / 86_400_000)
  if (daysLeft < 0)  return { daysLeft, urgency: 'overdue',  label: 'Deadline passed',    labelShort: 'Overdue' }
  if (daysLeft === 0) return { daysLeft, urgency: 'today',    label: 'Due today!',          labelShort: 'Due today' }
  if (daysLeft === 1) return { daysLeft, urgency: 'tomorrow', label: 'Due tomorrow',        labelShort: 'Tomorrow' }
  if (daysLeft <= 7)  return { daysLeft, urgency: 'soon',     label: `Due in ${daysLeft} days`, labelShort: `${daysLeft}d left` }
  return { daysLeft, urgency: 'upcoming', label: `Due ${fmtDate(due_date)}`, labelShort: fmtDate(due_date) }
}
