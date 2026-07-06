import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Volume2, X } from 'lucide-react'
import { useGame } from '../../context/GameContext'
import { SOUNDS } from '../../constants/sounds'

// Touch devices only: on desktop the compact in-canvas avatar buttons are
// easy to click with a mouse, so this big button (and its modal) would be
// redundant. Mirrors the GameScene check that hides the canvas buttons on
// touch — the two are mutually exclusive.
function isTouchDevice() {
  if (typeof window === 'undefined') return false
  return ('ontouchstart' in window) ||
    (window.matchMedia && window.matchMedia('(pointer: coarse)').matches)
}

/**
 * Mobile-friendly sound trigger. The in-canvas avatar buttons are tiny and
 * easy to miss on a phone, so this exposes a single large button (≈2.5× the
 * other HUD icons) next to the own avatar. Tapping it opens a modal of big,
 * finger-sized sound buttons that broadcast a reaction to the whole room.
 *
 * The modal stays open after each tap so you can fire several in a row; close
 * it with the ✕ or by tapping the backdrop.
 */
export default function SoundBoard() {
  const { playSound, mySeat } = useGame()
  const [open, setOpen] = useState(false)
  const [flash, setFlash] = useState(null)
  const [touch] = useState(isTouchDevice)

  if (!touch) return null

  const fire = (id) => {
    if (!playSound) return
    // Target our own seat so the bubble pops over our avatar, same as the
    // in-canvas buttons.
    playSound(id, mySeat)
    setFlash(id)
    setTimeout(() => setFlash(f => (f === id ? null : f)), 250)
  }

  // Rendered via a portal to document.body so it escapes the transformed
  // wrapper that positions the trigger — a `position: fixed` element inside a
  // `transform`ed ancestor is positioned relative to that ancestor (which is
  // only as wide as the button), which made the modal a thin vertical strip.
  const modal = open && createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3"
         style={{ background: 'rgba(32,18,10,0.72)', backdropFilter: 'blur(4px)' }}
         onClick={() => setOpen(false)}>
      <div className="w-full max-w-lg max-h-[88vh] flex flex-col rounded-2xl overflow-hidden"
           style={{
             background: 'linear-gradient(180deg, #f8efdd 0%, #ecd9b6 100%)',
             border: '1px solid rgba(122,83,44,0.45)',
             boxShadow: '0 12px 48px rgba(58,36,24,0.25)',
           }}
           onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3"
             style={{ borderBottom: '1px solid rgba(122,83,44,0.32)' }}>
          <h3 className="text-sm font-western uppercase tracking-wider" style={{ color: '#3b2314' }}>
            ხმები
          </h3>
          <button onClick={() => setOpen(false)} className="text-cream-soft hover:opacity-80"
                  aria-label="ხმების დახურვა">
            <X size={20} />
          </button>
        </div>

        <div className="p-3 overflow-y-auto">
          <div className="grid grid-cols-4 sm:grid-cols-5 gap-2.5">
            {SOUNDS.map(s => (
              <button
                key={s.id}
                onClick={() => fire(s.id)}
                title={s.label}
                className="flex flex-col items-center gap-1.5 rounded-xl py-2.5 px-1 active:scale-95 transition-transform"
                style={{
                  background: flash === s.id ? `${s.color}33` : 'rgba(236,222,196,0.85)',
                  border: `1.5px solid ${s.color}`,
                }}
              >
                <span className="flex items-center justify-center rounded-full font-bold"
                      style={{
                        width: 44,
                        height: 44,
                        background: '#f8efdd',
                        border: `2px solid ${s.color}`,
                        color: '#3b2314',
                        fontFamily: 'Roboto Slab, Georgia, serif',
                        fontSize: 18,
                      }}>
                  {s.glyph}
                </span>
                <span className="text-[10px] text-center leading-tight truncate w-full"
                      style={{ color: '#3b2314' }}>
                  {s.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body
  )

  return (
    <>
      {/* Trigger — deliberately larger than the neighbouring icon pills. */}
      <button
        onClick={() => setOpen(true)}
        title="ხმები"
        aria-label="ხმების გახსნა"
        className="pointer-events-auto inline-flex items-center justify-center rounded-2xl active:scale-95 transition-transform shrink-0"
        style={{
          width: 46,
          height: 46,
          background: 'linear-gradient(180deg, #f8efdd 0%, #ecd9b6 100%)',
          border: '1px solid rgba(142,43,35,0.6)',
          color: '#3b2314',
          boxShadow: '0 2px 0 rgba(58,36,24,0.25), 0 0 14px rgba(142,43,35,0.25), inset 0 1px 0 rgba(255,255,255,0.18)',
        }}
      >
        <Volume2 size={28} />
      </button>

      {modal}
    </>
  )
}
