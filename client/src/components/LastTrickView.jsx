import { X } from 'lucide-react'
import { useGame } from '../context/GameContext'

const SUIT_SYMBOLS = { H: '♥', D: '♦', S: '♠', C: '♣' }
const isRed = s => s === 'H' || s === 'D'

function MiniCard({ card, highlight }) {
  const col = isRed(card.suit) ? '#a31818' : '#1a1a1a'
  return (
    <div
      className="relative select-none"
      style={{
        width: 56, height: 80, borderRadius: 8,
        background: '#fffaf0',
        border: highlight ? '2.5px solid #f0c75a' : '1.5px solid rgba(120,70,30,0.45)',
        boxShadow: highlight
          ? '0 0 18px rgba(240,199,90,0.65), 0 4px 12px rgba(0,0,0,0.45)'
          : '0 2px 8px rgba(0,0,0,0.35)',
        flexShrink: 0,
      }}
    >
      <div className="absolute top-0.5 left-1 text-[11px] font-black leading-none" style={{ color: col }}>
        <div>{card.rank}</div>
        <div>{SUIT_SYMBOLS[card.suit]}</div>
      </div>
      <div className="absolute inset-0 flex items-center justify-center text-2xl leading-none" style={{ color: col }}>
        {SUIT_SYMBOLS[card.suit]}
      </div>
      <div className="absolute bottom-0.5 right-1 text-[11px] font-black leading-none rotate-180" style={{ color: col }}>
        <div>{card.rank}</div>
        <div>{SUIT_SYMBOLS[card.suit]}</div>
      </div>
    </div>
  )
}

export default function LastTrickView({ onClose }) {
  const { lastTrickResult, players } = useGame()

  if (!lastTrickResult || !lastTrickResult.trick) {
    return (
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-western uppercase tracking-wider"
            style={{ color: '#fde9b8' }}>Last Trick</h3>
        <p className="text-xs font-typewriter" style={{ color: 'rgba(245,233,207,0.55)' }}>
          No trick has been laid down yet this round.
        </p>
      </div>
    )
  }

  const { trick, winnerSeat } = lastTrickResult
  const winnerName = players.find(p => p.seat === winnerSeat)?.name ?? `Player ${winnerSeat}`

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-western uppercase tracking-wider"
            style={{ color: '#fde9b8' }}>Last Trick</h3>
        {onClose && (
          <button onClick={onClose}
                  className="hover:opacity-80"
                  style={{ color: 'rgba(245,233,207,0.7)' }}><X size={14} /></button>
        )}
      </div>

      <div className="rounded-xl p-3"
           style={{
             background: 'linear-gradient(180deg, rgba(28,16,10,0.65), rgba(15,8,4,0.75))',
             border: '1px solid rgba(218,165,32,0.32)',
           }}>
        <p className="text-[10px] uppercase tracking-widest mb-2 font-western"
           style={{ color: 'rgba(218,165,32,0.75)' }}>
          Took the pot
        </p>
        <p className="text-base font-western mb-3" style={{ color: '#f0c75a' }}>{winnerName}</p>

        <div className="flex gap-2 justify-center flex-wrap">
          {trick.map(({ seat, card }, i) => {
            const playerName = players.find(p => p.seat === seat)?.name ?? `P${seat}`
            return (
              <div key={i} className="flex flex-col items-center gap-1">
                <MiniCard card={card} highlight={seat === winnerSeat} />
                <span className="text-[10px] font-typewriter"
                      style={{ color: 'rgba(245,233,207,0.7)' }}>{playerName}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
