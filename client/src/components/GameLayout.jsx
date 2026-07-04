import { useCallback, useEffect, useRef, useState } from 'react'
import { useGame } from '../context/GameContext'
import { EventBus } from '../game/EventBus'
import PhaserGame       from '../game/PhaserGame'
import GameTypeSelector from './GameTypeSelector'
import TrumpSelector    from './TrumpSelector'
import DiscardSelector  from './DiscardSelector'
import ChatOverlay      from './ChatOverlay'
import TopBar           from './Hud/TopBar'
import ScoreBoardPanel  from './Hud/ScoreBoardPanel'
import ActionPanel      from './Hud/ActionPanel'
import ScoreDrawer      from './Hud/ScoreDrawer'
import SoundBoard       from './Hud/SoundBoard'
import MenuDrawer       from './Hud/MenuDrawer'
import DisconnectBanner from './Hud/DisconnectBanner'
import RoundResult      from './Hud/RoundResult'
import WaitingChip      from './Hud/WaitingChip'
import QuitModal        from './Hud/QuitModal'

/**
 * Orchestrator for the in-game experience: hosts the Phaser canvas and
 * stitches together all the HUD overlays. Each visual block lives in its own
 * file under `Hud/`; this component is intentionally thin glue.
 */
export default function GameLayout() {
  const {
    hand, cardCounts, centerCards, currentTrick, ledSuit,
    trickNumber, currentTurn, tricksTaken, mySeat, players,
    leaderSeat, gamePhase, chosenGameType, trumpSuit, round, cumulativeScores,
    trickAnimation, chatBubbles, typingSeats, playCard, playPending,
  } = useGame()

  const [drawer,      setDrawer]      = useState(null)
  const [menuOpen,    setMenuOpen]    = useState(false)
  const [chatOpen,    setChatOpen]    = useState(false)
  const [confirmQuit, setConfirmQuit] = useState(null) // null | 'round' | 'game'

  const openDrawer  = (id) => setDrawer(prev => prev === id ? null : id)
  const closeDrawer = () => setDrawer(null)

  const handleMenuPick = (id) => {
    if (id === 'quitRound')      setConfirmQuit('round')
    else if (id === 'surrender') setConfirmQuit('game')
    else openDrawer(id)
  }

  // Table-side typing indicator: seats typing in chat get a "…" bubble above
  // their avatar via the same canvas bubble pipeline as real messages — a
  // real message (spread last) always wins over the typing placeholder.
  const bubblesWithTyping = {
    ...Object.fromEntries(Object.keys(typingSeats || {}).map(s => [s, { message: '• • •' }])),
    ...chatBubbles,
  }

  const gameState = {
    hand, cardCounts, centerCards, currentTrick, ledSuit,
    trickNumber, currentTurn, tricksTaken, mySeat, players,
    leaderSeat, gamePhase, chosenGameType, trumpSuit, round, cumulativeScores,
    trickAnimation, chatBubbles: bubblesWithTyping, playPending,
  }

  const handleCardPlay = useCallback((card) => playCard(card), [playCard])

  const showTypeSelector  = gamePhase === 'type_selection'  && mySeat === leaderSeat
  const showTrumpSelector = gamePhase === 'trump_selection' && mySeat === leaderSeat
  const showDiscard       = gamePhase === 'discard'         && mySeat === leaderSeat
  const showRoundResult   = gamePhase === 'round_end'
  const showWaiting       = gamePhase === 'playing' && currentTurn !== mySeat && !trickAnimation

  const turnName   = players.find(p => p.seat === currentTurn)?.name ?? '…'
  const leaderName = players.find(p => p.seat === leaderSeat)?.name  ?? '…'
  const leaderBusy =
    (gamePhase === 'type_selection' || gamePhase === 'trump_selection' || gamePhase === 'discard') &&
    mySeat !== leaderSeat
  const leaderBusyLabel =
    gamePhase === 'type_selection'  ? 'to choose a game type' :
    gamePhase === 'trump_selection' ? 'to choose trump' :
    gamePhase === 'discard'         ? 'to discard 2 cards' : ''

  // ── On-our-turn handling: vibrate + force a canvas resync ──────────────────
  // The vibrate is the original mobile nicety. The force-render is a desync
  // guard for the "I can't see the card they just played, so I can't take my
  // turn" bug: if our React state is already correct but the Phaser canvas
  // skipped a render (e.g. a state-update arrived while the trick-fly
  // animation gate was up), this clears the gate and repaints the freshest
  // snapshot the instant it's our move. Small delay so a legitimate trick-fly
  // animation finishes first. (The deeper case — our React state itself being
  // stale — is handled by the request-state watchdog in GameContext.)
  const wasMyTurnRef = useRef(false)
  useEffect(() => {
    const isMyTurn = gamePhase === 'playing' && currentTurn === mySeat && !trickAnimation
    const justBecameMyTurn = isMyTurn && !wasMyTurnRef.current
    wasMyTurnRef.current = isMyTurn
    if (!justBecameMyTurn) return
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(80)
    const t = setTimeout(() => EventBus.emit('force-render'), 250)
    return () => clearTimeout(t)
  }, [gamePhase, currentTurn, mySeat, trickAnimation])

  // ── Wake-lock: keep the screen awake while a game is in progress ────────
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return
    let lock = null
    let cancelled = false
    const acquire = async () => {
      try { lock = await navigator.wakeLock.request('screen') }
      catch { /* user has battery saver / page hidden — fine */ }
      if (cancelled && lock) lock.release().catch(() => {})
    }
    acquire()
    const onVisibility = () => { if (document.visibilityState === 'visible' && !lock) acquire() }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
      if (lock) lock.release().catch(() => {})
    }
  }, [])

  return (
    // The wrapper must track the *visible* viewport height, not the layout
    // viewport. On mobile (esp. landscape) `inset-0`/`100vh` reports the
    // taller layout viewport — the area behind the browser chrome — so the
    // FIT-scaled Phaser canvas renders its bottom (own avatar + cards) below
    // the fold and it gets clipped. `.h-screen-dvh` (100dvh w/ fallbacks)
    // pins the height to what's actually on screen so the table always fits
    // 100%. `safe-area-pad` then keeps HUD elements clear of notch / home-
    // indicator / rounded-corner regions.
    <div className="fixed top-0 left-0 right-0 h-screen-dvh overflow-hidden bg-black safe-area-pad">
      <PhaserGame gameState={gameState} onCardPlay={handleCardPlay} />

      <TopBar
        onToggleMenu={() => setMenuOpen(o => !o)}
        onToggleScores={() => openDrawer('scores')}
        onToggleChat={() => setChatOpen(o => !o)}
      />
      <ScoreBoardPanel onOpen={() => openDrawer('scores')} />
      <ActionPanel     onLastTrick={() => openDrawer('last')} />

      {/* Sound Board trigger, parked next to the own ("You") avatar. The
          avatar sits bottom-centre, ~10% up from the bottom of the FIT-scaled
          canvas; we align the button's vertical centre to it and nudge it
          right into the gap where the old in-canvas grid used to be. The
          wrapper is pointer-events-none so only the button itself is clickable
          (the modal manages its own full-screen layer). */}
      <div className="absolute z-20 pointer-events-none"
           style={{ left: '50%', bottom: 'calc(10% - 23px)', transform: 'translateX(34px)' }}>
        <SoundBoard />
      </div>

      <DisconnectBanner />

      {showWaiting && <WaitingChip name={turnName}   label="to play" />}
      {leaderBusy  && <WaitingChip name={leaderName} label={leaderBusyLabel} />}

      {showTypeSelector  && <GameTypeSelector />}
      {showTrumpSelector && <TrumpSelector />}
      {showDiscard       && <DiscardSelector />}
      {showRoundResult   && <RoundResult />}

      <QuitModal confirmKind={confirmQuit} onCloseConfirm={() => setConfirmQuit(null)} />

      <MenuDrawer  open={menuOpen} onClose={() => setMenuOpen(false)} onPick={handleMenuPick} />
      <ScoreDrawer panel={drawer}  onClose={closeDrawer} />
      <ChatOverlay open={chatOpen} onClose={() => setChatOpen(false)} />
    </div>
  )
}
