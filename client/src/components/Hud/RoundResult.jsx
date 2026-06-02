import { useEffect, useRef } from 'react'
import confetti from 'canvas-confetti'
import { ArrowRight } from 'lucide-react'
import { useGame } from '../../context/GameContext'
import { getGameType } from '../../constants/gameTypes'

const scoreCol = (v) =>
  v > 0 ? 'score-pos-soft' : v < 0 ? 'score-neg-soft' : 'text-cream-soft'

/**
 * The big "Round X Settled" modal. Adds a single juice trick — a confetti
 * burst when this player scored positive on the round, a tumbleweed roll
 * across the screen when they scored negative.
 */
export default function RoundResult() {
  const {
    round, chosenGameType, roundScores, cumulativeScores, players,
    isCreator, nextRound, leaderSeat, mySeat,
  } = useGame()
  const lastRound  = roundScores[roundScores.length - 1]
  const gt         = getGameType(chosenGameType)
  const TypeIcon   = gt?.Icon
  const leaderName = players.find(p => p.seat === leaderSeat)?.name ?? `P${leaderSeat}`
  const myDelta    = lastRound?.scores?.[mySeat] ?? 0

  // Trigger confetti / tumbleweed exactly once when the modal first appears.
  const playedRef = useRef(false)
  useEffect(() => {
    if (playedRef.current || !lastRound) return
    playedRef.current = true
    if (myDelta > 0) {
      confetti({
        particleCount: 90,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#f0c75a', '#fde9b8', '#a3d68a', '#daa520', '#fff8e6'],
      })
    }
  }, [lastRound, myDelta])

  const sortedPlayers = [...players].sort((a, b) => a.seat - b.seat)

  return (
    // Compact modal designed to fit a landscape phone (≈430 px tall, less
    // ~80 px for the Safari URL bar). The Layers icon and verbose paddings
    // from the original design are gone; the two score panels are tight
    // single-row grids. On lg+ viewports the modal breathes out a bit via
    // the `lg:` paddings/fonts.
    <div className="absolute inset-0 z-40 flex items-center justify-center p-2 lg:p-4 pointer-events-auto western-backdrop overflow-y-auto">
      {/* Tumbleweed reaches in from the left when this player scored negative. */}
      {myDelta < 0 && (
        <svg viewBox="0 0 64 64" className="tumbleweed" aria-hidden="true">
          <g stroke="#9c7242" strokeWidth="2" fill="none" strokeLinecap="round">
            <circle cx="32" cy="32" r="26" stroke="#7d5c33" />
            <path d="M8 32 L56 32 M32 8 L32 56 M14 14 L50 50 M50 14 L14 50" />
            <path d="M20 12 Q32 32 12 44" />
            <path d="M44 12 Q32 32 52 44" />
            <path d="M12 20 Q32 32 44 52" />
          </g>
        </svg>
      )}

      <div className="w-full max-w-sm rounded-2xl p-3 lg:p-6 text-center western-panel my-auto">
        <h2 className="text-sm lg:text-xl font-western uppercase tracking-wider text-cream"
            style={{ textShadow: '0 1px 0 rgba(0,0,0,0.5)' }}>
          Round {round} Settled
        </h2>

        {gt && (
          <div className="inline-flex items-center gap-1.5 mt-1 mb-2 lg:mt-2 lg:mb-4 rounded-full px-2.5 py-0.5 text-[10px] lg:text-xs font-typewriter"
               style={{
                 background: `linear-gradient(180deg, ${gt.color}33, ${gt.color}11)`,
                 color: '#fff8e6',
                 border: `1px solid ${gt.color}80`,
               }}>
            {TypeIcon && <TypeIcon size={11} style={{ color: gt.color }} />}
            <span><strong style={{ color: gt.color }}>{gt.name}</strong> — called by {leaderName}</span>
          </div>
        )}

        {lastRound && (
          <div className="rounded-lg p-2 lg:p-4 mb-1.5 lg:mb-4 inset-card">
            <p className="text-[9px] lg:text-[10px] uppercase tracking-widest mb-1 lg:mb-3 font-western text-amber-dim">This Round</p>
            <div className="grid grid-cols-3 gap-1.5 lg:gap-2">
              {sortedPlayers.map(p => {
                const s = lastRound.scores?.[p.seat] ?? 0
                return (
                  <div key={p.seat} className="flex flex-col items-center min-w-0">
                    <span className="text-[9px] lg:text-[10px] truncate max-w-full font-typewriter text-cream-soft">{p.name}</span>
                    <span className={`text-lg lg:text-2xl font-black font-mono leading-tight ${scoreCol(s)}`}>
                      {s > 0 ? '+' : ''}{s}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div className="rounded-lg p-2 lg:p-4 mb-2 lg:mb-5 bg-amber-glow border-brass-strong">
          <p className="text-[9px] lg:text-[10px] uppercase tracking-widest mb-1 lg:mb-3 font-western"
             style={{ color: 'rgba(240,199,90,0.95)' }}>Running Tally</p>
          <div className="grid grid-cols-3 gap-1.5 lg:gap-2">
            {sortedPlayers.map(p => {
              const total = cumulativeScores[p.seat] ?? 0
              return (
                <div key={p.seat} className="flex flex-col items-center min-w-0">
                  <span className="text-[9px] lg:text-[10px] truncate max-w-full font-typewriter text-cream-soft">{p.name}</span>
                  <span className={`text-lg lg:text-2xl font-black font-mono leading-tight ${scoreCol(total)}`}>
                    {total > 0 ? '+' : ''}{total}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {isCreator ? (
          <button
            onClick={nextRound}
            className="casino-btn-gold w-full py-1.5 lg:py-3 text-xs lg:text-sm tracking-wider uppercase active:scale-95 inline-flex items-center justify-center gap-2"
          >
            Next Hand <ArrowRight size={14} />
          </button>
        ) : (
          <p className="text-[11px] lg:text-sm font-typewriter text-cream-soft">Waiting on the dealer to deal again…</p>
        )}
      </div>
    </div>
  )
}
