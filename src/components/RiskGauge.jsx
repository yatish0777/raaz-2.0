import { riskLevel } from '../lib/format'
import { RiskBadge } from './ui'

// Banded score bar: the number is the message, the bar shows where it sits in the bands.
const BANDS = [
  [0, 40, 'Low', 'var(--color-good)'],
  [40, 60, 'Medium', 'var(--color-warn)'],
  [60, 80, 'High', 'var(--color-serious)'],
  [80, 100, 'Critical', 'var(--color-critical)'],
]

export default function RiskGauge({ score }) {
  const level = riskLevel(score)
  return (
    <div role="img" aria-label={`Risk score ${score} of 100, ${level}`}>
      <div className="flex items-baseline gap-3">
        <span className="font-cond text-5xl leading-none font-semibold text-navy-900 tabular">{score}</span>
        <span className="text-sm text-ink-3">out of 100</span>
        <RiskBadge level={level} className="ml-auto" />
      </div>
      <div className="relative mt-4">
        <div className="flex h-2 gap-0.5 overflow-hidden rounded-sm">
          {BANDS.map(([s, e, , c]) => (
            <div key={s} style={{ width: `${e - s}%`, background: c, opacity: score >= s ? 1 : 0.25 }} />
          ))}
        </div>
        <div className="absolute -top-1 h-4 w-0.5 bg-navy-900" style={{ left: `calc(${Math.min(100, Math.max(0, score))}% - 1px)` }} />
      </div>
      <div className="mt-1.5 flex text-[11px] text-ink-3">
        {BANDS.map(([s, e, name]) => <span key={s} style={{ width: `${e - s}%` }}>{name}</span>)}
      </div>
    </div>
  )
}
