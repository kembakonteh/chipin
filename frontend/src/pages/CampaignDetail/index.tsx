import { useParams, Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import type { Campaign, Contributor } from '../../types'
import Layout from '../../components/Layout'
import StatusBadge from '../../components/StatusBadge'
import OverviewTab from './OverviewTab'
import ContributorsTab from './ContributorsTab'
import SettingsTab from './SettingsTab'

type Tab = 'overview' | 'contributors' | 'settings'
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview',     label: 'Overview' },
  { id: 'contributors', label: 'Contributors' },
  { id: 'settings',     label: 'Settings' },
]

function tabLabel(id: Tab, campaign: Campaign | undefined): string {
  if (id === 'contributors') {
    if (campaign?.campaign_type === 'celebration') return 'Guests'
    if (campaign?.campaign_type === 'political' && !!(campaign?.event_date || campaign?.event_location)) return 'Attendees'
  }
  return TABS.find(t => t.id === id)?.label ?? id
}

export default function CampaignDetail() {
  const { slug } = useParams<{ slug: string }>()
  const [sp, setSp] = useSearchParams()
  const tab = (sp.get('tab') as Tab) ?? 'overview'

  const campaignQ = useQuery({
    queryKey: ['campaign', slug],
    queryFn: () => api.get<Campaign>(`/campaigns/${slug}`).then(r => r.data),
    enabled: !!slug,
  })

  const contributorsQ = useQuery({
    queryKey: ['contributors', slug],
    queryFn: () => api.get<Contributor[]>(`/campaigns/${slug}/contributors`).then(r => r.data),
    enabled: !!slug,
  })

  const campaign = campaignQ.data
  const contributors = contributorsQ.data ?? []

  if (campaignQ.isLoading) {
    return (
      <Layout>
        <div className="flex items-center gap-3 mb-6">
          <div className="h-9 w-32 rounded-lg bg-gray-800 animate-pulse" />
        </div>
        <div className="h-10 w-64 rounded-lg bg-gray-800 animate-pulse mb-8" />
        <div className="h-64 rounded-xl bg-gray-900 animate-pulse" />
      </Layout>
    )
  }

  if (campaignQ.isError || !campaign) {
    return (
      <Layout>
        <div className="rounded-xl border border-red-900 bg-red-950/40 p-8 text-center">
          <p className="text-red-300 mb-3">Campaign not found or you don't have access.</p>
          <Link to="/dashboard" className="text-sm text-gray-400 hover:text-white underline">
            Back to dashboard
          </Link>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link to="/dashboard" className="hover:text-gray-300 transition-colors">Campaigns</Link>
        <span>/</span>
        <span className="text-gray-300 truncate">{campaign.title}</span>
      </div>

      {/* Campaign header */}
      <div className="flex items-start gap-4 mb-6">
        <span className="text-4xl shrink-0">{campaign.emoji}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-white truncate">{campaign.title}</h1>
            <StatusBadge status={campaign.status} />
          </div>
          {campaign.description && campaign.campaign_type !== 'political' && (
            <p className="text-sm text-gray-500 mt-1 line-clamp-2">{campaign.description}</p>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-800 mb-6">
        <nav className="flex gap-0 -mb-px">
          {TABS.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSp({ tab: t.id })}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors
                ${tab === t.id
                  ? 'border-brand-500 text-brand-300'
                  : 'border-transparent text-gray-500 hover:text-gray-300 hover:border-gray-600'
                }`}
            >
              {tabLabel(t.id, campaign)}
              {t.id === 'contributors' && contributors.length > 0 && (
                <span className="ml-1.5 rounded-full bg-gray-700 px-1.5 py-0.5 text-xs text-gray-400">
                  {contributors.length}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      {tab === 'overview' && (
        <OverviewTab campaign={campaign} contributors={contributors} />
      )}
      {tab === 'contributors' && (
        <ContributorsTab campaign={campaign} contributors={contributors} />
      )}
      {tab === 'settings' && (
        <SettingsTab campaign={campaign} contributors={contributors} />
      )}
    </Layout>
  )
}
