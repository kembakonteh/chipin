interface Props {
  percent: number
  size?: number
  strokeWidth?: number
  color?: string
  trackColor?: string
  label?: string
  openGoal?: boolean
}

export default function ProgressRing({
  percent,
  size = 140,
  strokeWidth = 12,
  color = '#40916C',
  trackColor = '#1B4332',
  label,
  openGoal = false,
}: Props) {
  const r = (size - strokeWidth) / 2
  const circ = 2 * Math.PI * r
  const safePct = openGoal ? 100 : Math.min(Math.max(isNaN(percent) ? 0 : percent, 0), 100)
  const offset = circ * (1 - safePct / 100)
  const center = size / 2

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
        />
        <circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center px-2">
        {openGoal ? (
          <>
            <span className="text-xl font-bold text-white leading-none">∞</span>
            <span className="text-xs text-white/70 mt-1 text-center leading-tight">Open goal</span>
          </>
        ) : (
          <>
            <span className="text-2xl font-bold text-white leading-none">{Math.round(safePct)}%</span>
            {label && <span className="text-xs text-gray-400 mt-0.5 text-center leading-tight">{label}</span>}
          </>
        )}
      </div>
    </div>
  )
}
