import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { api } from '../../lib/api'
import type { Campaign, Contributor } from '../../types'
import ContributorRow from '../../components/ContributorRow'
import ManualPayModal from '../../components/ManualPayModal'

interface Props {
  campaign: Campaign
  contributors: Contributor[]
}

type PaidVia = 'zelle' | 'cashapp' | 'cash' | 'card' | 'manual'

interface AddForm {
  name: string
  email: string
  amount: string
  is_anonymous: boolean
  paid_via: PaidVia | null
  note: string
}

const EMPTY_FORM: AddForm = { name: '', email: '', amount: '', is_anonymous: false, paid_via: null, note: '' }

const PAY_METHODS: { value: PaidVia; label: string; icon: string }[] = [
  { value: 'zelle',   label: 'Zelle',    icon: '💜' },
  { value: 'cashapp', label: 'CashApp',  icon: '💚' },
  { value: 'cash',    label: 'Cash',     icon: '💵' },
  { value: 'manual',  label: 'Other',    icon: '✏️' },
]

export default function ContributorsTab({ campaign, contributors }: Props) {
  const [payTarget, setPayTarget] = useState<Contributor | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState<AddForm>(EMPTY_FORM)
  const [exporting, setExporting] = useState(false)
  const qc = useQueryClient()

  async function handleExport() {
    setExporting(true)
    try {
      const res = await api.get(`/campaigns/${campaign.slug}/contributors/export`, {
        responseType: 'blob',
      })
      const url = URL.createObjectURL(res.data as Blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${campaign.slug}-contributors.csv`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  const paid = contributors.filter(c => c.paid)
  const unpaid = contributors.filter(c => !c.paid)

  const addMutation = useMutation({
    mutationFn: () =>
      api.post<Contributor>(`/campaigns/${campaign.slug}/contributors`, {
        name: form.name.trim(),
        email: form.email.trim() || null,
        amount: form.amount ? parseFloat(form.amount) : null,
        is_anonymous: form.is_anonymous,
        paid_via: form.paid_via || null,
        note: form.note.trim() || null,
      }).then(r => r.data),
    onSuccess: (added) => {
      qc.invalidateQueries({ queryKey: ['contributors', campaign.slug] })
      toast.success(added.paid ? `${added.name} added and marked paid` : 'Contributor added')
      setForm(EMPTY_FORM)
      setShowAdd(false)
    },
    onError: () => toast.error('Failed to add contributor'),
  })

  function handleAddSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { toast.error('Name is required'); return }
    addMutation.mutate()
  }

  function handleReminder(c: Contributor) {
    if (c.phone) {
      const msg = `Hi ${c.name.split(' ')[0]}! Just a reminder to chip in for "${campaign.title}". Thanks 💚`
      window.open(`https://wa.me/${c.phone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`, '_blank')
    } else {
      toast(`No phone number for ${c.name}`, { icon: 'ℹ️' })
    }
  }

  function handleRemindAll() {
    const withPhone = unpaid.filter(c => c.phone)
    if (withPhone.length === 0) {
      toast('No unpaid contributors with a phone number', { icon: 'ℹ️' })
      return
    }
    const msg = `Hi! Just a reminder to chip in for "${campaign.title}". Thanks 💚`
    withPhone.forEach(c => {
      window.open(`https://wa.me/${c.phone!.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`, '_blank')
    })
    toast.success(`Opened WhatsApp for ${withPhone.length} contributor${withPhone.length > 1 ? 's' : ''}`)
  }

  return (
    <div className="space-y-4">
      {/* Actions bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-gray-400">
          <span className="text-white font-medium">{paid.length}</span> paid ·{' '}
          <span className="text-gray-500">{unpaid.length} unpaid</span>
        </p>
        <div className="flex gap-2 flex-wrap">
          {unpaid.length > 0 && (
            <button
              type="button"
              onClick={handleRemindAll}
              className="rounded-lg border border-green-800 bg-green-900/30 px-3 py-1.5 text-xs
                font-medium text-green-300 hover:bg-green-800/50 transition-colors"
            >
              📱 Remind all unpaid
            </button>
          )}
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting || contributors.length === 0}
            className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs
              font-medium text-gray-300 hover:bg-gray-700 disabled:opacity-40 transition-colors"
          >
            {exporting ? 'Exporting…' : '⬇ Export CSV'}
          </button>
          <button
            type="button"
            onClick={() => setShowAdd(v => !v)}
            className="rounded-lg border border-brand-700 bg-brand-700/20 px-3 py-1.5 text-xs
              font-medium text-brand-300 hover:bg-brand-700/40 transition-colors"
          >
            {showAdd ? 'Cancel' : '＋ Add contributor'}
          </button>
        </div>
      </div>

      {/* Add contributor form */}
      {showAdd && (
        <form
          onSubmit={handleAddSubmit}
          className="rounded-xl border border-brand-700/40 bg-brand-900/20 p-4 space-y-4"
        >
          <p className="text-sm font-medium text-brand-200">Add contributor</p>

          {/* Name + email */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              value={form.name}
              onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))}
              placeholder="Full name *"
              className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white
                placeholder-gray-600 focus:border-brand-500 focus:outline-none"
            />
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm(p => ({ ...p, email: e.target.value }))}
              placeholder="Email (optional)"
              className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white
                placeholder-gray-600 focus:border-brand-500 focus:outline-none"
            />
          </div>

          {/* Amount + anonymous */}
          <div className="flex gap-3 items-center flex-wrap">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
              <input
                type="number"
                value={form.amount}
                onChange={(e) => setForm(p => ({ ...p, amount: e.target.value }))}
                placeholder={campaign.amount_per_person ?? 'Amount'}
                min="0"
                step="0.01"
                className="rounded-lg border border-gray-700 bg-gray-800 pl-7 pr-3 py-2 text-sm text-white
                  placeholder-gray-600 focus:border-brand-500 focus:outline-none w-32"
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_anonymous}
                onChange={(e) => setForm(p => ({ ...p, is_anonymous: e.target.checked }))}
                className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-brand-500
                  focus:ring-brand-500 focus:ring-offset-gray-900"
              />
              <span className="text-sm text-gray-300">Anonymous 🔒</span>
            </label>
          </div>

          {/* Payment method */}
          <div className="space-y-2">
            <p className="text-xs text-gray-400">Already paid? Select method:</p>
            <div className="flex flex-wrap gap-2">
              {PAY_METHODS.map(m => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setForm(p => ({ ...p, paid_via: p.paid_via === m.value ? null : m.value }))}
                  className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium
                    transition-colors ${
                      form.paid_via === m.value
                        ? 'border-brand-500 bg-brand-600/30 text-brand-200'
                        : 'border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-300'
                    }`}
                >
                  <span>{m.icon}</span>{m.label}
                </button>
              ))}
              {form.paid_via && (
                <button
                  type="button"
                  onClick={() => setForm(p => ({ ...p, paid_via: null, note: '' }))}
                  className="text-xs text-gray-500 hover:text-gray-300 px-1 transition-colors"
                >
                  ✕ clear
                </button>
              )}
            </div>
            {form.paid_via && (
              <input
                value={form.note}
                onChange={(e) => setForm(p => ({ ...p, note: e.target.value }))}
                placeholder="Reference / confirmation number (optional)"
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white
                  placeholder-gray-600 focus:border-brand-500 focus:outline-none"
              />
            )}
          </div>

          <button
            type="submit"
            disabled={addMutation.isPending}
            className="w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white
              hover:bg-brand-500 disabled:opacity-60 transition-colors"
          >
            {addMutation.isPending
              ? 'Adding…'
              : form.paid_via
                ? `Add & mark paid via ${PAY_METHODS.find(m => m.value === form.paid_via)?.label}`
                : 'Add (unpaid)'}
          </button>
        </form>
      )}

      {/* Contributor list */}
      {contributors.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-700 p-10 text-center">
          <p className="text-gray-500 text-sm">No contributors yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {paid.length > 0 && (
            <>
              <p className="text-xs text-gray-500 uppercase tracking-wide px-1">Paid ({paid.length})</p>
              {paid.map(c => (
                <ContributorRow key={c.id} contributor={c} />
              ))}
            </>
          )}
          {unpaid.length > 0 && (
            <>
              <p className="text-xs text-gray-500 uppercase tracking-wide px-1 mt-4">Unpaid ({unpaid.length})</p>
              {unpaid.map(c => (
                <ContributorRow
                  key={c.id}
                  contributor={c}
                  onMarkPaid={setPayTarget}
                  onSendReminder={handleReminder}
                />
              ))}
            </>
          )}
        </div>
      )}

      {payTarget && (
        <ManualPayModal
          contributor={payTarget}
          campaignSlug={campaign.slug}
          onClose={() => setPayTarget(null)}
        />
      )}
    </div>
  )
}
