import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { api } from '../../lib/api'
import type { Campaign, Contributor } from '../../types'
import ContributorRow from '../../components/ContributorRow'
import ManualPayModal from '../../components/ManualPayModal'
import InviteModal from '../../components/InviteModal'

interface Props {
  campaign: Campaign
  contributors: Contributor[]
}

type PaidVia = 'zelle' | 'cashapp' | 'cash' | 'card' | 'manual'

interface AddForm {
  name: string
  phone: string
  email: string
  amount: string
  is_anonymous: boolean
  paid_via: PaidVia | null
  note: string
}

const EMPTY_FORM: AddForm = { name: '', phone: '', email: '', amount: '', is_anonymous: false, paid_via: null, note: '' }

const PAY_METHODS: { value: PaidVia; label: string; icon: string }[] = [
  { value: 'zelle',   label: 'Zelle',    icon: '💜' },
  { value: 'cashapp', label: 'CashApp',  icon: '💚' },
  { value: 'cash',    label: 'Cash',     icon: '💵' },
  { value: 'manual',  label: 'Other',    icon: '✏️' },
]

export default function ContributorsTab({ campaign, contributors }: Props) {
  const isCelebration = campaign.campaign_type === 'celebration'
  const isInvitationOnly = isCelebration && parseFloat(campaign.amount_per_person ?? '0') === 0
  const isPartyMeeting = campaign.campaign_type === 'political' &&
    !!(campaign.event_date || campaign.event_time || campaign.event_location)
  const [payTarget, setPayTarget] = useState<Contributor | null>(null)
  const [inviteTarget, setInviteTarget] = useState<Contributor | null | 'new'>(null)
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
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Failed to export CSV')
    } finally {
      setExporting(false)
    }
  }

  const paid = contributors.filter(c => c.paid)
  const unpaid = contributors.filter(c => !c.paid)
  const invited = contributors.filter(c => c.status === 'invited' && !c.paid)
  const declined = contributors.filter(c => c.status === 'declined')

  const addMutation = useMutation({
    mutationFn: () =>
      api.post<Contributor>(`/campaigns/${campaign.slug}/contributors`, {
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        amount: isInvitationOnly ? null : (form.amount ? parseFloat(form.amount) : null),
        is_anonymous: isInvitationOnly ? false : form.is_anonymous,
        paid_via: isInvitationOnly ? null : (form.paid_via || null),
        note: isInvitationOnly ? null : (form.note.trim() || null),
      }).then(r => r.data),
    onSuccess: (added) => {
      qc.invalidateQueries({ queryKey: ['contributors', campaign.slug] })
      toast.success(added.paid
        ? `${added.name} added and marked ${isCelebration ? 'attending' : 'paid'}`
        : isCelebration ? 'Guest added' : 'Contributor added')
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

  const remindOneMutation = useMutation({
    mutationFn: (c: Contributor) =>
      api.post(`/campaigns/${campaign.slug}/contributors/${c.id}/remind`).then(r => r.data),
    onSuccess: (_data, c) => toast.success(`Reminder queued for ${c.name.split(' ')[0]}`),
    onError: (_err, c) => toast.error(`Failed to remind ${c.name.split(' ')[0]}`),
  })

  function handleReminder(c: Contributor) {
    if (!c.phone) {
      toast(`No phone number for ${c.name}`, { icon: 'ℹ️' })
      return
    }
    remindOneMutation.mutate(c)
  }

  const remindAllMutation = useMutation({
    mutationFn: () =>
      api.post<{ queued: number; skipped: number }>(`/campaigns/${campaign.slug}/remind-all`).then(r => r.data),
    onSuccess: (data) => {
      const sent = `${data.queued} reminder${data.queued !== 1 ? 's' : ''} sent`
      const msg = data.skipped > 0 ? `${sent}, ${data.skipped} skipped (no phone number)` : sent
      toast.success(msg)
    },
    onError: () => toast.error('Failed to send reminders'),
  })

  const confirmMutation = useMutation({
    mutationFn: (id: string) =>
      api.patch(`/campaigns/${campaign.slug}/contributors/${id}`, { paid: true }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contributors', campaign.slug] })
      toast.success('Marked as attending!')
    },
    onError: () => toast.error('Failed to confirm attendance'),
  })

  const declineMutation = useMutation({
    mutationFn: (id: string) =>
      api.delete(`/campaigns/${campaign.slug}/contributors/${id}`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contributors', campaign.slug] })
      toast.success('Guest removed')
    },
    onError: () => toast.error('Failed to remove guest'),
  })

  return (
    <div className="space-y-4">
      {/* WhatsApp info banner */}
      <div className="flex items-start gap-2.5 rounded-lg border border-sky-900/50 bg-sky-950/30 px-3.5 py-2.5 text-xs text-sky-300/80">
        <span className="shrink-0 mt-px">📱</span>
        <span>{isCelebration
          ? 'Guests are notified via WhatsApp when invited.'
          : isPartyMeeting
            ? 'Members are notified via WhatsApp when invited. RSVPs submitted via the public page appear here.'
            : 'Contributors are notified via WhatsApp. Make sure phone numbers are saved for each contributor to enable reminders.'
        }</span>
      </div>

      {/* Actions bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* Summary */}
        <p className="text-sm text-gray-400">
          {isPartyMeeting ? (
            <><span className="text-white font-medium">{contributors.length}</span> <span className="text-brand-400">Attending</span></>
          ) : (
            <>
              <span className="text-white font-medium">{contributors.length}</span> total
              {' '}—{' '}
              {isInvitationOnly ? (
                <>
                  <span className="text-brand-400">{paid.length} attending</span>
                  {unpaid.length > 0 && <> · <span className="text-yellow-400">{unpaid.length} pending</span></>}
                </>
              ) : (
                <>
                  <span className="text-brand-400">{paid.length} {isCelebration ? 'attending' : 'paid'}</span>
                  {invited.length > 0 && <> · <span className="text-sky-400">{invited.length} invited</span></>}
                  {declined.length > 0 && <> · <span className="text-gray-500">{declined.length} declined</span></>}
                </>
              )}
            </>
          )}
        </p>

        <div className="flex gap-2 flex-wrap">
          {unpaid.length > 0 && !isInvitationOnly && !isPartyMeeting && (
            <button
              type="button"
              onClick={() => remindAllMutation.mutate()}
              disabled={remindAllMutation.isPending}
              className="rounded-lg border border-green-800 bg-green-900/30 px-3 py-1.5 text-xs
                font-medium text-green-300 hover:bg-green-800/50 disabled:opacity-40 transition-colors"
            >
              {remindAllMutation.isPending ? 'Sending…' : '📱 Remind all unpaid'}
            </button>
          )}
          {!isPartyMeeting && (
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting || contributors.length === 0}
              className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs
                font-medium text-gray-300 hover:bg-gray-700 disabled:opacity-40 transition-colors"
            >
              {exporting ? 'Exporting…' : isCelebration ? '⬇ Export Guest List' : '⬇ Export CSV'}
            </button>
          )}
          {!isInvitationOnly && !isPartyMeeting && (
            <button
              type="button"
              onClick={() => { setInviteTarget('new'); setShowAdd(false) }}
              className="rounded-lg border border-sky-700 bg-sky-700/20 px-3 py-1.5 text-xs
                font-medium text-sky-300 hover:bg-sky-700/40 transition-colors"
            >
              {isCelebration ? '📲 Invite a Guest' : '📲 Invite Someone New'}
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowAdd(v => !v)}
            className="rounded-lg border border-brand-700 bg-brand-700/20 px-3 py-1.5 text-xs
              font-medium text-brand-300 hover:bg-brand-700/40 transition-colors"
          >
            {showAdd ? 'Cancel' : isCelebration ? '＋ Add guest' : isPartyMeeting ? '＋ Add Attendee' : '＋ Add contributor'}
          </button>
        </div>
      </div>

      {/* Add contributor form */}
      {showAdd && (
        <form
          onSubmit={handleAddSubmit}
          className="rounded-xl border border-brand-700/40 bg-brand-900/20 p-4 space-y-4"
        >
          <p className="text-sm font-medium text-brand-200">{isCelebration ? 'Add guest' : isPartyMeeting ? 'Add attendee' : 'Add contributor'}</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              value={form.name}
              onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))}
              placeholder={isCelebration ? 'Guest name *' : 'Contributor name *'}
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

          <div>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm(p => ({ ...p, phone: e.target.value }))}
              placeholder="+1 206 555 0100"
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white
                placeholder-gray-600 focus:border-brand-500 focus:outline-none"
            />
            <p className="mt-1.5 text-xs text-gray-500">
              📱 Required for WhatsApp reminders — include country code
            </p>
          </div>

          {!isInvitationOnly && (
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
          )}

          {!isInvitationOnly && (
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
          )}

          <button
            type="submit"
            disabled={addMutation.isPending}
            className="w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white
              hover:bg-brand-500 disabled:opacity-60 transition-colors"
          >
            {addMutation.isPending
              ? 'Adding…'
              : isInvitationOnly
                ? 'Add Guest'
                : form.paid_via
                  ? `Add & mark paid via ${PAY_METHODS.find(m => m.value === form.paid_via)?.label}`
                  : isPartyMeeting ? 'Add Attendee' : 'Add (unpaid)'}
          </button>
        </form>
      )}

      {/* Contributor list */}
      {contributors.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-700 p-10 text-center">
          <p className="text-gray-500 text-sm">{isCelebration ? 'No guests yet.' : isPartyMeeting ? 'No attendees yet.' : 'No contributors yet.'}</p>
        </div>
      ) : isInvitationOnly ? (
        <div className="space-y-2">
          {paid.length > 0 && (
            <>
              <p className="text-xs text-gray-500 uppercase tracking-wide px-1">Attending ({paid.length})</p>
              {paid.map(c => (
                <ContributorRow key={c.id} contributor={c} hideAmount showPhone />
              ))}
            </>
          )}
          {unpaid.length > 0 && (
            <>
              <p className={`text-xs text-gray-500 uppercase tracking-wide px-1 ${paid.length > 0 ? 'mt-4' : ''}`}>
                Pending RSVP ({unpaid.length})
              </p>
              {unpaid.map(c => (
                <ContributorRow
                  key={c.id}
                  contributor={c}
                  hideAmount
                  showPhone
                  onConfirm={() => confirmMutation.mutate(c.id)}
                  onDecline={() => declineMutation.mutate(c.id)}
                />
              ))}
            </>
          )}
        </div>
      ) : isPartyMeeting ? (
        <div className="space-y-2">
          {[...paid, ...unpaid].map(c => (
            <div
              key={c.id}
              className="flex items-center gap-3 rounded-lg px-4 py-3 bg-gray-900 border border-gray-800"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-700 text-brand-200 text-sm">✓</span>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-white truncate block">{c.name}</span>
                {c.phone && <p className="text-xs text-gray-500 mt-0.5">{c.phone}</p>}
              </div>
              <span className="shrink-0 text-xs font-medium px-2 py-0.5 rounded-full bg-brand-900/50 text-brand-300 border border-brand-800/40">
                ✅ Attending
              </span>
            </div>
          ))}
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
                  onMarkPaid={c.status !== 'declined' ? setPayTarget : undefined}
                  onSendReminder={c.status !== 'declined' ? handleReminder : undefined}
                  onInvite={setInviteTarget}
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

      {inviteTarget !== null && (
        <InviteModal
          campaign={campaign}
          contributor={inviteTarget === 'new' ? null : inviteTarget}
          onClose={() => setInviteTarget(null)}
          onSuccess={() => {}}
        />
      )}
    </div>
  )
}
