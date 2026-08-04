import { useEffect, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { useGame } from '../../context/GameContext'
import { getGameType } from '../../constants/gameTypes'
import { SPIN_TYPE_NAME_OVERRIDE } from '../../constants/spinKing'

/**
 * Rising auction for the face-down prikup, poker-table style — NO modal.
 * The table's shared state (game rule · current bid · pot) sits in the
 * centre of the felt over the two face-down cards, and the actor gets a
 * slim pass / bid bar floating just above their own cards, so the hand is
 * always readable while deciding.
 */
export default function AuctionOverlay() {
  const {
    auction, chips, pot, ante, mySeat, currentTurn, players,
    chosenGameType, placeBid, passBid,
  } = useGame()

  const gt         = getGameType(chosenGameType)
  const gtName     = SPIN_TYPE_NAME_OVERRIDE[chosenGameType] || gt?.name || chosenGameType
  const myChips    = chips?.[mySeat] ?? 0
  // All-pay: what you already sank stays in the pot; a new bid only tops
  // up the difference, so your ceiling is committed + remaining chips.
  const myCommitted = auction?.committed?.[mySeat] ?? 0
  const myMax      = myCommitted + myChips
  const minNextBid = auction?.minNextBid ?? ante
  const myTurn     = currentTurn === mySeat && !auction?.passed?.[mySeat]
  const canAfford  = myMax >= minNextBid

  const [bid, setBid] = useState(minNextBid)
  useEffect(() => { setBid(minNextBid) }, [minNextBid])
  const clampBid = (v) => {
    const n = Math.round(Number(v))
    if (!Number.isFinite(n)) return minNextBid
    return Math.max(minNextBid, Math.min(myMax, n))
  }

  const highName = auction?.highBidder !== null && auction?.highBidder !== undefined
    ? (players.find(p => p.seat === auction.highBidder)?.name ?? `მოთამაშე ${auction.highBidder}`)
    : null
  const turnName = players.find(p => p.seat === currentTurn)?.name ?? '…'

  return (
    <>
      {/* ── Centre of the table: rule · current bid · pot ── */}
      <div className="absolute left-1/2 -translate-x-1/2 z-30 pointer-events-none text-center px-3"
           style={{ top: '37%' }}>
        <div className="rounded-2xl px-5 py-2.5"
             style={{
               background: 'rgba(20,13,8,0.82)',
               border: '1.5px solid rgba(142,43,35,0.7)',
               boxShadow: '0 8px 28px rgba(10,6,3,0.5), inset 0 1px 0 rgba(255,255,255,0.08)',
             }}>
          <p className="text-[10px] font-typewriter uppercase tracking-[0.25em]"
             style={{ color: gt?.color || '#e3b04b' }}>
            {gtName} · პრიკუპზე ფსონები
          </p>
          <p className="text-base lg:text-xl font-typewriter font-black leading-tight"
             style={{ color: '#f4d06f' }}>
            {highName ? `${auction.bid.toLocaleString()} — ${highName}` : 'ფსონი ჯერ არავის დაუდია'}
          </p>
          <p className="text-[11px] lg:text-sm font-typewriter font-bold" style={{ color: '#e8dcbf' }}>
            2 ფარული კარტი{pot > 0 && <span className="opacity-60"> · ბანკი: {pot.toLocaleString()}</span>}
            {myCommitted > 0 && <span className="opacity-80"> · შენ დადე: {myCommitted.toLocaleString()}</span>}
          </p>
          {!myTurn && (
            <p className="text-[10px] lg:text-xs font-typewriter animate-pulse mt-0.5" style={{ color: 'rgba(232,220,191,0.75)' }}>
              {auction?.passed?.[mySeat]
                ? (myCommitted > 0
                    ? `შენ დაკეცე — ${myCommitted.toLocaleString()} ბანკში დარჩა · ელოდება ${turnName}-ს…`
                    : `შენ თქვი პასი · ელოდება ${turnName}-ს…`)
                : `ელოდება ${turnName}-ს…`}
            </p>
          )}
        </div>
      </div>

      {/* ── Action bar riding on top of the own card fan ── */}
      {myTurn && (
        <div className="absolute left-1/2 -translate-x-1/2 z-30 pointer-events-auto px-2"
             style={{ bottom: '38%' }}>
          <div className="flex items-center gap-1.5 rounded-2xl px-2 py-1.5"
               style={{
                 background: 'rgba(20,13,8,0.82)',
                 border: '1px solid rgba(122,83,44,0.55)',
                 boxShadow: '0 8px 28px rgba(10,6,3,0.5)',
               }}>
            <button onClick={passBid}
                    className="py-2 px-3.5 rounded-xl text-xs lg:text-sm font-bold uppercase tracking-wider transition-all active:scale-95 font-typewriter"
                    style={{ background: 'rgba(165,55,43,0.25)', border: '1px solid rgba(165,55,43,0.7)', color: '#ffb1a6' }}>
              ფოლდი
            </button>
            {canAfford && (
              <>
                <div className="flex items-center gap-1 mx-0.5">
                  <button onClick={() => setBid(b => clampBid((Number(b) || minNextBid) - ante))}
                          className="w-8 h-8 rounded-lg flex items-center justify-center active:scale-90 transition-all"
                          style={{ background: 'rgba(142,43,35,0.3)', border: '1px solid rgba(142,43,35,0.6)', color: '#ffb1a6' }}>
                    <Minus size={14} />
                  </button>
                  <input
                    type="number" min={minNextBid} max={myMax} step={ante}
                    value={bid}
                    onChange={e => setBid(e.target.value)}
                    onBlur={() => setBid(b => clampBid(b))}
                    className="font-typewriter text-center text-base font-black rounded-lg"
                    style={{
                      width: '5.5rem', padding: '0.35rem 0.25rem',
                      background: 'rgba(244,232,207,0.95)', color: '#3b2314',
                      border: '1px solid rgba(184,134,11,0.6)',
                    }}
                  />
                  <button onClick={() => setBid(b => clampBid((Number(b) || 0) + ante))}
                          className="w-8 h-8 rounded-lg flex items-center justify-center active:scale-90 transition-all"
                          style={{ background: 'rgba(76,122,47,0.3)', border: '1px solid rgba(76,122,47,0.6)', color: '#b8e6a3' }}>
                    <Plus size={14} />
                  </button>
                </div>
                <button onClick={() => placeBid(clampBid(bid))}
                        className="casino-btn-gold py-2 px-3.5 text-xs lg:text-sm tracking-wider uppercase active:scale-95">
                  დადება · {clampBid(bid).toLocaleString()}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
