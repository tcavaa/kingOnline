import { useEffect, useRef } from 'react'
import confetti from 'canvas-confetti'
import { ArrowRight } from 'lucide-react'
import { useGame } from '../../context/GameContext'
import { getGameType } from '../../constants/gameTypes'
import { quoteForRound } from '../../constants/quotes'
import ModalShell from '../ModalShell'
import { scoreColorClass } from '../../utils/scoreColor'

const scoreCol = (v) =>
  scoreColorClass(v, 'text-cream-soft')

/**
 * The big "Round X Settled" modal. Adds a single juice trick — a confetti
 * burst when this player scored positive on the round, a tumbleweed roll
 * across the screen when they scored negative.
 */
export default function RoundResult() {
  const {
    round, chosenGameType, roundScores, cumulativeScores, players,
    isCreator, nextRound, leaderSeat, mySeat, roomCode,
  } = useGame()
  // Same sentence that hung over the table during this round.
  const quote = quoteForRound(roomCode, round)
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
        colors: ['#e3b04b', '#8e2b23', '#4c7a2f', '#c08a26', '#f8efdd'],
      })
    }
  }, [lastRound, myDelta])

  const sortedPlayers = [...players].sort((a, b) => a.seat - b.seat)

  // Rolling jug reaches in from the left when this player scored negative.
  const jugOverlay = myDelta < 0 ? (
    <svg viewBox="0 0 64 64" className="tumbleweed" aria-hidden="true">
      <g stroke="#9c7242" strokeWidth="2" fill="none" strokeLinecap="round">
        <circle cx="32" cy="32" r="26" stroke="#7d5c33" />
        <path d="M8 32 L56 32 M32 8 L32 56 M14 14 L50 50 M50 14 L14 50" />
        <path d="M20 12 Q32 32 12 44" />
        <path d="M44 12 Q32 32 52 44" />
        <path d="M12 20 Q32 32 44 52" />
      </g>
    </svg>
  ) : null

  return (
    // Compact modal designed to fit a landscape phone (≈430 px tall, less
    // ~80 px for the Safari URL bar). The two score panels are tight
    // single-row grids; on lg+ viewports the modal breathes out via the
    // `lg:` paddings/fonts.
    <ModalShell
      className="items-center z-40 p-2 lg:p-4 pointer-events-auto overflow-y-auto"
      overlay={jugOverlay}
      panelClassName="max-w-sm p-3 lg:p-6 text-center my-auto">
        <h2 className="text-sm lg:text-xl font-western uppercase tracking-wider text-cream"
            style={{ textShadow: '0 1px 0 rgba(255,255,255,0.5)' }}>
          ხელი {round} დასრულდა
        </h2>

        {gt && (
          <div className="inline-flex items-center gap-1.5 mt-1 mb-2 lg:mt-2 lg:mb-4 rounded-full px-2.5 py-0.5 text-[10px] lg:text-xs font-typewriter"
               style={{
                 background: `linear-gradient(180deg, ${gt.color}33, ${gt.color}11)`,
                 color: '#3b2314',
                 border: `1px solid ${gt.color}80`,
               }}>
            {TypeIcon && <TypeIcon size={11} style={{ color: gt.color }} />}
            <span><strong style={{ color: gt.color }}>{gt.name}</strong> — {leaderName}-ის არჩევანი</span>
          </div>
        )}

        {lastRound && (
          <div className="rounded-lg p-2 lg:p-4 mb-1.5 lg:mb-4 inset-card">
            <p className="text-[9px] lg:text-[10px] uppercase tracking-widest mb-1 lg:mb-3 font-western text-amber-dim">ეს ხელი</p>
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
             style={{ color: 'rgba(142,43,35,0.95)' }}>ჯამი</p>
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

        {quote && (
          <div className="mb-2 lg:mb-4 px-2">
            <p className="font-handwritten text-sm lg:text-lg leading-snug"
               style={{ color: '#5a3620' }}>
              „{quote.text}“
            </p>
            <p className="mt-0.5 text-[9px] lg:text-[11px] font-typewriter uppercase tracking-widest"
               style={{ color: 'rgba(142,43,35,0.7)' }}>
              — {quote.author}
            </p>
          </div>
        )}

        {isCreator ? (
          <button
            onClick={nextRound}
            className="casino-btn-gold w-full py-1.5 lg:py-3 text-xs lg:text-sm tracking-wider uppercase active:scale-95 inline-flex items-center justify-center gap-2"
          >
            შემდეგი ხელი <ArrowRight size={14} />
          </button>
        ) : (
          <p className="text-[11px] lg:text-sm font-typewriter text-cream-soft">ველოდებით დამრიგებელს…</p>
        )}
    </ModalShell>
  )
}
