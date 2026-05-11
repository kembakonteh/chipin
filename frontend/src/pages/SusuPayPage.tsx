import { useState, useEffect } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import type { AxiosResponse } from 'axios'
import { api } from '../lib/api'
import type { SusuPayPageInfo } from '../types'
import { fmt } from '../types'

function getData<T>(r: AxiosResponse<T>): T { return r.data }

type PageState = 'info' | 'success' | 'already_paid' | 'pending_verification'

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="text-xs px-2 py-1 rounded bg-gray-700 border border-gray-600 text-gray-300 hover:bg-gray-600 transition-colors"
    >
      {copied ? '✓ Copied' : 'Copy'}
    </button>
  )
}

export default function SusuPayPage() {
  const { slug, member_id } = useParams<{ slug: string; member_id: string }>()
  const [searchParams] = useSearchParams()
  const isPartner = searchParams.get('partner') === '1'
  const partnerParam = isPartner ? '?partner=1' : ''
  const [state, setState] = useState<PageState>('info')
  const [offlineMethod, setOfflineMethod] = useState<'cashapp' | 'zelle' | null>(null)

  const { data: info, isLoading } = useQuery<SusuPayPageInfo>({
    queryKey: ['susu-pay-info', slug, member_id, isPartner],
    queryFn: () => api.get<SusuPayPageInfo>(`/s/${slug}/pay/${member_id}${partnerParam}`).then(getData),
  })

  useEffect(() => {
    if (!info) return
    if (info.already_paid) setState('already_paid')
    else if (info.pending_verification) setState('pending_verification')
  }, [info])

  const stripeCheckout = useMutation({
    mutationFn: () => api.post<{ checkout_url: string }>(`/s/${slug}/pay/${member_id}/stripe${partnerParam}`).then(getData),
    onSuccess: (d) => { window.location.href = d.checkout_url },
  })

  const offlinePay = useMutation({
    mutationFn: (paid_via: 'cashapp' | 'zelle') =>
      api.post(`/s/${slug}/pay/${member_id}/offline${partnerParam}`, { paid_via }).then(getData),
    onSuccess: () => setState('success'),
    onError: (err: any) => {
      const msg = err?.response?.data?.detail ?? 'Something went wrong'
      alert(msg)
    },
  })

  const headerEl = (
    <header className="border-b border-gray-800 bg-gray-950 sticky top-0 z-20">
      <div className="mx-auto flex max-w-sm items-center justify-between gap-2.5 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="text-xl">🌍</span>
          <div className="leading-none">
            <span className="block text-xs text-brand-400 font-medium">KafoTech</span>
            <span className="block text-sm font-bold text-white">ChipIn · Susu</span>
          </div>
        </div>
        <Link to={`/s/${slug}`} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
          ← Group page
        </Link>
      </div>
    </header>
  )

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-950">
        {headerEl}
        <div className="flex items-center justify-center py-20">
          <p className="text-gray-500">Loading…</p>
        </div>
      </div>
    )
  }

  if (!info) {
    return (
      <div className="min-h-screen bg-gray-950">
        {headerEl}
        <div className="mx-auto max-w-sm px-4 py-16 text-center">
          <span className="text-4xl block mb-4">🔒</span>
          <h1 className="text-xl font-bold text-white mb-2">Not Available</h1>
          <p className="text-sm text-gray-400">This payment link could not be found or the group is not active.</p>
          <Link to={`/s/${slug}`} className="inline-block mt-6 text-sm px-4 py-2 rounded-lg bg-brand-700 text-white hover:bg-brand-600 transition-colors">
            View group
          </Link>
        </div>
      </div>
    )
  }

  if (state === 'already_paid') {
    return (
      <div className="min-h-screen bg-gray-950">
        {headerEl}
        <div className="mx-auto max-w-sm px-4 py-16 text-center">
          <span className="text-5xl block mb-4">✅</span>
          <h1 className="text-xl font-bold text-white mb-2">Already Paid!</h1>
          <p className="text-sm text-gray-400 mb-6">
            <span className="text-white font-medium">{info.member_name}</span> has already paid for Cycle {info.cycle_number}.
          </p>
          <Link to={`/s/${slug}/standings`} className="text-sm px-4 py-2 rounded-lg bg-brand-700 text-white hover:bg-brand-600 transition-colors">
            View standings
          </Link>
        </div>
      </div>
    )
  }

  if (state === 'pending_verification') {
    const methodLabel = info.pending_paid_via === 'cashapp' ? 'CashApp' : info.pending_paid_via === 'zelle' ? 'Zelle' : 'offline'
    return (
      <div className="min-h-screen bg-gray-950">
        {headerEl}
        <div className="mx-auto max-w-sm px-4 py-16 text-center">
          <span className="text-5xl block mb-4">⏳</span>
          <h1 className="text-xl font-bold text-white mb-2">Awaiting Confirmation</h1>
          <p className="text-sm text-gray-400 mb-6">
            Your {methodLabel} payment of{' '}
            <span className="text-white font-medium">{fmt(parseFloat(info.amount))}</span> has been submitted.
            The organiser will confirm receipt shortly.
          </p>
          <Link to={`/s/${slug}/standings`} className="text-sm px-4 py-2 rounded-lg bg-brand-700 text-white hover:bg-brand-600 transition-colors">
            View standings
          </Link>
        </div>
      </div>
    )
  }

  if (state === 'success') {
    const methodLabel = offlineMethod === 'cashapp' ? 'CashApp' : 'Zelle'
    return (
      <div className="min-h-screen bg-gray-950">
        {headerEl}
        <div className="mx-auto max-w-sm px-4 py-16 text-center">
          <span className="text-5xl block mb-4">🎉</span>
          <h1 className="text-xl font-bold text-white mb-2">Payment Submitted!</h1>
          <p className="text-sm text-gray-400 mb-6">
            Your {methodLabel} payment of{' '}
            <span className="text-white font-medium">{fmt(parseFloat(info.amount))}</span> has been noted.
            The organiser will confirm receipt.
          </p>
          <Link to={`/s/${slug}/standings`} className="text-sm px-4 py-2 rounded-lg bg-brand-700 text-white hover:bg-brand-600 transition-colors">
            View standings
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950">
      {headerEl}
      <main className="mx-auto max-w-sm px-4 py-8 space-y-6">
        <div className="text-center">
          <div className="text-4xl mb-3">💰</div>
          <h1 className="text-xl font-bold text-white">{info.group_name}</h1>
          <p className="text-sm text-gray-400 mt-1">
            Cycle {info.cycle_number} contribution for{' '}
            <span className="text-white font-medium">{info.member_name}</span>
          </p>
          {info.is_split && info.split_partner_name && (
            <p className="text-xs text-violet-300 mt-1.5 flex items-center justify-center gap-1">
              <span>✂️</span>
              <span>Splitting this hand with <strong>{info.split_partner_name}</strong></span>
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-gray-700 bg-gray-900 p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400">
              {info.is_split ? 'Your share (split)' : 'Amount due'}
            </span>
            <span className="text-2xl font-bold text-white">{fmt(parseFloat(info.amount))}</span>
          </div>

          <div className="border-t border-gray-800 pt-4 space-y-3">
            {/* Card / Stripe */}
            {info.allow_card && (
              <div>
                <button
                  onClick={() => stripeCheckout.mutate()}
                  disabled={stripeCheckout.isPending}
                  className="w-full py-3 bg-brand-600 text-white font-semibold rounded-lg hover:bg-brand-500 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                >
                  {stripeCheckout.isPending ? 'Redirecting…' : <><span>💳</span> Pay by Card</>}
                </button>
                <p className="mt-1.5 text-xs text-gray-500 text-center">
                  💳 A processing fee may apply for card payments. Your exact total will be shown at checkout.
                </p>
              </div>
            )}

            {/* CashApp */}
            {info.allow_cashapp && (
              <div className="rounded-xl border border-emerald-800 bg-emerald-950 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-emerald-300">💚 CashApp</span>
                  {info.cashapp_handle && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white">{info.cashapp_handle}</span>
                      <CopyButton text={info.cashapp_handle} />
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-400 mb-3">
                  Send <span className="text-white font-medium">{fmt(parseFloat(info.amount))}</span> to{' '}
                  {info.cashapp_handle
                    ? <span className="text-emerald-300 font-medium">{info.cashapp_handle}</span>
                    : 'the organiser\'s CashApp'
                  }
                  , then tap the button below.
                </p>
                <button
                  onClick={() => { setOfflineMethod('cashapp'); offlinePay.mutate('cashapp') }}
                  disabled={offlinePay.isPending}
                  className="w-full py-2.5 bg-emerald-700 text-white font-semibold text-sm rounded-lg hover:bg-emerald-600 disabled:opacity-50 transition-colors"
                >
                  {offlinePay.isPending && offlineMethod === 'cashapp' ? 'Submitting…' : 'I sent payment via CashApp'}
                </button>
              </div>
            )}

            {/* Zelle */}
            {info.allow_zelle && (
              <div className="rounded-xl border border-indigo-700 bg-indigo-950 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-indigo-300">🔵 Zelle</span>
                  {info.zelle_handle && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white">{info.zelle_handle}</span>
                      <CopyButton text={info.zelle_handle} />
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-400 mb-3">
                  Send <span className="text-white font-medium">{fmt(parseFloat(info.amount))}</span> via Zelle to{' '}
                  {info.zelle_handle
                    ? <span className="text-indigo-300 font-medium">{info.zelle_handle}</span>
                    : 'the organiser\'s Zelle'
                  }
                  , then tap the button below.
                </p>
                <button
                  onClick={() => { setOfflineMethod('zelle'); offlinePay.mutate('zelle') }}
                  disabled={offlinePay.isPending}
                  className="w-full py-2.5 bg-indigo-700 text-white font-semibold text-sm rounded-lg hover:bg-indigo-600 disabled:opacity-50 transition-colors"
                >
                  {offlinePay.isPending && offlineMethod === 'zelle' ? 'Submitting…' : 'I sent payment via Zelle'}
                </button>
              </div>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-gray-600 pb-4">
          Powered by KafoTech ChipIn
        </p>
      </main>
    </div>
  )
}
