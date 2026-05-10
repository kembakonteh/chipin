import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { AxiosResponse } from 'axios'
import { api } from '../lib/api'
import type { SusuStandingsData, SusuFrequency } from '../types'
import { fmt } from '../types'

function getData<T>(r: AxiosResponse<T>): T { return r.data }

const FREQ_LABELS: Record<SusuFrequency, string> = {
  weekly: 'Weekly',
  biweekly: 'Biweekly',
  monthly: 'Monthly',
}

function ReliabilityBar({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-gray-600 text-xs">—</span>
  const color = pct >= 90 ? 'bg-emerald-500' : pct >= 60 ? 'bg-yellow-500' : 'bg-red-500'
  const textColor = pct >= 90 ? 'text-emerald-400' : pct >= 60 ? 'text-yellow-400' : 'text-red-400'
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1.5 rounded-full bg-gray-700 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-medium ${textColor}`}>{pct}%</span>
    </div>
  )
}

export default function SusuStandings() {
  const { slug } = useParams<{ slug: string }>()
  const [selectedMember, setSelectedMember] = useState<string | null>(null)

  const { data, isLoading } = useQuery<SusuStandingsData>({
    queryKey: ['susu-standings', slug],
    queryFn: () => api.get<SusuStandingsData>(`/s/${slug}/standings`).then(getData),
    refetchInterval: 60_000,
  })

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-500">Loading…</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-400">Susu group not found.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="border-b border-gray-800 bg-gray-950/90 backdrop-blur sticky top-0 z-20">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-2.5 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🌍</span>
            <div className="leading-none">
              <span className="block text-xs text-brand-400 font-medium">KafoTech</span>
              <span className="block text-sm font-bold text-white">ChipIn · Susu</span>
            </div>
          </div>
          <Link
            to={`/s/${slug}`}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            ← Group page
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-4 py-8 space-y-6">
        <div className="text-center">
          <div className="text-4xl mb-3">📊</div>
          <h1 className="text-2xl font-bold text-white">{data.name}</h1>
          <p className="text-sm text-gray-400 mt-1">
            {FREQ_LABELS[data.frequency]} · {fmt(parseFloat(data.contribution_amount))}/member
          </p>
          <p className="text-xs text-gray-600 mt-1">
            Cycle {data.current_cycle} of {data.total_cycles}
          </p>
        </div>

        <div className="rounded-xl border border-gray-700 bg-gray-900 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800">
            <h2 className="font-semibold text-white">Member Standings</h2>
            <p className="text-xs text-gray-500 mt-0.5">Ranked by total contributed</p>
          </div>

          {data.members.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-gray-500">
              No members yet.
            </div>
          ) : (
            <div className="divide-y divide-gray-800">
              {data.members.map((m, i) => (
                <div key={m.id} className="flex items-center justify-between px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <span className={`text-sm font-bold w-6 text-center ${
                      i === 0 ? 'text-yellow-400' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-amber-600' : 'text-gray-600'
                    }`}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                    </span>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm text-white font-medium">{m.name}</span>
                        {m.has_received_payout && (
                          <span className="text-xs text-purple-400" title="Has received payout">🏆</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-gray-500">
                          {m.paid_cycles}/{data.current_cycle} paid
                        </span>
                        <ReliabilityBar pct={m.reliability_pct} />
                      </div>
                    </div>
                  </div>
                  <div className="text-right flex flex-col items-end gap-1">
                    <div className="text-sm font-semibold text-white">
                      {fmt(parseFloat(m.total_contributed))}
                    </div>
                    {m.payout_position != null && (
                      <div className="text-xs text-gray-600">#{m.payout_position}</div>
                    )}
                    {data.status === 'active' && (
                      <Link
                        to={`/s/${slug}/pay/${m.id}`}
                        className="text-xs px-2.5 py-1 rounded-lg bg-brand-700/30 text-brand-300 hover:bg-brand-700/50 border border-brand-700/40 transition-colors"
                      >
                        Pay Now
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-center gap-4">
          <Link
            to={`/s/${slug}`}
            className="text-sm px-4 py-2 rounded-lg bg-brand-700/30 text-brand-300 hover:bg-brand-700/50 border border-brand-700/40 transition-colors"
          >
            View group & pay
          </Link>
        </div>

        <p className="text-center text-xs text-gray-600 pb-4">
          Powered by KafoTech ChipIn
        </p>
      </main>
    </div>
  )
}
