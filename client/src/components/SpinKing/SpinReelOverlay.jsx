import { useEffect, useRef, useState } from 'react'
import { Coins } from 'lucide-react'
import { useGame } from '../../context/GameContext'
import { getGameType } from '../../constants/gameTypes'
import { SPIN_TYPES, SPIN_TYPE_NAME_OVERRIDE, PLEDGE_TIERS } from '../../constants/spinKing'
import ModalShell from '../ModalShell'

const typeName = (code) => SPIN_TYPE_NAME_OVERRIDE[code] || getGameType(code)?.name || code

/**
 * The slot-reel round opener: cycles the 7 spin types with an eased
 * deceleration, lands on the server-rolled one, previews its pledge tiers,
 * then auto-acks so the table advances (first ack wins; duplicates are
 * silently ignored server-side, and a slow interval re-acks in case the
 * first packet is lost).
 */
export default function SpinReelOverlay() {
  const { chosenGameType, ackSpin, pot, ante, round } = useGame()
  const [displayed, setDisplayed] = useState(SPIN_TYPES[0])
  const [landed, setLanded] = useState(false)
  const ackedRef = useRef(false)

  // Reel animation — deterministic step count so all three clients land
  // together (their reels start within socket-jitter of each other).
  useEffect(() => {
    if (!chosenGameType) return undefined
    let cancelled = false
    let timer = null
    const reduced = typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    const finish = () => { if (!cancelled) { setDisplayed(chosenGameType); setLanded(true) } }
    if (reduced) { finish(); return undefined }
    try {
      const a = new window.Audio('/sounds/shuffle.mp3')
      a.volume = 0.5
      a.play().catch(() => {})
    } catch { /* ignore */ }
    const target = Math.max(0, SPIN_TYPES.indexOf(chosenGameType))
    const steps = SPIN_TYPES.length * 3 + target
    let i = 0
    const tick = () => {
      if (cancelled) return
      setDisplayed(SPIN_TYPES[i % SPIN_TYPES.length])
      if (i >= steps) { finish(); return }
      const t = i / steps
      i += 1
      timer = setTimeout(tick, 45 + 360 * t * t) // ease-out deceleration
    }
    tick()
    return () => { cancelled = true; if (timer) clearTimeout(timer) }
  }, [chosenGameType])

  // Auto-ack shortly after landing + keep re-acking slowly while the table
  // is still in the spin phase (covers a lost first ack).
  useEffect(() => {
    if (!landed) return undefined
    const first = setTimeout(() => { ackedRef.current = true; ackSpin() }, 1100)
    const again = setInterval(() => { if (ackedRef.current) ackSpin() }, 3000)
    return () => { clearTimeout(first); clearInterval(again) }
  }, [landed, ackSpin])

  const gt = getGameType(displayed)
  const Icon = gt?.Icon
  const tiers = landed ? (PLEDGE_TIERS[chosenGameType] || []) : []

  return (
    <ModalShell
      className="items-center z-40 p-3 pointer-events-auto overflow-y-auto"
      panelClassName="max-w-sm p-4 lg:p-6 text-center my-auto">
      <p className="text-[10px] uppercase tracking-[0.35em] font-western text-amber-dim mb-1">
        ხელი {round}
      </p>
      <h2 className="text-base lg:text-xl font-western uppercase tracking-wider text-cream mb-3"
          style={{ textShadow: '0 1px 0 rgba(255,255,255,0.5)' }}>
        🎰 ბედის ბორბალი
      </h2>

      {/* The reel window */}
      <div className={`mx-auto mb-3 w-40 h-40 rounded-2xl flex flex-col items-center justify-center gap-2 ${landed ? 'spin-reel-landed' : ''}`}
           style={{
             background: `linear-gradient(180deg, ${gt?.color || '#7a532c'}22, ${gt?.color || '#7a532c'}0d)`,
             border: `2px solid ${gt?.color || '#7a532c'}${landed ? 'dd' : '66'}`,
             boxShadow: landed ? `0 0 34px ${gt?.color}55, inset 0 1px 0 rgba(255,255,255,0.2)` : 'inset 0 1px 0 rgba(255,255,255,0.12)',
             transition: 'box-shadow 220ms ease, border-color 220ms ease',
           }}>
        {Icon && <Icon size={54} style={{ color: gt.color }} />}
        <span className="font-western uppercase tracking-wide text-lg" style={{ color: '#3b2314' }}>
          {typeName(displayed)}
        </span>
      </div>

      {landed ? (
        <>
          <p className="text-[11px] font-typewriter mb-2" style={{ color: 'rgba(59,35,20,0.7)' }}>
            {getGameType(chosenGameType)?.description}
          </p>
          {/* The raise ladder — betting starts loose and can only tighten */}
          <div className="flex gap-1 overflow-x-auto pb-1 mb-2 justify-center items-center flex-wrap">
            {tiers.map((t, i) => (
              <span key={t.id} className="inline-flex items-center gap-1">
                {i > 0 && <span className="text-[10px]" style={{ color: 'rgba(138,90,11,0.6)' }}>→</span>}
                <span className="text-[10px] font-typewriter px-2 py-0.5 rounded-full whitespace-nowrap"
                      style={{
                        background: i === 0 ? 'rgba(76,122,47,0.12)' : 'rgba(184,134,11,0.12)',
                        border: i === 0 ? '1px solid rgba(76,122,47,0.4)' : '1px solid rgba(184,134,11,0.4)',
                        color: i === 0 ? '#3f5a28' : '#7a4d09',
                      }}>
                  {t.label}
                </span>
              </span>
            ))}
          </div>
        </>
      ) : (
        <p className="text-[11px] font-typewriter mb-2 animate-pulse" style={{ color: 'rgba(59,35,20,0.6)' }}>
          ტრიალებს…
        </p>
      )}

      <div className="inline-flex items-center gap-2 text-[11px] font-typewriter rounded-full px-3 py-1"
           style={{ background: 'rgba(76,122,47,0.1)', border: '1px solid rgba(76,122,47,0.35)', color: '#3f5a28' }}>
        <Coins size={12} /> ანტე: {ante} · ბანკი: {pot.toLocaleString()}
      </div>
    </ModalShell>
  )
}
