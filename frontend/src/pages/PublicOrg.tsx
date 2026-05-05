import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { AxiosResponse } from 'axios'
import { api } from '../lib/api'
import type { PublicOrg, PublicOrgCampaign } from '../types'

function getData<T>(r: AxiosResponse<T>): T { return r.data }
import { fmt } from '../types'

function CampaignCard({ c }: { c: PublicOrgCampaign }) {
  const raised = parseFloat(c.total_raised)
  const goal = parseFloat(c.goal_amount)
  const pct = goal > 0 ? Math.min((raised / goal) * 100, 100) : 0

  return (
    <Link
      to={`/p/${c.slug}`}
      className="block bg-white rounded-2xl border border-gray-100 hover:border-emerald-200 hover:shadow-md transition-all p-5"
    >
      <div className="flex items-start gap-3 mb-3">
        <span className="text-2xl">{c.emoji}</span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 truncate">{c.title}</p>
          <p className="text-xs text-gray-400 mt-0.5">{c.paid_count} paid</p>
        </div>
        {c.status !== 'active' && (
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{c.status}</span>
        )}
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-emerald-500 rounded-full"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-gray-500 mt-1.5">
        <span className="font-medium text-emerald-700">{fmt(raised)}</span>
        <span>of {fmt(goal)}</span>
      </div>
    </Link>
  )
}

export default function PublicOrgPage() {
  const { slug } = useParams<{ slug: string }>()

  const { data: org, isLoading, isError } = useQuery<PublicOrg>({
    queryKey: ['public-org', slug],
    queryFn: () => api.get<PublicOrg>(`/o/${slug}`).then(getData),
    enabled: !!slug,
  })

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  if (isError || !org) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-4xl mb-3">😕</p>
          <p className="text-lg font-semibold text-gray-700">Organization not found</p>
          <Link to="/" className="mt-4 inline-block text-emerald-600 hover:underline text-sm">
            Back to ChipIn
          </Link>
        </div>
      </div>
    )
  }

  const typeIcon =
    org.org_type === 'sports' ? '⚽' :
    org.org_type === 'religious' ? '🕌' :
    org.org_type === 'professional' ? '💼' :
    org.org_type === 'social' ? '🎉' : '🏘️'

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-4 py-8">
          <div className="flex items-center gap-5">
            {org.logo_url ? (
              <img src={org.logo_url} alt="" className="w-20 h-20 rounded-2xl object-cover flex-shrink-0" />
            ) : (
              <div className="w-20 h-20 rounded-2xl bg-emerald-50 flex items-center justify-center text-4xl flex-shrink-0">
                {typeIcon}
              </div>
            )}
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{org.name}</h1>
              {org.description && (
                <p className="text-sm text-gray-500 mt-1 max-w-md">{org.description}</p>
              )}
            </div>
          </div>

          {/* Stats bar */}
          <div className="mt-6 flex gap-6 text-sm">
            <div>
              <p className="text-xl font-bold text-gray-900">{fmt(parseFloat(org.stats.total_raised))}</p>
              <p className="text-xs text-gray-400">Total raised</p>
            </div>
            <div>
              <p className="text-xl font-bold text-gray-900">{org.stats.total_campaigns}</p>
              <p className="text-xs text-gray-400">Campaigns</p>
            </div>
            {org.stats.active_campaigns > 0 && (
              <div>
                <p className="text-xl font-bold text-emerald-600">{org.stats.active_campaigns}</p>
                <p className="text-xs text-gray-400">Active now</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
        {org.active_campaigns.length > 0 && (
          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-4">Active Campaigns</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {org.active_campaigns.map(c => <CampaignCard key={c.slug} c={c} />)}
            </div>
          </section>
        )}

        {org.past_campaigns.length > 0 && (
          <section>
            <h2 className="text-lg font-bold text-gray-700 mb-4">Past Campaigns</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {org.past_campaigns.map(c => <CampaignCard key={c.slug} c={c} />)}
            </div>
          </section>
        )}

        {org.active_campaigns.length === 0 && org.past_campaigns.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <p className="text-3xl mb-3">📭</p>
            <p>No campaigns yet</p>
          </div>
        )}

        <p className="text-center text-xs text-gray-300 pt-4">
          Powered by <a href="/" className="hover:underline">ChipIn</a>
        </p>
      </div>
    </div>
  )
}
