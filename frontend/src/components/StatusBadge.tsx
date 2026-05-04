import type { CampaignStatus } from '../types'

const MAP: Record<CampaignStatus, { label: string; cls: string }> = {
  active:    { label: 'Active',    cls: 'bg-brand-700 text-brand-100 ring-1 ring-brand-500' },
  paused:    { label: 'Paused',    cls: 'bg-yellow-900 text-yellow-200 ring-1 ring-yellow-600' },
  completed: { label: 'Completed', cls: 'bg-blue-900 text-blue-200 ring-1 ring-blue-500' },
  archived:  { label: 'Archived',  cls: 'bg-gray-800 text-gray-400 ring-1 ring-gray-600' },
}

export default function StatusBadge({ status }: { status: CampaignStatus }) {
  const { label, cls } = MAP[status] ?? MAP.archived
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  )
}
