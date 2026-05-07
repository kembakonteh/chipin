import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { Campaign, PaginatedResponse } from '../types'
import Layout from '../components/Layout'
import CampaignCard from '../components/CampaignCard'
import NewCampaignModal from '../components/NewCampaignModal'

export default function CampaignsPage() {
  const [showNew, setShowNew] = useState(false)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['campaigns'],
    queryFn: () =>
      api.get<PaginatedResponse<Campaign>>('/campaigns').then(r => r.data),
  })

  const campaigns = data?.items ?? []

  return (
    <Layout>
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Campaigns</h1>
          {!isLoading && (
            <p className="text-sm text-gray-500 mt-0.5">
              {data?.total ?? 0} campaign{data?.total !== 1 ? 's' : ''}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold
            text-white hover:bg-brand-500 transition-colors shrink-0"
        >
          <span className="text-base leading-none">＋</span>
          <span>New Campaign</span>
        </button>
      </div>

      {isLoading ? (
        <div className="campaign-grid">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-36 rounded-xl bg-gray-900 border border-gray-800 animate-pulse" />
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-red-900 bg-red-950/40 p-6 text-center">
          <p className="text-red-300">Failed to load campaigns.</p>
        </div>
      ) : campaigns.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-700 p-12 text-center">
          <span className="text-4xl block mb-3">🌱</span>
          <p className="text-gray-400 font-medium mb-1">No campaigns yet</p>
          <p className="text-sm text-gray-600 mb-5">Create your first campaign to get started.</p>
          <button
            type="button"
            onClick={() => setShowNew(true)}
            className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white
              hover:bg-brand-500 transition-colors"
          >
            Create a campaign
          </button>
        </div>
      ) : (
        <div className="campaign-grid">
          {campaigns.map((c) => (
            <CampaignCard key={c.id} campaign={c} />
          ))}
        </div>
      )}

      {showNew && <NewCampaignModal onClose={() => setShowNew(false)} />}
    </Layout>
  )
}
