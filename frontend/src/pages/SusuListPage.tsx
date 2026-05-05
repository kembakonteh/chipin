import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { AxiosResponse } from 'axios'
import { api } from '../lib/api'
import type { SusuGroup, SusuFrequency, SusuStatus } from '../types'
import Layout from '../components/Layout'
import { fmt } from '../types'

function getData<T>(r: AxiosResponse<T>): T { return r.data }

const FREQ_LABELS: Record<SusuFrequency, string> = {
  weekly: 'Weekly',
  biweekly: 'Biweekly',
  monthly: 'Monthly',
}

const STATUS_STYLES: Record<SusuStatus, string> = {
  forming:   'bg-yellow-900/40 text-yellow-300 border border-yellow-800/40',
  active:    'bg-emerald-900/40 text-emerald-300 border border-emerald-800/40',
  completed: 'bg-gray-800 text-gray-400 border border-gray-700',
  paused:    'bg-orange-900/40 text-orange-300 border border-orange-800/40',
}

function formatDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function SusuCard({ group }: { group: SusuGroup }) {
  const navigate = useNavigate()
  const progress = group.total_cycles > 0 ? (group.current_cycle / group.total_cycles) * 100 : 0

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/susu/${group.slug}`)}
      onKeyDown={(e) => e.key === 'Enter' && navigate(`/susu/${group.slug}`)}
      className="group cursor-pointer rounded-xl border border-gray-700 bg-gray-900 p-5
        hover:border-brand-600 hover:bg-gray-800/70 transition-colors focus:outline-none
        focus:ring-2 focus:ring-brand-500"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="font-semibold text-white group-hover:text-brand-200 transition-colors">
            {group.name}
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            ↺ {FREQ_LABELS[group.frequency]} · {fmt(parseFloat(group.contribution_amount))}/member
            · {group.total_members} members
          </p>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full capitalize ${STATUS_STYLES[group.status]}`}>
          {group.status}
        </span>
      </div>

      <div className="mb-3">
        <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden">
          <div
            className="h-full rounded-full bg-brand-500 transition-all duration-500"
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>Cycle {group.current_cycle} of {group.total_cycles}</span>
        {group.next_contribution_date && (
          <span>Next: {formatDate(group.next_contribution_date)}</span>
        )}
      </div>
    </div>
  )
}

export default function SusuListPage() {
  const navigate = useNavigate()

  const { data: groups = [], isLoading } = useQuery<SusuGroup[]>({
    queryKey: ['susu'],
    queryFn: () => api.get<SusuGroup[]>('/susu').then(getData),
  })

  const active = groups.filter(g => g.status === 'active')
  const forming = groups.filter(g => g.status === 'forming')
  const done = groups.filter(g => g.status === 'completed' || g.status === 'paused')

  return (
    <Layout>
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Susu Groups</h1>
            <p className="text-sm text-gray-500 mt-1">
              Rotating savings clubs — everyone contributes, one person gets the pot each cycle
            </p>
          </div>
          <button
            onClick={() => navigate('/susu/create')}
            className="px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-500 transition-colors"
          >
            + New Susu
          </button>
        </div>

        {isLoading ? (
          <div className="text-center py-20 text-gray-500">Loading…</div>
        ) : groups.length === 0 ? (
          <div className="text-center py-20 rounded-xl border border-gray-800 bg-gray-900">
            <p className="text-4xl mb-3">🤝</p>
            <p className="font-semibold text-gray-300">No susu groups yet</p>
            <p className="text-sm text-gray-500 mt-1 mb-6 max-w-xs mx-auto">
              Start a rotating savings club for your community, church, or family.
            </p>
            <button
              onClick={() => navigate('/susu/create')}
              className="px-5 py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-500"
            >
              Create First Susu
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {active.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Active</h2>
                <div className="space-y-3">
                  {active.map(g => <SusuCard key={g.id} group={g} />)}
                </div>
              </section>
            )}
            {forming.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Forming</h2>
                <div className="space-y-3">
                  {forming.map(g => <SusuCard key={g.id} group={g} />)}
                </div>
              </section>
            )}
            {done.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Completed / Paused</h2>
                <div className="space-y-3">
                  {done.map(g => <SusuCard key={g.id} group={g} />)}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </Layout>
  )
}
