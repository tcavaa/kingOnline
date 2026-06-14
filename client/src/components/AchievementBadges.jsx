import { ACHIEVEMENT_DEFS } from '../utils/achievements'

/**
 * Renders a set of achievement badges.
 *
 * @param {object}  achievements  { [code]: count } — counts > 0 are shown.
 * @param {'full'|'inline'} variant
 *   'full'   — stacked icon + label cards (game-over screen, profiles).
 *   'inline' — just the icons in a row (history list rows).
 * @param {number} size  icon size in px.
 */
export default function AchievementBadges({ achievements, variant = 'full', size }) {
  const entries = Object.entries(achievements || {}).filter(([, count]) => count > 0)
  if (!entries.length) return null

  if (variant === 'inline') {
    const px = size || 14
    return (
      <span className="inline-flex flex-wrap items-center gap-1 align-middle">
        {entries.map(([code, count]) => {
          const def = ACHIEVEMENT_DEFS[code]
          if (!def) return null
          const Icon = def.Icon
          return (
            <span key={code} className="inline-flex items-center"
                  title={`${def.label}: ${def.desc}${count > 1 ? ` (×${count})` : ''}`}>
              <Icon size={px} style={{ color: def.color }} />
              {count > 1 && (
                <span className="text-[9px] font-bold ml-0.5" style={{ color: def.color }}>×{count}</span>
              )}
            </span>
          )
        })}
      </span>
    )
  }

  const px = size || 22
  return (
    <div className="flex flex-wrap gap-2">
      {entries.map(([code, count]) => {
        const def = ACHIEVEMENT_DEFS[code]
        if (!def) return null
        const Icon = def.Icon
        return (
          <div key={code}
               title={`${def.label}: ${def.desc}`}
               className="flex flex-col items-center justify-center gap-1 rounded-lg px-2 py-1.5"
               style={{
                 minWidth: 66,
                 background: 'rgba(28,16,10,0.7)',
                 border: `1px solid ${def.color}55`,
               }}>
            <Icon size={px} style={{ color: def.color }} />
            <div className="text-[9px] uppercase tracking-wide text-center leading-tight"
                 style={{ color: '#f5e9cf' }}>
              {def.label}
            </div>
            {count > 1 && (
              <div className="text-[10px] font-bold" style={{ color: def.color }}>×{count}</div>
            )}
          </div>
        )
      })}
    </div>
  )
}
