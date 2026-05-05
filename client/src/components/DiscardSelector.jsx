import { Trash2, Ban, Star, Check, ArrowRight } from 'lucide-react'
import { useGame } from '../context/GameContext'
import { SuitLabel } from './Icons'

const SUIT_SYMBOLS = { H: '♥', D: '♦', S: '♠', C: '♣' }
const isRed = s => s === 'H' || s === 'D'
const cardKey = c => `${c.rank}-${c.suit}`

function isCardRestricted(card, gameType) {
  if (gameType === 'K' || gameType === 'H') return card.suit === 'H'
  if (gameType === 'Q') return card.rank === 'Q'
  if (gameType === 'J') return card.rank === 'J'
  return false
}

function MiniCard({ card, selected, restricted, onClick, isCenter }) {
  const col = isRed(card.suit) ? '#a31818' : '#1a1a1a'

  return (
    <button
      onClick={() => !restricted && onClick(card)}
      disabled={restricted}
      className="relative select-none transition-all duration-150"
      style={{
        width: 54,
        height: 78,
        borderRadius: 8,
        background: '#fffaf0',
        border: selected
          ? '2.5px solid #f0c75a'
          : isCenter
            ? '2px solid #c47a3a'
            : '1.5px solid rgba(120,70,30,0.45)',
        boxShadow: selected
          ? '0 0 18px rgba(240,199,90,0.7), 0 4px 12px rgba(0,0,0,0.45)'
          : isCenter
            ? '0 0 10px rgba(196,122,58,0.5), 0 2px 8px rgba(0,0,0,0.4)'
            : '0 2px 8px rgba(0,0,0,0.35)',
        transform: selected ? 'translateY(-8px) scale(1.05)' : restricted ? 'none' : 'translateY(0)',
        opacity: restricted ? 0.32 : 1,
        cursor: restricted ? 'not-allowed' : 'pointer',
        flexShrink: 0,
      }}
    >
      <div className="absolute top-0.5 left-1 text-[10px] font-black leading-none" style={{ color: col }}>
        <div>{card.rank}</div>
        <div>{SUIT_SYMBOLS[card.suit]}</div>
      </div>
      <div className="absolute inset-0 flex items-center justify-center text-2xl leading-none" style={{ color: col }}>
        {SUIT_SYMBOLS[card.suit]}
      </div>
      <div className="absolute bottom-0.5 right-1 text-[10px] font-black leading-none rotate-180" style={{ color: col }}>
        <div>{card.rank}</div>
        <div>{SUIT_SYMBOLS[card.suit]}</div>
      </div>

      {selected && (
        <div className="absolute -top-2 -right-2 w-5 h-5 rounded-full flex items-center justify-center shadow-lg"
             style={{ background: '#f0c75a', color: '#3a2410', border: '1.5px solid #b8821b' }}>
          <Check size={12} strokeWidth={3} />
        </div>
      )}
      {isCenter && !selected && (
        <div className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full text-[9px] flex items-center justify-center font-western shadow"
             style={{ background: '#c47a3a', color: '#fff8e6', border: '1px solid #8b3a2e' }}>
          N
        </div>
      )}
    </button>
  )
}

export default function DiscardSelector() {
  const { hand, lastCenterCards, selectedDiscards, toggleDiscard, discardCards, chosenGameType, trumpSuit } = useGame()

  const restrictionType =
    chosenGameType === 'K' || chosenGameType === 'H' ? 'Hearts' :
    chosenGameType === 'Q' ? 'Queens' :
    chosenGameType === 'J' ? 'Jacks' : null

  const centerKeys  = new Set((lastCenterCards || []).map(cardKey))
  const isSelected  = card => selectedDiscards.some(c => c.rank === card.rank && c.suit === card.suit)
  // Must keep at least one center card — picking both as discards is illegal.
  const bothCenterPicked = selectedDiscards.length === 2 &&
    selectedDiscards.every(c => centerKeys.has(cardKey(c)))
  const canConfirm  = selectedDiscards.length === 2 && !bothCenterPicked

  return (
    <div className="absolute inset-0 flex items-center justify-center z-30 p-4"
         style={{
           background: 'radial-gradient(ellipse at center, rgba(28,16,10,0.85) 0%, rgba(10,5,2,0.96) 100%)',
           backdropFilter: 'blur(8px)',
         }}>
      <div className="w-full max-w-2xl max-h-[95vh] overflow-y-auto rounded-2xl p-6 western-panel">

        {/* Header */}
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-2">
            <Trash2 size={22} style={{ color: '#f0c75a' }} />
            <h2 className="text-xl font-western uppercase tracking-wide" style={{ color: '#fde9b8' }}>
              Toss Two Cards
            </h2>
          </div>
          <p className="text-sm font-typewriter" style={{ color: 'rgba(245,233,207,0.75)' }}>
            You picked up the two center cards (marked{' '}
            <span style={{ color: '#e0a070', fontWeight: 700 }}>orange</span>).
            Pitch 2 cards from your hand to settle back to ten.
          </p>

          {restrictionType && (
            <div className="mt-3 rounded-lg px-4 py-2.5 text-xs font-medium flex items-center gap-2 font-typewriter"
                 style={{
                   background: 'linear-gradient(180deg, rgba(139,58,46,0.4), rgba(74,28,22,0.4))',
                   border: '1px solid rgba(212,87,77,0.55)',
                   color: '#ffd0c4',
                 }}>
              <Ban size={14} style={{ color: '#e8a097' }} />
              <span>Can't toss <strong>{restrictionType}</strong> — required by the "{chosenGameType}" hand</span>
            </div>
          )}
          {trumpSuit && (
            <div className="mt-2 rounded-lg px-4 py-2.5 text-xs font-medium flex items-center gap-2 font-typewriter"
                 style={{
                   background: 'rgba(218,165,32,0.10)',
                   border: '1px solid rgba(218,165,32,0.4)',
                   color: '#fde9b8',
                 }}>
              <Star size={14} fill="#f0c75a" style={{ color: '#f0c75a' }} />
              <span className="inline-flex items-center gap-1">
                Trump for this hand: <strong><SuitLabel suit={trumpSuit} size={12} /></strong>
              </span>
            </div>
          )}
          {bothCenterPicked && (
            <div className="mt-2 rounded-lg px-4 py-2.5 text-xs font-medium flex items-center gap-2 font-typewriter"
                 style={{
                   background: 'linear-gradient(180deg, rgba(139,58,46,0.4), rgba(74,28,22,0.4))',
                   border: '1px solid rgba(212,87,77,0.55)',
                   color: '#ffd0c4',
                 }}>
              <Ban size={14} style={{ color: '#e8a097' }} />
              <span>You must keep at least one of the two center cards.</span>
            </div>
          )}
        </div>

        {/* Card grid */}
        <div className="flex flex-wrap gap-3 justify-center mb-6 py-2">
          {hand.map(card => (
            <MiniCard
              key={cardKey(card)}
              card={card}
              selected={isSelected(card)}
              restricted={isCardRestricted(card, chosenGameType)}
              onClick={toggleDiscard}
              isCenter={centerKeys.has(cardKey(card))}
            />
          ))}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-5 text-xs mb-6 font-typewriter"
             style={{ color: 'rgba(245,233,207,0.7)' }}>
          <div className="flex items-center gap-2">
            <div style={{ width: 16, height: 24, borderRadius: 4, background: '#fffaf0', border: '2px solid #c47a3a' }} />
            <span>From the centre</span>
          </div>
          <div className="flex items-center gap-2">
            <div style={{ width: 16, height: 24, borderRadius: 4, background: '#fffaf0', border: '2.5px solid #f0c75a' }} />
            <span>Marked to toss</span>
          </div>
          <div className="flex items-center gap-2">
            <div style={{ width: 16, height: 24, borderRadius: 4, background: '#fffaf0', opacity: 0.32, border: '1px solid rgba(120,70,30,0.45)' }} />
            <span>Locked</span>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-western uppercase tracking-wider"
                style={{ color: canConfirm ? '#a3d68a' : 'rgba(245,233,207,0.6)' }}>
            {selectedDiscards.length}/2 marked
          </span>
          <button
            onClick={() => discardCards(selectedDiscards)}
            disabled={!canConfirm}
            className={`px-8 py-2.5 rounded-xl text-sm font-western uppercase tracking-wider transition-all active:scale-95 inline-flex items-center gap-2 ${canConfirm ? 'casino-btn-primary' : ''}`}
            style={!canConfirm ? {
              background: 'linear-gradient(180deg, rgba(74,46,26,0.7), rgba(44,26,16,0.7))',
              border: '1px solid rgba(218,165,32,0.25)',
              color: 'rgba(245,233,207,0.4)',
              cursor: 'not-allowed',
            } : undefined}
          >
            <span>Confirm Toss</span>
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
