// DOM playing card for ჩეხური დურაკა (no Phaser — plain markup).

export const SUIT_GLYPH = { S: '♠', H: '♥', D: '♦', C: '♣' }
export const SUIT_NAME  = { S: 'ყვავი', H: 'გული', D: 'აგური', C: 'ჯვარი' }
export const SUIT_COLOR = { S: '#26221e', H: '#b3261e', D: '#c2410c', C: '#1f3d2e' }

export default function DurakCard({ card, size = 'md', raised = false, dimmed = false, onClick }) {
  if (!card) return null
  const dims = size === 'lg'
    ? { w: 84, h: 118, rank: 26, corner: 13 }
    : size === 'sm'
      ? { w: 44, h: 62, rank: 15, corner: 8 }
      : { w: 62, h: 88, rank: 20, corner: 10 }
  const color = SUIT_COLOR[card.suit] || '#26221e'

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="relative rounded-lg select-none transition-transform"
      style={{
        width: dims.w, height: dims.h,
        background: 'linear-gradient(160deg, #fffdf6 0%, #f3ecd9 100%)',
        border: '1px solid rgba(90,54,32,0.4)',
        boxShadow: raised
          ? '0 8px 18px rgba(40,20,10,0.35), 0 0 0 2px rgba(142,43,35,0.55)'
          : '0 2px 6px rgba(40,20,10,0.25)',
        transform: raised ? 'translateY(-10px)' : 'none',
        opacity: dimmed ? 0.45 : 1,
        cursor: onClick ? 'pointer' : 'default',
        color,
        flexShrink: 0,
      }}
    >
      <span className="absolute font-black leading-none"
            style={{ top: 5, left: 6, fontSize: dims.corner }}>
        {card.rank}
      </span>
      <span className="absolute leading-none"
            style={{ top: 5 + dims.corner + 1, left: 6, fontSize: dims.corner }}>
        {SUIT_GLYPH[card.suit]}
      </span>
      <span className="absolute inset-0 flex items-center justify-center font-black"
            style={{ fontSize: dims.rank }}>
        {card.rank}
        <span style={{ fontSize: dims.rank * 0.9, marginLeft: 2 }}>{SUIT_GLYPH[card.suit]}</span>
      </span>
      <span className="absolute font-black leading-none"
            style={{ bottom: 5, right: 6, fontSize: dims.corner, transform: 'rotate(180deg)' }}>
        {card.rank}
      </span>
    </button>
  )
}

/** Face-down card (draw pile, opponents' hands). */
export function DurakCardBack({ size = 'md', label, style }) {
  const dims = size === 'lg' ? { w: 84, h: 118 }
    : size === 'sm' ? { w: 44, h: 62 }
      : size === 'xs' ? { w: 18, h: 26 }
        : { w: 62, h: 88 }
  return (
    <div className="relative rounded flex items-center justify-center select-none flex-shrink-0"
         style={{
           width: dims.w, height: dims.h,
           borderRadius: size === 'xs' ? 3 : 8,
           background: 'repeating-linear-gradient(45deg, #7a2620 0 6px, #8e2b23 6px 12px)',
           border: '1px solid rgba(59,35,20,0.55)',
           boxShadow: size === 'xs'
             ? '0 1px 2px rgba(40,20,10,0.35)'
             : '0 2px 6px rgba(40,20,10,0.3), inset 0 0 0 3px rgba(255,240,210,0.25)',
           ...style,
         }}>
      {label != null && (
        <span className="text-xs font-black px-1.5 py-0.5 rounded"
              style={{ background: 'rgba(255,244,214,0.92)', color: '#5a3620' }}>
          {label}
        </span>
      )}
    </div>
  )
}
