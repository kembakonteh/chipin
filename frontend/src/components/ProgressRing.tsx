interface Props {
  percent: number
  size?: number
  strokeWidth?: number
  color?: string
  trackColor?: string
  label?: string
}

export default function ProgressRing({
  percent,
  size = 140,
  strokeWidth = 12,
  color = '#40916C',
  trackColor = '#1B4332',
  label,
}: Props) {
  const r = (size - strokeWidth) / 2
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - Math.min(percent, 100) / 100)
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
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-white">{Math.round(percent)}%</span>
        {label && <span className="text-xs text-gray-400 mt-0.5">{label}</span>}
      </div>
    </div>
  )
}
