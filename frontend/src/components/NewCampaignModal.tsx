import { useState } from 'react'
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
  accept_contributions: boolean
}

interface BeneficiaryForm {
  display_name: string
  story: string
  location: string
  party_name: string
  office_sought: string
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
  accept_contributions: true,
}

const INIT_BEN: BeneficiaryForm = {
  display_name: '',
  story: '',
  location: '',
  party_name: '',
  office_sought: '',
  photo: null,
}

type Step = 'template' | 'details' | 'beneficiary'

const PARTY_COLOR_PRESETS = ['#FF0000', '#0000FF', '#008000', '#FFD700', '#800080', '#FF6600', '#FFFFFF', '#000000']

const TITLE_PLACEHOLDERS: Record<string, string> = {
  'Sports & Team Dues':        'e.g. Sunday League Spring Season Fund',
  'Religious Collection':      'e.g. Mosque Ramadan Collection 2025',
  'Funeral Repatriation':      'e.g. Repatriation Fund for Uncle Lamin',
  'Wedding Gift Collection':   'e.g. Gift Collection for Sara & James',
  'Baby Shower':               'e.g. Baby Shower Collection for Amie',
  'Community Emergency Fund':  'e.g. Emergency Relief Fund for the Danso Family',
  'Annual Association Dues':   'e.g. GASA Annual Dues 2025',
  'Graduation Celebration':    'e.g. Graduation Celebration for Fatou',
  'Naming Ceremony':           'e.g. Naming Ceremony for Baby Jallow',
  'Birthday Celebration':      'e.g. Birthday Celebration for Adama',
}
const DEFAULT_TITLE_PLACEHOLDER = 'e.g. My Campaign'

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
  const [honoreePhoto, setHonoreePhoto] = useState<File | null>(null)
  const [honoreePhotoPreview, setHonoreePhotoPreview] = useState<string | null>(null)
  const [eventDate, setEventDate] = useState('')
  const [eventTime, setEventTime] = useState('')
  const [eventLocation, setEventLocation] = useState('')
  const [eventRsvp, setEventRsvp] = useState('')
  const [partyColor, setPartyColor] = useState('#FF0000')
  const [titlePlaceholder, setTitlePlaceholder] = useState(DEFAULT_TITLE_PLACEHOLDER)
  const qc = useQueryClient()

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
      accept_contributions: true,
    }))
    setTitlePlaceholder(TITLE_PLACEHOLDERS[t.name] ?? DEFAULT_TITLE_PLACEHOLDER)
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
        goal_amount: form.accept_contributions && form.has_goal && form.goal_amount ? parseFloat(form.goal_amount) : null,
        contribution_note: form.accept_contributions && !form.has_goal && form.contribution_note ? form.contribution_note.trim() : null,
        amount_per_person: !form.accept_contributions ? 0 : form.amount_per_person ? parseFloat(form.amount_per_person) : null,
        due_date: form.due_date || null,
        visibility_mode: form.visibility_mode,
        allow_anonymous_contributions: form.allow_anonymous_contributions,
        ...(form.template_id ? { template_id: form.template_id } : {}),
        ...(form.org_id ? { org_id: form.org_id } : {}),
      }).then(r => r.data),
    onSuccess: async (campaign) => {
      qc.invalidateQueries({ queryKey: ['campaigns'] })
      qc.invalidateQueries({ queryKey: ['org-campaigns'] })
      if (campaign.campaign_type === 'celebration' && honoreePhoto) {
        try {
          const fd = new FormData()
          fd.append('display_name', ' ')
          fd.append('photo', honoreePhoto)
          await api.post(`/campaigns/${campaign.slug}/beneficiary`, fd)
          qc.invalidateQueries({ queryKey: ['beneficiary', campaign.slug] })
        } catch {
          // photo upload failed — campaign still created successfully
        }
      }
      if (campaign.campaign_type === 'celebration' && (eventDate || eventTime || eventLocation || eventRsvp)) {
        try {
          const patch: Record<string, string> = {}
          if (eventDate)     patch.event_date     = eventDate
          if (eventTime)     patch.event_time     = eventTime
          if (eventLocation) patch.event_location = eventLocation
          if (eventRsvp)     patch.event_rsvp     = eventRsvp
          await api.patch(`/campaigns/${campaign.slug}`, patch)
          qc.invalidateQueries({ queryKey: ['campaign', campaign.slug] })
        } catch {
          // event details failed — campaign still created successfully
        }
      }
      if (campaign.campaign_type === 'political' && partyColor) {
        try {
          await api.patch(`/campaigns/${campaign.slug}`, { party_color: partyColor })
          qc.invalidateQueries({ queryKey: ['campaign', campaign.slug] })
        } catch {
          // party color failed — campaign still created successfully
        }
      }
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
      if (benForm.party_name) fd.append('party_name', benForm.party_name)
      if (benForm.office_sought) fd.append('office_sought', benForm.office_sought)
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
    if (form.accept_contributions && form.has_goal && (!form.goal_amount || isNaN(parseFloat(form.goal_amount)))) {
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
      className="fixed inset-0 z-50 overflow-y-auto bg-gray-900
        md:bg-black/70 md:backdrop-blur-sm md:flex md:items-center md:justify-center md:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full min-h-full
          md:min-h-0 md:max-w-lg md:rounded-2xl md:bg-gray-900 md:border md:border-gray-700
          md:shadow-2xl md:my-4 md:max-h-[85vh] md:overflow-y-auto"
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
              onClick={() => { setTitlePlaceholder(DEFAULT_TITLE_PLACEHOLDER); setStep('details') }}
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
            {/* Title — first field, nothing above it */}
            <div>
              <label className="block text-xs text-gray-400 mb-1">Title <span className="text-red-400">*</span></label>
              <input
                value={form.title}
                onChange={e => setF('title', e.target.value)}
                placeholder={titlePlaceholder}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5
                  text-sm text-white placeholder-gray-600 focus:border-brand-500 focus:outline-none"
              />
            </div>

            {/* Emoji + Description */}
            <div className="flex gap-3 items-start">
              <div className="w-16 shrink-0">
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
            </div>

            {/* Campaign type — only shown when starting from scratch; templates set this automatically */}
            {!form.template_id && (
              <div>
                <label className="block text-xs text-gray-400 mb-2">Campaign Type</label>
                <CampaignTypeSelector value={form.campaign_type} onChange={handleTypeChange} />
              </div>
            )}

            {/* Honoree Photo — celebration only */}
            {form.campaign_type === 'celebration' && (
              <div>
                <p className="text-xs text-gray-400 mb-2">
                  Honoree Photo <span className="text-gray-600">(optional)</span>
                </p>
                <div className="flex items-center gap-4">
                  <label className="cursor-pointer shrink-0">
                    <div className={`h-24 w-24 rounded-full overflow-hidden border-2 bg-gray-800
                      flex items-center justify-center transition-colors
                      ${honoreePhotoPreview ? 'border-amber-500' : 'border-gray-700 hover:border-amber-600'}`}>
                      {honoreePhotoPreview
                        ? <img src={honoreePhotoPreview} className="h-full w-full object-cover" alt="" />
                        : <span className="text-3xl">📷</span>
                      }
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={e => {
                        const file = e.target.files?.[0] ?? null
                        setHonoreePhoto(file)
                        setHonoreePhotoPreview(file ? URL.createObjectURL(file) : null)
                      }}
                    />
                  </label>
                  <div>
                    <p className="text-xs text-gray-400">Featured on your campaign page</p>
                    {honoreePhotoPreview && (
                      <button
                        type="button"
                        onClick={() => { setHonoreePhoto(null); setHonoreePhotoPreview(null) }}
                        className="text-xs text-gray-600 hover:text-gray-400 mt-1 transition-colors"
                      >
                        ✕ Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Event Details — celebration only */}
            {form.campaign_type === 'celebration' && (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Event Details <span className="font-normal normal-case text-gray-600">(optional)</span>
                </p>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Event Date</label>
                  <input
                    type="date"
                    value={eventDate}
                    onChange={e => setEventDate(e.target.value)}
                    className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5
                      text-sm text-white focus:border-brand-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Event Time</label>
                  <input
                    type="text"
                    value={eventTime}
                    onChange={e => setEventTime(e.target.value)}
                    placeholder="e.g. 12 PM – 8 PM"
                    maxLength={50}
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5
                      text-sm text-white placeholder-gray-600 focus:border-brand-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Event Location</label>
                  <input
                    type="text"
                    value={eventLocation}
                    onChange={e => setEventLocation(e.target.value)}
                    placeholder="e.g. Lynndale Park, 18927 72nd Ave W, Lynnwood WA"
                    maxLength={500}
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5
                      text-sm text-white placeholder-gray-600 focus:border-brand-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">RSVP Contact</label>
                  <input
                    type="text"
                    value={eventRsvp}
                    onChange={e => setEventRsvp(e.target.value)}
                    placeholder="e.g. (425) 750-7106"
                    maxLength={255}
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5
                      text-sm text-white placeholder-gray-600 focus:border-brand-500 focus:outline-none"
                  />
                </div>
              </div>
            )}

            {/* Party color picker — political only */}
            {form.campaign_type === 'political' && (
              <div>
                <p className="text-xs text-gray-400 mb-2">
                  Party Color <span className="text-gray-600">(optional)</span>
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  {PARTY_COLOR_PRESETS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setPartyColor(c)}
                      className="h-8 w-8 rounded-full border-2 transition-all hover:scale-110"
                      style={{
                        backgroundColor: c,
                        borderColor: partyColor === c ? 'white' : 'transparent',
                        outline: partyColor === c ? '2px solid #6b7280' : 'none',
                        outlineOffset: '2px',
                        boxShadow: c === '#FFFFFF' ? '0 0 0 1px #4b5563' : undefined,
                      }}
                    />
                  ))}
                  <input
                    type="color"
                    value={partyColor}
                    onChange={e => setPartyColor(e.target.value)}
                    className="h-8 w-8 rounded cursor-pointer border border-gray-600 bg-transparent p-0.5"
                    title="Custom color"
                  />
                </div>
                <p className="text-xs text-gray-600 mt-1.5">Styles your public campaign page</p>
              </div>
            )}

            {/* Accept contributions toggle — celebration only */}
            {form.campaign_type === 'celebration' && (
              <label className="flex items-center gap-3 cursor-pointer rounded-xl border border-amber-800/40 bg-amber-950/30 px-4 py-3">
                <input
                  type="checkbox"
                  checked={form.accept_contributions}
                  onChange={e => setF('accept_contributions', e.target.checked)}
                  className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-brand-500
                    focus:ring-brand-500 focus:ring-offset-gray-900"
                />
                <div>
                  <span className="text-sm text-amber-200">Accept contributions?</span>
                  <span className="block text-xs text-amber-400/70">
                    Turn off if this is an invitation only — no gifts expected.
                  </span>
                </div>
              </label>
            )}

            {/* Goal toggle + amounts */}
            {form.accept_contributions && (
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
            )}

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

            {/* Location / Political fields */}
            {form.campaign_type === 'political' ? (
              <>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Party Name (optional)</label>
                  <input
                    value={benForm.party_name}
                    onChange={e => setBenForm(p => ({ ...p, party_name: e.target.value }))}
                    placeholder="e.g. United Democratic Party"
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5
                      text-sm text-white placeholder-gray-600 focus:border-brand-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Office Sought (optional)</label>
                  <input
                    value={benForm.office_sought}
                    onChange={e => setBenForm(p => ({ ...p, office_sought: e.target.value }))}
                    placeholder="e.g. National Assembly Member"
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5
                      text-sm text-white placeholder-gray-600 focus:border-brand-500 focus:outline-none"
                  />
                </div>
              </>
            ) : (
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
            )}

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
