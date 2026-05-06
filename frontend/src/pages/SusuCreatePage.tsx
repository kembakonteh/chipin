import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import type { AxiosResponse } from 'axios'
import { api } from '../lib/api'
import type { SusuFrequency, SusuGroup, SusuMember, SusuPayoutOrder } from '../types'
import Layout from '../components/Layout'

function getData<T>(r: AxiosResponse<T>): T { return r.data }

const FREQ_OPTIONS: { value: SusuFrequency; label: string; desc: string }[] = [
  { value: 'weekly', label: 'Weekly', desc: 'Every 7 days' },
  { value: 'biweekly', label: 'Biweekly', desc: 'Every 14 days' },
  { value: 'monthly', label: 'Monthly', desc: 'Once a month' },
]

const ORDER_OPTIONS: { value: SusuPayoutOrder; label: string; desc: string }[] = [
  { value: 'fixed', label: 'Fixed', desc: 'Assign positions manually' },
  { value: 'random', label: 'Random', desc: 'Shuffle on start' },
  { value: 'bid', label: 'Bid', desc: 'Members bid for position' },
]

interface MemberRow {
  name: string
  phone: string
  email: string
  payout_position: string
}

const emptyMember = (): MemberRow => ({ name: '', phone: '', email: '', payout_position: '' })

export default function SusuCreatePage() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [error, setError] = useState<string | null>(null)

  // Step 1: Group details
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [frequency, setFrequency] = useState<SusuFrequency>('monthly')
  const [totalCycles, setTotalCycles] = useState('12')
  const [payoutOrder, setPayoutOrder] = useState<SusuPayoutOrder>('fixed')
  const [startDate, setStartDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 7)
    return d.toISOString().split('T')[0]
  })

  // Members — collected on step 1 alongside group details
  const [members, setMembers] = useState<MemberRow[]>([emptyMember(), emptyMember()])

  // Created group (set after step 1 submit succeeds)
  const [group, setGroup] = useState<SusuGroup | null>(null)
  const [addedMembers, setAddedMembers] = useState<SusuMember[]>([])

  const [submitting, setSubmitting] = useState(false)

  // Step 1: create group then add all filled-in members
  async function handleCreateAndAddMembers() {
    setError(null)
    const valid = members.filter(m => m.name.trim() && m.phone.trim())
    setSubmitting(true)
    try {
      const g: SusuGroup = await api.post<SusuGroup>('/susu', {
        name, contribution_amount: parseFloat(amount), frequency,
        total_cycles: parseInt(totalCycles), payout_order: payoutOrder,
        start_date: startDate,
      }).then(getData)
      setGroup(g)

      const added: SusuMember[] = []
      for (const m of valid) {
        const member = await api.post<SusuMember>(`/susu/${g.slug}/members`, {
          name: m.name.trim(),
          phone: m.phone.trim(),
          email: m.email.trim() || undefined,
          payout_position: m.payout_position ? parseInt(m.payout_position) : undefined,
        }).then(getData)
        added.push(member)
      }
      setAddedMembers(added)
      setStep(2)
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // Step 2: start
  const startGroup = useMutation({
    mutationFn: () => api.post(`/susu/${group!.slug}/start`).then(getData),
    onSuccess: () => navigate(`/susu/${group!.slug}`),
    onError: (e: any) => setError(e?.response?.data?.detail ?? 'Failed to start group'),
  })

  function addMemberRow() { setMembers(prev => [...prev, emptyMember()]) }
  function removeMemberRow(i: number) {
    setMembers(prev => prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev)
  }
  function updateMember(i: number, field: keyof MemberRow, value: string) {
    setMembers(prev => prev.map((m, idx) => idx === i ? { ...m, [field]: value } : m))
  }

  const validMemberCount = members.filter(m => m.name.trim() && m.phone.trim()).length

  return (
    <Layout>
      <div className="max-w-2xl mx-auto">
        {/* Step indicator — now 2 steps */}
        <div className="flex items-center gap-2 mb-8">
          {[1, 2].map(s => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                step >= s ? 'bg-brand-600 text-white' : 'bg-gray-800 text-gray-500'
              }`}>{s}</div>
              {s < 2 && <div className={`h-px w-8 ${step > s ? 'bg-brand-600' : 'bg-gray-800'}`} />}
            </div>
          ))}
          <span className="ml-2 text-sm text-gray-400">
            {step === 1 ? 'Group Details & Members' : 'Review & Start'}
          </span>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-900/30 border border-red-800 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Step 1: Group details + members */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="rounded-xl border border-gray-700 bg-gray-900 p-6 space-y-5">
              <h2 className="text-lg font-bold text-white">Group Details</h2>

              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Group Name</label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Family Susu 2026"
                  className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:border-brand-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Contribution per Member</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                    <input
                      type="number"
                      value={amount}
                      onChange={e => setAmount(e.target.value)}
                      placeholder="100"
                      className="w-full rounded-lg bg-gray-800 border border-gray-700 pl-7 pr-3 py-2.5 text-sm text-white placeholder-gray-600 focus:border-brand-500 focus:outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Number of Cycles</label>
                  <input
                    type="number"
                    value={totalCycles}
                    onChange={e => setTotalCycles(e.target.value)}
                    min={2}
                    max={52}
                    className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:border-brand-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-2">Frequency</label>
                <div className="grid grid-cols-3 gap-2">
                  {FREQ_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setFrequency(opt.value)}
                      className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                        frequency === opt.value
                          ? 'border-brand-500 bg-brand-900/30 text-brand-300'
                          : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'
                      }`}
                    >
                      <div className="text-sm font-medium">{opt.label}</div>
                      <div className="text-xs text-gray-500">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-2">Payout Order</label>
                <div className="grid grid-cols-3 gap-2">
                  {ORDER_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setPayoutOrder(opt.value)}
                      className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                        payoutOrder === opt.value
                          ? 'border-brand-500 bg-brand-900/30 text-brand-300'
                          : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'
                      }`}
                    >
                      <div className="text-sm font-medium">{opt.label}</div>
                      <div className="text-xs text-gray-500">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2.5 text-sm text-white focus:border-brand-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Members section — part of the same form */}
            <div className="rounded-xl border border-gray-700 bg-gray-900 p-6 space-y-4">
              <div>
                <h2 className="text-lg font-bold text-white">Members</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Add who you know now — you can add more later before starting.
                  {payoutOrder === 'fixed' && ' Set a payout position (#) or leave blank to assign on start.'}
                </p>
              </div>

              <div className="space-y-2">
                {members.map((m, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center">
                    <input
                      value={m.name}
                      onChange={e => updateMember(i, 'name', e.target.value)}
                      placeholder="Name"
                      className="col-span-4 rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-brand-500 focus:outline-none"
                    />
                    <input
                      value={m.phone}
                      onChange={e => updateMember(i, 'phone', e.target.value)}
                      placeholder="Phone"
                      className="col-span-4 rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-brand-500 focus:outline-none"
                    />
                    {payoutOrder === 'fixed' ? (
                      <>
                        <input
                          type="number"
                          value={m.payout_position}
                          onChange={e => updateMember(i, 'payout_position', e.target.value)}
                          placeholder="#"
                          min={1}
                          className="col-span-2 rounded-lg bg-gray-800 border border-gray-700 px-2 py-2 text-sm text-white placeholder-gray-600 focus:border-brand-500 focus:outline-none text-center"
                        />
                        <button
                          type="button"
                          onClick={() => removeMemberRow(i)}
                          className="col-span-2 text-gray-600 hover:text-red-400 text-lg font-bold py-1 transition-colors"
                        >
                          ×
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => removeMemberRow(i)}
                        className="col-span-4 text-gray-600 hover:text-red-400 text-lg font-bold py-1 transition-colors"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={addMemberRow}
                className="w-full py-2 rounded-lg border border-dashed border-gray-700 text-sm text-gray-500 hover:border-gray-600 hover:text-gray-400 transition-colors"
              >
                + Add another member
              </button>

              {validMemberCount > 0 && amount && (
                <div className="rounded-lg bg-brand-900/20 border border-brand-800/30 px-4 py-3 text-sm text-brand-300">
                  Pot per cycle: <span className="font-bold">
                    ${(parseFloat(amount || '0') * validMemberCount).toLocaleString()}
                  </span>
                  {' '}(${amount} × {validMemberCount} members)
                </div>
              )}

              <button
                onClick={handleCreateAndAddMembers}
                disabled={submitting || !name.trim() || !amount || !totalCycles || validMemberCount < 2}
                className="w-full py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-500 disabled:opacity-50 transition-colors"
              >
                {submitting
                  ? 'Creating…'
                  : validMemberCount < 2
                    ? `Add at least 2 members (${validMemberCount} so far)`
                    : `Continue with ${validMemberCount} members →`}
              </button>
            </div>
          </div>
        )}

        {/* Step 2 (was step 3) */}
        {step === 2 && group && (
          <div className="rounded-xl border border-gray-700 bg-gray-900 p-6 space-y-5">
            <h2 className="text-lg font-bold text-white">Review & Start</h2>

            <div className="rounded-lg bg-gray-800 divide-y divide-gray-700 text-sm">
              <div className="flex justify-between px-4 py-3">
                <span className="text-gray-400">Group</span>
                <span className="text-white font-medium">{group.name}</span>
              </div>
              <div className="flex justify-between px-4 py-3">
                <span className="text-gray-400">Contribution</span>
                <span className="text-white">${group.contribution_amount} / member / cycle</span>
              </div>
              <div className="flex justify-between px-4 py-3">
                <span className="text-gray-400">Frequency</span>
                <span className="text-white capitalize">{group.frequency}</span>
              </div>
              <div className="flex justify-between px-4 py-3">
                <span className="text-gray-400">Cycles</span>
                <span className="text-white">{group.total_cycles}</span>
              </div>
              <div className="flex justify-between px-4 py-3">
                <span className="text-gray-400">Members added</span>
                <span className="text-white">{addedMembers.length}</span>
              </div>
              <div className="flex justify-between px-4 py-3">
                <span className="text-gray-400">Pot per cycle</span>
                <span className="text-white font-bold text-brand-300">
                  ${(parseFloat(group.contribution_amount) * addedMembers.length).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between px-4 py-3">
                <span className="text-gray-400">Start date</span>
                <span className="text-white">{new Date(group.start_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
              </div>
              <div className="flex justify-between px-4 py-3">
                <span className="text-gray-400">Payout order</span>
                <span className="text-white capitalize">{group.payout_order}</span>
              </div>
            </div>

            {/* Members list */}
            <div>
              <p className="text-xs font-medium text-gray-400 mb-2">Members ({addedMembers.length})</p>
              <div className="space-y-1">
                {addedMembers.map((m, i) => (
                  <div key={m.id} className="flex items-center justify-between rounded-lg bg-gray-800 px-3 py-2 text-sm">
                    <span className="text-white">{m.name}</span>
                    <span className="text-gray-500 text-xs">{m.phone}</span>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => navigate(`/susu/${group.slug}`)}
                className="mt-2 text-xs text-brand-400 hover:text-brand-300 transition-colors"
              >
                + Add more members on the group page
              </button>
            </div>

            <div className="rounded-lg bg-yellow-900/20 border border-yellow-800/30 px-4 py-3 text-xs text-yellow-300">
              Starting will assign payout positions and create all {group.total_cycles} cycle schedules. You can still add more members from the group page before starting.
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => navigate(`/susu/${group.slug}`)}
                className="flex-1 py-2.5 rounded-lg border border-gray-700 text-sm text-gray-400 hover:border-gray-600 hover:text-white transition-colors"
              >
                Save & add later
              </button>
              <button
                onClick={() => startGroup.mutate()}
                disabled={startGroup.isPending}
                className="flex-[2] py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-500 disabled:opacity-50 transition-colors"
              >
                {startGroup.isPending ? 'Starting…' : '🚀 Start Susu'}
              </button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
