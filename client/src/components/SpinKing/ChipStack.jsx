import { chipBreakdown } from '../../constants/spinKing'

/**
 * DOM chip-pile visual: one column per denomination (gold 1000 / purple 500 /
 * black 100 / green 25 / red 5 / white 1), column height tracking the count.
 * Pure presentation — the exact number always rides alongside as text.
 */
export default function ChipStack({ amount, chipW = 18, maxPerCol = 6, className = '' }) {
  const cols = chipBreakdown(amount, maxPerCol)
  const chipH = Math.max(3, Math.round(chipW * 0.3))
  if (!cols.length) {
    // Zero/empty stack — a faint outline so layouts don't jump.
    return (
      <span className={`inline-block rounded-full ${className}`}
            style={{ width: chipW, height: chipH, border: '1px dashed rgba(59,35,20,0.35)' }} />
    )
  }
  return (
    <span className={`inline-flex items-end ${className}`} style={{ gap: 2 }}
          title={Math.round(amount).toLocaleString()}>
      {cols.map((c, ci) => (
        <span key={ci} className="inline-flex flex-col-reverse" style={{ gap: 1 }}>
          {Array.from({ length: c.count }).map((_, i) => (
            <span key={i}
                  style={{
                    width: chipW,
                    height: chipH,
                    borderRadius: chipH,
                    background: `linear-gradient(180deg, ${c.color} 0%, ${c.dark} 100%)`,
                    border: '1px solid rgba(0,0,0,0.4)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35)',
                  }} />
          ))}
        </span>
      ))}
    </span>
  )
}
