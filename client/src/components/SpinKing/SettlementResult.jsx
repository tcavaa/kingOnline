import { useEffect, useRef } from 'react'
import confetti from 'canvas-confetti'
import { ArrowRight, Coins, RotateCcw } from 'lucide-react'
import { useGame } from '../../context/GameContext'
import { getGameType } from '../../constants/gameTypes'
import { SPIN_TYPE_NAME_OVERRIDE, getTier } from '../../constants/spinKing'
import ModalShell from '../ModalShell'
import ChipStack from './ChipStack'

/**
 * Spin King's round-end modal: who pledged what, met/failed stamps, chip
 * payouts, rollover banner, fresh zombies and the match-end state. Replaces
 * King's RoundResult on spinking tables only.
 */
export default function SettlementResult() {
  const { settlement, players, isCreator, nextRound, mySeat } = useGame()

  const stl = settlement
  const gt = getGameType(stl?.gameType)
  const gtName = stl ? (SPIN_TYPE_NAME_OVERRIDE[stl.gameType] || gt?.name || stl.gameType) : ''
  const TypeIcon = gt?.Icon
  const myPayout = stl?.payouts?.[mySeat] ?? 0
  // The single shared condition the whole round settled on.
  const finalTier = stl?.tierId ? getTier(stl.gameType, stl.tierId) : null

  // One-shot confetti when this player banked chips.
  const playedRef = useRef(false)
  useEffect(() => {
    if (playedRef.current || !stl) return
    playedRef.current = true
    if (myPayout > 0) {
      confetti({
        particleCount: 110, spread: 75, origin: { y: 0.6 },
        colors: ['#e3b04b', '#b8860b', '#8e2b23', '#f8efdd'],
      })
    }
  }, [stl, myPayout])

  if (!stl) {
    // Settlement payload hasn't landed yet (e.g. reconnect race) — show a
    // minimal shell; the next state sync fills it in.
    return (
      <ModalShell className="items-center z-40 p-2 pointer-events-auto"
                  panelClassName="max-w-sm p-4 text-center my-auto">
        <p className="text-sm font-typewriter text-cream-soft animate-pulse">ანგარიშსწორება…</p>
      </ModalShell>
    )
  }

  const sortedPlayers = [...players].sort((a, b) => a.seat - b.seat)
  const winnerName = stl.matchWinner !== null && stl.matchWinner !== undefined
    ? (players.find(p => p.seat === stl.matchWinner)?.name ?? `მოთამაშე ${stl.matchWinner}`)
    : null

  return (
    <ModalShell
      className="items-center z-40 p-2 lg:p-4 pointer-events-auto overflow-y-auto"
      panelClassName="max-w-md p-3 lg:p-6 text-center my-auto">
      <h2 className="text-sm lg:text-xl font-western uppercase tracking-wider text-cream"
          style={{ textShadow: '0 1px 0 rgba(255,255,255,0.5)' }}>
        ხელი {stl.round} — ანგარიში
      </h2>

      <div className="flex items-center justify-center gap-2 mt-1 mb-2 lg:mb-3 flex-wrap">
        {gt && (
          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] lg:text-xs font-typewriter"
                style={{ background: `linear-gradient(180deg, ${gt.color}33, ${gt.color}11)`, color: '#3b2314', border: `1px solid ${gt.color}80` }}>
            {TypeIcon && <TypeIcon size={11} style={{ color: gt.color }} />}
            <strong style={{ color: gt.color }}>{gtName}</strong>
          </span>
        )}
        {finalTier && (
          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] lg:text-xs font-typewriter font-bold"
                style={{ background: 'rgba(184,134,11,0.14)', border: '1px solid rgba(184,134,11,0.5)', color: '#7a4d09' }}>
            პირობა: {finalTier.label}
          </span>
        )}
        <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] lg:text-xs font-typewriter"
              style={{ background: 'rgba(76,122,47,0.1)', border: '1px solid rgba(76,122,47,0.35)', color: '#3f5a28' }}>
          <Coins size={11} /> ბანკი: <strong>{stl.potBefore.toLocaleString()}</strong>
          <ChipStack amount={stl.potBefore} chipW={13} maxPerCol={5} className="ml-1" />
        </span>
      </div>

      {/* Per-player settlement rows */}
      <div className="rounded-lg p-2 lg:p-3 mb-2 inset-card text-left">
        {sortedPlayers.map(p => {
          const r = stl.results?.[p.seat] || {}
          const payout = stl.payouts?.[p.seat] ?? 0
          const after = stl.chipsAfter?.[p.seat] ?? 0
          return (
            <div key={p.seat} className="flex items-center gap-2 py-1.5"
                 style={{ borderBottom: p.seat !== sortedPlayers[sortedPlayers.length - 1].seat ? '1px solid rgba(122,83,44,0.18)' : 'none' }}>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] lg:text-xs font-typewriter font-bold truncate text-cream-soft">
                  {p.seat === mySeat ? 'შენ' : p.name}
                </p>
                <p className="text-[9px] lg:text-[10px] font-typewriter truncate" style={{ color: 'rgba(59,35,20,0.55)' }}>
                  {r.entered
                    ? (r.committed > 0 ? `ფსონი ${r.committed.toLocaleString()} ბანკში` : 'ჩეკით შევიდა')
                    : r.committed > 0 ? `ფოლდი · ${r.committed.toLocaleString()} ბანკში` : 'არ ჩართულა'}
                </p>
              </div>
              {r.entered && (
                <span className="text-[9px] lg:text-[10px] font-typewriter font-black px-1.5 py-0.5 rounded-full flex-shrink-0"
                      style={{
                        background: r.met ? 'rgba(76,122,47,0.14)' : 'rgba(165,55,43,0.12)',
                        border: r.met ? '1px solid rgba(76,122,47,0.45)' : '1px solid rgba(165,55,43,0.45)',
                        color: r.met ? '#4c7a2f' : '#a5372b',
                      }}>
                  {r.met ? '✓ შესრულდა' : '✗ ჩავარდა'}
                </span>
              )}
              <div className="w-24 text-right flex-shrink-0">
                <p className="text-sm lg:text-base font-black font-mono leading-tight"
                   style={{ color: payout > 0 ? '#4c7a2f' : 'rgba(59,35,20,0.45)' }}>
                  {payout > 0 ? `+${payout.toLocaleString()}` : '0'}
                </p>
                <div className="flex items-center justify-end gap-1">
                  <ChipStack amount={after} chipW={10} maxPerCol={4} />
                  <span className="text-[9px] font-typewriter" style={{ color: 'rgba(59,35,20,0.55)' }}>
                    {after.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {stl.rolledOver && (
        <div className="rounded-lg px-3 py-2 mb-2 inline-flex items-center gap-2 text-[11px] lg:text-xs font-typewriter font-bold"
             style={{ background: 'rgba(184,134,11,0.14)', border: '1px solid rgba(184,134,11,0.5)', color: '#7a4d09' }}>
          <RotateCcw size={13} /> პირობა ვერავინ შეასრულა — ბანკი ({stl.potAfter.toLocaleString()}) გადადის შემდეგ ხელში!
        </div>
      )}

      {stl.newZombies?.length > 0 && (
        <div className="mb-2 text-[11px] lg:text-xs font-typewriter" style={{ color: '#6b7280' }}>
          {stl.newZombies.map(s => {
            const n = players.find(p => p.seat === s)?.name ?? `მოთამაშე ${s}`
            return <p key={s}>☠ {s === mySeat ? 'შენ' : n} ჩიპების გარეშე დარჩა — თამაშს აგრძელებს ზომბად.</p>
          })}
        </div>
      )}

      {stl.matchEnd ? (
        <div className="rounded-lg px-3 py-2.5 text-xs lg:text-sm font-typewriter font-bold"
             style={{ background: 'rgba(184,134,11,0.16)', border: '1px solid rgba(184,134,11,0.6)', color: '#7a4d09' }}>
          🏆 {winnerName} იღებს ყველა ჩიპს — მატჩი დასრულდა!
        </div>
      ) : isCreator ? (
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
