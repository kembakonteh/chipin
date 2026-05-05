import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import type { Beneficiary, Campaign, Contributor } from '../../types'
import { computeStats, fmt } from '../../types'
import ProgressRing from '../../components/ProgressRing'
import CopyLinkBar from '../../components/CopyLinkBar'
import { api } from '../../lib/api'

interface Props {
  campaign: Campaign
  contributors: Contributor[]
}

export default function OverviewTab({ campaign, contributors }: Props) {
  const stats = computeStats(campaign, contributors)

  return (
    <div className="space-y-6">
      {/* Progress + key stats */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
        <div className="flex flex-col sm:flex-row items-center gap-8">
          <ProgressRing percent={stats.progress} size={160} strokeWidth={14} label="funded" />

          <div className="grid grid-cols-2 gap-x-10 gap-y-4 flex-1 w-full sm:w-auto">
            <Stat label="Total raised" value={fmt(stats.totalRaised, campaign.currency)} accent />
            <Stat label="Goal" value={fmt(stats.goalAmount, campaign.currency)} />
            <Stat label="Paid" value={String(stats.paidCount)} />
            <Stat label="Total contributors" value={String(stats.totalCount)} />
          </div>
        </div>
      </div>

      {/* Shareable link */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
        <h3 className="text-sm font-semibold text-white mb-3">Shareable link</h3>
        <CopyLinkBar campaign={campaign} contributors={contributors} />
      </div>

      {/* QR collection card */}
      <QrCardDownload slug={campaign.slug} />

      {/* Beneficiary profile (memorial/charity) */}
      {(campaign.campaign_type === 'memorial' || campaign.campaign_type === 'charity') && (
        <BeneficiaryCard campaign={campaign} />
      )}

      {/* Earnings summary */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
        <h3 className="text-sm font-semibold text-white mb-4">Earnings summary</h3>
        <div className="space-y-3">
          <EarningsRow label="Total raised" value={fmt(stats.totalRaised, campaign.currency)} />
          <EarningsRow
            label={`Platform fee (${campaign.platform_fee_pct}%)`}
            value={`− ${fmt(stats.platformFees, campaign.currency)}`}
            muted
          />
          <div className="border-t border-gray-800 pt-3">
            <EarningsRow label="Net to organizer" value={fmt(stats.net, campaign.currency)} accent />
          </div>
        </div>
      </div>
    </div>
  )
}

function QrCardDownload({ slug }: { slug: string }) {
  const [loadingPng, setLoadingPng] = useState(false)
  const [loadingPdf, setLoadingPdf] = useState(false)

  async function download(format: 'png' | 'pdf') {
    const set = format === 'png' ? setLoadingPng : setLoadingPdf
    set(true)
    try {
      const res = await api.get(`/campaigns/${slug}/qr-card?format=${format}`, {
        responseType: 'blob',
      })
      const url = URL.createObjectURL(res.data as Blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `chipin-${slug}-qr.${format}`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      // silent — user can retry
    } finally {
      set(false)
    }
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
      <h3 className="text-sm font-semibold text-white mb-1">Collection card</h3>
      <p className="text-xs text-gray-500 mb-4">
        Print this A5 card and display at collection points — contributors scan the QR to chip in
      </p>
      <div className="flex gap-3">
        <button
          onClick={() => download('png')}
          disabled={loadingPng}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-800 text-sm
            text-white hover:bg-gray-700 disabled:opacity-50 transition-colors"
        >
          {loadingPng ? '…' : '↓'} PNG
        </button>
        <button
          onClick={() => download('pdf')}
          disabled={loadingPdf}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-700 text-sm
            text-white hover:bg-brand-600 disabled:opacity-50 transition-colors"
        >
          {loadingPdf ? '…' : '↓'} PDF
        </button>
      </div>
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-xl font-bold mt-0.5 ${accent ? 'text-brand-300' : 'text-white'}`}>{value}</p>
    </div>
  )
}

function EarningsRow({ label, value, accent, muted }: {
  label: string; value: string; accent?: boolean; muted?: boolean
}) {
  return (
    <div className="flex justify-between items-center">
      <span className={`text-sm ${muted ? 'text-gray-500' : 'text-gray-300'}`}>{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${accent ? 'text-brand-300' : muted ? 'text-gray-500' : 'text-white'}`}>
        {value}
      </span>
    </div>
  )
}

// ── Beneficiary card ──────────────────────────────────────────────────────────

function BeneficiaryCard({ campaign }: { campaign: Campaign }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ display_name: '', story: '', location: '' })
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const qc = useQueryClient()

  const { data: beneficiary, isLoading } = useQuery<Beneficiary | null>({
    queryKey: ['beneficiary', campaign.slug],
    queryFn: () =>
      api.get<Beneficiary>(`/campaigns/${campaign.slug}/beneficiary`)
        .then(r => r.data)
        .catch(e => e?.response?.status === 404 ? null : Promise.reject(e)),
    staleTime: 30_000,
  })

  const isMemorial = campaign.campaign_type === 'memorial'

  function startEdit(b?: Beneficiary | null) {
    setForm({
      display_name: b?.display_name ?? '',
      story: b?.story ?? '',
      location: b?.location ?? '',
    })
    setPhotoPreview(b?.photo_url ?? null)
    setPhoto(null)
    setEditing(true)
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const fd = new FormData()
      if (form.display_name) fd.append('display_name', form.display_name)
      if (form.story) fd.append('story', form.story)
      if (form.location) fd.append('location', form.location)
      if (photo) fd.append('photo', photo)
      if (beneficiary) {
        await api.patch(`/campaigns/${campaign.slug}/beneficiary`, fd)
      } else {
        await api.post(`/campaigns/${campaign.slug}/beneficiary`, fd)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['beneficiary', campaign.slug] })
      toast.success('Profile saved!')
      setEditing(false)
    },
    onError: () => toast.error('Failed to save profile'),
  })

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/campaigns/${campaign.slug}/beneficiary`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['beneficiary', campaign.slug] })
      toast.success('Profile removed')
      setEditing(false)
    },
    onError: () => toast.error('Failed to remove profile'),
  })

  if (isLoading) return null

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-white">Beneficiary Profile</h3>
        {beneficiary && !editing && (
          <button
            type="button"
            onClick={() => startEdit(beneficiary)}
            className="text-xs text-gray-400 hover:text-white transition-colors"
          >
            Edit
          </button>
        )}
      </div>

      {!editing && !beneficiary && (
        <div className={`rounded-lg border border-dashed p-4 text-center
          ${isMemorial ? 'border-slate-700' : 'border-amber-900/40'}`}>
          <p className="text-sm text-gray-400 mb-3">
            {isMemorial
              ? 'Add a profile for the person being remembered to build emotional connection.'
              : 'Add a beneficiary profile to show contributors who they are helping.'}
          </p>
          <button
            type="button"
            onClick={() => startEdit()}
            className="rounded-lg bg-gray-800 px-4 py-2 text-xs font-medium text-white
              hover:bg-gray-700 transition-colors"
          >
            {isMemorial ? '🕊 Add Profile' : '❤️ Add Profile'}
          </button>
        </div>
      )}

      {!editing && beneficiary && (
        <div className="flex items-start gap-4">
          <div className="h-14 w-14 shrink-0 rounded-full overflow-hidden bg-gray-800 border border-gray-700">
            {beneficiary.photo_url
              ? <img src={beneficiary.photo_url} alt={beneficiary.display_name} className="h-full w-full object-cover" />
              : <div className="h-full w-full flex items-center justify-center text-2xl">
                  {isMemorial ? '🕊' : '❤️'}
                </div>
            }
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white">{beneficiary.display_name}</p>
            {beneficiary.location && (
              <p className="text-xs text-gray-400 mt-0.5">📍 {beneficiary.location}</p>
            )}
            {beneficiary.story && (
              <p className="text-xs text-gray-500 mt-1 line-clamp-2">{beneficiary.story}</p>
            )}
          </div>
        </div>
      )}

      {editing && (
        <div className="space-y-4">
          {/* Photo */}
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 shrink-0 rounded-full overflow-hidden bg-gray-800 border border-gray-700">
              {photoPreview
                ? <img src={photoPreview} alt="" className="h-full w-full object-cover" />
                : <div className="h-full w-full flex items-center justify-center text-2xl">
                    {isMemorial ? '🕊' : '❤️'}
                  </div>
              }
            </div>
            <label className="cursor-pointer rounded-lg border border-gray-700 px-3 py-1.5
              text-xs text-gray-300 hover:border-brand-500 hover:text-white transition-colors">
              Upload photo
              <input type="file" accept="image/*" className="hidden" onChange={e => {
                const f = e.target.files?.[0] ?? null
                setPhoto(f)
                if (f) setPhotoPreview(URL.createObjectURL(f))
              }} />
            </label>
          </div>

          <input
            value={form.display_name}
            onChange={e => setForm(p => ({ ...p, display_name: e.target.value }))}
            placeholder="Full name *"
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5
              text-sm text-white placeholder-gray-600 focus:border-brand-500 focus:outline-none"
          />
          <input
            value={form.location}
            onChange={e => setForm(p => ({ ...p, location: e.target.value }))}
            placeholder="Location (optional)"
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5
              text-sm text-white placeholder-gray-600 focus:border-brand-500 focus:outline-none"
          />
          <textarea
            value={form.story}
            onChange={e => setForm(p => ({ ...p, story: e.target.value }))}
            rows={3}
            maxLength={1000}
            placeholder="Story (optional)"
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5
              text-sm text-white placeholder-gray-600 focus:border-brand-500 focus:outline-none resize-none"
          />

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="flex-1 rounded-lg border border-gray-700 py-2 text-xs text-gray-400
                hover:text-white transition-colors"
            >
              Cancel
            </button>
            {beneficiary && (
              <button
                type="button"
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="rounded-lg border border-red-900 py-2 px-3 text-xs text-red-400
                  hover:border-red-700 hover:text-red-300 transition-colors disabled:opacity-50"
              >
                Remove
              </button>
            )}
            <button
              type="button"
              disabled={!form.display_name.trim() || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
              className="flex-1 rounded-lg bg-brand-600 py-2 text-xs font-semibold text-white
                hover:bg-brand-500 disabled:opacity-60 transition-colors"
            >
              {saveMutation.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
