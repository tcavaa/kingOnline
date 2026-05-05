import { useState, useMemo } from 'react'
import { Star, Heart, Diamond, Spade, Club } from 'lucide-react'
import { useGame } from '../context/GameContext'

const SUITS = [
  { code: 'S', Icon: Spade,   name: 'Spades',   color: '#1a1a1a' },
  { code: 'H', Icon: Heart,   name: 'Hearts',   color: '#a31818' },
  { code: 'D', Icon: Diamond, name: 'Diamonds', color: '#a31818' },
  { code: 'C', Icon: Club,    name: 'Clubs',    color: '#1a1a1a' },
]

const SUIT_SYMBOLS = { H: '♥', D: '♦', S: '♠', C: '♣' }
const isRed = s => s === 'H' || s === 'D'

function HandPreviewCard({ card, isTrump }) {
  const col = isRed(card.suit) ? '#a31818' : '#1a1a1a'
  return (
    <div className="relative select-none flex-shrink-0"
         style={{
           width: 44, height: 64, borderRadius: 6,
           background: '#fffaf0',
           border: isTrump ? '2px solid #f0c75a' : '1px solid rgba(120,70,30,0.45)',
           boxShadow: isTrump ? '0 0 14px rgba(240,199,90,0.65)' : '0 2px 6px rgba(0,0,0,0.45)',
         }}>
      <div className="absolute top-0.5 left-1 text-[9px] font-black leading-none" style={{ color: col }}>
        <div>{card.rank}</div>
        <div>{SUIT_SYMBOLS[card.suit]}</div>
      </div>
      <div className="absolute inset-0 flex items-center justify-center text-lg leading-none" style={{ color: col }}>
        {SUIT_SYMBOLS[card.suit]}
      </div>
    </div>
  )
}

export default function TrumpSelector() {
  const { selectTrump, leaderSeat, players, chosenGameType, hand } = useGame()
  const [picked, setPicked] = useState(null)

  const leaderName = players.find(p => p.seat === leaderSeat)?.name ?? `Player ${leaderSeat}`

  const suitCounts = useMemo(() => {
    const counts = { H: 0, D: 0, S: 0, C: 0 }
    for (const c of hand || []) counts[c.suit] = (counts[c.suit] || 0) + 1
    return counts
  }, [hand])

  return (
    <div
      className="absolute inset-0 flex items-start justify-center z-30 px-4 py-3 overflow-y-auto"
      style={{
        background: 'radial-gradient(ellipse at center, rgba(28,16,10,0.85) 0%, rgba(10,5,2,0.96) 100%)',
        backdropFilter: 'blur(6px)',
      }}
    >
      <div
        className="w-full max-w-xl rounded-2xl p-5 my-auto western-panel"
      >
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-1.5">
            <Star size={20} style={{ color: '#f0c75a' }} fill="#f0c75a" />
            <h2 className="text-lg font-western uppercase tracking-wide" style={{ color: '#fde9b8' }}>
              Name Your Trump
            </h2>
          </div>
          <p className="text-sm font-typewriter" style={{ color: 'rgba(245,233,207,0.75)' }}>
            <strong style={{ color: '#fff8e6' }}>{leaderName}</strong>, you called{' '}
            <span className="font-western" style={{ color: '#f0c75a' }}>{chosenGameType}</span> —
            pick a trump suit (or ride bareback with no trump). Trumps beat all comers.
          </p>
        </div>

        <div className="mb-4 rounded-xl p-3"
             style={{
               background: 'linear-gradient(180deg, rgba(28,16,10,0.6), rgba(15,8,4,0.7))',
               border: '1px solid rgba(218,165,32,0.32)',
             }}>
          <p className="text-[10px] uppercase tracking-widest mb-2 font-western"
             style={{ color: 'rgba(218,165,32,0.75)' }}>Your hand ({hand.length} cards)</p>
          <div className="flex gap-1.5 flex-wrap justify-center">
            {hand.map((c, i) => (
              <HandPreviewCard
                key={`${c.rank}-${c.suit}-${i}`}
                card={c}
                isTrump={picked === c.suit}
              />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3 mb-4">
          {SUITS.map(s => {
            const sel = picked === s.code
            const Icon = s.Icon
            return (
              <button
                key={s.code}
                onClick={() => setPicked(sel ? null : s.code)}
                className="relative aspect-[3/4] rounded-xl flex flex-col items-center justify-center transition-all"
                style={{
                  background: sel
                    ? 'linear-gradient(180deg, #fff7d8 0%, #f0d9a8 100%)'
                    : 'linear-gradient(180deg, rgba(74,46,26,0.7), rgba(44,26,16,0.7))',
                  border: sel ? '2px solid #f0c75a' : '1px solid rgba(218,165,32,0.32)',
                  boxShadow: sel
                    ? '0 0 24px rgba(240,199,90,0.55), inset 0 1px 0 rgba(255,255,255,0.5)'
                    : '0 2px 0 rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,220,170,0.08)',
                  transform: sel ? 'translateY(-2px) scale(1.04)' : 'scale(1)',
                }}
              >
                <Icon
                  size={48}
                  strokeWidth={2}
                  style={{ color: sel ? s.color : '#fde9b8' }}
                  fill={sel ? s.color : 'none'}
                />
                <span className="text-xs font-western uppercase mt-1"
                      style={{ color: sel ? '#3a2410' : 'rgba(245,233,207,0.85)' }}>
                  {s.name}
                </span>
                <span className="absolute top-1.5 right-2 text-[10px] font-mono font-bold"
                      style={{ color: sel ? '#3a2410' : 'rgba(218,165,32,0.85)' }}>
                  ×{suitCounts[s.code]}
                </span>
              </button>
            )
          })}
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => selectTrump(null)}
            className="flex-1 py-2.5 rounded-xl text-sm font-western uppercase tracking-wider transition-all active:scale-95"
            style={{
              background: 'linear-gradient(180deg, rgba(74,46,26,0.85), rgba(44,26,16,0.85))',
              border: '1px solid rgba(218,165,32,0.4)',
              color: '#fde9b8',
              boxShadow: '0 2px 0 rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,220,170,0.12)',
              textShadow: '0 1px 0 rgba(0,0,0,0.45)',
            }}
          >
            No Trump
          </button>
          <button
            onClick={() => picked && selectTrump(picked)}
            disabled={!picked}
            className={`flex-[2] py-2.5 rounded-xl text-sm tracking-wider font-western uppercase transition-all active:scale-95 ${picked ? 'casino-btn-gold' : ''}`}
            style={!picked ? {
              background: 'linear-gradient(180deg, rgba(74,46,26,0.7), rgba(44,26,16,0.7))',
              border: '1px solid rgba(218,165,32,0.25)',
              color: 'rgba(245,233,207,0.45)',
              cursor: 'not-allowed',
            } : undefined}
          >
            {picked ? `Confirm Trump — ${SUITS.find(s => s.code === picked)?.name}` : 'Pick a trump suit'}
          </button>
        </div>
      </div>
    </div>
  )
}
