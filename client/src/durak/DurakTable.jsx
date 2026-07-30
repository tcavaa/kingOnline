import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft, RotateCcw, Trophy, Eye, Copy, Check,
  ScrollText, MessageSquare, LogOut, Flag, X,
} from 'lucide-react'
import { useDurak } from './DurakContext'
import DurakCard, { DurakCardBack, SUIT_GLYPH, SUIT_NAME, SUIT_COLOR } from './DurakCard'
import DurakChat from './DurakChat'
import AvatarImg from '../components/AvatarImg'

const SUITS = ['S', 'H', 'D', 'C']
// Hand sorting: by suit, then big → small inside the suit.
const SUIT_ORDER = ['S', 'H', 'D', 'C']
const RANK_ORDER = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6']

function SuitChip({ suit, label }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-black"
          style={{ background: 'rgba(255,250,235,0.95)', border: `2px solid ${SUIT_COLOR[suit]}`, color: SUIT_COLOR[suit] }}>
      {label && <span className="text-[10px] font-typewriter font-bold uppercase" style={{ color: 'rgba(59,35,20,0.6)' }}>{label}</span>}
      {SUIT_GLYPH[suit]} {SUIT_NAME[suit]}
    </span>
  )
}

function SuitPickerModal({ title, onPick, onCancel }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center px-4"
         style={{ background: 'rgba(20,12,8,0.55)', backdropFilter: 'blur(3px)' }}>
      <div className="western-panel p-6 w-full max-w-xs text-center">
        <h3 className="text-base font-western uppercase mb-4" style={{ color: '#3b2314' }}>{title}</h3>
        <div className="grid grid-cols-2 gap-3">
          {SUITS.map((s) => (
            <button key={s} onClick={() => onPick(s)}
                    className="py-3 rounded-xl text-lg font-black transition-all active:scale-95"
                    style={{ background: 'rgba(255,250,235,0.9)', border: `2px solid ${SUIT_COLOR[s]}`, color: SUIT_COLOR[s] }}>
              {SUIT_GLYPH[s]}<br />
              <span className="text-[11px] font-typewriter font-bold">{SUIT_NAME[s]}</span>
            </button>
          ))}
        </div>
        {onCancel && (
          <button onClick={onCancel} className="mt-4 text-xs font-typewriter" style={{ color: 'rgba(59,35,20,0.6)' }}>
            გაუქმება
          </button>
        )}
      </div>
    </div>
  )
}

function TopBarButton({ onClick, title, children, danger, badge }) {
  return (
    <button onClick={onClick} title={title}
            className="relative inline-flex items-center justify-center w-9 h-9 rounded-lg transition-all active:scale-95"
            style={{
              background: danger ? 'rgba(165,55,43,0.12)' : 'rgba(122,83,44,0.12)',
              border: danger ? '1px solid rgba(165,55,43,0.45)' : '1px solid rgba(122,83,44,0.35)',
              color: danger ? '#a5372b' : '#3b2314',
            }}>
      {children}
      {badge > 0 && (
        <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full text-[9px] font-black flex items-center justify-center"
              style={{ background: '#a5372b', color: '#fdf2df' }}>
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  )
}

/** Score sheet drawer: one column per player, one row per finished hand. */
function ScoreDrawer({ open, onClose, players, game }) {
  const history = game.history || []
  return (
    <>
      {open && <div className="durak-drawer-backdrop" onClick={onClose} />}
      <div className={`durak-drawer ${open ? 'open' : ''}`}>
        <div className="flex items-center justify-between px-4 py-3"
             style={{ borderBottom: '2px solid rgba(122,83,44,0.35)' }}>
          <h3 className="text-sm font-western uppercase inline-flex items-center gap-2" style={{ color: '#3b2314' }}>
            <ScrollText size={15} /> ქულების ფურცელი
          </h3>
          <button onClick={onClose}><X size={16} style={{ color: '#3b2314' }} /></button>
        </div>
        <div className="flex-1 overflow-auto p-3">
          <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th className="px-1.5 py-1.5 text-left font-typewriter text-[10px] uppercase" style={{ color: 'rgba(59,35,20,0.6)' }}>ხელი</th>
                {players.map((p) => (
                  <th key={p.seat} className="px-1.5 py-1.5 text-center font-western text-[11px]"
                      style={{ color: game.eliminated[p.seat] ? 'rgba(165,55,43,0.8)' : '#3b2314',
                               textDecoration: game.eliminated[p.seat] ? 'line-through' : 'none' }}>
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.length === 0 && (
                <tr><td colSpan={players.length + 1} className="px-1.5 py-3 text-center font-typewriter"
                        style={{ color: 'rgba(59,35,20,0.5)' }}>ჯერ არც ერთი ხელი არ დასრულებულა.</td></tr>
              )}
              {history.map((h) => (
                <tr key={h.handNumber} style={{ borderTop: '1px solid rgba(122,83,44,0.25)' }}>
                  <td className="px-1.5 py-1.5 font-mono" style={{ color: 'rgba(59,35,20,0.6)' }}>{h.handNumber}</td>
                  {players.map((p) => {
                    const d = h.perSeat[p.seat]
                    const isWin = h.winnerSeat === p.seat
                    return (
                      <td key={p.seat} className="px-1.5 py-1.5 text-center font-mono font-bold"
                          style={{ color: d === undefined ? 'rgba(59,35,20,0.3)' : d < 0 ? '#4c7a2f' : d === 0 ? '#4c7a2f' : '#3b2314',
                                   background: isWin ? 'rgba(76,122,47,0.1)' : 'transparent' }}>
                        {d === undefined ? '—' : d > 0 ? `+${d}` : d}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid rgba(122,83,44,0.45)' }}>
                <td className="px-1.5 py-2 font-western text-[10px] uppercase" style={{ color: '#3b2314' }}>Σ</td>
                {players.map((p) => (
                  <td key={p.seat} className="px-1.5 py-2 text-center font-mono font-black"
                      style={{ color: game.scores[p.seat] >= game.targetScore ? '#a5372b' : '#1f3d2e' }}>
                    {game.scores[p.seat] ?? 0}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
          <p className="mt-3 text-[10px] font-typewriter text-center" style={{ color: 'rgba(59,35,20,0.5)' }}>
            წაგების ქულა: {game.targetScore}
          </p>
        </div>
      </div>
    </>
  )
}

export default function DurakTable({ onExit }) {
  const {
    room, game, mySeat, chatMessages, typingSeats,
    playCard, drawCard, takePenalty, pass, sayKarta, chooseSuit,
    nextHand, rematch, endMatch, leaveRoom,
  } = useDurak()
  const [pendingQueen, setPendingQueen] = useState(null)
  const [drawer, setDrawer] = useState(null) // null | 'score' | 'chat'
  const [copied, setCopied] = useState(false)
  const [seenChatCount, setSeenChatCount] = useState(0)
  // Hand-end flow: a short "round done" stamp first (so everyone sees the
  // final card on the table), the results modal 4 seconds later.
  const [resultsVisible, setResultsVisible] = useState(false)
  const [stampVisible, setStampVisible] = useState(false)
  const prevPhaseRef = useRef(game.phase)

  useEffect(() => {
    const prev = prevPhaseRef.current
    prevPhaseRef.current = game.phase
    if (game.phase === 'hand_end' || game.phase === 'match_end') {
      if (prev === 'playing') {
        setStampVisible(true)
        setResultsVisible(false)
        const t = setTimeout(() => { setStampVisible(false); setResultsVisible(true) }, 4000)
        return () => clearTimeout(t)
      }
      // Rejoining straight into a finished hand — no ceremony, show results.
      setResultsVisible(true)
      setStampVisible(false)
    } else {
      setResultsVisible(false)
      setStampVisible(false)
    }
    return undefined
  }, [game.phase])

  const players = room.players
  const nameOf = (seat) => players.find((p) => p.seat === seat)?.name || `#${seat}`

  const iAmEliminated = !!game.eliminated[mySeat]
  const myTurn = game.phase === 'playing' && game.currentSeat === mySeat && game.awaitingSuitFrom === null

  // Sorted hand: suit groups, big → small.
  const hand = useMemo(() => {
    return [...(game.yourHand || [])].sort((a, b) => {
      const sd = SUIT_ORDER.indexOf(a.suit) - SUIT_ORDER.indexOf(b.suit)
      if (sd !== 0) return sd
      return RANK_ORDER.indexOf(a.rank) - RANK_ORDER.indexOf(b.rank)
    })
  }, [game.yourHand])

  const isPlayable = (card) => {
    if (game.pendingDraw > 0) return card.rank === '6'
    if (!game.topCard) return false
    if (card.rank === 'Q') return true
    if (game.requestedSuit) return card.suit === game.requestedSuit
    return card.suit === game.topCard.suit || card.rank === game.topCard.rank
  }

  // May still put a card down this turn (a 7 re-opens the sub-turn).
  const canPlayNow = myTurn && !game.playedThisTurn
  // "სვლის დასრულება" is how EVERY turn ends: after a play it's always
  // available; without a play you must draw first (unless nothing to draw).
  const canFinishTurn = game.playedThisTurn
    ? true
    : (game.pendingDraw > 0 ? false : (game.drawnThisTurn || !game.canDraw))

  const opponents = useMemo(() => {
    const seats = players.map((p) => p.seat).sort((a, b) => a - b)
    const start = seats.indexOf(mySeat)
    const order = []
    for (let i = 1; i < seats.length; i++) order.push(seats[(start + i) % seats.length])
    return order.map((s) => players.find((p) => p.seat === s)).filter(Boolean)
  }, [players, mySeat])

  // Latest chat message per seat → transient bubble above the player chip.
  const [bubbles, setBubbles] = useState({})
  const lastMsg = chatMessages[chatMessages.length - 1]
  useEffect(() => {
    if (!lastMsg) return
    setBubbles((prev) => ({ ...prev, [lastMsg.seat]: lastMsg }))
    const t = setTimeout(() => {
      setBubbles((prev) => (prev[lastMsg.seat] === lastMsg ? { ...prev, [lastMsg.seat]: null } : prev))
    }, 4000)
    return () => clearTimeout(t)
  }, [lastMsg])

  const unreadChat = drawer === 'chat' ? 0 : chatMessages.length - seenChatCount
  useEffect(() => {
    if (drawer === 'chat') setSeenChatCount(chatMessages.length)
  }, [drawer, chatMessages.length])

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(room.roomCode)
      setCopied(true); setTimeout(() => setCopied(false), 1600)
    } catch { /* ignore */ }
  }

  const handleCardTap = (card) => {
    if (!canPlayNow || game.phase !== 'playing') return
    if (!isPlayable(card)) return
    if (card.rank === 'Q' && hand.length > 1) {
      const locked = game.topCard?.rank === 'Q' && game.topCard?.suit === 'H' && game.requestedSuit
      if (!locked) { setPendingQueen(card); return }
    }
    playCard(card)
  }

  const confirmEnd = () => {
    if (window.confirm('დაასრულო თამაში ყველასთვის? ქულები წაიშლება.')) endMatch()
  }
  const confirmExit = () => {
    if (window.confirm('გახვიდე ოთახიდან? შენი ადგილი დაიკარგება.')) { leaveRoom(); onExit() }
  }

  const isCreator = mySeat === room.creatorSeat
  const stackCards = game.recentDiscards || (game.topCard ? [game.topCard] : [])

  return (
    <div className="saloon-bg min-h-screen flex flex-col px-3 py-3" style={{ minHeight: '100dvh' }}>
      {/* ── top bar ── */}
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <TopBarButton onClick={onExit} title="კინგზე დაბრუნება (ადგილი შენარჩუნდება)">
            <ArrowLeft size={15} />
          </TopBarButton>
          <button onClick={copyCode} title="კოდის კოპირება"
                  className="inline-flex items-center gap-1.5 px-2.5 h-9 rounded-lg text-[12px] font-typewriter font-bold tracking-[0.15em] active:scale-95"
                  style={{
                    background: copied ? 'rgba(76,122,47,0.15)' : 'rgba(122,83,44,0.12)',
                    border: copied ? '1px solid rgba(76,122,47,0.5)' : '1px solid rgba(122,83,44,0.35)',
                    color: copied ? '#4c7a2f' : '#3b2314',
                  }}>
            {room.roomCode} {copied ? <Check size={12} strokeWidth={3} /> : <Copy size={12} />}
          </button>
        </div>
        <div className="text-center">
          <div className="text-base font-western leading-none" style={{ color: '#1f3d2e' }}>ჩეხური დურაკა</div>
          <div className="text-[10px] font-typewriter" style={{ color: 'rgba(59,35,20,0.55)' }}>
            ხელი {game.handNumber} · ლიმიტი {game.targetScore} · დასტა {game.drawableCount}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <TopBarButton onClick={() => setDrawer(drawer === 'score' ? null : 'score')} title="ქულების ფურცელი">
            <ScrollText size={15} />
          </TopBarButton>
          <TopBarButton onClick={() => setDrawer(drawer === 'chat' ? null : 'chat')} title="ჩატი" badge={unreadChat}>
            <MessageSquare size={15} />
          </TopBarButton>
          {isCreator && game.phase === 'playing' && (
            <TopBarButton onClick={confirmEnd} title="თამაშის დასრულება" danger>
              <Flag size={15} />
            </TopBarButton>
          )}
          <TopBarButton onClick={confirmExit} title="ოთახიდან გასვლა" danger>
            <LogOut size={15} />
          </TopBarButton>
        </div>
      </div>

      {/* ── opponents ── */}
      <div className="flex flex-wrap justify-center gap-3 mb-3">
        {opponents.map((p) => {
          const isTurn = game.phase === 'playing' && game.currentSeat === p.seat
          const out = game.eliminated[p.seat]
          const count = game.handCounts[p.seat] ?? 0
          return (
            <div key={p.seat} className={`relative flex flex-col items-center gap-1 ${isTurn ? 'durak-turn-pulse' : ''}`}
                 style={{
                   padding: '6px 10px', borderRadius: 14,
                   background: isTurn ? 'rgba(31,61,46,0.14)' : 'rgba(255,250,235,0.6)',
                   border: isTurn ? '2px solid rgba(31,61,46,0.75)' : '1px solid rgba(122,83,44,0.3)',
                   opacity: out ? 0.5 : 1,
                 }}>
              {bubbles[p.seat]
                ? <div className="durak-bubble">{bubbles[p.seat].message}</div>
                : typingSeats[p.seat]
                  ? <div className="durak-bubble"><span className="animate-pulse tracking-widest">● ● ●</span></div>
                  : null}
              <div className="flex items-center gap-2">
                <div className="relative">
                  <AvatarImg avatar={p.avatar} size={30} ring={isTurn ? 'rgba(31,61,46,0.8)' : 'rgba(122,83,44,0.4)'} />
                  {!p.connected && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
                </div>
                <div className="leading-tight">
                  <div className="text-[11px] font-western font-bold" style={{ color: '#3b2314', textDecoration: out ? 'line-through' : 'none' }}>
                    {p.name}
                    {game.kartaFlags[p.seat] && count === 1 && (
                      <span className="ml-1 text-[9px] px-1 py-px rounded font-typewriter"
                            style={{ background: 'rgba(192,138,38,0.25)', color: '#8a5a12', border: '1px solid rgba(192,138,38,0.5)' }}>
                        კარტა!
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] font-typewriter" style={{ color: 'rgba(59,35,20,0.6)' }}>
                    {out ? 'გამოვიდა' : <>{count} კარტი · {game.scores[p.seat] ?? 0} ქ.</>}
                  </div>
                </div>
              </div>
              {/* opponent's card backs — near full-size so the table reads at a glance */}
              {!out && count > 0 && (
                <div className="flex items-end" style={{ height: 66, marginTop: 2 }}>
                  {Array.from({ length: Math.min(count, 8) }).map((_, i) => {
                    const shown = Math.min(count, 8)
                    return (
                      <DurakCardBack key={i} size="sm"
                                     style={{
                                       marginLeft: i === 0 ? 0 : -30,
                                       transform: `rotate(${(i - (shown - 1) / 2) * 4}deg)`,
                                     }} />
                    )
                  })}
                  {count > 8 && (
                    <span className="ml-1.5 text-[10px] font-black font-typewriter" style={{ color: 'rgba(59,35,20,0.65)' }}>
                      ×{count}
                    </span>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── table center ── */}
      <div className="flex-1 flex flex-col items-center justify-center gap-3">
        {game.awaitingSuitFrom !== null && game.awaitingSuitFrom !== mySeat && (
          <div className="text-xs font-typewriter px-3 py-1.5 rounded-full"
               style={{ background: 'rgba(192,138,38,0.15)', border: '1px solid rgba(192,138,38,0.5)', color: '#8a5a12' }}>
            {nameOf(game.awaitingSuitFrom)} ირჩევს ფერს…
          </div>
        )}
        <div className="flex items-end gap-8">
          <div className="flex flex-col items-center gap-1">
            <DurakCardBack label={game.drawPileCount} />
            <span className="text-[10px] font-typewriter" style={{ color: 'rgba(59,35,20,0.55)' }}>დასტა</span>
          </div>
          {/* stacked discard pile */}
          <div className="flex flex-col items-center gap-1">
            <div className="relative" style={{ width: 84, height: 118 }}>
              {stackCards.map((card, i) => {
                const isTop = i === stackCards.length - 1
                const angle = isTop ? 0 : [-9, 7, -4][i % 3]
                const dx = isTop ? 0 : [-5, 4, -2][i % 3]
                return (
                  <div key={`${game.discardCount - stackCards.length + i}`}
                       className={`absolute inset-0 ${isTop ? 'durak-play-in' : ''}`}
                       style={{ transform: `rotate(${angle}deg) translate(${dx}px, ${isTop ? 0 : 2}px)`, zIndex: i }}>
                    <DurakCard card={card} size="lg" />
                  </div>
                )
              })}
            </div>
            <span className="text-[10px] font-typewriter" style={{ color: 'rgba(59,35,20,0.55)' }}>
              მაგიდა · {game.discardCount}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-center min-h-[34px]">
          {game.requestedSuit && <SuitChip suit={game.requestedSuit} label="ითხოვს" />}
          {game.pendingDraw > 0 && (
            <span className="px-3 py-1 rounded-full text-sm font-black animate-pulse"
                  style={{ background: 'rgba(165,55,43,0.14)', border: '2px solid rgba(165,55,43,0.6)', color: '#a5372b' }}>
              +{game.pendingDraw}
            </span>
          )}
        </div>

        <div className="text-sm font-typewriter font-bold"
             style={{ color: myTurn ? '#1f3d2e' : 'rgba(59,35,20,0.6)' }}>
          {game.phase === 'playing' && (
            myTurn
              ? (game.playedThisTurn ? '⤵ დააჭირე „სვლის დასრულებას"' : '➤ შენი სვლაა')
              : game.awaitingSuitFrom === mySeat
                ? 'აირჩიე ფერი'
                : `${nameOf(game.currentSeat)}-ის სვლა…`
          )}
        </div>
      </div>

      {/* ── actions ── */}
      {!iAmEliminated && game.phase === 'playing' && (
        <div className="flex items-center justify-center gap-2 mb-3 flex-wrap">
          {/* კარტა is always on screen so nobody hunts for it — it lights
              up the moment you're down to one unannounced card. */}
          <button onClick={sayKarta}
                  disabled={!(hand.length === 1 && !game.saidKarta)}
                  className={`px-5 py-2.5 rounded-xl text-sm font-black active:scale-95 disabled:opacity-35 ${hand.length === 1 && !game.saidKarta ? 'animate-pulse' : ''}`}
                  style={{ background: 'rgba(192,138,38,0.9)', border: '2px solid rgba(120,80,20,0.6)', color: '#2b1a08' }}>
            კარტა!
          </button>
          {myTurn && game.pendingDraw > 0 && !game.playedThisTurn && (
            <button onClick={takePenalty}
                    className="px-5 py-2.5 rounded-xl text-sm font-black active:scale-95"
                    style={{ background: 'rgba(165,55,43,0.9)', border: '2px solid rgba(111,31,26,0.6)', color: '#fdf2df' }}>
              აიღე +{game.pendingDraw}
            </button>
          )}
          {myTurn && game.pendingDraw === 0 && !game.playedThisTurn && (
            <button onClick={drawCard} disabled={game.drawnThisTurn || !game.canDraw}
                    className="px-5 py-2.5 rounded-xl text-sm font-bold active:scale-95 disabled:opacity-40"
                    style={{ background: 'rgba(31,61,46,0.85)', border: '2px solid rgba(20,40,30,0.6)', color: '#f4e8cf' }}>
              +1 კარტი
            </button>
          )}
          {myTurn && (
            <button onClick={pass} disabled={!canFinishTurn}
                    className={`px-5 py-2.5 rounded-xl text-sm font-bold active:scale-95 disabled:opacity-40 ${game.playedThisTurn ? 'animate-pulse' : ''}`}
                    style={{ background: 'rgba(122,83,44,0.95)', border: '2px solid rgba(90,54,32,0.6)', color: '#f4e8cf' }}>
              სვლის დასრულება
            </button>
          )}
        </div>
      )}

      {iAmEliminated && game.phase === 'playing' && (
        <div className="mb-3 text-center text-xs font-typewriter inline-flex items-center gap-2 justify-center"
             style={{ color: 'rgba(59,35,20,0.6)' }}>
          <Eye size={13} /> შენ გამოხვედი — უყურებ თამაშს
        </div>
      )}

      {/* ── my hand (locked & dimmed while it's not your turn) ── */}
      {!iAmEliminated && (
        <div className="flex justify-center">
          <div key={game.handNumber}
               className="flex flex-wrap justify-center gap-1.5 max-w-3xl pb-2 transition-opacity"
               style={{ opacity: myTurn || game.phase !== 'playing' ? 1 : 0.55 }}>
            {hand.map((card, i) => (
              <div key={`${card.rank}${card.suit}`} className="durak-deal-in" style={{ animationDelay: `${i * 55}ms` }}>
                <DurakCard
                  card={card}
                  raised={canPlayNow && isPlayable(card)}
                  dimmed={canPlayNow && !isPlayable(card)}
                  onClick={canPlayNow ? () => handleCardTap(card) : undefined}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── drawers, modals & overlays ── */}
      <ScoreDrawer open={drawer === 'score'} onClose={() => setDrawer(null)} players={players} game={game} />
      <DurakChat open={drawer === 'chat'} onClose={() => setDrawer(null)} />

      {pendingQueen && (
        <SuitPickerModal
          title={`დამა ${SUIT_GLYPH[pendingQueen.suit]} — რომელი ფერი გინდა?`}
          onPick={(s) => { playCard(pendingQueen, s); setPendingQueen(null) }}
          onCancel={() => setPendingQueen(null)}
        />
      )}
      {game.awaitingSuitFrom === mySeat && (
        <SuitPickerModal title="პირველი კარტი დამაა — აირჩიე ფერი" onPick={chooseSuit} />
      )}

      {/* "Round done" stamp — the table (and the winning card) stay visible
          for a beat before the results modal takes over. */}
      {stampVisible && game.lastResults && (
        <div className="fixed inset-0 z-30 flex items-center justify-center pointer-events-none px-4">
          <div className="durak-stamp px-8 py-5 rounded-2xl text-center"
               style={{
                 background: 'linear-gradient(180deg, rgba(31,61,46,0.95), rgba(20,40,30,0.95))',
                 border: '3px solid rgba(227,176,75,0.8)',
                 boxShadow: '0 14px 44px rgba(20,12,8,0.55), inset 0 1px 0 rgba(255,255,255,0.2)',
               }}>
            <div className="text-3xl mb-1">🏆</div>
            <div className="text-xl font-western uppercase tracking-wider" style={{ color: '#f4e8cf' }}>
              {game.phase === 'match_end'
                ? `${nameOf(game.matchWinner)} მოიგო მატჩი!`
                : `${nameOf(game.lastResults.winnerSeat)} იგებს ხელს!`}
            </div>
            <div className="mt-1 text-[11px] font-typewriter" style={{ color: 'rgba(244,232,207,0.7)' }}>
              ქულები ითვლება…
            </div>
          </div>
        </div>
      )}

      {(game.phase === 'hand_end' || game.phase === 'match_end') && game.lastResults && resultsVisible && (
        <div className="fixed inset-0 z-40 flex items-center justify-center px-4"
             style={{ background: 'rgba(20,12,8,0.6)', backdropFilter: 'blur(4px)' }}>
          <div className="western-panel p-6 w-full max-w-md">
            <h3 className="text-lg font-western uppercase text-center mb-1 inline-flex items-center gap-2 w-full justify-center"
                style={{ color: '#1f3d2e' }}>
              <Trophy size={18} style={{ color: '#b8860b' }} />
              {game.phase === 'match_end'
                ? `${nameOf(game.matchWinner)} მოიგო მატჩი!`
                : `ხელი ${game.lastResults.handNumber}: ${nameOf(game.lastResults.winnerSeat)} იგებს`}
            </h3>
            {game.lastResults.bonus !== 0 && (
              <p className="text-center text-xs font-typewriter mb-2" style={{ color: '#4c7a2f' }}>
                დამათი დაასრულა: {game.lastResults.bonus} ქულა
              </p>
            )}
            <div className="mt-3 mb-4">
              {players.map((p) => {
                const r = game.lastResults.perSeat[p.seat]
                if (!r && !game.eliminated[p.seat]) return null
                const total = r ? r.total : game.scores[p.seat]
                const out = game.eliminated[p.seat]
                return (
                  <div key={p.seat} className="flex items-center justify-between px-3 py-2 rounded-lg mb-1.5"
                       style={{
                         background: p.seat === game.lastResults.winnerSeat ? 'rgba(76,122,47,0.12)' : 'rgba(255,250,235,0.6)',
                         border: '1px solid rgba(122,83,44,0.25)',
                         opacity: out && !(r && r.eliminatedNow) ? 0.55 : 1,
                       }}>
                    <span className="text-sm font-bold font-western" style={{ color: '#3b2314' }}>
                      {p.name}
                      {r && r.eliminatedNow && (
                        <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full font-typewriter"
                              style={{ background: 'rgba(165,55,43,0.15)', color: '#a5372b', border: '1px solid rgba(165,55,43,0.4)' }}>
                          გამოეთიშა
                        </span>
                      )}
                    </span>
                    <span className="text-sm font-mono font-bold" style={{ color: 'rgba(59,35,20,0.8)' }}>
                      {r ? (r.delta >= 0 ? `+${r.delta}` : r.delta) : ''}
                      <span className="ml-2 text-xs" style={{ color: 'rgba(59,35,20,0.55)' }}>Σ {total}</span>
                    </span>
                  </div>
                )
              })}
            </div>
            <div className="flex flex-col gap-2">
              {game.phase === 'hand_end' && !iAmEliminated && (
                <button onClick={nextHand}
                        className="casino-btn-primary w-full py-2.5 text-sm uppercase tracking-wider active:scale-95">
                  შემდეგი ხელი
                </button>
              )}
              {game.phase === 'match_end' && (
                <button onClick={rematch}
                        className="casino-btn-primary w-full py-2.5 text-sm uppercase tracking-wider active:scale-95 inline-flex items-center justify-center gap-2">
                  <RotateCcw size={14} /> ახალი მატჩი
                </button>
              )}
              <button onClick={() => { leaveRoom(); onExit() }}
                      className="w-full py-2 text-xs font-typewriter rounded-lg"
                      style={{ background: 'rgba(122,83,44,0.08)', border: '1px solid rgba(122,83,44,0.3)', color: '#3b2314' }}>
                ოთახის დატოვება
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
