import { useCallback, useEffect, useRef, useState } from 'react'
import { useGame } from '../context/GameContext'
import PhaserGame       from '../game/PhaserGame'
import GameTypeSelector from './GameTypeSelector'
import TrumpSelector    from './TrumpSelector'
import DiscardSelector  from './DiscardSelector'
import ChatOverlay      from './ChatOverlay'
import TopBar           from './Hud/TopBar'
import ScoreBoardPanel  from './Hud/ScoreBoardPanel'
import ActionPanel      from './Hud/ActionPanel'
import ScoreDrawer      from './Hud/ScoreDrawer'
import MenuDrawer       from './Hud/MenuDrawer'
import DisconnectBanner from './Hud/DisconnectBanner'
import RoundResult      from './Hud/RoundResult'
import WaitingChip      from './Hud/WaitingChip'
import VoicePanel       from './Hud/VoicePanel'

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
    trickAnimation, chatBubbles, playCard, playPending, voiceSpeaking,
  } = useGame()

  const [drawer,   setDrawer]   = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)

  const openDrawer  = (id) => setDrawer(prev => prev === id ? null : id)
  const closeDrawer = () => setDrawer(null)

  const gameState = {
    hand, cardCounts, centerCards, currentTrick, ledSuit,
    trickNumber, currentTurn, tricksTaken, mySeat, players,
    leaderSeat, gamePhase, chosenGameType, trumpSuit, round, cumulativeScores,
    trickAnimation, chatBubbles, playPending,
    // `voiceSpeaking` is a Set; the Phaser scene reads it as-is to decide
    // which seats get a green pulsing halo. Re-renders on identity change
    // (we always replace the Set in GameContext, never mutate it).
    voiceSpeaking,
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

  // ── Vibration when it becomes my turn (mobile-only, opt-in by default) ──
  const wasMyTurnRef = useRef(false)
  useEffect(() => {
    const isMyTurn = gamePhase === 'playing' && currentTurn === mySeat && !trickAnimation
    if (isMyTurn && !wasMyTurnRef.current && typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(80)
    }
    wasMyTurnRef.current = isMyTurn
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
    // `fixed inset-0` ties the wrapper to the *visual* viewport (the area
    // actually visible to the user). `relative w-screen h-screen` would
    // pull the layout viewport's width/height, which on iOS Safari can
    // overshoot the visible area by a hair and produce a phantom
    // horizontal scrollbar. `safe-area-pad` then keeps every HUD element
    // (positioned absolute inside) clear of notch / home-indicator /
    // rounded-corner regions.
    <div className="fixed inset-0 overflow-hidden bg-black safe-area-pad">
      <PhaserGame gameState={gameState} onCardPlay={handleCardPlay} />

      <TopBar
        onToggleMenu={() => setMenuOpen(o => !o)}
        onToggleScores={() => openDrawer('scores')}
        onToggleChat={() => setChatOpen(o => !o)}
      />
      <ScoreBoardPanel onOpen={() => openDrawer('scores')} />
      <ActionPanel     onLastTrick={() => openDrawer('last')} />
      <VoicePanel />

      <DisconnectBanner />

      {showWaiting && <WaitingChip name={turnName}   label="to play" />}
      {leaderBusy  && <WaitingChip name={leaderName} label={leaderBusyLabel} />}

      {showTypeSelector  && <GameTypeSelector />}
      {showTrumpSelector && <TrumpSelector />}
      {showDiscard       && <DiscardSelector />}
      {showRoundResult   && <RoundResult />}

      <MenuDrawer  open={menuOpen} onClose={() => setMenuOpen(false)} onPick={openDrawer} />
      <ScoreDrawer panel={drawer}  onClose={closeDrawer} />
      <ChatOverlay open={chatOpen} onClose={() => setChatOpen(false)} />
    </div>
  )
}
