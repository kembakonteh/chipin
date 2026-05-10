import { useState, useLayoutEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { api } from '../lib/api'
import type { Campaign, CampaignTemplate, CampaignType, Org, VisibilityMode } from '../types'
import CampaignTypeSelector from './CampaignTypeSelector'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Form {
  emoji: string
  title: string
  description: string
  campaign_type: CampaignType
  has_goal: boolean
  goal_amount: string
  contribution_note: string
  amount_per_person: string
  due_date: string
  visibility_mode: VisibilityMode
  allow_anonymous_contributions: boolean
  template_id: string | null
  org_id: string | null
}

interface BeneficiaryForm {
  display_name: string
  story: string
  location: string
  photo: File | null
}

const INIT_FORM: Form = {
  emoji: '⚽',
  title: '',
  description: '',
  campaign_type: 'general',
  has_goal: true,
  goal_amount: '',
  contribution_note: '',
  amount_per_person: '',
  due_date: '',
  visibility_mode: 'full_name',
  allow_anonymous_contributions: true,
  template_id: null,
  org_id: null,
}

const INIT_BEN: BeneficiaryForm = {
  display_name: '',
  story: '',
  location: '',
  photo: null,
}

type Step = 'template' | 'details' | 'beneficiary'

interface Props {
  onClose: () => void
  onCreated?: (c: Campaign) => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function NewCampaignModal({ onClose, onCreated }: Props) {
  const [step, setStep] = useState<Step>('template')
  const [form, setForm] = useState<Form>(INIT_FORM)
  const [benForm, setBenForm] = useState<BeneficiaryForm>(INIT_BEN)
  const [createdCampaign, setCreatedCampaign] = useState<Campaign | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const qc = useQueryClient()
  const scrollRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [step])

  const { data: templates = [] } = useQuery<CampaignTemplate[]>({
    queryKey: ['templates'],
    queryFn: () => api.get<CampaignTemplate[]>('/templates').then(r => r.data),
    staleTime: Infinity,
  })

  const { data: orgs = [] } = useQuery<Org[]>({
    queryKey: ['orgs'],
    queryFn: () => api.get<Org[]>('/orgs').then(r => r.data as Org[]),
  })

  function setF<K extends keyof Form>(k: K, v: Form[K]) {
    setForm(prev => ({ ...prev, [k]: v }))
  }

  function applyTemplate(t: CampaignTemplate) {
    setForm(prev => ({
      ...prev,
      emoji: t.emoji,
      title: '',
      description: '',
      campaign_type: t.campaign_type,
      goal_amount: '',
      amount_per_person: t.default_amount_per_person != null ? String(t.default_amount_per_person) : '',
      visibility_mode: t.default_visibility_mode,
      allow_anonymous_contributions: t.default_anonymous,
      template_id: t.id,
    }))
    setStep('details')
  }

  function handleTypeChange(t: CampaignType) {
    setForm(prev => ({
      ...prev,
      campaign_type: t,
      ...(t === 'memorial' || t === 'charity'
        ? { allow_anonymous_contributions: true, visibility_mode: 'first_name_only' as VisibilityMode }
        : {}),
    }))
  }

  // ── Campaign creation mutation ─────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: () =>
      api.post<Campaign>('/campaigns', {
        emoji: form.emoji || '⚽',
        title: form.title,
        description: form.description || null,
        campaign_type: form.campaign_type,
        goal_amount: form.has_goal && form.goal_amount ? parseFloat(form.goal_amount) : null,
        contribution_note: !form.has_goal && form.contribution_note ? form.contribution_note.trim() : null,
        amount_per_person: form.amount_per_person ? parseFloat(form.amount_per_person) : null,
        due_date: form.due_date || null,
        visibility_mode: form.visibility_mode,
        allow_anonymous_contributions: form.allow_anonymous_contributions,
        ...(form.template_id ? { template_id: form.template_id } : {}),
        ...(form.org_id ? { org_id: form.org_id } : {}),
      }).then(r => r.data),
    onSuccess: (campaign) => {
      qc.invalidateQueries({ queryKey: ['campaigns'] })
      toast.success('Campaign created!')
      setCreatedCampaign(campaign)
      if (campaign.campaign_type === 'memorial' || campaign.campaign_type === 'charity') {
        setStep('beneficiary')
      } else {
        onCreated?.(campaign)
        onClose()
      }
    },
    onError: () => toast.error('Failed to create campaign'),
  })

  // ── Beneficiary creation mutation ──────────────────────────────────────────

  const benMutation = useMutation({
    mutationFn: async () => {
      if (!createdCampaign) return
      const fd = new FormData()
      fd.append('display_name', benForm.display_name)
      if (benForm.story) fd.append('story', benForm.story)
      if (benForm.location) fd.append('location', benForm.location)
      if (benForm.photo) fd.append('photo', benForm.photo)
      await api.post(`/campaigns/${createdCampaign.slug}/beneficiary`, fd)
    },
    onSuccess: () => {
      if (createdCampaign) {
        qc.invalidateQueries({ queryKey: ['campaigns'] })
        qc.invalidateQueries({ queryKey: ['beneficiary', createdCampaign.slug] })
        toast.success('Profile added!')
        onCreated?.(createdCampaign)
      }
      onClose()
    },
    onError: () => toast.error('Failed to save beneficiary profile'),
  })

  function handleDetailsSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) { toast.error('Title is required'); return }
    if (form.has_goal && (!form.goal_amount || isNaN(parseFloat(form.goal_amount)))) {
      toast.error('Enter a goal amount, or uncheck "Set a goal"')
      return
    }
    createMutation.mutate()
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    setBenForm(prev => ({ ...prev, photo: file }))
    if (file) {
      const url = URL.createObjectURL(file)
      setPhotoPreview(url)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const needsBeneficiary = form.campaign_type === 'memorial' || form.campaign_type === 'charity'

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4
        bg-black/70 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={scrollRef}
        className="w-full max-w-lg rounded-2xl bg-gray-900 border border-gray-700 shadow-2xl my-4
          max-h-[calc(100svh-2rem)] overflow-y-auto"
      >

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-800">
          <div>
            <h2 className="text-lg font-semibold text-white">
              {step === 'template' && 'New Campaign'}
              {step === 'details' && 'Campaign Details'}
              {step === 'beneficiary' && 'Beneficiary Profile'}
            </h2>
            <div className="flex gap-1.5 mt-2">
              {(['template', 'details', ...(needsBeneficiary ? ['beneficiary'] : [])] as Step[]).map((s) => (
                <div
                  key={s}
                  className={`h-1 rounded-full transition-all ${
                    s === step ? 'w-6 bg-brand-500' : 'w-3 bg-gray-700'
                  }`}
                />
              ))}
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-white transition-colors text-xl leading-none">✕</button>
        </div>

        {/* Step 1: Template picker */}
        {step === 'template' && (
          <div className="p-6">
            <p className="text-xs text-gray-400 mb-4">
              Choose a template to get started quickly, or start from scratch.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
              {templates.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => applyTemplate(t)}
                  className="flex flex-col items-center gap-1.5 rounded-xl border border-gray-700
                    bg-gray-800 p-3 hover:border-brand-500 hover:bg-gray-750 transition-all
                    text-center group"
                >
                  <span className="text-2xl">{t.emoji}</span>
                  <span className="text-xs font-medium text-gray-300 group-hover:text-white leading-tight">
                    {t.name}
                  </span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setStep('details')}
              className="w-full rounded-xl border border-dashed border-gray-700 py-3 text-sm
                text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
            >
              + Start from scratch
            </button>
          </div>
        )}

        {/* Step 2: Details form */}
        {step === 'details' && (
          <form onSubmit={handleDetailsSubmit} className="p-6 space-y-5">
            {/* Emoji + Title */}
            <div className="flex gap-3">
              <div className="w-16">
                <label className="block text-xs text-gray-400 mb-1">Emoji</label>
                <input
                  value={form.emoji}
                  onChange={e => setF('emoji', e.target.value)}
                  maxLength={4}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-2 py-2.5
                    text-center text-2xl text-white focus:border-brand-500 focus:outline-none"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-gray-400 mb-1">Title <span className="text-red-400">*</span></label>
                <input
                  value={form.title}
                  onChange={e => setF('title', e.target.value)}
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
                onChange={e => setF('description', e.target.value)}
                rows={2}
                placeholder={
                  form.has_goal
                    ? 'Optional details about this campaign…'
                    : 'e.g. Members can contribute any amount they wish. Every bit helps!'
                }
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5
                  text-sm text-white placeholder-gray-600 focus:border-brand-500 focus:outline-none resize-none"
              />
              {!form.has_goal && !form.description && (
                <p className="text-xs text-gray-500 mt-1">
                  Tip: let contributors know what's expected — e.g. a minimum, a suggested amount, or just encourage them to give what they can.
                </p>
              )}
            </div>

            {/* Campaign type — only shown when starting from scratch; templates set this automatically */}
            {!form.template_id && (
              <div>
                <label className="block text-xs text-gray-400 mb-2">Campaign Type</label>
                <CampaignTypeSelector value={form.campaign_type} onChange={handleTypeChange} />
              </div>
            )}

            {/* Goal toggle + amounts */}
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.has_goal}
                  onChange={e => setF('has_goal', e.target.checked)}
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
                    <label className="block text-xs text-gray-400 mb-1">Goal Amount <span className="text-red-400">*</span></label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                      <input
                        type="number"
                        value={form.goal_amount}
                        onChange={e => setF('goal_amount', e.target.value)}
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
                        onChange={e => setF('amount_per_person', e.target.value)}
                        placeholder="25"
                        min="0"
                        step="0.01"
                        className="w-full rounded-lg border border-gray-700 bg-gray-800 pl-7 pr-3 py-2.5
                          text-sm text-white placeholder-gray-600 focus:border-brand-500 focus:outline-none"
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
                      onChange={e => setF('contribution_note', e.target.value)}
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
                    <label className="block text-xs text-gray-400 mb-1">Per Person (optional)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                      <input
                        type="number"
                        value={form.amount_per_person}
                        onChange={e => setF('amount_per_person', e.target.value)}
                        placeholder="25"
                        min="0"
                        step="0.01"
                        className="w-full rounded-lg border border-gray-700 bg-gray-800 pl-7 pr-3 py-2.5
                          text-sm text-white placeholder-gray-600 focus:border-brand-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Due date */}
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Payment deadline <span className="text-gray-600">(optional)</span>
              </label>
              <input
                type="date"
                value={form.due_date}
                onChange={e => setF('due_date', e.target.value)}
                className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5
                  text-sm text-white focus:border-brand-500 focus:outline-none"
              />
              <p className="text-xs text-gray-600 mt-1">
                Auto-sends reminders 7, 3 &amp; 1 day(s) before. Campaign auto-completes when passed.
              </p>
            </div>

            {/* Visibility */}
            <div>
              <label className="block text-xs text-gray-400 mb-2">Visibility on Public Board</label>
              <div className="flex gap-2 flex-wrap">
                {([
                  ['full_name', 'Full name'],
                  ['first_name_only', 'First name only'],
                  ['anonymous', 'Anonymous'],
                ] as [VisibilityMode, string][]).map(([v, l]) => (
                  <label key={v} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="visibility_mode"
                      value={v}
                      checked={form.visibility_mode === v}
                      onChange={() => setF('visibility_mode', v)}
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
                onChange={e => setF('allow_anonymous_contributions', e.target.checked)}
                className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-brand-500
                  focus:ring-brand-500 focus:ring-offset-gray-900"
              />
              <span className="text-sm text-gray-300">Allow anonymous contributions</span>
            </label>

            {/* Org selector */}
            {orgs.length > 0 && (
              <div>
                <label className="block text-xs text-gray-400 mb-1">Link to Organization</label>
                <select
                  value={form.org_id ?? ''}
                  onChange={e => setF('org_id', e.target.value || null)}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5
                    text-sm text-white focus:border-brand-500 focus:outline-none"
                >
                  <option value="">— No organization —</option>
                  {orgs.map(o => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
                {form.org_id && (
                  <p className="text-xs text-gray-500 mt-1">
                    All active org members will be auto-imported as contributors.
                  </p>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStep('template')}
                className="flex-1 rounded-lg border border-gray-700 py-2.5 text-sm text-gray-400
                  hover:text-white transition-colors"
              >
                ← Back
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="flex-1 rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white
                  hover:bg-brand-500 disabled:opacity-60 transition-colors"
              >
                {createMutation.isPending
                  ? 'Creating…'
                  : needsBeneficiary
                    ? 'Next: Beneficiary →'
                    : 'Create Campaign'}
              </button>
            </div>
          </form>
        )}

        {/* Step 3: Beneficiary */}
        {step === 'beneficiary' && (
          <div className="p-6 space-y-5">
            <div className={`rounded-xl p-4 mb-1 ${
              form.campaign_type === 'memorial'
                ? 'bg-slate-800/60 border border-slate-700'
                : 'bg-amber-950/40 border border-amber-900/40'
            }`}>
              <p className={`text-xs leading-relaxed ${
                form.campaign_type === 'memorial' ? 'text-slate-300' : 'text-amber-200'
              }`}>
                {form.campaign_type === 'memorial'
                  ? 'Adding a beneficiary profile helps contributors know who they are supporting and builds trust. This is optional but strongly recommended.'
                  : 'A beneficiary profile shows contributors exactly who they are helping. Adding one significantly increases donation rates.'}
              </p>
            </div>

            {/* Photo upload */}
            <div className="flex items-center gap-4">
              <div className={`h-20 w-20 shrink-0 rounded-full overflow-hidden flex items-center justify-center
                border-2 ${form.campaign_type === 'memorial' ? 'border-slate-600' : 'border-amber-700/50'}
                bg-gray-800`}>
                {photoPreview
                  ? <img src={photoPreview} className="h-full w-full object-cover" alt="" />
                  : <span className="text-3xl">{form.campaign_type === 'memorial' ? '🕊' : '❤️'}</span>
                }
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Photo (optional)</label>
                <label className="cursor-pointer inline-flex items-center gap-2 rounded-lg border
                  border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-300 hover:border-brand-500
                  hover:text-white transition-colors">
                  <span>Upload photo</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handlePhotoChange}
                  />
                </label>
                {benForm.photo && (
                  <p className="text-xs text-gray-500 mt-1 truncate max-w-[140px]">{benForm.photo.name}</p>
                )}
              </div>
            </div>

            {/* Name */}
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Full name <span className="text-red-400">*</span>
              </label>
              <input
                value={benForm.display_name}
                onChange={e => setBenForm(p => ({ ...p, display_name: e.target.value }))}
                placeholder={form.campaign_type === 'memorial' ? 'e.g. Mama Fatou Jallow' : 'e.g. Adama Ceesay'}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5
                  text-sm text-white placeholder-gray-600 focus:border-brand-500 focus:outline-none"
              />
            </div>

            {/* Location */}
            <div>
              <label className="block text-xs text-gray-400 mb-1">Location (optional)</label>
              <input
                value={benForm.location}
                onChange={e => setBenForm(p => ({ ...p, location: e.target.value }))}
                placeholder="e.g. Banjul, The Gambia"
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5
                  text-sm text-white placeholder-gray-600 focus:border-brand-500 focus:outline-none"
              />
            </div>

            {/* Story */}
            <div>
              <label className="block text-xs text-gray-400 mb-1">Story (optional)</label>
              <textarea
                value={benForm.story}
                onChange={e => setBenForm(p => ({ ...p, story: e.target.value }))}
                rows={3}
                maxLength={1000}
                placeholder={form.campaign_type === 'memorial'
                  ? 'Share a little about this person and what they meant to the community…'
                  : 'Tell contributors about the person you are raising funds for…'
                }
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5
                  text-sm text-white placeholder-gray-600 focus:border-brand-500 focus:outline-none resize-none"
              />
              <p className="text-xs text-gray-600 text-right mt-1">{benForm.story.length}/1000</p>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => {
                  if (createdCampaign) { onCreated?.(createdCampaign); onClose() }
                }}
                className="flex-1 rounded-lg border border-gray-700 py-2.5 text-sm text-gray-400
                  hover:text-white transition-colors"
              >
                Skip
              </button>
              <button
                type="button"
                disabled={!benForm.display_name.trim() || benMutation.isPending}
                onClick={() => benMutation.mutate()}
                className="flex-1 rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white
                  hover:bg-brand-500 disabled:opacity-60 transition-colors"
              >
                {benMutation.isPending ? 'Saving…' : 'Save Profile'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
