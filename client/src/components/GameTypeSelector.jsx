import { useState } from 'react'
import { Spade, AlertTriangle, Check, ArrowRight } from 'lucide-react'
import { useGame } from '../context/GameContext'
import { GAME_TYPES } from '../constants/gameTypes'

const SUIT_SYMBOLS = { H: '♥', D: '♦', S: '♠', C: '♣' }
const isRed = s => s === 'H' || s === 'D'

function HandPreviewCard({ card }) {
  const col = isRed(card.suit) ? '#a31818' : '#1a1a1a'
  return (
    <div className="relative select-none flex-shrink-0"
         style={{
           width: 44, height: 64, borderRadius: 6,
           background: '#fffaf0',
           border: '1px solid rgba(120,70,30,0.45)',
           boxShadow: '0 2px 6px rgba(0,0,0,0.45)',
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

export default function GameTypeSelector() {
  const { selectGameType, usedTypes, leaderSeat, players, hand } = useGame()
  const [selected, setSelected] = useState(null)

  const usedByLeader = usedTypes?.[leaderSeat] ?? []
  const leaderName   = players.find(p => p.seat === leaderSeat)?.name ?? `Player ${leaderSeat}`
  const available    = GAME_TYPES.filter(t => !usedByLeader.includes(t.code))
  const used         = GAME_TYPES.filter(t => usedByLeader.includes(t.code))
  const selectedType = GAME_TYPES.find(t => t.code === selected)
  const SelectedIcon = selectedType?.Icon

  return (
    // Sized to fit a landscape phone in one frame. On lg+ screens we
    // re-expand the spacing/typography. The hint banner and per-button
    // description text are hidden on phone landscape (via the
    // .hide-on-phone-landscape CSS rule) — the type code + name + payout
    // are enough to make a decision, and the description duplicates the
    // name almost verbatim ("Avoid Hearts (-5 each)" for "No Hearts").
    <div
      className="absolute inset-0 flex items-start lg:items-center justify-center z-30 px-2 py-1.5 lg:px-4 lg:py-3 overflow-y-auto"
      style={{
        background: 'radial-gradient(ellipse at center, rgba(28,16,10,0.85) 0%, rgba(10,5,2,0.96) 100%)',
        backdropFilter: 'blur(6px)',
      }}
    >
      <div
        className="w-full max-w-2xl rounded-2xl p-2.5 lg:p-5 my-auto western-panel"
      >
        <div className="mb-1.5 lg:mb-4">
          <div className="flex items-center gap-2">
            <Spade size={16} style={{ color: '#f0c75a' }} fill="#f0c75a" />
            <h2 className="text-sm lg:text-lg font-western uppercase tracking-wide" style={{ color: '#fde9b8' }}>
              Call Your Hand
            </h2>
          </div>
          <p className="hidden lg:block text-sm font-typewriter mt-1" style={{ color: 'rgba(245,233,207,0.75)' }}>
            You're the dealer, <strong style={{ color: '#fff8e6' }}>{leaderName}</strong>. Look over your 10 cards before picking your poison.
          </p>
          <div className="hide-on-phone-landscape mt-2 rounded-lg px-2.5 py-1.5 text-xs font-medium flex items-center gap-2 font-typewriter"
               style={{
                 background: 'rgba(218,165,32,0.10)',
                 border: '1px solid rgba(218,165,32,0.4)',
                 color: '#fde9b8',
               }}>
            <AlertTriangle size={13} style={{ color: '#f0c75a' }} />
            <span>The other gunslingers can't peek at their hands until you call it.</span>
          </div>
        </div>

        {/* Leader's hand preview — card size is fixed (HandPreviewCard
            renders at 44×64 regardless of viewport) per the user's
            constraint; we just trim the padding around the row. */}
        <div className="mb-1.5 lg:mb-4 rounded-xl p-1.5 lg:p-3"
             style={{
               background: 'linear-gradient(180deg, rgba(28,16,10,0.6), rgba(15,8,4,0.7))',
               border: '1px solid rgba(218,165,32,0.32)',
             }}>
          <p className="text-[9px] lg:text-[10px] uppercase tracking-widest mb-1 lg:mb-2 font-western"
             style={{ color: 'rgba(218,165,32,0.75)' }}>Your hand ({hand.length} cards)</p>
          <div className="flex gap-1.5 flex-wrap justify-center">
            {hand.map((c, i) => <HandPreviewCard key={`${c.rank}-${c.suit}-${i}`} card={c} />)}
          </div>
        </div>

        <div className="grid grid-cols-4 lg:grid-cols-4 gap-1.5 lg:gap-2.5 mb-2 lg:mb-4">
          {available.map(type => {
            const isSelected = selected === type.code
            const Icon = type.Icon
            return (
              <button
                key={type.code}
                onClick={() => setSelected(isSelected ? null : type.code)}
                className="relative text-left p-1.5 lg:p-3 rounded-lg lg:rounded-xl transition-all"
                style={{
                  background: isSelected
                    ? `linear-gradient(180deg, ${type.color}25, rgba(28,16,10,0.55))`
                    : 'linear-gradient(180deg, rgba(74,46,26,0.7), rgba(44,26,16,0.7))',
                  border: isSelected
                    ? `1px solid ${type.color}`
                    : '1px solid rgba(218,165,32,0.32)',
                  boxShadow: isSelected
                    ? `0 0 20px ${type.color}40, inset 0 1px 0 rgba(255,220,170,0.18)`
                    : '0 2px 0 rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,220,170,0.08)',
                  transform: isSelected ? 'translateY(-1px) scale(1.02)' : 'scale(1)',
                }}
              >
                <div className="flex items-center gap-1 lg:gap-1.5 mb-0.5 lg:mb-1">
                  <Icon size={14} style={{ color: type.color }} />
                  <span className="text-[9px] lg:text-[10px] font-western uppercase tracking-widest"
                        style={{ color: type.color }}>
                    {type.code}
                  </span>
                </div>
                <div className="text-[11px] lg:text-xs font-bold leading-tight"
                     style={{ color: '#fff8e6' }}>{type.name}</div>
                {/* Description is informative on desktop but on landscape
                    phones it costs a row of height per button — hide it. */}
                <div className="hide-on-phone-landscape text-[10px] leading-snug font-typewriter mt-0.5"
                     style={{ color: 'rgba(245,233,207,0.7)' }}>
                  {type.description}
                </div>
                <div className="mt-0.5 lg:mt-1.5 text-[9px] lg:text-[10px] font-mono font-bold" style={{ color: type.color }}>
                  {type.pointPerUnit > 0 ? '+' : ''}{type.pointPerUnit} × {type.totalUnits}
                </div>
                {isSelected && (
                  <div className="absolute top-1 right-1 lg:top-2 lg:right-2 w-3.5 h-3.5 lg:w-4 lg:h-4 rounded-full flex items-center justify-center text-white"
                       style={{ background: type.color }}>
                    <Check size={9} strokeWidth={3} />
                  </div>
                )}
              </button>
            )
          })}
        </div>

        {used.length > 0 && (
          <div className="mb-1.5 lg:mb-4 hide-on-phone-landscape">
            <p className="text-[10px] uppercase tracking-widest mb-1.5 font-western"
               style={{ color: 'rgba(218,165,32,0.55)' }}>Already played</p>
            <div className="flex flex-wrap gap-1.5">
              {used.map(type => {
                const Icon = type.Icon
                return (
                  <div key={type.code}
                       className="text-xs rounded-lg px-2 py-0.5 flex items-center gap-1 line-through opacity-50 font-typewriter"
                       style={{
                         background: 'rgba(28,16,10,0.6)',
                         border: '1px solid rgba(218,165,32,0.18)',
                         color: '#a08a6a',
                       }}>
                    <Icon size={11} />
                    <span>{type.name}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <button
          onClick={() => selected && selectGameType(selected)}
          disabled={!selected}
          className={`w-full py-1.5 lg:py-2.5 rounded-lg lg:rounded-xl font-western uppercase text-[11px] lg:text-sm tracking-wider transition-all active:scale-95 inline-flex items-center justify-center gap-2 ${selected ? 'casino-btn-gold' : ''}`}
          style={!selected ? {
            background: 'linear-gradient(180deg, rgba(74,46,26,0.7), rgba(44,26,16,0.7))',
            border: '1px solid rgba(218,165,32,0.25)',
            color: 'rgba(245,233,207,0.45)',
            cursor: 'not-allowed',
          } : undefined}
        >
          {selected ? (
            <>
              {SelectedIcon && <SelectedIcon size={14} />}
              <span>Call it — {selectedType?.name}</span>
              <ArrowRight size={14} />
            </>
          ) : (
            <span>Pick your hand to continue</span>
          )}
        </button>
      </div>
    </div>
  )
}
