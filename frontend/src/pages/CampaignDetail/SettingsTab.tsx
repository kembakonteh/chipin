import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { api } from '../../lib/api'
import type { Campaign, CampaignType, VisibilityMode, CampaignStatus } from '../../types'
import CampaignTypeSelector from '../../components/CampaignTypeSelector'

interface Form {
  emoji: string
  title: string
  description: string
  campaign_type: CampaignType
  goal_amount: string
  amount_per_person: string
  visibility_mode: VisibilityMode
  allow_anonymous_contributions: boolean
  whatsapp_reminders_enabled: boolean
}

function toForm(c: Campaign): Form {
  return {
    emoji: c.emoji,
    title: c.title,
    description: c.description ?? '',
    campaign_type: c.campaign_type,
    goal_amount: c.goal_amount,
    amount_per_person: c.amount_per_person ?? '',
    visibility_mode: c.visibility_mode,
    allow_anonymous_contributions: c.allow_anonymous_contributions,
    whatsapp_reminders_enabled: c.whatsapp_reminders_enabled,
  }
}

interface Props {
  campaign: Campaign
}

export default function SettingsTab({ campaign }: Props) {
  const [form, setForm] = useState<Form>(toForm(campaign))
  const qc = useQueryClient()
  const nav = useNavigate()

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
        goal_amount: parseFloat(form.goal_amount),
        amount_per_person: form.amount_per_person ? parseFloat(form.amount_per_person) : null,
        visibility_mode: form.visibility_mode,
        allow_anonymous_contributions: form.allow_anonymous_contributions,
        whatsapp_reminders_enabled: form.whatsapp_reminders_enabled,
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
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5
              text-sm text-white focus:border-brand-500 focus:outline-none resize-none"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-2">Campaign type</label>
          <CampaignTypeSelector value={form.campaign_type} onChange={(v) => set('campaign_type', v)} />
        </div>

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

      {/* Save */}
      <button
        type="submit"
        disabled={saveMutation.isPending}
        className="w-full rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white
          hover:bg-brand-500 disabled:opacity-60 transition-colors"
      >
        {saveMutation.isPending ? 'Saving…' : 'Save changes'}
      </button>

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
    </form>
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
