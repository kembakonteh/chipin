import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { Campaign, PaginatedResponse } from '../types'
import Layout from '../components/Layout'
import NewCampaignModal from '../components/NewCampaignModal'
import { useAuth } from '../contexts/AuthContext'

export default function Dashboard() {
  const { features } = useAuth()
  const [showNew, setShowNew] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['campaigns'],
    queryFn: () =>
      api.get<PaginatedResponse<Campaign>>('/campaigns').then(r => r.data),
    enabled: !!features?.campaigns_enabled,
  })

  const campaigns = data?.items ?? []
  const active = campaigns.filter(c => c.status === 'active')

  return (
    <Layout>
      <h1 className="text-2xl font-bold text-white mb-6">Home</h1>

      <div className="space-y-4">
        {/* Campaigns summary */}
        {features?.campaigns_enabled && (
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">📋</span>
                <span className="font-semibold text-white">Campaigns</span>
              </div>
              <Link to="/campaigns" className="text-xs text-brand-400 hover:text-brand-300">
                View all →
              </Link>
            </div>
            {isLoading ? (
              <div className="h-8 w-32 rounded bg-gray-800 animate-pulse" />
            ) : (
              <div className="flex gap-6">
                <div>
                  <p className="text-2xl font-bold text-white">{data?.total ?? 0}</p>
                  <p className="text-xs text-gray-500">total</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-brand-400">{active.length}</p>
                  <p className="text-xs text-gray-500">active</p>
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={() => setShowNew(true)}
              className="mt-4 w-full rounded-lg border border-gray-700 py-2 text-sm text-gray-400
                hover:text-white hover:border-gray-500 transition-colors"
            >
              + New Campaign
            </button>
          </div>
        )}

        {/* Susu summary */}
        {features?.susu_enabled && (
          <Link
            to="/susu"
            className="block rounded-xl border border-gray-800 bg-gray-900 p-5 hover:border-gray-700 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="text-xl">💰</span>
              <span className="font-semibold text-white">Susu</span>
              <span className="ml-auto text-xs text-brand-400">View →</span>
            </div>
          </Link>
        )}

        {/* Org summary */}
        {features?.org_enabled && (
          <Link
            to="/orgs"
            className="block rounded-xl border border-gray-800 bg-gray-900 p-5 hover:border-gray-700 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="text-xl">👥</span>
              <span className="font-semibold text-white">My Organisation</span>
              <span className="ml-auto text-xs text-brand-400">View →</span>
            </div>
          </Link>
        )}
      </div>

      {showNew && <NewCampaignModal onClose={() => setShowNew(false)} />}
    </Layout>
  )
}
