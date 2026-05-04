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

interface AddForm {
  name: string
  email: string
  amount: string
  is_anonymous: boolean
}

const EMPTY_FORM: AddForm = { name: '', email: '', amount: '', is_anonymous: false }

export default function ContributorsTab({ campaign, contributors }: Props) {
  const [payTarget, setPayTarget] = useState<Contributor | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState<AddForm>(EMPTY_FORM)
  const qc = useQueryClient()

  const paid = contributors.filter(c => c.paid)
  const unpaid = contributors.filter(c => !c.paid)

  const addMutation = useMutation({
    mutationFn: () =>
      api.post<Contributor>(`/campaigns/${campaign.slug}/contributors`, {
        name: form.name.trim(),
        email: form.email.trim() || null,
        amount: form.amount ? parseFloat(form.amount) : null,
        is_anonymous: form.is_anonymous,
      }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contributors', campaign.slug] })
      toast.success('Contributor added')
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
        <div className="flex gap-2">
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
          className="rounded-xl border border-brand-700/40 bg-brand-900/20 p-4 space-y-3"
        >
          <p className="text-sm font-medium text-brand-200">Add contributor</p>
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
            <button
              type="submit"
              disabled={addMutation.isPending}
              className="ml-auto rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white
                hover:bg-brand-500 disabled:opacity-60 transition-colors"
            >
              {addMutation.isPending ? 'Adding…' : 'Add'}
            </button>
          </div>
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
