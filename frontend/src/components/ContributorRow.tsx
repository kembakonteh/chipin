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
  onInvite?: (c: Contributor) => void
}

export default function ContributorRow({ contributor: c, onMarkPaid, onSendReminder, onInvite }: Props) {
  const isPaid = c.paid
  const isDeclined = c.status === 'declined'
  const isInvited = c.status === 'invited'

  const showInviteBtn = onInvite && !isPaid && !isDeclined && c.phone
  const showReInviteBtn = onInvite && !isPaid && isInvited && c.phone
  const inviteBtnLabel = isInvited ? 'Re-invite' : 'Invite'

  return (
    <div
      role={!isPaid && onMarkPaid && !isDeclined ? 'button' : undefined}
      tabIndex={!isPaid && onMarkPaid && !isDeclined ? 0 : undefined}
      onClick={() => { if (!isPaid && onMarkPaid && !isDeclined) onMarkPaid(c) }}
      onKeyDown={(e) => { if (e.key === 'Enter' && !isPaid && onMarkPaid && !isDeclined) onMarkPaid(c) }}
      className={`flex items-center gap-3 rounded-lg px-4 py-3 transition-colors
        ${isDeclined
          ? 'bg-gray-900/50 border border-gray-800/50 opacity-50'
          : isPaid
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
        ) : isDeclined ? (
          <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-gray-700 text-gray-600 text-xs">✕</span>
        ) : (
          <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-dashed border-gray-600 text-gray-600 text-xs">○</span>
        )}
      </div>

      {/* Name */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`text-sm font-medium truncate ${isPaid ? 'text-white' : isDeclined ? 'text-gray-600' : 'text-gray-400'}`}>
            {c.name}
          </span>
          {c.is_anonymous && <PrivacyLockBadge />}
          {/* Status badge */}
          {isInvited && !isPaid && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-sky-900/40 text-sky-300 border border-sky-800/40">
              📨 Invited
            </span>
          )}
          {isDeclined && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-800 text-gray-500 border border-gray-700">
              ❌ Declined
            </span>
          )}
        </div>
        {isPaid && c.paid_at && (
          <p className="text-xs text-gray-500 mt-0.5">{fmtTime(c.paid_at)}</p>
        )}
        {!isPaid && !isDeclined && (
          <p className="text-xs text-gray-600 mt-0.5">{isInvited ? 'Awaiting payment' : 'Unpaid'}</p>
        )}
        {isDeclined && (
          <p className="text-xs text-gray-700 mt-0.5">Declined to contribute</p>
        )}
      </div>

      {/* Amount + badges + actions */}
      <div className="flex items-center gap-2 shrink-0">
        <span className={`text-sm font-semibold tabular-nums ${isPaid ? 'text-brand-300' : 'text-gray-600'}`}>
          {fmt(parseFloat(c.amount))}
        </span>
        {isPaid && c.paid_via && (
          <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${VIA_COLORS[c.paid_via] ?? VIA_COLORS.manual}`}>
            {VIA_LABELS[c.paid_via] ?? c.paid_via}
          </span>
        )}
        {!isPaid && !isDeclined && (
          <>
            {(showInviteBtn || showReInviteBtn) && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onInvite!(c) }}
                className={`rounded border px-2.5 py-1 text-xs transition-colors
                  ${isInvited
                    ? 'border-sky-800/50 text-sky-400 hover:border-sky-600 hover:bg-sky-900/30'
                    : 'border-gray-700 text-gray-400 hover:border-brand-600 hover:text-brand-300'
                  }`}
              >
                {inviteBtnLabel}
              </button>
            )}
            {!c.phone && onInvite && (
              <span className="text-[10px] text-gray-600" title="Add a phone number to enable invites">
                📵
              </span>
            )}
            {onSendReminder && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onSendReminder(c) }}
                className="rounded border border-gray-700 px-2.5 py-1 text-xs text-gray-400
                  hover:border-brand-600 hover:text-brand-300 transition-colors"
              >
                Remind
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
