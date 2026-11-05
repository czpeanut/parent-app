/** 準備進度環形百分比（對應學生端 app/v2/_readiness/shared.tsx 的 Ring） */
export function Ring({ value, size = 78 }: { value: number; size?: number }) {
  const v = Math.max(0, Math.min(100, Math.round(value)))
  const r = size / 2 - 9, c = 2 * Math.PI * r
  const color = v >= 80 ? 'var(--good)' : v < 50 ? 'var(--progress-low)' : 'var(--color-accent)'
  return (
    <svg className="cx-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`準備進度 ${v}%`}>
      <circle className="track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={9} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={9} strokeLinecap="round"
        strokeDasharray={`${(c * v) / 100} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fontSize={size * 0.23}>{v}%</text>
    </svg>
  )
}
