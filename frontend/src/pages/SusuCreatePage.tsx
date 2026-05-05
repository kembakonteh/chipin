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

  // Step 2: Members
  const [members, setMembers] = useState<MemberRow[]>([emptyMember(), emptyMember()])

  // Created group (after step 1 submit)
  const [group, setGroup] = useState<SusuGroup | null>(null)
  const [addedMembers, setAddedMembers] = useState<SusuMember[]>([])

  // Step 1: create group
  const createGroup = useMutation({
    mutationFn: () => api.post<SusuGroup>('/susu', {
      name, contribution_amount: parseFloat(amount), frequency,
      total_cycles: parseInt(totalCycles), payout_order: payoutOrder,
      start_date: startDate,
    }).then(getData),
    onSuccess: (g) => { setGroup(g); setStep(2) },
    onError: (e: any) => setError(e?.response?.data?.detail ?? 'Failed to create group'),
  })

  // Step 2: add all members, then start
  const [addingMembers, setAddingMembers] = useState(false)

  async function handleAddMembers() {
    if (!group) return
    setError(null)
    setAddingMembers(true)
    const valid = members.filter(m => m.name.trim() && m.phone.trim())
    if (valid.length < 2) {
      setError('Add at least 2 members')
      setAddingMembers(false)
      return
    }
    try {
      const added: SusuMember[] = []
      for (const m of valid) {
        const member = await api.post<SusuMember>(`/susu/${group.slug}/members`, {
          name: m.name.trim(),
          phone: m.phone.trim(),
          email: m.email.trim() || undefined,
          payout_position: m.payout_position ? parseInt(m.payout_position) : undefined,
        }).then(getData)
        added.push(member)
      }
      setAddedMembers(added)
      setStep(3)
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? 'Failed to add members')
    } finally {
      setAddingMembers(false)
    }
  }

  // Step 3: start
  const startGroup = useMutation({
    mutationFn: () => api.post(`/susu/${group!.slug}/start`).then(getData),
    onSuccess: () => navigate(`/susu/${group!.slug}`),
    onError: (e: any) => setError(e?.response?.data?.detail ?? 'Failed to start group'),
  })

  function addMemberRow() { setMembers(prev => [...prev, emptyMember()]) }
  function removeMemberRow(i: number) { setMembers(prev => prev.filter((_, idx) => idx !== i)) }
  function updateMember(i: number, field: keyof MemberRow, value: string) {
    setMembers(prev => prev.map((m, idx) => idx === i ? { ...m, [field]: value } : m))
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto">
        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-8">
          {[1, 2, 3].map(s => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                step >= s ? 'bg-brand-600 text-white' : 'bg-gray-800 text-gray-500'
              }`}>{s}</div>
              {s < 3 && <div className={`h-px w-8 ${step > s ? 'bg-brand-600' : 'bg-gray-800'}`} />}
            </div>
          ))}
          <span className="ml-2 text-sm text-gray-400">
            {step === 1 ? 'Group Details' : step === 2 ? 'Add Members' : 'Review & Start'}
          </span>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-900/30 border border-red-800 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Step 1 */}
        {step === 1 && (
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

            {amount && totalCycles && (
              <div className="rounded-lg bg-brand-900/20 border border-brand-800/30 px-4 py-3 text-sm text-brand-300">
                Pot per cycle: <span className="font-bold">${(parseFloat(amount || '0') * parseInt(totalCycles || '0')).toLocaleString()}</span>
                {' '}(${amount} × {totalCycles} members)
              </div>
            )}

            <button
              onClick={() => { setError(null); createGroup.mutate() }}
              disabled={createGroup.isPending || !name || !amount || !totalCycles}
              className="w-full py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-500 disabled:opacity-50 transition-colors"
            >
              {createGroup.isPending ? 'Creating…' : 'Continue →'}
            </button>
          </div>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <div className="rounded-xl border border-gray-700 bg-gray-900 p-6">
            <h2 className="text-lg font-bold text-white mb-1">Add Members</h2>
            <p className="text-sm text-gray-500 mb-5">
              Add all members. {payoutOrder === 'fixed' ? 'Set payout positions — leave blank to assign automatically.' : 'Positions will be assigned when you start.'}
            </p>

            <div className="space-y-3 mb-4">
              {members.map((m, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-start">
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
                    className="col-span-3 rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-brand-500 focus:outline-none"
                  />
                  <input
                    value={m.email}
                    onChange={e => updateMember(i, 'email', e.target.value)}
                    placeholder="Email (opt)"
                    className="col-span-3 rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-brand-500 focus:outline-none"
                  />
                  {payoutOrder === 'fixed' && (
                    <input
                      type="number"
                      value={m.payout_position}
                      onChange={e => updateMember(i, 'payout_position', e.target.value)}
                      placeholder="#"
                      min={1}
                      className="col-span-1 rounded-lg bg-gray-800 border border-gray-700 px-2 py-2 text-sm text-white placeholder-gray-600 focus:border-brand-500 focus:outline-none text-center"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => removeMemberRow(i)}
                    className={`${payoutOrder === 'fixed' ? 'col-span-1' : 'col-span-2'} text-gray-600 hover:text-red-400 text-lg font-bold py-2 transition-colors`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={addMemberRow}
              className="w-full py-2 rounded-lg border border-dashed border-gray-700 text-sm text-gray-500 hover:border-gray-600 hover:text-gray-400 transition-colors mb-5"
            >
              + Add row
            </button>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="flex-1 py-2.5 rounded-lg border border-gray-700 text-sm text-gray-400 hover:border-gray-600 hover:text-white transition-colors"
              >
                ← Back
              </button>
              <button
                onClick={handleAddMembers}
                disabled={addingMembers}
                className="flex-[2] py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-500 disabled:opacity-50 transition-colors"
              >
                {addingMembers ? 'Adding…' : 'Continue →'}
              </button>
            </div>
          </div>
        )}

        {/* Step 3 */}
        {step === 3 && group && (
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

            <div className="rounded-lg bg-yellow-900/20 border border-yellow-800/30 px-4 py-3 text-xs text-yellow-300">
              Starting the group will assign payout positions and create all {group.total_cycles} cycle schedules. This cannot be undone.
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="flex-1 py-2.5 rounded-lg border border-gray-700 text-sm text-gray-400 hover:border-gray-600 hover:text-white transition-colors"
              >
                ← Back
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
