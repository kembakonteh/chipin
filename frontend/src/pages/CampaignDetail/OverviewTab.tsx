import type { Campaign, Contributor } from '../../types'
import { computeStats, fmt } from '../../types'
import ProgressRing from '../../components/ProgressRing'
import CopyLinkBar from '../../components/CopyLinkBar'

interface Props {
  campaign: Campaign
  contributors: Contributor[]
}

export default function OverviewTab({ campaign, contributors }: Props) {
  const stats = computeStats(campaign, contributors)

  return (
    <div className="space-y-6">
      {/* Progress + key stats */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
        <div className="flex flex-col sm:flex-row items-center gap-8">
          <ProgressRing percent={stats.progress} size={160} strokeWidth={14} label="funded" />

          <div className="grid grid-cols-2 gap-x-10 gap-y-4 flex-1 w-full sm:w-auto">
            <Stat label="Total raised" value={fmt(stats.totalRaised, campaign.currency)} accent />
            <Stat label="Goal" value={fmt(stats.goalAmount, campaign.currency)} />
            <Stat label="Paid" value={String(stats.paidCount)} />
            <Stat label="Total contributors" value={String(stats.totalCount)} />
          </div>
        </div>
      </div>

      {/* Shareable link */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
        <h3 className="text-sm font-semibold text-white mb-3">Shareable link</h3>
        <CopyLinkBar campaign={campaign} contributors={contributors} />
      </div>

      {/* Earnings summary */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
        <h3 className="text-sm font-semibold text-white mb-4">Earnings summary</h3>
        <div className="space-y-3">
          <EarningsRow label="Total raised" value={fmt(stats.totalRaised, campaign.currency)} />
          <EarningsRow
            label={`Platform fee (${campaign.platform_fee_pct}%)`}
            value={`− ${fmt(stats.platformFees, campaign.currency)}`}
            muted
          />
          <div className="border-t border-gray-800 pt-3">
            <EarningsRow label="Net to organizer" value={fmt(stats.net, campaign.currency)} accent />
          </div>
        </div>
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
