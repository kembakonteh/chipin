import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { Campaign, Contributor, RecurringSchedule } from '../types'
import { computeStats, deadlineInfo, fmt } from '../types'
import StatusBadge from './StatusBadge'
import { CAMPAIGN_TYPES } from './CampaignTypeSelector'

const FREQ_SHORT: Record<string, string> = {
  weekly: 'Weekly',
  biweekly: 'Biweekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annual: 'Annual',
}

function typeEmoji(ct: Campaign['campaign_type']) {
  return CAMPAIGN_TYPES.find(t => t.value === ct)?.emoji ?? '⚽'
}

export default function CampaignCard({ campaign }: { campaign: Campaign }) {
  const nav = useNavigate()

  const { data: contributors, isLoading } = useQuery({
    queryKey: ['contributors', campaign.slug],
    queryFn: () =>
      api.get<Contributor[]>(`/campaigns/${campaign.slug}/contributors`).then(r => r.data),
  })

  const { data: schedule } = useQuery<RecurringSchedule | null>({
    queryKey: ['schedule', campaign.slug],
    queryFn: () =>
      api.get<RecurringSchedule | null>(`/campaigns/${campaign.slug}/schedule`).then(r => r.data),
    staleTime: 60_000,
  })

  const stats = contributors ? computeStats(campaign, contributors) : null
  const deadline = deadlineInfo(campaign.due_date ?? null)

  const deadlineBadgeClass =
    deadline.urgency === 'overdue' || deadline.urgency === 'today'   ? 'bg-red-900/50 text-red-300 border-red-800/40'
    : deadline.urgency === 'tomorrow' || deadline.urgency === 'soon' ? 'bg-yellow-900/40 text-yellow-300 border-yellow-800/40'
    : 'bg-gray-800 text-gray-400 border-gray-700'

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => nav(`/dashboard/${campaign.slug}`)}
      onKeyDown={(e) => e.key === 'Enter' && nav(`/dashboard/${campaign.slug}`)}
      className="group cursor-pointer rounded-xl border border-gray-700 bg-gray-900 p-5
        hover:border-brand-600 hover:bg-gray-800/70 transition-colors focus:outline-none
        focus:ring-2 focus:ring-brand-500"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-3xl shrink-0">{campaign.emoji}</span>
          <div className="min-w-0">
            <h3 className="font-semibold text-white truncate group-hover:text-brand-200 transition-colors">
              {campaign.title}
            </h3>
            <span className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
              {typeEmoji(campaign.campaign_type)}
              <span className="capitalize">{campaign.campaign_type}</span>
              {schedule?.is_active && (
                <span className="ml-1 text-brand-400 font-medium">
                  · ↺ {FREQ_SHORT[schedule.frequency]}
                  {schedule.next_due_date && (
                    <> · Next {new Date(schedule.next_due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</>
                  )}
                </span>
              )}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <StatusBadge status={campaign.status} />
          {deadline.urgency && campaign.status === 'active' && (
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${deadlineBadgeClass}`}>
              {deadline.urgency === 'overdue' ? '⚠ ' : deadline.urgency === 'today' ? '🔴 ' : deadline.urgency === 'tomorrow' ? '🟡 ' : '📅 '}
              {deadline.labelShort}
            </span>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {isLoading ? (
        <div className="h-2 rounded-full bg-gray-800 animate-pulse mb-3" />
      ) : (
        <div className="mb-3">
          <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-brand-500 transition-all duration-500"
              style={{ width: `${stats?.progress ?? 0}%` }}
            />
          </div>
        </div>
      )}

      {/* Stats */}
      {isLoading ? (
        <div className="space-y-1">
          <div className="h-4 w-40 rounded bg-gray-800 animate-pulse" />
          <div className="h-3 w-24 rounded bg-gray-800 animate-pulse" />
        </div>
      ) : stats ? (
        <div className="flex items-end justify-between gap-2">
          <div>
            <p className="text-sm text-white font-medium">
              {fmt(stats.totalRaised, campaign.currency)}{' '}
              {stats.goalAmount != null && (
                <span className="text-gray-500 font-normal">
                  of {fmt(stats.goalAmount, campaign.currency)}
                </span>
              )}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {stats.paidCount} paid / {stats.totalCount} total
            </p>
          </div>
          {stats.goalAmount != null && (
            <span className="text-xs text-brand-400 font-medium">
              {Math.round(stats.progress)}%
            </span>
          )}
        </div>
      ) : null}
    </div>
  )
}
