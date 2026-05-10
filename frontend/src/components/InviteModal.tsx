import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { api } from '../lib/api'
import type { Campaign, Contributor } from '../types'

interface Props {
  campaign: Campaign
  contributor?: Contributor | null
  onClose: () => void
  onSuccess: (c: Contributor) => void
}

export default function InviteModal({ campaign, contributor, onClose, onSuccess }: Props) {
  const isNew = !contributor
  const qc = useQueryClient()

  const defaultMessage = contributor
    ? `Hey ${contributor.name.split(' ')[0]}! I'm putting together a collection for ${campaign.title} and would love for you to chip in if you're able. No pressure — you can decline if you wish.`
    : `I'm putting together a collection for ${campaign.title} and would love for you to chip in if you're able. No pressure — you can decline if you wish.`

  const [name, setName] = useState(contributor?.name ?? '')
  const [phone, setPhone] = useState(contributor?.phone ?? '')
  const [message, setMessage] = useState(defaultMessage)

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  const inviteMutation = useMutation({
    mutationFn: () => {
      if (isNew) {
        return api.post<Contributor>(`/campaigns/${campaign.slug}/invite-new`, {
          name: name.trim(),
          phone: phone.trim(),
          custom_message: message.trim() || undefined,
        }).then(r => r.data)
      }
      return api.post<Contributor>(
        `/campaigns/${campaign.slug}/contributors/${contributor!.id}/invite`,
        { custom_message: message.trim() || undefined },
      ).then(r => r.data)
    },
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ['contributors', campaign.slug] })
      toast.success(`Invite sent to ${c.name.split(' ')[0]} via WhatsApp`)
      onSuccess(c)
      onClose()
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.detail
      toast.error(detail ?? 'Failed to send invite. Check the phone number and try again.')
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { toast.error('Name is required'); return }
    if (!phone.trim()) { toast.error('Phone number is required'); return }
    inviteMutation.mutate()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-800">
          <div>
            <h2 className="text-base font-semibold text-white">
              {isNew ? '＋ Invite Someone New' : contributor!.status === 'invited' ? 'Re-invite' : 'Send Invite'}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Sends a personal WhatsApp message with payment link
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 transition-colors text-lg leading-none"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
              disabled={!isNew && !!contributor?.name}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white
                placeholder-gray-600 focus:border-brand-500 focus:outline-none
                disabled:opacity-60 disabled:cursor-default"
            />
          </div>

          {/* Phone */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">
              WhatsApp number <span className="text-red-400">*</span>
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 206 555 0100"
              disabled={!isNew && !!contributor?.phone}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white
                placeholder-gray-600 focus:border-brand-500 focus:outline-none
                disabled:opacity-60 disabled:cursor-default"
            />
            <p className="mt-1 text-xs text-gray-500">Include country code, e.g. +44 7700 900000</p>
          </div>

          {/* Personal message */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Personal message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white
                placeholder-gray-600 focus:border-brand-500 focus:outline-none resize-none"
            />
          </div>

          {/* Preview note */}
          <div className="rounded-lg border border-sky-900/40 bg-sky-950/30 px-3 py-2.5 text-xs text-sky-300/80">
            <span className="font-medium">Preview:</span> "Hi {name.split(' ')[0] || '[Name]'}! [your organiser name] is pulling you into a collection for <em>{campaign.title}</em>. {message.slice(0, 60)}{message.length > 60 ? '…' : ''} Contribute here: [link]  Can't make it? [decline link]"
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-gray-700 py-2.5 text-sm font-medium
                text-gray-300 hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={inviteMutation.isPending}
              className="flex-1 rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white
                hover:bg-brand-500 disabled:opacity-60 transition-colors"
            >
              {inviteMutation.isPending ? 'Sending…' : '📲 Send Invite via WhatsApp'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
