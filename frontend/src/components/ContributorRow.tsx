import type { Contributor } from '../types'
import { fmt, fmtTime } from '../types'
import PrivacyLockBadge from './PrivacyLockBadge'

const VIA_LABELS: Record<string, string> = {
  card: 'Card', zelle: 'Zelle', cash: 'Cash', cashapp: 'CashApp', manual: 'Manual',
}
const VIA_COLORS: Record<string, string> = {
  card:    'bg-blue-900 text-blue-200',
  zelle:   'bg-purple-900 text-purple-200',
  cash:    'bg-brand-800 text-brand-200',
  cashapp: 'bg-lime-900 text-lime-200',
  manual:  'bg-gray-700 text-gray-300',
}

interface Props {
  contributor: Contributor
  onMarkPaid?: (c: Contributor) => void
  onSendReminder?: (c: Contributor) => void
}

export default function ContributorRow({ contributor: c, onMarkPaid, onSendReminder }: Props) {
  const isPaid = c.paid

  return (
    <div
      role={!isPaid && onMarkPaid ? 'button' : undefined}
      tabIndex={!isPaid && onMarkPaid ? 0 : undefined}
      onClick={() => { if (!isPaid && onMarkPaid) onMarkPaid(c) }}
      onKeyDown={(e) => { if (e.key === 'Enter' && !isPaid && onMarkPaid) onMarkPaid(c) }}
      className={`flex items-center gap-3 rounded-lg px-4 py-3 transition-colors
        ${isPaid
          ? 'bg-gray-900 border border-gray-800'
          : onMarkPaid
            ? 'bg-gray-900 border border-dashed border-gray-700 cursor-pointer hover:border-brand-600 hover:bg-gray-800/50'
            : 'bg-gray-900 border border-dashed border-gray-700'
        }`}
    >
      {/* Status icon */}
      <div className="shrink-0">
        {isPaid ? (
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-700 text-brand-200 text-sm">✓</span>
        ) : (
          <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-dashed border-gray-600 text-gray-600 text-xs">○</span>
        )}
      </div>

      {/* Name */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={`text-sm font-medium truncate ${isPaid ? 'text-white' : 'text-gray-400'}`}>
            {c.name}
          </span>
          {c.is_anonymous && <PrivacyLockBadge />}
        </div>
        {isPaid && c.paid_at && (
          <p className="text-xs text-gray-500 mt-0.5">{fmtTime(c.paid_at)}</p>
        )}
        {!isPaid && (
          <p className="text-xs text-gray-600 mt-0.5">Unpaid</p>
        )}
      </div>

      {/* Amount + badges */}
      <div className="flex items-center gap-2 shrink-0">
        <span className={`text-sm font-semibold tabular-nums ${isPaid ? 'text-brand-300' : 'text-gray-600'}`}>
          {fmt(parseFloat(c.amount))}
        </span>
        {isPaid && c.paid_via && (
          <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${VIA_COLORS[c.paid_via] ?? VIA_COLORS.manual}`}>
            {VIA_LABELS[c.paid_via] ?? c.paid_via}
          </span>
        )}
        {!isPaid && onSendReminder && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onSendReminder(c) }}
            className="rounded border border-gray-700 px-2.5 py-1 text-xs text-gray-400
              hover:border-brand-600 hover:text-brand-300 transition-colors"
          >
            Remind
          </button>
        )}
      </div>
    </div>
  )
}
