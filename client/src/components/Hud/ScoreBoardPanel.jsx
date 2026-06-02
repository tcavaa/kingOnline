import { ClipboardList } from 'lucide-react'
import { useGame } from '../../context/GameContext'
import { Pill } from './Pill'

/** Bottom-left: Score Board pill + 3-player mini score panel. */
export default function ScoreBoardPanel({ onOpen }) {
  const { players, cumulativeScores } = useGame()
  const sorted = [...players].sort((a, b) => a.seat - b.seat)

  return (
    <div className="absolute bottom-3 lg:bottom-4 left-3 lg:left-4 z-20 flex flex-col gap-1.5 lg:gap-2 pointer-events-auto max-w-[calc(100vw-1.5rem)]">
      <Pill onClick={onOpen} className="self-start px-2.5 lg:px-3" title="Score Board">
        <ClipboardList size={14} />
        <span className="text-xs lg:text-sm">Score Board</span>
      </Pill>
      <div className="rounded-xl px-2 py-1.5 lg:px-3 lg:py-2 bg-leather border-brass" style={{ backdropFilter: 'blur(12px)' }}>
        <div className="flex items-center gap-2 lg:gap-3">
          {sorted.map(p => {
            const score = cumulativeScores[p.seat] ?? 0
            const colour = score > 0 ? 'score-pos-soft' : score < 0 ? 'score-neg-soft' : 'score-nil-soft'
            return (
              <div key={p.seat} className="flex flex-col items-center min-w-0">
                {/* Cap the name width so a single overlong handle can't blow
                    the panel out past the right edge of the screen.
                    `truncate` adds the ellipsis when it overflows. */}
                <span className="text-[9px] lg:text-[10px] uppercase tracking-wider text-amber-dim truncate max-w-[4rem] lg:max-w-[5.5rem]">{p.name}</span>
                <span className={`text-sm lg:text-base font-black font-mono ${colour}`}>
                  {score > 0 ? '+' : ''}{score}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
