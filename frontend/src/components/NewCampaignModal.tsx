import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { api } from '../lib/api'
import type { Campaign, CampaignType, VisibilityMode } from '../types'
import CampaignTypeSelector from './CampaignTypeSelector'

interface Form {
  emoji: string
  title: string
  description: string
  campaign_type: CampaignType
  goal_amount: string
  amount_per_person: string
  visibility_mode: VisibilityMode
  allow_anonymous_contributions: boolean
}

const INIT: Form = {
  emoji: '⚽',
  title: '',
  description: '',
  campaign_type: 'general',
  goal_amount: '',
  amount_per_person: '',
  visibility_mode: 'full_name',
  allow_anonymous_contributions: true,
}

interface Props {
  onClose: () => void
  onCreated?: (c: Campaign) => void
}

export default function NewCampaignModal({ onClose, onCreated }: Props) {
  const [form, setForm] = useState<Form>(INIT)
  const qc = useQueryClient()

  function set<K extends keyof Form>(k: K, v: Form[K]) {
    setForm(prev => ({ ...prev, [k]: v }))
  }

  function handleTypeChange(t: CampaignType) {
    setForm(prev => ({
      ...prev,
      campaign_type: t,
      ...(t === 'memorial' || t === 'charity'
        ? { allow_anonymous_contributions: true, visibility_mode: 'first_name_only' }
        : {}),
    }))
  }

  const mutation = useMutation({
    mutationFn: () =>
      api.post<Campaign>('/campaigns', {
        emoji: form.emoji || '⚽',
        title: form.title,
        description: form.description || null,
        campaign_type: form.campaign_type,
        goal_amount: parseFloat(form.goal_amount),
        amount_per_person: form.amount_per_person ? parseFloat(form.amount_per_person) : null,
        visibility_mode: form.visibility_mode,
        allow_anonymous_contributions: form.allow_anonymous_contributions,
      }).then(r => r.data),
    onSuccess: (campaign) => {
      qc.invalidateQueries({ queryKey: ['campaigns'] })
      toast.success('Campaign created!')
      onCreated?.(campaign)
      onClose()
    },
    onError: () => toast.error('Failed to create campaign'),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) { toast.error('Title is required'); return }
    if (!form.goal_amount || isNaN(parseFloat(form.goal_amount))) {
      toast.error('Goal amount is required')
      return
    }
    mutation.mutate()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4
        bg-black/70 backdrop-blur-sm overflow-y-auto"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-lg rounded-2xl bg-gray-900 border border-gray-700 shadow-2xl my-4">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-800">
          <h2 className="text-lg font-semibold text-white">New Campaign</h2>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-white transition-colors text-xl leading-none">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Emoji + Title */}
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
              <label className="block text-xs text-gray-400 mb-1">Title <span className="text-red-400">*</span></label>
              <input
                value={form.title}
                onChange={(e) => set('title', e.target.value)}
                placeholder="e.g. Sunday League Fund"
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5
                  text-sm text-white placeholder-gray-600 focus:border-brand-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              rows={2}
              placeholder="Optional details about this campaign…"
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5
                text-sm text-white placeholder-gray-600 focus:border-brand-500 focus:outline-none resize-none"
            />
          </div>

          {/* Campaign type */}
          <div>
            <label className="block text-xs text-gray-400 mb-2">Campaign Type</label>
            <CampaignTypeSelector value={form.campaign_type} onChange={handleTypeChange} />
          </div>

          {/* Goal + Per person */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Goal Amount <span className="text-red-400">*</span></label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                <input
                  type="number"
                  value={form.goal_amount}
                  onChange={(e) => set('goal_amount', e.target.value)}
                  placeholder="500"
                  min="1"
                  step="0.01"
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 pl-7 pr-3 py-2.5
                    text-sm text-white placeholder-gray-600 focus:border-brand-500 focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Per Person</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                <input
                  type="number"
                  value={form.amount_per_person}
                  onChange={(e) => set('amount_per_person', e.target.value)}
                  placeholder="25"
                  min="0"
                  step="0.01"
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 pl-7 pr-3 py-2.5
                    text-sm text-white placeholder-gray-600 focus:border-brand-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Visibility mode */}
          <div>
            <label className="block text-xs text-gray-400 mb-2">Visibility on Public Board</label>
            <div className="flex gap-2 flex-wrap">
              {([
                ['full_name',       'Full name'],
                ['first_name_only', 'First name only'],
                ['anonymous',       'Anonymous'],
              ] as [VisibilityMode, string][]).map(([v, l]) => (
                <label key={v} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="visibility_mode"
                    value={v}
                    checked={form.visibility_mode === v}
                    onChange={() => set('visibility_mode', v)}
                    className="text-brand-500 focus:ring-brand-500 focus:ring-offset-gray-900"
                  />
                  <span className="text-sm text-gray-300">{l}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Anonymous toggle */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.allow_anonymous_contributions}
              onChange={(e) => set('allow_anonymous_contributions', e.target.checked)}
              className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-brand-500
                focus:ring-brand-500 focus:ring-offset-gray-900"
            />
            <span className="text-sm text-gray-300">Allow anonymous contributions</span>
          </label>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-gray-700 py-2.5 text-sm text-gray-400
                hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="flex-1 rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white
                hover:bg-brand-500 disabled:opacity-60 transition-colors"
            >
              {mutation.isPending ? 'Creating…' : 'Create Campaign'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
