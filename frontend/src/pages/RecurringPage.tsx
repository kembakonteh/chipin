import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { AxiosResponse } from 'axios'
import { api } from '../lib/api'
import type { RecurringScheduleWithCampaign, RecurringInstance, Frequency, InstanceStatus } from '../types'
import Layout from '../components/Layout'

function getData<T>(r: AxiosResponse<T>): T { return r.data }

const FREQ_LABELS: Record<Frequency, string> = {
  weekly: 'Weekly',
  biweekly: 'Biweekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annual: 'Annual',
}

const STATUS_STYLES: Record<InstanceStatus, string> = {
  upcoming: 'bg-blue-900/40 text-blue-300 border border-blue-800/40',
  active:   'bg-emerald-900/40 text-emerald-300 border border-emerald-800/40',
  completed:'bg-gray-800 text-gray-400 border border-gray-700',
  missed:   'bg-red-900/40 text-red-400 border border-red-800/40',
}

function formatDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function InstancePill({ instance }: { instance: RecurringInstance }) {
  return (
    <div className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs ${STATUS_STYLES[instance.status]}`}>
      <span>{formatDate(instance.due_date)}</span>
      <span className="capitalize font-medium">{instance.status}</span>
    </div>
  )
}

function ScheduleCard({ schedule }: { schedule: RecurringScheduleWithCampaign }) {
  const qc = useQueryClient()
  const navigate = useNavigate()

  const toggle = useMutation({
    mutationFn: (active: boolean) =>
      api.patch<RecurringScheduleWithCampaign>(
        `/campaigns/${schedule.campaign_slug}/schedule`,
        { is_active: active }
      ).then(getData),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recurring'] }),
  })

  const nextDue = new Date(schedule.next_due_date + 'T00:00:00')
  const daysUntil = Math.ceil((nextDue.getTime() - Date.now()) / 86400000)

  return (
    <div className={`rounded-xl border bg-gray-900 p-5 ${
      schedule.is_active ? 'border-gray-700' : 'border-gray-800 opacity-60'
    }`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-2xl">{schedule.campaign_emoji}</span>
          <div className="min-w-0">
            <button
              onClick={() => navigate(`/dashboard/${schedule.campaign_slug}?tab=settings`)}
              className="font-semibold text-white hover:text-brand-300 truncate block text-left transition-colors"
            >
              {schedule.campaign_title}
            </button>
            <p className="text-xs text-gray-500 mt-0.5">
              ↺ {FREQ_LABELS[schedule.frequency]} · Started {formatDate(schedule.start_date)}
              {schedule.end_date && ` · Ends ${formatDate(schedule.end_date)}`}
            </p>
          </div>
        </div>
        <button
          onClick={() => toggle.mutate(!schedule.is_active)}
          disabled={toggle.isPending}
          className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors flex-shrink-0 ${
            schedule.is_active
              ? 'bg-emerald-900/50 text-emerald-400 border border-emerald-800 hover:bg-red-900/50 hover:text-red-400 hover:border-red-800'
              : 'bg-gray-800 text-gray-500 border border-gray-700 hover:bg-emerald-900/50 hover:text-emerald-400 hover:border-emerald-800'
          }`}
        >
          {schedule.is_active ? '⏸ Pause' : '▶ Resume'}
        </button>
      </div>

      {/* Next due */}
      {schedule.is_active && (
        <div className="mb-4 rounded-lg bg-brand-900/20 border border-brand-800/30 px-4 py-3">
          <p className="text-sm text-brand-300 font-medium">
            Next collection: {formatDate(schedule.next_due_date)}
          </p>
          <p className="text-xs text-brand-400/60 mt-0.5">
            {daysUntil > 0
              ? `Campaign created in ${daysUntil - schedule.auto_create_days_before} days · Reminders ${schedule.auto_remind_days_before}d before`
              : 'Processing soon'}
          </p>
        </div>
      )}

      {/* Recent instances */}
      {schedule.recent_instances.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 mb-2">Recent cycles</p>
          <div className="space-y-1.5">
            {schedule.recent_instances.map(inst => (
              <InstancePill key={inst.id} instance={inst} />
            ))}
          </div>
        </div>
      )}

      {schedule.recent_instances.length === 0 && schedule.is_active && (
        <p className="text-xs text-gray-600 italic">No cycles run yet</p>
      )}
    </div>
  )
}

export default function RecurringPage() {
  const navigate = useNavigate()
  const { data: schedules = [], isLoading } = useQuery<RecurringScheduleWithCampaign[]>({
    queryKey: ['recurring'],
    queryFn: () => api.get<RecurringScheduleWithCampaign[]>('/recurring').then(getData),
  })

  const active = schedules.filter(s => s.is_active)
  const paused = schedules.filter(s => !s.is_active)

  return (
    <Layout>
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Recurring Collections</h1>
            <p className="text-sm text-gray-500 mt-1">
              Automated cycles for tithes, dues, and fees
            </p>
          </div>
          {schedules.length > 0 && (
            <div className="text-right text-sm text-gray-400">
              <span className="text-emerald-400 font-semibold">{active.length}</span> active
              {paused.length > 0 && <>, <span className="text-gray-500">{paused.length}</span> paused</>}
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="text-center py-20 text-gray-500">Loading…</div>
        ) : schedules.length === 0 ? (
          <div className="text-center py-20 rounded-xl border border-gray-800 bg-gray-900">
            <p className="text-4xl mb-3">↺</p>
            <p className="font-semibold text-gray-300">No recurring schedules yet</p>
            <p className="text-sm text-gray-500 mt-1 mb-6 max-w-xs mx-auto">
              Open any campaign's Settings tab and enable Recurring Collection to automate it.
            </p>
            <button
              onClick={() => navigate('/dashboard')}
              className="px-5 py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-500"
            >
              Go to Campaigns
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {active.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Active</h2>
                <div className="space-y-4">
                  {active.map(s => <ScheduleCard key={s.id} schedule={s} />)}
                </div>
              </section>
            )}
            {paused.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 mt-6">Paused</h2>
                <div className="space-y-4">
                  {paused.map(s => <ScheduleCard key={s.id} schedule={s} />)}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </Layout>
  )
}
