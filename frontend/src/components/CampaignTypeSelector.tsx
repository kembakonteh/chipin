import type { CampaignType } from '../types'

export const CAMPAIGN_TYPES: {
  value: CampaignType
  emoji: string
  label: string
  desc: string
}[] = [
  { value: 'general',     emoji: '⚽', label: 'General',     desc: 'Soccer, trips, group events' },
  { value: 'memorial',    emoji: '🕊',  label: 'Memorial',    desc: 'Funeral, repatriation, bereavement' },
  { value: 'charity',     emoji: '❤️',  label: 'Charity',     desc: 'Community support, donations' },
  { value: 'celebration', emoji: '🎉', label: 'Celebration', desc: 'Weddings, graduations, showers' },
]

interface Props {
  value: CampaignType
  onChange: (v: CampaignType) => void
}

export default function CampaignTypeSelector({ value, onChange }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {CAMPAIGN_TYPES.map((t) => {
        const selected = value === t.value
        return (
          <button
            key={t.value}
            type="button"
            onClick={() => onChange(t.value)}
            className={`flex items-start gap-2 rounded-lg border p-3 text-left transition-colors
              ${selected
                ? 'border-brand-500 bg-brand-700/30 text-white'
                : 'border-gray-700 bg-gray-800 text-gray-300 hover:border-brand-600 hover:bg-gray-700'
              }`}
          >
            <span className="text-2xl leading-none mt-0.5">{t.emoji}</span>
            <span>
              <span className="block text-sm font-semibold">{t.label}</span>
              <span className="block text-xs text-gray-400 mt-0.5">{t.desc}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
