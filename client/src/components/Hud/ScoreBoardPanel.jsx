import { ClipboardList } from 'lucide-react'
import { useGame } from '../../context/GameContext'
import { Pill } from './Pill'

/** Bottom-left: Score Board pill + 3-player mini score panel. */
export default function ScoreBoardPanel({ onOpen }) {
  const { players, cumulativeScores } = useGame()
  const sorted = [...players].sort((a, b) => a.seat - b.seat)

  return (
    <div className="absolute bottom-4 left-4 z-20 flex flex-col gap-2 pointer-events-auto">
      <Pill onClick={onOpen} className="self-start" title="Score Board">
        <ClipboardList size={16} />
        <span>Score Board</span>
      </Pill>
      <div className="rounded-2xl px-4 py-2.5 bg-leather border-brass" style={{ backdropFilter: 'blur(12px)' }}>
        <div className="flex items-center gap-4">
          {sorted.map(p => {
            const score = cumulativeScores[p.seat] ?? 0
            const colour = score > 0 ? 'score-pos-soft' : score < 0 ? 'score-neg-soft' : 'score-nil-soft'
            return (
              <div key={p.seat} className="flex flex-col items-center">
                <span className="text-[10px] uppercase tracking-wider text-amber-dim">{p.name}</span>
                <span className={`text-base font-black font-mono ${colour}`}>
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
