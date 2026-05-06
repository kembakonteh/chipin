import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { api } from '../lib/api'
import type { Contributor, PaidVia } from '../types'
import { fmt } from '../types'

const OPTIONS: { value: PaidVia; label: string; emoji: string }[] = [
  { value: 'zelle',   label: 'Zelle',   emoji: '💜' },
  { value: 'cash',    label: 'Cash',    emoji: '💵' },
  { value: 'cashapp', label: 'CashApp', emoji: '💸' },
  { value: 'manual',  label: 'Other',   emoji: '🔧' },
]

interface Props {
  contributor: Contributor
  campaignSlug: string
  onClose: () => void
}

export default function ManualPayModal({ contributor, campaignSlug, onClose }: Props) {
  const [paidVia, setPaidVia] = useState<PaidVia>('cash')
  const [isAnonymous, setIsAnonymous] = useState(contributor.is_anonymous)
  const [note, setNote] = useState('')
  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: () =>
      api.post(
        `/campaigns/${campaignSlug}/contributors/${contributor.id}/mark-paid`,
        { paid_via: paidVia, is_anonymous: isAnonymous, note: note.trim() || null },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contributors', campaignSlug] })
      toast.success(`${contributor.name} marked as paid`)
      onClose()
    },
    onError: () => toast.error('Failed to mark as paid'),
  })

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4
        bg-black/70 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-sm rounded-2xl bg-gray-900 border border-gray-700 shadow-2xl p-6">
        <h2 className="text-lg font-semibold text-white mb-1">Mark as Paid</h2>
        <p className="text-sm text-gray-400 mb-5">
          {contributor.name} — {fmt(parseFloat(contributor.amount))}
        </p>

        {/* Payment method */}
        <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Payment method</p>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setPaidVia(o.value)}
              className={`flex items-center gap-2 rounded-lg border p-3 text-sm font-medium transition-colors
                ${paidVia === o.value
                  ? 'border-brand-500 bg-brand-700/30 text-white'
                  : 'border-gray-700 bg-gray-800 text-gray-300 hover:border-gray-600'
                }`}
            >
              <span>{o.emoji}</span>
              <span>{o.label}</span>
            </button>
          ))}
        </div>

        {/* Reference / confirmation number */}
        <div className="mb-4">
          <label className="block text-xs text-gray-400 mb-1">
            Reference / confirmation number <span className="text-gray-600">(optional)</span>
          </label>
          <input
            type="text"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder={
              paidVia === 'zelle'   ? 'e.g. Zelle confirmation #12345' :
              paidVia === 'cashapp' ? 'e.g. CashApp $cashtag or transaction ID' :
              'e.g. Envelope #3, cash received 6 May'
            }
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5
              text-sm text-white placeholder-gray-600 focus:border-brand-500 focus:outline-none"
          />
        </div>

        {/* Anonymous toggle */}
        <label className="flex items-center gap-3 cursor-pointer mb-6">
          <input
            type="checkbox"
            checked={isAnonymous}
            onChange={(e) => setIsAnonymous(e.target.checked)}
            className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-brand-500
              focus:ring-brand-500 focus:ring-offset-gray-900"
          />
          <span className="text-sm text-gray-300">
            Keep name private on public board
            <span className="ml-1 text-gray-500">🔒</span>
          </span>
        </label>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-gray-700 py-2.5 text-sm text-gray-400
              hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="flex-1 rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white
              hover:bg-brand-500 disabled:opacity-60 transition-colors"
          >
            {mutation.isPending ? 'Saving…' : 'Confirm Paid'}
          </button>
        </div>
      </div>
    </div>
  )
}
