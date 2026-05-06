import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { api } from '../../lib/api'
import Layout from '../../components/Layout'
import type { MethodType, PayoutMethod } from '../../types'

// ── Network catalogue by country ─────────────────────────────────────────────

const COUNTRY_NETWORKS: Record<string, { label: string; networks: string[]; type: MethodType }[]> = {
  GM: [
    { label: 'Wave (Gambia)', networks: ['Wave'], type: 'mobile_money' },
    { label: 'Afrimoney', networks: ['Afrimoney'], type: 'mobile_money' },
    { label: 'QMoney', networks: ['QMoney'], type: 'mobile_money' },
  ],
  SN: [
    { label: 'Wave (Senegal)', networks: ['Wave'], type: 'mobile_money' },
    { label: 'Orange Money', networks: ['Orange Money'], type: 'mobile_money' },
  ],
  GH: [
    { label: 'MTN Mobile Money', networks: ['MTN Mobile Money'], type: 'mobile_money' },
    { label: 'Vodafone Cash', networks: ['Vodafone Cash'], type: 'mobile_money' },
  ],
  NG: [
    { label: 'Bank Transfer (Flutterwave)', networks: ['Bank Transfer'], type: 'bank_transfer' },
  ],
}

const COUNTRY_LABELS: Record<string, string> = {
  GM: 'The Gambia',
  SN: 'Senegal',
  GH: 'Ghana',
  NG: 'Nigeria',
}

// ── Status badge ─────────────────────────────────────────────────────────────

function VerifiedBadge({ verified }: { verified: boolean }) {
  return verified ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-green-900/50 px-2 py-0.5 text-xs text-green-400 border border-green-800">
      ✓ Verified
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-yellow-900/50 px-2 py-0.5 text-xs text-yellow-400 border border-yellow-800">
      Pending
    </span>
  )
}

// ── Add payout method form ────────────────────────────────────────────────────

function AddMethodForm({ onSuccess }: { onSuccess: () => void }) {
  const [country, setCountry] = useState('')
  const [networkName, setNetworkName] = useState('')
  const [methodType, setMethodType] = useState<MethodType>('mobile_money')
  const [accountNumber, setAccountNumber] = useState('')
  const [accountName, setAccountName] = useState('')
  const [step, setStep] = useState<'form' | 'verify'>('form')
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [code, setCode] = useState('')

  const addMutation = useMutation({
    mutationFn: () =>
      api.post<PayoutMethod>('/users/payout-methods', {
        method_type: methodType,
        country_code: country,
        network_name: networkName,
        account_number: accountNumber,
        account_name: accountName,
      }).then(r => r.data),
    onSuccess: (data) => {
      setPendingId(data.id)
      setStep('verify')
      toast.success('Method added — enter the verification code sent to your phone')
    },
    onError: () => toast.error('Failed to add payout method'),
  })

  const verifyMutation = useMutation({
    mutationFn: () =>
      api.post(`/users/payout-methods/${pendingId}/verify`, { code }).then(r => r.data),
    onSuccess: () => {
      toast.success('Payout method verified!')
      onSuccess()
    },
    onError: () => toast.error('Invalid or expired code'),
  })

  const selectedCountryNetworks = COUNTRY_NETWORKS[country] ?? []

  if (step === 'verify') {
    return (
      <div className="space-y-4">
        <p className="text-sm text-gray-400">
          A 6-digit code was sent to <span className="text-white font-medium">{accountNumber}</span> via WhatsApp.
        </p>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Verification code</label>
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={e => setCode(e.target.value)}
            placeholder="123456"
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white text-center text-lg tracking-widest focus:border-brand-500 focus:outline-none"
          />
        </div>
        <button
          onClick={() => verifyMutation.mutate()}
          disabled={code.length !== 6 || verifyMutation.isPending}
          className="w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50"
        >
          {verifyMutation.isPending ? 'Verifying…' : 'Verify'}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Country */}
      <div>
        <label className="block text-xs text-gray-400 mb-1">Country</label>
        <select
          value={country}
          onChange={e => { setCountry(e.target.value); setNetworkName('') }}
          className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white focus:border-brand-500 focus:outline-none"
        >
          <option value="">Select country…</option>
          {Object.entries(COUNTRY_LABELS).map(([code, label]) => (
            <option key={code} value={code}>{label}</option>
          ))}
        </select>
      </div>

      {/* Network */}
      {country && (
        <div>
          <label className="block text-xs text-gray-400 mb-1">Network / Provider</label>
          <select
            value={networkName}
            onChange={e => {
              const opt = selectedCountryNetworks.find(n => n.networks[0] === e.target.value)
              setNetworkName(e.target.value)
              if (opt) setMethodType(opt.type)
            }}
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white focus:border-brand-500 focus:outline-none"
          >
            <option value="">Select network…</option>
            {selectedCountryNetworks.map(n => (
              <option key={n.networks[0]} value={n.networks[0]}>{n.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* Account number */}
      {networkName && (
        <>
          <div>
            <label className="block text-xs text-gray-400 mb-1">
              {methodType === 'bank_transfer' ? 'Account number' : 'Mobile money number'}
            </label>
            <input
              type="text"
              value={accountNumber}
              onChange={e => setAccountNumber(e.target.value)}
              placeholder={methodType === 'mobile_money' ? '+220 7XX XXXX' : 'Account number'}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white focus:border-brand-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Account / recipient name</label>
            <input
              type="text"
              value={accountName}
              onChange={e => setAccountName(e.target.value)}
              placeholder="Full name as registered"
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white focus:border-brand-500 focus:outline-none"
            />
          </div>
        </>
      )}

      <button
        onClick={() => addMutation.mutate()}
        disabled={!country || !networkName || !accountNumber || !accountName || addMutation.isPending}
        className="w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50"
      >
        {addMutation.isPending ? 'Adding…' : 'Add payout method'}
      </button>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PayoutSettings() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)

  const { data: methods = [], isLoading } = useQuery({
    queryKey: ['payout-methods'],
    queryFn: () => api.get<PayoutMethod[]>('/users/payout-methods').then(r => r.data),
  })

  return (
    <Layout>
      <div className="max-w-xl mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-bold text-white">Receive Money</h1>
          <p className="text-sm text-gray-400 mt-1">
            Add a mobile money or bank account to receive campaign payouts in local currency.
          </p>
        </div>

        {/* Existing methods */}
        {isLoading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : methods.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-700 bg-gray-900/50 p-8 text-center">
            <p className="text-sm text-gray-500">No payout methods yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {methods.map(m => (
              <div
                key={m.id}
                className="rounded-xl border border-gray-800 bg-gray-900 p-4 flex items-start justify-between gap-4"
              >
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-white">{m.network_name}</span>
                    {m.is_default && (
                      <span className="rounded-full bg-brand-900/50 border border-brand-800 px-2 py-0.5 text-xs text-brand-400">
                        Default
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400">{m.account_name}</p>
                  <p className="text-xs text-gray-500 font-mono">{m.account_number}</p>
                </div>
                <VerifiedBadge verified={m.is_verified} />
              </div>
            ))}
          </div>
        )}

        {/* Add form toggle */}
        {showForm ? (
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
            <h2 className="text-sm font-semibold text-white mb-4">Add payout method</h2>
            <AddMethodForm
              onSuccess={() => {
                qc.invalidateQueries({ queryKey: ['payout-methods'] })
                setShowForm(false)
              }}
            />
          </div>
        ) : (
          <button
            onClick={() => setShowForm(true)}
            className="w-full rounded-xl border border-dashed border-gray-700 bg-gray-900/50 px-4 py-3 text-sm text-gray-400 hover:border-brand-600 hover:text-brand-400 transition-colors"
          >
            + Add payout method
          </button>
        )}
      </div>
    </Layout>
  )
}
