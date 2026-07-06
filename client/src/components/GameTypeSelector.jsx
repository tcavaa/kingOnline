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
  const leaderName   = players.find(p => p.seat === leaderSeat)?.name ?? `მოთამაშე ${leaderSeat}`
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
        background: 'radial-gradient(ellipse at center, rgba(58,36,24,0.72) 0%, rgba(32,18,10,0.88) 100%)',
        backdropFilter: 'blur(6px)',
      }}
    >
      <div
        className="w-full max-w-2xl rounded-2xl p-2.5 lg:p-5 my-auto western-panel"
      >
        <div className="mb-1.5 lg:mb-4">
          <div className="flex items-center gap-2">
            <Spade size={16} style={{ color: '#8e2b23' }} fill="#8e2b23" />
            <h2 className="text-sm lg:text-lg font-western uppercase tracking-wide" style={{ color: '#3b2314' }}>
              აირჩიე თამაში
            </h2>
          </div>
          <p className="hidden lg:block text-sm font-typewriter mt-1" style={{ color: 'rgba(59,35,20,0.75)' }}>
            შენ არიგებ, <strong style={{ color: '#3b2314' }}>{leaderName}</strong>. დახედე შენს კარტებს და აირჩიე თამაში.
          </p>
          <div className="hide-on-phone-landscape mt-2 rounded-lg px-2.5 py-1.5 text-xs font-medium flex items-center gap-2 font-typewriter"
               style={{
                 background: 'rgba(142,43,35,0.07)',
                 border: '1px solid rgba(122,83,44,0.4)',
                 color: '#3b2314',
               }}>
            <AlertTriangle size={13} style={{ color: '#8e2b23' }} />
            <span>სხვები თავიანთ კარტებს ვერ ნახავენ, სანამ თამაშს არ აირჩევ.</span>
          </div>
        </div>

        {/* Leader's hand preview — card size is fixed (HandPreviewCard
            renders at 44×64 regardless of viewport) per the user's
            constraint; we just trim the padding around the row. */}
        <div className="mb-1.5 lg:mb-4 rounded-xl p-1.5 lg:p-3"
             style={{
               background: 'linear-gradient(180deg, rgba(236,222,196,0.85), rgba(226,208,176,0.9))',
               border: '1px solid rgba(122,83,44,0.32)',
             }}>
          <p className="text-[9px] lg:text-[10px] uppercase tracking-widest mb-1 lg:mb-2 font-western"
             style={{ color: 'rgba(142,43,35,0.75)' }}>შენი კარტები ({hand.length})</p>
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
                    ? `linear-gradient(180deg, ${type.color}25, rgba(236,222,196,0.85))`
                    : 'linear-gradient(180deg, rgba(248,239,221,0.95), rgba(236,217,182,0.95))',
                  border: isSelected
                    ? `1px solid ${type.color}`
                    : '1px solid rgba(122,83,44,0.32)',
                  boxShadow: isSelected
                    ? `0 0 20px ${type.color}40, inset 0 1px 0 rgba(255,255,255,0.18)`
                    : '0 2px 0 rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)',
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
                     style={{ color: '#3b2314' }}>{type.name}</div>
                {/* Description is informative on desktop but on landscape
                    phones it costs a row of height per button — hide it. */}
                <div className="hide-on-phone-landscape text-[10px] leading-snug font-typewriter mt-0.5"
                     style={{ color: 'rgba(59,35,20,0.7)' }}>
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
               style={{ color: 'rgba(142,43,35,0.55)' }}>უკვე ნათამაშები</p>
            <div className="flex flex-wrap gap-1.5">
              {used.map(type => {
                const Icon = type.Icon
                return (
                  <div key={type.code}
                       className="text-xs rounded-lg px-2 py-0.5 flex items-center gap-1 line-through opacity-50 font-typewriter"
                       style={{
                         background: 'rgba(236,222,196,0.85)',
                         border: '1px solid rgba(122,83,44,0.18)',
                         color: 'rgba(59,35,20,0.55)',
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
            background: 'linear-gradient(180deg, rgba(248,239,221,0.95), rgba(236,217,182,0.95))',
            border: '1px solid rgba(122,83,44,0.25)',
            color: 'rgba(59,35,20,0.45)',
            cursor: 'not-allowed',
          } : undefined}
        >
          {selected ? (
            <>
              {SelectedIcon && <SelectedIcon size={14} />}
              <span>ვთამაშობთ — {selectedType?.name}</span>
              <ArrowRight size={14} />
            </>
          ) : (
            <span>აირჩიე თამაში გასაგრძელებლად</span>
          )}
        </button>
      </div>
    </div>
  )
}
