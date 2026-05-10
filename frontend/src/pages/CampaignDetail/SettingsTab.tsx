import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { api } from '../../lib/api'
import type { Campaign, CampaignType, Contributor, Frequency, Org, RecurringSchedule, VisibilityMode, CampaignStatus } from '../../types'
import { deadlineInfo } from '../../types'
import CampaignTypeSelector from '../../components/CampaignTypeSelector'

interface Form {
  emoji: string
  title: string
  description: string
  campaign_type: CampaignType
  has_goal: boolean
  goal_amount: string
  contribution_note: string
  amount_per_person: string
  visibility_mode: VisibilityMode
  allow_anonymous_contributions: boolean
  whatsapp_reminders_enabled: boolean
  due_date: string
  zelle_info: string
  cashapp_handle: string
  org_id: string | null
}

function toForm(c: Campaign): Form {
  return {
    emoji: c.emoji,
    title: c.title,
    description: c.description ?? '',
    campaign_type: c.campaign_type,
    has_goal: c.goal_amount != null,
    goal_amount: c.goal_amount ?? '',
    contribution_note: c.contribution_note ?? '',
    amount_per_person: c.amount_per_person ?? '',
    visibility_mode: c.visibility_mode,
    allow_anonymous_contributions: c.allow_anonymous_contributions,
    whatsapp_reminders_enabled: c.whatsapp_reminders_enabled,
    due_date: c.due_date ?? '',
    zelle_info: c.zelle_info ?? '',
    cashapp_handle: c.cashapp_handle ?? '',
    org_id: c.org_id ?? null,
  }
}

interface Props {
  campaign: Campaign
  contributors: Contributor[]
}

export default function SettingsTab({ campaign, contributors }: Props) {
  const [form, setForm] = useState<Form>(toForm(campaign))
  const [confirmDelete, setConfirmDelete] = useState(false)
  const qc = useQueryClient()
  const nav = useNavigate()

  const { data: orgs = [] } = useQuery<Org[]>({
    queryKey: ['orgs'],
    queryFn: () => api.get<Org[]>('/orgs').then(r => r.data),
  })

  useEffect(() => { setForm(toForm(campaign)) }, [campaign.id])

  function set<K extends keyof Form>(k: K, v: Form[K]) {
    setForm(p => ({ ...p, [k]: v }))
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      api.patch<Campaign>(`/campaigns/${campaign.slug}`, {
        emoji: form.emoji || '⚽',
        title: form.title,
        description: form.description || null,
        campaign_type: form.campaign_type,
        goal_amount: form.has_goal && form.goal_amount ? parseFloat(form.goal_amount) : null,
        contribution_note: !form.has_goal && form.contribution_note ? form.contribution_note.trim() : null,
        amount_per_person: form.amount_per_person ? parseFloat(form.amount_per_person) : null,
        visibility_mode: form.visibility_mode,
        allow_anonymous_contributions: form.allow_anonymous_contributions,
        whatsapp_reminders_enabled: form.whatsapp_reminders_enabled,
        due_date: form.due_date || null,
        zelle_info: form.zelle_info.trim() || null,
        cashapp_handle: form.cashapp_handle.trim() || null,
        org_id: form.org_id || null,
      }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaign', campaign.slug] })
      qc.invalidateQueries({ queryKey: ['campaigns'] })
      toast.success('Campaign saved')
    },
    onError: () => toast.error('Failed to save changes'),
  })

  const statusMutation = useMutation({
    mutationFn: (status: CampaignStatus) =>
      api.patch<Campaign>(`/campaigns/${campaign.slug}`, { status }).then(r => r.data),
    onSuccess: (updated) => {
      qc.setQueryData(['campaign', campaign.slug], updated)
      qc.invalidateQueries({ queryKey: ['campaigns'] })
      if (updated.status === 'archived') nav('/dashboard', { replace: true })
      else toast.success(`Campaign ${updated.status}`)
    },
    onError: () => toast.error('Failed to update status'),
  })

  const deletePermanentMutation = useMutation({
    mutationFn: () => api.delete(`/campaigns/${campaign.slug}/permanent`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaigns'] })
      toast.success('Campaign permanently deleted')
      nav('/dashboard', { replace: true })
    },
    onError: () => toast.error('Failed to delete campaign'),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) { toast.error('Title is required'); return }
    saveMutation.mutate()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-lg">
      {/* Basic info */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 space-y-4">
        <h3 className="text-sm font-semibold text-white">Campaign info</h3>

        <div className="flex gap-3">
          <div className="w-16">
            <label className="block text-xs text-gray-400 mb-1">Emoji</label>
            <input
              value={form.emoji}
              onChange={(e) => set('emoji', e.target.value)}
              maxLength={4}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-2 py-2.5
                text-center text-2xl text-white focus:border-brand-500 focus:outline-none"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs text-gray-400 mb-1">Title</label>
            <input
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5
                text-sm text-white focus:border-brand-500 focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1">Description</label>
          <textarea
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            rows={2}
            placeholder={
              form.has_goal
                ? 'Optional details about this campaign…'
                : 'e.g. Members can contribute any amount they wish. Every bit helps!'
            }
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5
              text-sm text-white placeholder-gray-500 focus:border-brand-500 focus:outline-none resize-none"
          />
          {!form.has_goal && !form.description && (
            <p className="text-xs text-gray-500 mt-1">
              Tip: let contributors know what's expected — a minimum, a suggested amount, or just encourage them to give what they can.
            </p>
          )}
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1">Payment deadline <span className="text-gray-600">(optional)</span></label>
          <div className="flex items-center gap-3">
            <input
              type="date"
              value={form.due_date}
              onChange={(e) => set('due_date', e.target.value)}
              className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5
                text-sm text-white focus:border-brand-500 focus:outline-none"
            />
            {form.due_date && (() => {
              const { urgency, label } = deadlineInfo(form.due_date)
              const color = urgency === 'overdue' || urgency === 'today' ? 'text-red-400'
                : urgency === 'tomorrow' || urgency === 'soon' ? 'text-yellow-400'
                : 'text-gray-400'
              return <span className={`text-xs ${color}`}>{label}</span>
            })()}
            {form.due_date && (
              <button type="button" onClick={() => set('due_date', '')}
                className="text-xs text-gray-600 hover:text-gray-400 transition-colors">
                ✕ clear
              </button>
            )}
          </div>
          <p className="text-xs text-gray-600 mt-1">
            Reminders auto-send at 7, 3, and 1 day(s) before. Campaign auto-completes when passed.
          </p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">
              Zelle info <span className="text-gray-600">(optional)</span>
            </label>
            <input
              type="text"
              value={form.zelle_info}
              onChange={(e) => set('zelle_info', e.target.value)}
              placeholder="e.g. john@email.com or +1 555-0100"
              maxLength={255}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5
                text-sm text-white placeholder-gray-600 focus:border-brand-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">
              CashApp handle <span className="text-gray-600">(optional)</span>
            </label>
            <input
              type="text"
              value={form.cashapp_handle}
              onChange={(e) => set('cashapp_handle', e.target.value)}
              placeholder="e.g. $JohnDoe"
              maxLength={255}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5
                text-sm text-white placeholder-gray-600 focus:border-brand-500 focus:outline-none"
            />
          </div>
          {(form.zelle_info || form.cashapp_handle) && (
            <p className="text-xs text-brand-400">
              Contributors who choose Zelle / CashApp will see this info on the public page.
            </p>
          )}
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-2">Campaign type</label>
          <CampaignTypeSelector value={form.campaign_type} onChange={(v) => set('campaign_type', v)} />
        </div>

        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.has_goal}
              onChange={(e) => set('has_goal', e.target.checked)}
              className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-brand-500
                focus:ring-brand-500 focus:ring-offset-gray-900"
            />
            <div>
              <span className="text-sm text-gray-200">Set a goal amount</span>
              <span className="block text-xs text-gray-500">Uncheck to collect open-ended contributions</span>
            </div>
          </label>

          {form.has_goal && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Goal amount</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                  <input
                    type="number"
                    value={form.goal_amount}
                    onChange={(e) => set('goal_amount', e.target.value)}
                    min="1"
                    step="0.01"
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 pl-7 pr-3 py-2.5
                      text-sm text-white focus:border-brand-500 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Per person</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                  <input
                    type="number"
                    value={form.amount_per_person}
                    onChange={(e) => set('amount_per_person', e.target.value)}
                    min="0"
                    step="0.01"
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 pl-7 pr-3 py-2.5
                      text-sm text-white focus:border-brand-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {!form.has_goal && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Message to contributors <span className="text-gray-600">(optional)</span>
                </label>
                <textarea
                  value={form.contribution_note}
                  onChange={(e) => set('contribution_note', e.target.value)}
                  maxLength={200}
                  rows={2}
                  placeholder="e.g. Any amount donated will be appreciated — every bit helps!"
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5
                    text-sm text-white placeholder-gray-600 focus:border-brand-500 focus:outline-none resize-none"
                />
                <p className="text-xs text-gray-600 mt-0.5">
                  Shown on the public page where the goal amount would normally appear.
                </p>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Per person (optional)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                  <input
                    type="number"
                    value={form.amount_per_person}
                    onChange={(e) => set('amount_per_person', e.target.value)}
                    min="0"
                    step="0.01"
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 pl-7 pr-3 py-2.5
                      text-sm text-white focus:border-brand-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Privacy */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 space-y-4">
        <h3 className="text-sm font-semibold text-white">Privacy</h3>

        <div>
          <label className="block text-xs text-gray-400 mb-2">Visibility on public board</label>
          <div className="space-y-2">
            {([
              ['full_name',       'Full name',       'Show full name publicly'],
              ['first_name_only', 'First name only', 'Show only the first name'],
              ['anonymous',       'Anonymous',       'Hide all names publicly'],
            ] as [VisibilityMode, string, string][]).map(([v, l, d]) => (
              <label key={v} className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="radio"
                  name="visibility_mode"
                  value={v}
                  checked={form.visibility_mode === v}
                  onChange={() => set('visibility_mode', v)}
                  className="mt-0.5 text-brand-500 focus:ring-brand-500 focus:ring-offset-gray-900"
                />
                <div>
                  <span className="text-sm text-gray-200">{l}</span>
                  <span className="block text-xs text-gray-500">{d}</span>
                </div>
              </label>
            ))}
          </div>
        </div>

        {form.allow_anonymous_contributions && (
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.allow_anonymous_contributions}
              onChange={(e) => set('allow_anonymous_contributions', e.target.checked)}
              className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-brand-500
                focus:ring-brand-500 focus:ring-offset-gray-900"
            />
            <div>
              <span className="text-sm text-gray-200">Allow anonymous contributions</span>
              <span className="block text-xs text-gray-500">Contributors can opt to hide their name</span>
            </div>
          </label>
        )}
        {!form.allow_anonymous_contributions && (
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={false}
              onChange={(e) => set('allow_anonymous_contributions', e.target.checked)}
              className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-brand-500
                focus:ring-brand-500 focus:ring-offset-gray-900"
            />
            <div>
              <span className="text-sm text-gray-200">Allow anonymous contributions</span>
              <span className="block text-xs text-gray-500">Privacy checkbox hidden on public page</span>
            </div>
          </label>
        )}
      </div>

      {/* Notifications */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
        <h3 className="text-sm font-semibold text-white mb-4">Notifications</h3>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={form.whatsapp_reminders_enabled}
            onChange={(e) => set('whatsapp_reminders_enabled', e.target.checked)}
            className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-brand-500
              focus:ring-brand-500 focus:ring-offset-gray-900"
          />
          <div>
            <span className="text-sm text-gray-200">WhatsApp reminders</span>
            <span className="block text-xs text-gray-500">Get notified when someone pays</span>
          </div>
        </label>
      </div>

      {/* Organisation */}
      {orgs.length > 0 && (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-white">Organisation</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Link this campaign to a group so members are tracked across collections.
            </p>
          </div>
          <select
            value={form.org_id ?? ''}
            onChange={e => set('org_id', e.target.value || null)}
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5
              text-sm text-white focus:border-brand-500 focus:outline-none"
          >
            <option value="">— No organisation —</option>
            {orgs.map(o => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
          {form.org_id && form.org_id !== (campaign.org_id ?? null) && (
            <p className="text-xs text-brand-400">
              Save changes to link this campaign. Then use the Contributors tab to sync org members.
            </p>
          )}
          {form.org_id && form.org_id === (campaign.org_id ?? null) && (
            <p className="text-xs text-gray-500">
              Linked. Go to the Contributors tab → Sync Org Members to import any members not yet on this campaign.
            </p>
          )}
        </div>
      )}

      {/* Save */}
      <button
        type="submit"
        disabled={saveMutation.isPending}
        className="w-full rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white
          hover:bg-brand-500 disabled:opacity-60 transition-colors"
      >
        {saveMutation.isPending ? 'Saving…' : 'Save changes'}
      </button>

      {/* Recurring */}
      <RecurringSection campaign={campaign} />

      {/* Campaign status actions */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 space-y-3">
        <h3 className="text-sm font-semibold text-white mb-1">Campaign status</h3>
        <p className="text-xs text-gray-500 mb-3">
          Current: <span className="capitalize text-gray-300">{campaign.status}</span>
        </p>

        <div className="flex flex-wrap gap-2">
          {campaign.status === 'active' && (
            <ActionBtn
              label="Pause Campaign"
              onClick={() => statusMutation.mutate('paused')}
              loading={statusMutation.isPending}
              color="yellow"
            />
          )}
          {campaign.status === 'paused' && (
            <>
              <ActionBtn
                label="Resume Campaign"
                onClick={() => statusMutation.mutate('active')}
                loading={statusMutation.isPending}
                color="green"
              />
              <ActionBtn
                label="Complete Campaign"
                onClick={() => statusMutation.mutate('completed')}
                loading={statusMutation.isPending}
                color="blue"
              />
            </>
          )}
          {campaign.status === 'completed' && (
            <ActionBtn
              label="Archive Campaign"
              onClick={() => {
                if (confirm('Archive this campaign? It will be removed from your dashboard.')) {
                  statusMutation.mutate('archived')
                }
              }}
              loading={statusMutation.isPending}
              color="red"
            />
          )}
          {campaign.status === 'active' && (
            <ActionBtn
              label="Complete Campaign"
              onClick={() => statusMutation.mutate('completed')}
              loading={statusMutation.isPending}
              color="blue"
            />
          )}
        </div>
      </div>

      {/* Danger zone */}
      <div className="rounded-xl border border-red-900/60 bg-red-950/20 p-6 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-red-400">Danger Zone</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Permanently deletes this campaign and all its data — contributors, payment history, and any beneficiary profile.
            This cannot be undone.
          </p>
        </div>

        {!confirmDelete ? (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="rounded-lg border border-red-800 px-4 py-2 text-sm font-medium
              text-red-400 hover:bg-red-900/30 transition-colors"
          >
            Delete Campaign Permanently
          </button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-red-300 font-medium">
              This will permanently delete this campaign and all{' '}
              <span className="font-bold">{contributors.length} contributor{contributors.length !== 1 ? 's' : ''}</span>
              {' '}and their payment records. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => deletePermanentMutation.mutate()}
                disabled={deletePermanentMutation.isPending}
                className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white
                  hover:bg-red-600 disabled:opacity-60 transition-colors"
              >
                {deletePermanentMutation.isPending ? 'Deleting…' : 'Yes, delete permanently'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-400
                  hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </form>
  )
}

// ── Recurring Schedule Section ────────────────────────────────────────────────

const FREQ_LABELS: Record<Frequency, string> = {
  weekly: 'Weekly',
  biweekly: 'Biweekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annual: 'Annual',
}

const DOW_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function formatNextDue(schedule: RecurringSchedule): string {
  return new Date(schedule.next_due_date + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  })
}

function RecurringSection({ campaign }: { campaign: Campaign }) {
  const qc = useQueryClient()
  const [enabled, setEnabled] = useState(false)
  const [freq, setFreq] = useState<Frequency>('monthly')
  const [dom, setDom] = useState('1')
  const [dow, setDow] = useState('0')
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10))
  const [endDate, setEndDate] = useState('')
  const [remindDays, setRemindDays] = useState(1)
  const [createDays, setCreateDays] = useState(3)

  const scheduleQ = useQuery<RecurringSchedule | null>({
    queryKey: ['schedule', campaign.slug],
    queryFn: () => api.get<RecurringSchedule | null>(`/campaigns/${campaign.slug}/schedule`).then(r => r.data),
  })
  const schedule = scheduleQ.data

  useEffect(() => {
    if (schedule) {
      setEnabled(schedule.is_active)
      setFreq(schedule.frequency)
      setDom(String(schedule.day_of_month ?? 1))
      setDow(String(schedule.day_of_week ?? 0))
      setStartDate(schedule.start_date)
      setEndDate(schedule.end_date ?? '')
      setRemindDays(schedule.auto_remind_days_before)
      setCreateDays(schedule.auto_create_days_before)
    }
  }, [schedule?.id])

  const schedulePayload = () => ({
    frequency: freq,
    day_of_month: ['monthly', 'quarterly', 'annual'].includes(freq) ? parseInt(dom) : null,
    day_of_week: ['weekly', 'biweekly'].includes(freq) ? parseInt(dow) : null,
    start_date: startDate,
    end_date: endDate || null,
    auto_create_days_before: createDays,
    auto_remind_days_before: remindDays,
  })

  const createSchedule = useMutation({
    mutationFn: () =>
      api.post<RecurringSchedule>(`/campaigns/${campaign.slug}/schedule`, schedulePayload()).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedule', campaign.slug] })
      qc.invalidateQueries({ queryKey: ['recurring'] })
      toast.success('Recurring schedule saved')
    },
    onError: () => toast.error('Failed to save schedule'),
  })

  const updateSchedule = useMutation({
    mutationFn: () =>
      api.patch<RecurringSchedule>(`/campaigns/${campaign.slug}/schedule`, schedulePayload()).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedule', campaign.slug] })
      qc.invalidateQueries({ queryKey: ['recurring'] })
      toast.success('Recurring schedule updated')
    },
    onError: () => toast.error('Failed to update schedule'),
  })

  const toggleActive = useMutation({
    mutationFn: (active: boolean) =>
      api.patch<RecurringSchedule>(`/campaigns/${campaign.slug}/schedule`, { is_active: active }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedule', campaign.slug] })
      qc.invalidateQueries({ queryKey: ['recurring'] })
    },
  })

  const needsDom = ['monthly', 'quarterly', 'annual'].includes(freq)
  const needsDow = ['weekly', 'biweekly'].includes(freq)

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white">Recurring Collection</h3>
          <p className="text-xs text-gray-500 mt-0.5">Auto-create this campaign every cycle</p>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={e => {
              setEnabled(e.target.checked)
              if (schedule && !e.target.checked) {
                toggleActive.mutate(false)
              }
            }}
            className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-brand-500 focus:ring-brand-500 focus:ring-offset-gray-900"
          />
          <span className="text-sm text-gray-300">{enabled ? 'On' : 'Off'}</span>
        </label>
      </div>

      {schedule && schedule.is_active && (
        <div className="rounded-lg bg-brand-900/30 border border-brand-800/40 px-4 py-3 text-sm">
          <p className="text-brand-300 font-medium">
            ↺ {FREQ_LABELS[schedule.frequency]} · Next collection: {formatNextDue(schedule)}
          </p>
          <p className="text-brand-400/70 text-xs mt-0.5">
            Reminders {schedule.auto_remind_days_before}d before due ·
            Campaign created {schedule.auto_create_days_before}d before due
          </p>
        </div>
      )}

      {enabled && (
        <div className="space-y-4 pt-1">
          <div>
            <label className="block text-xs text-gray-400 mb-2">Frequency</label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(FREQ_LABELS) as Frequency[]).map(f => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFreq(f)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    freq === f
                      ? 'bg-brand-600 text-white'
                      : 'border border-gray-700 text-gray-400 hover:text-white'
                  }`}
                >
                  {FREQ_LABELS[f]}
                </button>
              ))}
            </div>
          </div>

          {needsDom && (
            <div>
              <label className="block text-xs text-gray-400 mb-1">Day of month (1–28)</label>
              <input
                type="number"
                min="1"
                max="28"
                value={dom}
                onChange={e => setDom(e.target.value)}
                className="w-24 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-brand-500 focus:outline-none"
              />
            </div>
          )}

          {needsDow && (
            <div>
              <label className="block text-xs text-gray-400 mb-1">Day of week</label>
              <select
                value={dow}
                onChange={e => setDow(e.target.value)}
                className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-brand-500 focus:outline-none"
              >
                {DOW_LABELS.map((d, i) => (
                  <option key={i} value={i}>{d}</option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Start date</label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-brand-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">End date (optional)</label>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-brand-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">
              Remind contributors {remindDays} day{remindDays !== 1 ? 's' : ''} before due
            </label>
            <input
              type="range"
              min="1"
              max="7"
              value={remindDays}
              onChange={e => setRemindDays(parseInt(e.target.value))}
              className="w-full accent-brand-500"
            />
          </div>

          <button
            type="button"
            onClick={() => schedule ? updateSchedule.mutate() : createSchedule.mutate()}
            disabled={(schedule ? updateSchedule.isPending : createSchedule.isPending) || !startDate}
            className="w-full rounded-lg bg-brand-600/20 border border-brand-700 py-2 text-sm font-medium
              text-brand-300 hover:bg-brand-600/40 disabled:opacity-50 transition-colors"
          >
            {(schedule ? updateSchedule.isPending : createSchedule.isPending)
              ? 'Saving…'
              : schedule
                ? 'Update Schedule'
                : 'Enable Recurring'}
          </button>
        </div>
      )}
    </div>
  )
}

function ActionBtn({
  label, onClick, loading, color,
}: {
  label: string
  onClick: () => void
  loading: boolean
  color: 'yellow' | 'blue' | 'red' | 'green'
}) {
  const colors = {
    yellow: 'border-yellow-700 text-yellow-300 hover:bg-yellow-900/40',
    blue:   'border-blue-700 text-blue-300 hover:bg-blue-900/40',
    red:    'border-red-700 text-red-300 hover:bg-red-900/40',
    green:  'border-brand-600 text-brand-300 hover:bg-brand-900/40',
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors
        disabled:opacity-50 ${colors[color]}`}
    >
      {label}
    </button>
  )
}
