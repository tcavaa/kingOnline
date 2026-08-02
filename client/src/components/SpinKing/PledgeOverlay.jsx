import { useEffect, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { useGame } from '../../context/GameContext'
import { getGameType } from '../../constants/gameTypes'
import { PLEDGE_TIERS, SPIN_TYPE_NAME_OVERRIDE } from '../../constants/spinKing'

/**
 * Pledge betting, poker-table style — NO modal. The table's shared state
 * (game rule · active condition · stake) sits in the centre of the felt,
 * and the actor gets a slim fold / check-call / raise bar floating just
 * above their own cards, so the hand is never covered.
 *
 * Rules recap: while the stake is 0 it's bet-or-fold (min = ante). A raise
 * may add chips and/or tighten the shared condition; a player who already
 * matched the stake checks a tier escalation for free.
 */
export default function PledgeOverlay() {
  const {
    pledge, pot, ante, mySeat, currentTurn, players,
    chosenGameType, pledgeAct,
  } = useGame()

  const gt      = getGameType(chosenGameType)
  const gtName  = SPIN_TYPE_NAME_OVERRIDE[chosenGameType] || gt?.name || chosenGameType
  const ladder  = PLEDGE_TIERS[chosenGameType] || []
  const tierIdx = pledge?.tierIdx ?? 0
  const activeTier = ladder[tierIdx] || null
  const stricterTiers = ladder.slice(tierIdx + 1)
  const myEntry = pledge?.entries?.[mySeat]
  const stake   = pledge?.stake ?? 0
  const cap     = pledge?.cap ?? 0
  const minRaise = pledge?.minRaise ?? ante
  const opened  = stake > 0
  const myTurn  = currentTurn === mySeat && myEntry && myEntry.status !== 'folded'
  const callDelta = Math.max(0, stake - (myEntry?.committed ?? 0))
  const canMoneyRaise = minRaise <= cap

  const [tierSel, setTierSel] = useState(null)
  const [raise, setRaise]     = useState(minRaise)
  useEffect(() => { setTierSel(null) }, [tierIdx, chosenGameType])
  const raiseMin = tierSel ? Math.max(stake, ante) : minRaise
  useEffect(() => { setRaise(raiseMin) }, [raiseMin])
  const clampRaise = (v) => {
    const n = Math.round(Number(v))
    if (!Number.isFinite(n)) return raiseMin
    return Math.max(raiseMin, Math.min(cap, n))
  }
  const canRaise = (!!tierSel && raiseMin <= cap) || canMoneyRaise
  const turnName = players.find(p => p.seat === currentTurn)?.name ?? '…'
  // Who tightened the table to the current condition (null at the base tier).
  const tierSetByName = pledge?.tierSetBy !== null && pledge?.tierSetBy !== undefined
    ? (pledge.tierSetBy === mySeat ? 'შენ' : players.find(p => p.seat === pledge.tierSetBy)?.name ?? null)
    : null

  return (
    <>
      {/* ── Centre of the table: rule · active condition · stake ── */}
      <div className="absolute left-1/2 -translate-x-1/2 z-30 pointer-events-none text-center px-3"
           style={{ top: '37%' }}>
        <div className="rounded-2xl px-5 py-2.5"
             style={{
               background: 'rgba(20,13,8,0.82)',
               border: '1.5px solid rgba(184,134,11,0.65)',
               boxShadow: '0 8px 28px rgba(10,6,3,0.5), inset 0 1px 0 rgba(255,255,255,0.08)',
             }}>
          <p className="text-[10px] font-typewriter uppercase tracking-[0.25em]"
             style={{ color: gt?.color || '#e3b04b' }}>
            {gtName}
          </p>
          <p className="text-base lg:text-xl font-typewriter font-black leading-tight"
             style={{ color: '#f4d06f' }}>
            {activeTier?.label ?? '—'}
            {tierSetByName && (
              <span className="text-[10px] lg:text-xs font-bold ml-1.5 align-middle" style={{ color: 'rgba(232,220,191,0.8)' }}>
                — {tierSetByName}
              </span>
            )}
          </p>
          <p className="text-[11px] lg:text-sm font-typewriter font-bold" style={{ color: '#e8dcbf' }}>
            ფსონი: {stake.toLocaleString()}{pot > 0 && <span className="opacity-60"> · ბანკი: {pot.toLocaleString()}</span>}
          </p>
          {!myTurn && (
            <p className="text-[10px] lg:text-xs font-typewriter animate-pulse mt-0.5" style={{ color: 'rgba(232,220,191,0.75)' }}>
              {myEntry?.status === 'folded' && currentTurn !== mySeat
                ? `ელოდება ${turnName}-ს…`
                : myEntry?.status === 'folded'
                  ? 'შენ დაკეცე — ხელს მაინც თამაშობ'
                  : `ელოდება ${turnName}-ს…`}
            </p>
          )}
        </div>
      </div>

      {/* ── Action bar floating fully ABOVE the own card fan ── */}
      {myTurn && (
        <div className="absolute left-1/2 -translate-x-1/2 z-30 pointer-events-auto flex flex-col items-center gap-1.5 px-2"
             style={{ bottom: '38%' }}>
          {stricterTiers.length > 0 && (
            <div className="flex gap-1.5 flex-wrap justify-center">
              {stricterTiers.map(t => {
                const sel = tierSel === t.id
                return (
                  <button key={t.id} onClick={() => setTierSel(sel ? null : t.id)}
                          className="rounded-full px-3 py-1 text-[11px] font-typewriter font-bold transition-all active:scale-95 whitespace-nowrap"
                          style={{
                            background: sel ? 'rgba(184,134,11,0.9)' : 'rgba(20,13,8,0.78)',
                            border: sel ? '1.5px solid #f4d06f' : '1px solid rgba(184,134,11,0.5)',
                            color: sel ? '#1a120a' : '#e8dcbf',
                            boxShadow: sel ? '0 0 14px rgba(184,134,11,0.5)' : '0 2px 8px rgba(10,6,3,0.4)',
                          }}>
                    ⇧ {t.label}
                  </button>
                )
              })}
            </div>
          )}

          <div className="flex items-center gap-1.5 rounded-2xl px-2 py-1.5"
               style={{
                 background: 'rgba(20,13,8,0.82)',
                 border: '1px solid rgba(122,83,44,0.55)',
                 boxShadow: '0 8px 28px rgba(10,6,3,0.5)',
               }}>
            <button onClick={() => pledgeAct({ action: 'fold' })}
                    className="py-2 px-3.5 rounded-xl text-xs lg:text-sm font-bold uppercase tracking-wider transition-all active:scale-95 font-typewriter"
                    style={{ background: 'rgba(165,55,43,0.25)', border: '1px solid rgba(165,55,43,0.7)', color: '#ffb1a6' }}>
              ფოლდი
            </button>
            {opened && (
              <button onClick={() => pledgeAct({ action: 'call' })}
                      className="py-2 px-3.5 rounded-xl text-xs lg:text-sm font-bold uppercase tracking-wider transition-all active:scale-95 font-typewriter"
                      style={{ background: 'rgba(76,122,47,0.28)', border: '1px solid rgba(76,122,47,0.7)', color: '#b8e6a3' }}>
                {callDelta > 0 ? `ქოლი · ${callDelta.toLocaleString()}` : 'ჩეკი'}
              </button>
            )}
            <div className="flex items-center gap-1 mx-0.5">
              <button onClick={() => setRaise(r => clampRaise((Number(r) || raiseMin) - ante))}
                      className="w-8 h-8 rounded-lg flex items-center justify-center active:scale-90 transition-all"
                      style={{ background: 'rgba(142,43,35,0.3)', border: '1px solid rgba(142,43,35,0.6)', color: '#ffb1a6' }}>
                <Minus size={14} />
              </button>
              <input
                type="number" min={raiseMin} max={cap} step={ante}
                value={raise}
                onChange={e => setRaise(e.target.value)}
                onBlur={() => setRaise(r => clampRaise(r))}
                className="font-typewriter text-center text-base font-black rounded-lg"
                style={{
                  width: '5.5rem', padding: '0.35rem 0.25rem',
                  background: 'rgba(244,232,207,0.95)', color: '#3b2314',
                  border: '1px solid rgba(184,134,11,0.6)',
                }}
              />
              <button onClick={() => setRaise(r => clampRaise((Number(r) || 0) + ante))}
                      className="w-8 h-8 rounded-lg flex items-center justify-center active:scale-90 transition-all"
                      style={{ background: 'rgba(76,122,47,0.3)', border: '1px solid rgba(76,122,47,0.6)', color: '#b8e6a3' }}>
                <Plus size={14} />
              </button>
            </div>
            <button onClick={() => pledgeAct({ action: 'raise', ...(tierSel ? { tier: tierSel } : {}), stake: clampRaise(raise) })}
                    disabled={!canRaise}
                    className="casino-btn-gold py-2 px-3.5 text-xs lg:text-sm tracking-wider uppercase active:scale-95 disabled:opacity-50">
              {opened ? 'რეიზი' : 'ფსონი'}{tierSel ? ' ⇧' : ''} · {clampRaise(raise).toLocaleString()}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
