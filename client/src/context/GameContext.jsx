import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { io } from 'socket.io-client'
import { EventBus } from '../game/EventBus'
import { saveGame } from '../lib/leaderboard'
import { API_BASE } from '../lib/api'
import { voicePlayer } from '../lib/voicePlayer'

const GameContext = createContext(null)
// Chat traffic (messages, table bubbles, typing pings) changes at keystroke
// frequency. It lives in its own context so that churn re-renders only the
// 2-3 chat consumers instead of every useGame() component + the canvas.
const ChatContext = createContext(null)

// ── Hand sorting ──────────────────────────────────────────────────────────────
const RANK_ORDER = ['A', 'K', 'Q', 'J', '10', '9', '8', '7']
const SUIT_ORDER = ['S', 'H', 'D', 'C']

function sortHand(hand) {
  return [...hand].sort((a, b) => {
    const sd = SUIT_ORDER.indexOf(a.suit) - SUIT_ORDER.indexOf(b.suit)
    if (sd !== 0) return sd
    return RANK_ORDER.indexOf(a.rank) - RANK_ORDER.indexOf(b.rank)
  })
}

const TRICK_DISPLAY_MS = 1300   // how long a completed trick stays on the table
const TRICK_ANIMATION_MS = 600  // how long the "fly to winner" animation runs

export function GameProvider({ children }) {
  const socketRef = useRef(null)

  const [connected, setConnected] = useState(false)

  const [roomCode, setRoomCode]   = useState('')
  const [players, setPlayers]     = useState([])
  const [mySeat, setMySeat]       = useState(null)
  const [myName, setMyName]       = useState('')
  const [isCreator, setIsCreator] = useState(false)

  const [appPhase, setAppPhase] = useState('lobby')

  const [gamePhase, setGamePhase]           = useState(null)
  const [round, setRound]                   = useState(1)
  const [leaderSeat, setLeaderSeat]         = useState(0)
  const [chosenGameType, setChosenGameType] = useState(null)
  const [trumpSuit, setTrumpSuit]           = useState(null)
  const [usedTypes, setUsedTypes]           = useState({ 0: [], 1: [], 2: [] })

  const [hand, setHand]                     = useState([])
  const [cardCounts, setCardCounts]         = useState({ 0: 0, 1: 0, 2: 0 })
  const [centerCards, setCenterCards]       = useState([])
  const [lastCenterCards, setLastCenterCards] = useState([])

  const [currentTrick, setCurrentTrick]       = useState([])
  const [ledSuit, setLedSuit]                 = useState(null)
  const [trickNumber, setTrickNumber]         = useState(1)
  const [currentTurn, setCurrentTurn]         = useState(null)
  const [tricksTaken, setTricksTaken]         = useState({ 0: 0, 1: 0, 2: 0 })
  const [lastTrickResult, setLastTrickResult] = useState(null)
  const [trickAnimation, setTrickAnimation]   = useState(null) // { winnerSeat, trick } during animation

  const [roundScores, setRoundScores]           = useState([])
  const [roundDetails, setRoundDetails]         = useState([])
  const [cumulativeScores, setCumulativeScores] = useState({ 0: 0, 1: 0, 2: 0 })
  const [finalResults, setFinalResults]         = useState(null)

  const [toasts, setToasts]                     = useState([])
  const [disconnectedPlayer, setDisconnectedPlayer] = useState(null)
  // True from the moment our own socket goes offline until it reconnects
  // AND the server confirms re-attachment (room-joined { reconnected: true }).
  // Drives the self-disconnect banner.
  const [reconnecting, setReconnecting] = useState(false)
  const [selectedDiscards, setSelectedDiscards] = useState([])

  // Chat
  const [chatMessages, setChatMessages] = useState([])  // [{seat,name,avatar,message,at}]
  const [chatBubbles, setChatBubbles]   = useState({})  // seat -> {message, at}
  const bubbleTimers = useRef({})
  // Typing indicator — seats (other than ours) currently typing in chat.
  // Each entry auto-expires a couple of seconds after the last typing ping.
  const [typingSeats, setTypingSeats] = useState({})    // seat -> true
  const typingTimers    = useRef({})
  const typingSentAtRef = useRef(0)

  // ── Public quick-match room (homepage) ──────────────────────────────────
  // Live snapshot of the shared homepage table, broadcast to every socket.
  // `publicSeat` is OUR seat there (null = not sitting); while seated the
  // user stays on the lobby screen — the game only starts (and appPhase
  // flips) when the server sees the 3rd seat fill.
  // Two homepage quick-match tables — one casual, one championship.
  const EMPTY_TABLE = { roomCode: null, seats: [] }
  const [publicRoom, setPublicRoom] = useState({ public: EMPTY_TABLE, championship: EMPTY_TABLE })
  const [publicSeat, setPublicSeat] = useState(null)
  const publicSeatRef = useRef(null)
  const setPublicSeatBoth = (v) => { publicSeatRef.current = v; setPublicSeat(v) }
  // Which quick-match table the seat belongs to ('public' | 'championship').
  const [publicSeatMode, setPublicSeatMode] = useState(null)
  // Mode of the room we're currently in ('public' | 'championship') — shown
  // in the waiting room and on the game-over screen.
  const [roomMode, setRoomMode] = useState('public')

  // ── Quit-round / surrender vote ─────────────────────────────────────────
  // Set while a proposal is waiting on votes:
  //   { kind: 'round'|'game', proposerSeat, proposerName, acceptedSeats }
  // Cleared when it passes (round-complete / game-over lands), is declined,
  // or expires server-side.
  const [quitProposal, setQuitProposal] = useState(null)

  // ── Spin King slice ─────────────────────────────────────────────────────
  // Additive state for the chip-betting variant. King rooms never populate
  // any of it (gameKind stays 'king'), so every King screen renders exactly
  // as before. Everything here is fed from `game-state` broadcasts — the
  // server re-syncs the full per-seat view after each betting action.
  const [gameKind, setGameKind]           = useState('king')
  const [startingStack, setStartingStack] = useState(null)
  const [chips, setChips]                 = useState(null)   // {0,1,2} → stack
  const [pot, setPot]                     = useState(0)
  const [ante, setAnte]                   = useState(0)
  const [zombies, setZombies]             = useState(null)   // {0,1,2} → bool
  const [auction, setAuction]             = useState(null)   // {bid, highBidder, passed, minNextBid}
  const [pledge, setPledge]               = useState(null)   // {stake, entries, toAct, cap, minRaise}
  const [settlement, setSettlement]       = useState(null)   // lastSettlement of the round
  const [matchWinner, setMatchWinner]     = useState(null)
  const [prikupCount, setPrikupCount]     = useState(0)
  const [prikupDead, setPrikupDead]       = useState(false)
  // Running per-round stat maps (queens/jacks/hearts/K♥/trick winners) —
  // they drive the live pledge-progress plaques on the Spin King table.
  const [roundStats, setRoundStats]       = useState(null)
  // Previous pot/chips snapshot for diffing — a pot increase paired with a
  // stack decrease means chips physically moved to the table, which the
  // canvas animates as a chip flight.
  const prevPotRef   = useRef(null)
  const prevChipsRef = useRef(null)

  const playersRef = useRef(players)
  const mySeatRef  = useRef(null)
  const trickTimers = useRef([])
  const savedGameRef = useRef(null) // de-dupe key for the leaderboard save
  // Per-session credentials needed to silently rejoin our room after the
  // socket auto-reconnects with a fresh id. Stored as refs (not state) so
  // the `connect` listener — which is registered once inside the mount-only
  // useEffect below — can read the *current* values without re-binding.
  const roomCodeRef = useRef('')
  const myNameRef   = useRef('')
  const myAvatarRef = useRef(null)
  const hadDisconnectRef = useRef(false)
  // Latest serialised game-state snapshot (whatever last got pushed to the
  // Phaser scene via EventBus). The scene replays this via `scene-ready`
  // when it finishes mounting — fixes the "table is blank after refresh
  // until I open a drawer" bug, where the first state-update was emitted
  // before the scene's listener was registered.
  const lastStateForSceneRef = useRef(null)
  // "Play in flight" lock — set the moment the user clicks a card, cleared
  // when the server acks (card-played / trick-complete) or rejects (error).
  // Prevents a rapid second click from optimistically removing a *second*
  // card from the hand before the first round-trip completes.
  const playPendingRef = useRef(false)
  const [playPending, setPlayPending] = useState(false)
  const setPlayPendingBoth = (v) => { playPendingRef.current = v; setPlayPending(v) }

  // ── Rematch coordination ────────────────────────────────────────────────
  // Populated from the server's `rematch-status` broadcast after the game
  // ends. `newRoomCode` is the rematch lobby; `joinedOldSeats` is the set
  // of seats (from the *old* / finished room) that have already clicked
  // Play Again. The game-over screen uses this to render the "wants to
  // play again" badge over each joined seat's avatar.
  const [rematch, setRematch] = useState({ newRoomCode: null, joinedOldSeats: [] })

  useEffect(() => { playersRef.current = players }, [players])

  // ── Desync recovery watchdog ──────────────────────────────────────────────
  // If we sit "waiting on someone else to play" for too long during the
  // playing phase, the likeliest cause is a dropped socket event that left our
  // view stale: we still think it's their turn while the server has already
  // advanced to ours → a deadlock the user can currently only escape by
  // refreshing. Quietly re-pull the authoritative snapshot.
  //
  // Armed ONLY while it's *not* our turn — when it's our turn we already hold
  // everything we need, so the active player never triggers a resync (no
  // flicker for the person actually thinking). The timer is re-armed every
  // time the turn changes; a normal hand-off clears it long before it fires.
  useEffect(() => {
    // Who must act right now: the current player while a trick is in progress
    // (or a Spin King bet is open), or the leader during the per-round
    // decision phases. In Spin King the "leader" of trump/discard is the
    // auction winner — the server's leaderSeat already points at them.
    const ACTIVE_PHASES = ['playing', 'type_selection', 'trump_selection', 'discard', 'auction', 'pledge']
    if (!ACTIVE_PHASES.includes(gamePhase)) return
    const TURN_PHASES = ['playing', 'auction', 'pledge']
    const actorSeat = TURN_PHASES.includes(gamePhase) ? currentTurn : leaderSeat
    if (actorSeat === null || actorSeat === undefined || actorSeat === mySeat) return
    const t = setTimeout(() => {
      socketRef.current?.emit('request-state')
    }, 9000)
    return () => clearTimeout(t)
  }, [gamePhase, currentTurn, leaderSeat, mySeat])

  const addToast = useCallback((message, type = 'info') => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
  }, [])

  const clearTrickTimers = () => {
    trickTimers.current.forEach(t => clearTimeout(t))
    trickTimers.current = []
  }

  const SOUND_IDS = [
    'yeehaw', 'gunshot', 'whistle',
    'giv', 'janmrteloba',
    'sheilage', 'shemetxara', 'tsava',
    'Dedofali', 'Male!', 'Revia', 'Tazik',
    '10-10', 'achexet', 'bedi', 'cxado',
    'ketika',
  ]
  const audioElsRef = useRef(null)
  if (!audioElsRef.current && typeof window !== 'undefined') {
    const map = {}
    for (const id of SOUND_IDS) {
      // `Male!` has a reserved URL character; encodeURIComponent keeps the
      // socket-layer id unchanged while still resolving the correct file
      // path here (and is a no-op for the plain lowercase ids).
      const a = new Audio(`/sounds/${encodeURIComponent(id)}.mp3`)
      // 'none': don't fetch 17 MP3s (~1.2 MB) during page load. The first-
      // gesture unlock pass below plays each element muted, which triggers
      // the actual download — same audible behavior, off the critical path.
      a.preload = 'none'
      a.volume = 0.7
      map[id] = a
    }
    audioElsRef.current = map
  }

  useEffect(() => {
    if (typeof window === 'undefined') return
    let unlocked = false
    const unlock = () => {
      if (unlocked) return
      unlocked = true
      // Prime every element inside this user gesture so later socket-driven
      // .play() calls are allowed by the autoplay policy. The elements STAY
      // muted for the entire priming pass — they are only unmuted inside the
      // real playback path (the `play-sound` handler). Unmuting here used to
      // race: a rejected/interrupted prime could flip `muted` back off while
      // another prime was still playing, occasionally blasting all 17 clips
      // at once on page load. Priming is also strictly once per session —
      // no retry loop to interleave with itself.
      Object.values(audioElsRef.current || {}).forEach(a => {
        try {
          a.muted = true
          const stop = () => { a.pause(); a.currentTime = 0 }
          const p = a.play()
          if (p && typeof p.then === 'function') {
            p.then(stop).catch(() => { /* stays muted & idle — never audible */ })
          } else {
            setTimeout(stop, 0)
          }
        } catch { /* ignore */ }
      })
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown',     unlock)
    }
    window.addEventListener('pointerdown', unlock, { once: false })
    window.addEventListener('keydown',     unlock, { once: false })
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown',     unlock)
    }
  }, [])

  useEffect(() => {
    // Use socket.io's default transport flow: connect via long-polling first
    // (which works on any HTTP server, including cPanel/LiteSpeed), then
    // *optimistically* upgrade to WebSocket in the background. If the host
    // doesn't allow WS upgrades, we silently stay on polling instead of
    // hanging on the WS handshake forever — that's why the page was stuck on
    // "Saddlin' up…". Passing `undefined` for same-origin (API_BASE === '')
    // makes socket.io use window.location, which is the cleanest path.
    //
    // Reconnection is socket.io's default — we just turn the knobs to be
    // a bit more aggressive on the first few attempts because mobile wifi
    // tends to come back within seconds.
    const socket = io(API_BASE || undefined, {
      withCredentials: false,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 600,
      reconnectionDelayMax: 5000,
      randomizationFactor: 0.5,
      timeout: 8000,
    })
    socketRef.current = socket

    // ── Rematch broadcast ───────────────────────────────────────────────
    // Server fans this out to every socket still in the (just-finished)
    // old room whenever a Play Again click lands: the new lobby code +
    // the list of old seats that have signed up so far.
    socket.on('rematch-status', ({ newRoomCode, joinedOldSeats }) => {
      setRematch({
        newRoomCode: newRoomCode || null,
        joinedOldSeats: Array.isArray(joinedOldSeats) ? joinedOldSeats : [],
      })
    })

    socket.on('connect', () => {
      setConnected(true)
      // Always refresh the homepage public-table snapshot on (re)connect.
      socket.emit('public-room-info')
      // After a prior `disconnect`, socket.io has just (re)opened the
      // pipe — but the new socket id has no server-side mapping. Re-emit
      // `join-room` with our saved room/name so the server can run its
      // reconnection branch (returns `room-joined { reconnected: true }`
      // and a fresh `game-state` snapshot). Without this, the table looks
      // frozen on the previous tick and the user has to refresh.
      if (hadDisconnectRef.current && roomCodeRef.current && myNameRef.current) {
        socket.emit('join-room', {
          roomCode:   roomCodeRef.current,
          playerName: myNameRef.current,
          avatar:     myAvatarRef.current ?? null,
        })
        // Stay in the "reconnecting…" state until the server-side
        // reconnect path acknowledges via `room-joined { reconnected: true }`.
      } else {
        // Fresh connect (page load, no prior session). If we were sitting
        // at the public table before a refresh, silently re-take the seat —
        // the server only re-attaches (never fresh-sits), and if the game
        // started while we were away this drops us straight back into it.
        if (!roomCodeRef.current) {
          try {
            const saved = JSON.parse(localStorage.getItem('king.publicSeat') || 'null')
            if (saved?.roomCode && saved?.name) {
              myNameRef.current = saved.name
              setMyName(saved.name)
              socket.emit('rejoin-public', { roomCode: saved.roomCode, playerName: saved.name })
            }
          } catch { /* corrupted storage — ignore */ }
        }
        setReconnecting(false)
      }
    })
    socket.on('disconnect', () => {
      setConnected(false)
      // Only flag the reconnect banner if we were actually mid-game / mid-
      // lobby — a brief blip during the very first connection attempt
      // shouldn't pop the banner.
      if (roomCodeRef.current) {
        hadDisconnectRef.current = true
        setReconnecting(true)
      }
    })

    socket.on('room-created', ({ roomCode: code, seat, mode, gameKind: gk, startingStack: ss }) => {
      setRoomCode(code)
      roomCodeRef.current = code
      setMySeat(seat)
      mySeatRef.current = seat
      setIsCreator(true)
      setRoomMode(mode === 'championship' ? 'championship' : 'public')
      setGameKind(gk === 'spinking' ? 'spinking' : 'king')
      setStartingStack(gk === 'spinking' ? (ss || null) : null)
      setAppPhase('waiting')
    })

    socket.on('room-joined', ({ roomCode: code, seat, reconnected, status, mode, gameKind: gk, startingStack: ss }) => {
      setRoomCode(code)
      roomCodeRef.current = code
      setMySeat(seat)
      mySeatRef.current = seat
      setIsCreator(seat === 0)
      if (mode) setRoomMode(mode === 'championship' ? 'championship' : 'public')
      if (gk) {
        setGameKind(gk === 'spinking' ? 'spinking' : 'king')
        setStartingStack(gk === 'spinking' ? (ss || null) : null)
      }
      if (reconnected) {
        // Server re-bound this socket to the existing seat. Pick the
        // right screen based on the room's lifecycle: lobby reconnects go
        // back to WaitingRoom, finished games go to the results screen
        // (never the table), and live games rehydrate via the follow-up
        // `game-state` snapshot.
        setAppPhase(status === 'waiting' ? 'waiting' : status === 'finished' ? 'gameover' : 'game')
        hadDisconnectRef.current = false
        setReconnecting(false)
      } else {
        setAppPhase('waiting')
      }
    })

    socket.on('player-joined', ({ players: p, gameKind: gk, startingStack: ss }) => {
      setPlayers(p)
      // Keep late joiners' waiting room in sync with the table's kind/stack.
      if (gk === 'spinking' && ss) setStartingStack(ss)
    })
    socket.on('player-left',   ({ players: p }) => setPlayers(p))

    // Spin King: the creator adjusted the chip stack in the waiting room.
    socket.on('starting-stack-updated', ({ startingStack: ss }) => {
      if (ss) setStartingStack(ss)
    })

    // ── Quick-match tables (casual + championship) ─────────────────────
    socket.on('public-room', (view = {}) => {
      const norm = (t) => ({
        roomCode: t?.roomCode || null,
        seats: Array.isArray(t?.seats) ? t.seats : [],
      })
      // Legacy single-table payloads (server mid-deploy) land as the casual table.
      const v = view.public || view.championship
        ? { public: norm(view.public), championship: norm(view.championship) }
        : { public: norm(view), championship: { roomCode: null, seats: [] } }
      setPublicRoom(v)
      if (publicSeatRef.current === null) return
      const myTable = [v.public, v.championship].find(t => t.roomCode && t.roomCode === roomCodeRef.current)
      if (myTable) {
        // Still the same table — but if our seat is gone the server swept
        // us out (disconnect grace expired). Stand down locally.
        if (!myTable.seats.some(s => s.seat === publicSeatRef.current)) {
          setPublicSeatBoth(null)
          setPublicSeatMode(null)
          roomCodeRef.current = ''
          setRoomCode('')
          setMySeat(null); mySeatRef.current = null
          setIsCreator(false)
          try { localStorage.removeItem('king.publicSeat') } catch { /* ignore */ }
        }
      } else {
        // The quick-match lobby moved on — either our table filled and the
        // game is starting (game-started handles the transition; keep the
        // room refs for reconnection) or a fresh table opened. Either way
        // we're no longer "seated on the homepage".
        setPublicSeatBoth(null)
        setPublicSeatMode(null)
      }
    })

    socket.on('public-seated', ({ roomCode: code, seat, mode }) => {
      setRoomCode(code)
      roomCodeRef.current = code
      setMySeat(seat)
      mySeatRef.current = seat
      setIsCreator(seat === 0)
      setPublicSeatBoth(seat)
      const tableMode = mode === 'championship' ? 'championship' : 'public'
      setPublicSeatMode(tableMode)
      setRoomMode(tableMode)
      // Survive a refresh: rejoin-public re-attaches by room code + name.
      try {
        localStorage.setItem('king.publicSeat', JSON.stringify({ roomCode: code, name: myNameRef.current }))
      } catch { /* ignore quota */ }
    })

    socket.on('public-unseated', () => {
      setPublicSeatBoth(null)
      setPublicSeatMode(null)
      setRoomCode('')
      roomCodeRef.current = ''
      setMySeat(null)
      mySeatRef.current = null
      setIsCreator(false)
      try { localStorage.removeItem('king.publicSeat') } catch { /* ignore */ }
    })

    socket.on('public-rejoin-failed', () => {
      setPublicSeatBoth(null)
      setPublicSeatMode(null)
      try { localStorage.removeItem('king.publicSeat') } catch { /* ignore */ }
    })

    socket.on('game-started', ({ round: r, leaderSeat: ls, players: p }) => {
      setRound(r)
      setLeaderSeat(ls)
      setPlayers(p)
      setGamePhase('type_selection')
      setAppPhase('game')
      // Fresh game — wipe the per-seat used-type ledger. Without this a
      // rematch (same browser session, new room) leaves the previous game's
      // fully-used matrix in place and the first leader sees every game
      // type greyed out until a page refresh.
      setUsedTypes({ 0: [], 1: [], 2: [] })
      setRoundScores([])
      setRoundDetails([])
      setCumulativeScores({ 0: 0, 1: 0, 2: 0 })
      setLastTrickResult(null)
      setTrickAnimation(null)
      setLastCenterCards([])
      // Wipe rematch state from any previous game; the new game-over for
      // THIS room is the only thing that should populate it.
      setRematch({ newRoomCode: null, joinedOldSeats: [] })
      setQuitProposal(null)
      // Spin King per-match state — the opening `game-state` broadcast
      // repopulates chips/pot/spin for spinking tables.
      setSettlement(null)
      setMatchWinner(null)
      setAuction(null)
      setPledge(null)
      setRoundStats(null)
      prevPotRef.current = null
      prevChipsRef.current = null
    })

    socket.on('hand-dealt', ({ hand: h, centerCards: cc, leaderSeat: ls, round: r, cardCounts: counts }) => {
      setHand(sortHand(h || []))
      setCenterCards(cc || [])
      setLeaderSeat(ls)
      setRound(r)
      setCardCounts(counts)
      setCurrentTrick([])
      setLedSuit(null)
      setTrickNumber(1)
      setTricksTaken({ 0: 0, 1: 0, 2: 0 })
      setChosenGameType(null)
      setTrumpSuit(null)
      setLastTrickResult(null)
      setLastCenterCards([])
      setTrickAnimation(null)
      setPlayPendingBoth(false)
      setRoundStats(null)
      clearTrickTimers()
    })

    // Round 1: cards revealed to non-leaders after leader picks game type
    // (their own 10 cards + the 2 cards that were in the center).
    socket.on('hand-revealed', ({ hand: h, cardCounts: counts, centerCards: cc }) => {
      setHand(sortHand(h || []))
      if (counts) setCardCounts(counts)
      if (cc && cc.length) setCenterCards(cc)
    })

    socket.on('round-started', ({ round: r, leaderSeat: ls, phase, usedTypes: ut }) => {
      setRound(r)
      setLeaderSeat(ls)
      setGamePhase(phase)
      setUsedTypes(ut)
      setCurrentTrick([])
      setLedSuit(null)
      setTrickNumber(1)
      setLastTrickResult(null)
      setLastCenterCards([])
      setTrumpSuit(null)
      setTrickAnimation(null)
      // Same defensive reset as hand-dealt — clears the play-in-flight lock
      // before the new round so nobody starts the round with their cards
      // still greyed out from a stale optimistic update.
      setPlayPendingBoth(false)
      setQuitProposal(null)
      clearTrickTimers()
    })

    socket.on('game-type-selected', ({ typeCode, leaderSeat: ls, phase, usedTypes: ut }) => {
      setChosenGameType(typeCode)
      setLeaderSeat(ls)
      setGamePhase(phase)
      setUsedTypes(ut)
      const leaderName = playersRef.current.find(p => p.seat === ls)?.name || `მოთამაშე ${ls}`
      addToast(`${leaderName}-მ აირჩია — „${typeCode}“`, 'info')
    })

    socket.on('trump-selected', ({ trumpSuit: ts, phase }) => {
      setTrumpSuit(ts)
      setGamePhase(phase)
      const label = ts ? { H: 'გული', D: 'აგური', S: 'ყვავი', C: 'ჯვარი' }[ts] : 'უკოზირო'
      addToast(`კოზირი: ${label}`, 'info')
    })

    socket.on('hand-updated', ({ hand: h, lastCenterCards: lcc }) => {
      setHand(sortHand(h || []))
      if (lcc) setLastCenterCards(lcc)
    })

    socket.on('cards-discarded', ({ phase, currentTurn: ct, leaderSeat: ls }) => {
      setGamePhase(phase)
      setCurrentTurn(ct)
      setLeaderSeat(ls)
      setCenterCards([])
      setLastCenterCards([])
      // Phase has just changed to 'playing' — release any stale optimistic
      // lock so the leader can immediately play their first card. Without
      // this, a leader whose playPending got stuck earlier in the game
      // would discard 2 cards but then find their hand greyed out.
      setPlayPendingBoth(false)
      setTrickAnimation(null)
    })

    socket.on('card-played', ({ seat, card, currentTrick: ct, currentTurn: turn, ledSuit: ls, cardCounts: cc }) => {
      setCurrentTrick(ct)
      setCurrentTurn(turn)
      setLedSuit(ls)
      if (cc) setCardCounts(cc)
      if (seat === mySeatRef.current) {
        setHand(prev => sortHand(prev.filter(c => !(c.rank === card.rank && c.suit === card.suit))))
        // Server acked our play — release the click-lock.
        setPlayPendingBoth(false)
      }
    })

    socket.on('trick-complete', ({ winnerSeat, trick, trickNumber: tn, nextTurn, tricksTaken: tt, cardCounts: cc, queensTaken, jacksTaken, heartsTaken, kingOfHeartsTakenBy, trickWinners }) => {
      // Show the full 3-card trick on the table for a moment, then animate
      // toward the winner, then clear.
      setCurrentTrick(trick)
      setLedSuit(trick[0]?.card?.suit ?? null)
      setLastTrickResult({ winnerSeat, trick })
      if (cc) setCardCounts(cc)
      // Whoever played the 3rd card was us if it's the local seat; release
      // the click-lock unconditionally — by the time a trick completes, no
      // play of ours can still be in flight.
      setPlayPendingBoth(false)

      // Lock cards immediately: the local player just played the 3rd card and
      // their hand might still look "playable" until currentTurn updates.
      // Setting trickAnimation here freezes hand interaction during the entire
      // reveal + animation window, preventing the "card disappears but says
      // not your turn" race.
      setTrickAnimation({ winnerSeat, trick, status: 'showing' })

      clearTrickTimers()

      // Phase 1: fly the cards to the winner avatar
      trickTimers.current.push(setTimeout(() => {
        setTrickAnimation({ winnerSeat, trick, status: 'animating' })
        EventBus.emit('animate-trick-winner', { winnerSeat, trick })
      }, TRICK_DISPLAY_MS))

      // Phase 2: clear & advance turn after the animation finishes
      trickTimers.current.push(setTimeout(() => {
        setCurrentTrick([])
        setLedSuit(null)
        setTricksTaken(tt)
        setTrickNumber(tn + 1)
        setCurrentTurn(nextTurn)
        setTrickAnimation(null)
        // Advance the pledge-progress stats together with tricksTaken so
        // the table plaques tick over as the trick lands on its winner.
        if (queensTaken) {
          setRoundStats({
            queensTaken, jacksTaken, heartsTaken,
            kingOfHeartsTakenBy: kingOfHeartsTakenBy ?? null,
            trickWinners: trickWinners || [],
          })
        }
      }, TRICK_DISPLAY_MS + TRICK_ANIMATION_MS))
    })

    socket.on('round-complete', ({ winnerSeat, trick, scores, cumulativeScores: cs, round: r, gameType, isGameOver, cardCounts: cc, roundDetail, quitBySeat, settlement: stl, matchWinner: mw }) => {
      // Spin King: the chip settlement rides on the round-complete event so
      // the result modal can show payouts the moment the last trick lands.
      // Chips/pot advance from the settlement itself — the server sends no
      // state broadcast at round end (it would stomp the trick animation).
      if (stl) {
        setSettlement(stl)
        if (stl.chipsAfter) setChips(stl.chipsAfter)
        if (typeof stl.potAfter === 'number') setPot(stl.potAfter)
        if (stl.newZombies?.length) {
          setZombies(prev => {
            const next = { ...(prev || { 0: false, 1: false, 2: false }) }
            stl.newZombies.forEach(s => { next[s] = true })
            return next
          })
        }
        // Keep the chip-flight diff baseline in step with the settlement so
        // next round's antes animate the right deltas.
        if (stl.chipsAfter) prevChipsRef.current = { ...stl.chipsAfter }
        if (typeof stl.potAfter === 'number') prevPotRef.current = stl.potAfter
      }
      if (mw !== undefined) setMatchWinner(mw)
      // Show the last trick of the round briefly, then transition.
      if (trick) {
        setCurrentTrick(trick)
        setLastTrickResult({ winnerSeat, trick })
      }
      setRoundScores(prev => [...prev, { round: r, scores, gameType }])
      if (roundDetail) setRoundDetails(prev => [...prev, roundDetail])
      setCumulativeScores(cs)
      if (cc) setCardCounts(cc)

      setPlayPendingBoth(false)
      setQuitProposal(null)

      clearTrickTimers()

      // Quit-round vote passed: there's no final trick to show or animate —
      // jump straight to the round summary.
      if (!trick) {
        setCurrentTrick([])
        setLedSuit(null)
        setTrickAnimation(null)
        setGamePhase('round_end')
        if (typeof quitBySeat === 'number') {
          const quitterName = playersRef.current.find(p => p.seat === quitBySeat)?.name || `მოთამაშე ${quitBySeat}`
          addToast(`${quitterName}-მ დათმო ხელი.`, 'warning')
        }
        return
      }
      // Spin King payout flight: after the final trick lands, the pot's
      // chips fly to the winners BEFORE the settlement modal dims the
      // table. Rounds with no payout (rollover/all-fold) skip the pause.
      const chipMoves = stl
        ? [0, 1, 2].filter(s => (stl.payouts?.[s] ?? 0) > 0)
            .map(s => ({ seat: s, amount: stl.payouts[s] }))
        : []
      const chipFlightMs = chipMoves.length ? 900 : 0

      trickTimers.current.push(setTimeout(() => {
        setTrickAnimation({ winnerSeat, trick: trick || [] })
        EventBus.emit('animate-trick-winner', { winnerSeat, trick: trick || [] })
      }, TRICK_DISPLAY_MS))
      trickTimers.current.push(setTimeout(() => {
        setCurrentTrick([])
        setLedSuit(null)
        setTrickAnimation(null)
        if (chipMoves.length) EventBus.emit('spin-chips-fly', { moves: chipMoves, direction: 'out' })
      }, TRICK_DISPLAY_MS + TRICK_ANIMATION_MS))
      trickTimers.current.push(setTimeout(() => {
        setGamePhase('round_end')
        if (!isGameOver) addToast(`ხელი ${r} დასრულდა.`, 'success')
      }, TRICK_DISPLAY_MS + TRICK_ANIMATION_MS + chipFlightMs))
    })

    socket.on('game-over', ({ finalScores, winner, winners, isTie, mode, players: p, roundDetails: rd, surrenderedBySeat, gameKind: gk, chips: finalChips, matchWinner: mw, startingStack: ss, settlements }) => {
      // ── Spin King: the match is decided by chips ──────────────────────
      // No leaderboard POST — spinking matches are casual chip games and
      // must never create finished_games rows or touch the seasons.
      if (gk === 'spinking') {
        const w = winner || null
        setFinalResults({
          gameKind: 'spinking',
          finalScores, players: p, roundDetails: rd,
          winner: w, winners: w ? [w] : [], isTie: false, mode,
          chips: finalChips || {}, matchWinner: mw ?? null,
          startingStack: ss || null, settlements: settlements || [],
        })
        if (rd) setRoundDetails(rd)
        setMatchWinner(mw ?? null)
        if (finalChips) setChips(finalChips)
        setQuitProposal(null)
        try { localStorage.removeItem('king.publicSeat') } catch { /* ignore */ }
        // Extra beat so the final payout chip-flight (and the settlement
        // modal's match banner) get seen before the results screen.
        setTimeout(() => setAppPhase('gameover'), TRICK_DISPLAY_MS + TRICK_ANIMATION_MS + 1400)
        addToast(w ? `${w.name} იღებს მთელ ბანკს! 🪙` : 'მატჩი დასრულდა.', 'success')
        return
      }

      // Older server payloads carry only `winner` — normalise so the
      // game-over screen can always render from `winners`.
      const winnersList = Array.isArray(winners) && winners.length ? winners : (winner ? [winner] : [])
      const tie = !!isTie && winnersList.length > 1
      setFinalResults({ finalScores, winner, winners: winnersList, isTie: tie, mode, players: p, roundDetails: rd })
      if (rd) setRoundDetails(rd)
      setGamePhase('game_over')
      setQuitProposal(null)
      // The public-seat bookmark (if any) has served its purpose — the game
      // it pointed at is finished, so a later refresh shouldn't chase it.
      try { localStorage.removeItem('king.publicSeat') } catch { /* ignore */ }
      setTimeout(() => setAppPhase('gameover'), TRICK_DISPLAY_MS + TRICK_ANIMATION_MS + 200)
      const winnerLabel = winnersList.map(w => w.name).join(' და ')
      if (typeof surrenderedBySeat === 'number') {
        const surrenderName = (p || []).find(pl => pl.seat === surrenderedBySeat)?.name || `მოთამაშე ${surrenderedBySeat}`
        addToast(`${surrenderName} დანებდა — ${winnerLabel} იმარჯვებს!`, 'success')
      } else if (tie) {
        addToast(`ფრეა! გამარჯვებულები: ${winnerLabel} 🤝`, 'success')
      } else {
        addToast(`${winnerLabel} იმარჯვებს!`, 'success')
      }

      // Persist this finished game to the leaderboard. Two layers of dedupe:
      //
      //   1. `savedGameRef` blocks a re-fired event inside *this* browser
      //      (HMR, React-strict-mode double-mount, socket reconnect → the
      //      server can re-send `game-over` on a fresh `game-state` flush).
      //
      //   2. The `id` field below is computed deterministically from data
      //      every player in the room sees identically (room code + winner
      //      seat + final cumulative scores). All 3 browsers therefore POST
      //      the same id, and the server's `INSERT IGNORE` on
      //      `finished_games.id` silently drops the cross-browser duplicates.
      //      Without this, a 3-player game produced up to 3 rows because
      //      each browser independently calls POST /api/games.
      const dedupeKey = [
        winner?.name,
        ...(p || []).map(pl => `${pl.name}:${finalScores?.[pl.seat] ?? 0}`),
      ].join('|')
      if (savedGameRef.current === dedupeKey) return
      savedGameRef.current = dedupeKey
      try {
        const playerRecords = (p || []).map(pl => ({
          seat: pl.seat, name: pl.name, avatar: pl.avatar || null,
          score: finalScores?.[pl.seat] ?? 0,
        }))
        const scorePart = [0, 1, 2]
          .map(s => finalScores?.[s] ?? 0)
          .join('.')
          .replace(/-/g, 'n') // keep the id matching VARCHAR(64) + safe charset
        const sharedId = `g_${roomCodeRef.current || 'noroom'}_${winner?.seat ?? 0}_${scorePart}`
        saveGame({
          id: sharedId,
          players: playerRecords,
          winner: { seat: winner?.seat, name: winner?.name, score: winner?.score },
          winners: winnersList,
          // Old servers don't send `mode` — leave the flag undefined there so
          // the store applies its legacy default (championship) instead of
          // mislabelling the game as public.
          isChampionship: mode ? mode === 'championship' : undefined,
          roundDetails: rd || [],
        })
      } catch { /* ignore network/quota errors */ }
    })

    // ── Sounds: a player triggered a saloon reaction ───────────────────
    socket.on('play-sound', ({ soundId, bySeat, targetSeat }) => {
      // Reuse the same HTMLAudioElement that was unlocked on the first user
      // gesture — a freshly-constructed Audio() would be blocked by the
      // browser's autoplay policy because *this* call is happening inside a
      // socket event, not inside a click handler.
      const a = audioElsRef.current?.[soundId]
      if (a) {
        try {
          a.pause()
          a.currentTime = 0
          // Elements are kept muted after the unlock priming pass — unmute
          // only here, in the real playback path.
          a.muted = false
          a.volume = 0.7
          a.play().catch(() => { /* still blocked — needs a fresh gesture */ })
        } catch { /* ignore */ }
      }
      // Also flash a chat-bubble-style indicator above the targeted player.
      // Built-in clips get an evocative label; user-added clips fall back to
      // an upper-cased version of the id (e.g. "BABI", "JANMRTELOBA"), which
      // is good enough until you want to customise each one.
      const target = typeof targetSeat === 'number' ? targetSeat : bySeat
      const LABELS = {
        yeehaw:  'YEE-HAW!',
        gunshot: '*BANG*',
        whistle: '~ whistle ~',
      }
      const label = LABELS[soundId] || soundId.toUpperCase()
      setChatBubbles(prev => ({ ...prev, [target]: { message: label, name: '', avatar: null } }))
      if (bubbleTimers.current[target]) clearTimeout(bubbleTimers.current[target])
      bubbleTimers.current[target] = setTimeout(() => {
        setChatBubbles(prev => {
          const next = { ...prev }; delete next[target]; return next
        })
      }, 2500)
    })

    // ── Quit-round / surrender votes ────────────────────────────────────
    socket.on('quit-proposal', ({ kind, proposerSeat, proposerName, acceptedSeats }) => {
      setQuitProposal({
        kind,
        proposerSeat,
        proposerName,
        acceptedSeats: Array.isArray(acceptedSeats) ? acceptedSeats : [proposerSeat],
      })
    })

    socket.on('quit-rejected', ({ kind, voterSeat, reason }) => {
      setQuitProposal(null)
      const what = kind === 'game' ? 'დანებებაზე' : 'ხელის დათმობაზე'
      if (reason === 'declined') {
        const voterName = playersRef.current.find(p => p.seat === voterSeat)?.name || 'ვიღაცამ'
        addToast(`${voterName}-მ უარი თქვა ${what} — თამაში გრძელდება.`, 'warning')
      } else {
        addToast(`${what} ხმის მიცემის დრო ამოიწურა — თამაში გრძელდება.`, 'warning')
      }
    })

    // ── Typing indicator ────────────────────────────────────────────────
    socket.on('chat-typing', ({ seat }) => {
      if (seat === mySeatRef.current) return
      setTypingSeats(prev => (prev[seat] ? prev : { ...prev, [seat]: true }))
      if (typingTimers.current[seat]) clearTimeout(typingTimers.current[seat])
      typingTimers.current[seat] = setTimeout(() => {
        delete typingTimers.current[seat]
        setTypingSeats(prev => {
          const next = { ...prev }; delete next[seat]; return next
        })
      }, 2500)
    })

    // ── Voice messages (ephemeral) ──────────────────────────────────────
    // The server relays the raw audio bytes; we wrap them in an object URL
    // and drop them into the same chat list as text messages. Nothing is
    // persisted — a refresh loses the clips, by design.
    socket.on('voice-message', (msg) => {
      try {
        if (!msg || !msg.audio) return
        const blob = new Blob([msg.audio], { type: msg.mime || 'audio/webm' })
        const url = URL.createObjectURL(blob)
        const entry = {
          type: 'voice',
          url,
          duration: msg.duration || 0,
          seat: msg.seat,
          name: msg.name,
          avatar: msg.avatar || null,
          at: msg.at || Date.now(),
        }
        setChatMessages(prev => {
          const next = [...prev, entry]
          // Release object URLs of clips that scroll out of the 50-message
          // window, otherwise every voice message leaks its blob.
          const dropped = next.length > 50 ? next.slice(0, next.length - 50) : []
          dropped.forEach(m => {
            // Never yank the blob out from under a clip that's mid-play.
            if (m.type === 'voice' && m.url && voicePlayer.playingUrl() !== m.url) {
              URL.revokeObjectURL(m.url)
            }
          })
          return next.slice(-50)
        })
        // Flash a mic bubble above the sender's avatar on the table.
        setChatBubbles(prev => ({ ...prev, [msg.seat]: { message: '🎤 ხმოვანი' } }))
        if (bubbleTimers.current[msg.seat]) clearTimeout(bubbleTimers.current[msg.seat])
        bubbleTimers.current[msg.seat] = setTimeout(() => {
          setChatBubbles(prev => {
            const next = { ...prev }
            delete next[msg.seat]
            return next
          })
        }, 4000)
      } catch { /* malformed clip — ignore */ }
    })

    // ── Chat ────────────────────────────────────────────────────────────
    socket.on('chat-message', (msg) => {
      setChatMessages(prev => [...prev.slice(-49), msg])
      // Their message landed — retire the typing indicator immediately.
      if (typingTimers.current[msg.seat]) {
        clearTimeout(typingTimers.current[msg.seat])
        delete typingTimers.current[msg.seat]
      }
      setTypingSeats(prev => {
        if (!prev[msg.seat]) return prev
        const next = { ...prev }; delete next[msg.seat]; return next
      })
      // Show bubble above the sender's avatar for ~5 seconds
      setChatBubbles(prev => ({ ...prev, [msg.seat]: msg }))
      if (bubbleTimers.current[msg.seat]) clearTimeout(bubbleTimers.current[msg.seat])
      bubbleTimers.current[msg.seat] = setTimeout(() => {
        setChatBubbles(prev => {
          const next = { ...prev }
          delete next[msg.seat]
          return next
        })
      }, 5000)
    })

    // Brief network blips happen all the time on mobile; suppress the
    // disconnect banner for a few seconds so a fast auto-rejoin (which
    // socket.io-client does for free) goes unnoticed.
    let disconnectGraceTimer = null
    socket.on('player-disconnected', ({ playerName }) => {
      if (disconnectGraceTimer) clearTimeout(disconnectGraceTimer)
      disconnectGraceTimer = setTimeout(() => {
        setDisconnectedPlayer(playerName)
        addToast(`${playerName} გაითიშა…`, 'warning')
      }, 5000)
    })

    socket.on('player-reconnected', ({ players: p }) => {
      // No toast here — if the rejoin happens inside the grace window the
      // user never saw a drop in the first place, and a stray "reconnected"
      // banner would just confuse them.
      if (disconnectGraceTimer) { clearTimeout(disconnectGraceTimer); disconnectGraceTimer = null }
      setDisconnectedPlayer(null)
      if (p) setPlayers(p)
    })

    socket.on('game-state', (state) => {
      // A snapshot of a FINISHED game must never drag the user back onto
      // the table. Late snapshots arrive after game over (visibility-resume
      // resync, a socket blip reconnect, the error-path resync) — route
      // them to the game-over screen instead, rebuilding finalResults from
      // the snapshot if this client never saw the live `game-over` event
      // (e.g. a refresh on the results screen).
      if (state.phase === 'game_over') {
        setFinalResults(prev => {
          if (prev) return prev
          const fs = state.cumulativeScores || {}
          const best = Math.max(...[0, 1, 2].map(s => fs[s] ?? -Infinity))
          const winnersList = [0, 1, 2]
            .filter(s => (fs[s] ?? -Infinity) === best)
            .map(s => ({
              seat: s,
              name: (state.players || []).find(pl => pl.seat === s)?.name || `მოთამაშე ${s}`,
              score: fs[s] ?? 0,
            }))
          return {
            finalScores: fs,
            winner: winnersList[0],
            winners: winnersList,
            isTie: winnersList.length > 1,
            players: state.players || [],
            roundDetails: state.roundDetails || [],
          }
        })
        setAppPhase('gameover')
      } else if (state.phase === 'match_end') {
        // Spin King terminal snapshot (refresh/reconnect on a decided match)
        // — rebuild the chips-flavored results if the live `game-over`
        // event never reached this client.
        setFinalResults(prev => {
          if (prev) return prev
          const mw = state.matchWinner ?? null
          const w = mw === null ? null : {
            seat: mw,
            name: (state.players || []).find(pl => pl.seat === mw)?.name || `მოთამაშე ${mw}`,
            score: state.chips?.[mw] ?? 0,
          }
          return {
            gameKind: 'spinking',
            finalScores: state.cumulativeScores || {},
            players: state.players || [],
            roundDetails: state.roundDetails || [],
            winner: w, winners: w ? [w] : [], isTie: false,
            chips: state.chips || {}, matchWinner: mw,
            startingStack: state.startingStack || null,
            settlements: state.settlements || [],
          }
        })
        setAppPhase('gameover')
      } else {
        setAppPhase('game')
      }
      // ── Spin King slice ─────────────────────────────────────────────────
      // Unconditional sets (not truthy-guarded) — nulls are meaningful here:
      // auction/pledge being over, a settlement being cleared by a new round.
      if (state.gameKind === 'spinking') {
        setGameKind('spinking')
        if (state.startingStack) setStartingStack(state.startingStack)
        if (state.chips)         setChips(state.chips)
        setPot(state.pot ?? 0)
        setAnte(state.ante ?? 0)
        if (state.zombies)       setZombies(state.zombies)
        setAuction(state.auction ?? null)
        setPledge(state.pledge ?? null)
        setSettlement(state.lastSettlement ?? null)
        setMatchWinner(state.matchWinner ?? null)
        setPrikupCount(state.prikupCount ?? 0)
        setPrikupDead(!!state.prikupDead)
        setRoundStats({
          queensTaken: state.queensTaken || {},
          jacksTaken: state.jacksTaken || {},
          heartsTaken: state.heartsTaken || {},
          kingOfHeartsTakenBy: state.kingOfHeartsTakenBy ?? null,
          trickWinners: state.trickWinners || [],
        })
        // Chip-flight detection: pot grew + stacks shrank → animate the
        // difference flying from each payer's avatar into the pot (antes,
        // auction price, pledge stakes — one generic diff covers them all).
        if (typeof state.pot === 'number' && state.chips) {
          const prevPot = prevPotRef.current
          const prevChips = prevChipsRef.current
          if (prevPot !== null && prevChips && state.pot > prevPot) {
            const moves = []
            for (const s of [0, 1, 2]) {
              const before = prevChips[s] ?? 0
              const after = state.chips[s] ?? 0
              if (after < before) moves.push({ seat: s, amount: before - after })
            }
            if (moves.length) EventBus.emit('spin-chips-fly', { moves, direction: 'in' })
          }
          prevPotRef.current = state.pot
          prevChipsRef.current = { ...state.chips }
        }
      }
      if (state.players)                       setPlayers(state.players)
      if (state.hand)                          setHand(sortHand(state.hand))
      if (state.phase)                         setGamePhase(state.phase)
      if (state.round)                         setRound(state.round)
      if (state.leaderSeat !== undefined)      setLeaderSeat(state.leaderSeat)
      if (state.chosenGameType)                setChosenGameType(state.chosenGameType)
      if (state.trumpSuit !== undefined)       setTrumpSuit(state.trumpSuit)
      if (state.usedTypes)                     setUsedTypes(state.usedTypes)
      if (state.cardCounts)                    setCardCounts(state.cardCounts)
      if (state.centerCards)                   setCenterCards(state.centerCards)
      if (state.lastCenterCards)               setLastCenterCards(state.lastCenterCards)
      if (state.currentTrick)                  setCurrentTrick(state.currentTrick)
      if (state.ledSuit !== undefined)         setLedSuit(state.ledSuit)
      if (state.trickNumber)                   setTrickNumber(state.trickNumber)
      if (state.currentTurn !== undefined)     setCurrentTurn(state.currentTurn)
      if (state.tricksTaken)                   setTricksTaken(state.tricksTaken)
      if (state.cumulativeScores)              setCumulativeScores(state.cumulativeScores)
      if (state.lastTrick)                     setLastTrickResult(state.lastTrick)
      if (state.roundScores) {
        setRoundScores(
          state.roundScores.map(rs => ({ round: rs.round, scores: rs.scores, gameType: rs.gameType }))
        )
      }
      if (state.roundDetails)                  setRoundDetails(state.roundDetails)
      // Authoritative state sync — drop any optimistic locks/animations the
      // client might have been holding on to. Important on reconnect: the
      // server's snapshot is the truth, the local play-in-flight flag was
      // an optimism we don't need anymore.
      setPlayPendingBoth(false)
      setTrickAnimation(null)
      clearTrickTimers()
      // Force the canvas to repaint the rehydrated state. The setX calls above
      // queue a React re-render → PhaserGame re-emits state-update; we fire
      // force-render *after* that has committed (double rAF = past commit +
      // paint) so the scene drops any stuck animation gate and draws the fresh
      // snapshot. Fixes the "blank table / stale trick until I interact" bug
      // on rejoin and after a desync resync.
      if (typeof requestAnimationFrame !== 'undefined') {
        requestAnimationFrame(() => requestAnimationFrame(() => EventBus.emit('force-render')))
      } else {
        setTimeout(() => EventBus.emit('force-render'), 80)
      }
    })

    socket.on('error', ({ message, code }) => {
      // If a play was in flight and got rejected, the client may have
      // optimistically removed a card — re-sync hand state from the server
      // so the player sees the correct deck again. Always release the lock.
      if (playPendingRef.current) {
        setPlayPendingBoth(false)
        socketRef.current?.emit('request-state')
      }
      if (code === 'CHAMPIONSHIP_LIMIT') {
        addToast('დღის ლიმიტი ამოიწურა — 2 ლიგის თამაში დღეში. ითამაშე უბრალო ოთახში 🎲', 'error')
        return
      }
      addToast(message, 'error')
    })

    // ── Visibility-resume safety net ────────────────────────────────────────
    // Mobile browsers throttle background tabs aggressively: setTimeout can
    // be coalesced to ≥1 Hz, Phaser's scene clock can stall, and socket.io
    // can lose its heartbeat without firing a visible disconnect. The net
    // effect on production was "I came back to the tab and a card the other
    // player put down ages ago is still missing from my screen". Whenever
    // the tab returns to `visible`, ask the server for the authoritative
    // snapshot. Cheap and idempotent — the `game-state` handler is built
    // for replay.
    let lastResyncAt = 0
    const onResumeVisibility = () => {
      if (typeof document === 'undefined') return
      if (document.visibilityState !== 'visible') return
      if (!roomCodeRef.current) return            // not in a room — nothing to sync
      const now = Date.now()
      // Throttle: visibilitychange can fire in rapid bursts (focus + page
      // visibility events on iOS sometimes double-fire). One resync per
      // second is plenty.
      if (now - lastResyncAt < 1000) return
      lastResyncAt = now
      socketRef.current?.emit('request-state')
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onResumeVisibility)
    }

    return () => {
      clearTrickTimers()
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onResumeVisibility)
      }
      socket.disconnect()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── rematch action ────────────────────────────────────────────────────
  // Triggered from the Play Again button on the game-over screen. Sends
  // the current name/avatar through so the server can use them as the
  // canonical identity for the new room (the old room's roster also has
  // them, but passing them here saves an extra lookup on slow links).
  const requestRematch = useCallback(() => {
    socketRef.current?.emit('request-rematch', {
      playerName: myNameRef.current,
      avatar:     myAvatarRef.current ?? null,
    })
  }, [])

  const createRoom = useCallback((name, avatar = null, mode = 'public', extra = {}) => {
    setMyName(name)
    myNameRef.current   = name
    myAvatarRef.current = avatar
    // `extra` carries variant options — { gameKind: 'spinking', startingStack }
    // for a Spin King table; empty for a classic King room.
    socketRef.current?.emit('create-room', { playerName: name, avatar, mode, ...extra })
  }, [])

  const joinRoom = useCallback((code, name, avatar = null) => {
    setMyName(name)
    myNameRef.current   = name
    myAvatarRef.current = avatar
    // Pre-stash the room code too — the very first join is the only place
    // we know it before the server's `room-joined` round-trip lands, and
    // `roomCodeRef` drives the auto-rejoin path on a subsequent disconnect.
    roomCodeRef.current = code
    socketRef.current?.emit('join-room', { roomCode: code, playerName: name, avatar })
  }, [])

  const startGame      = useCallback(() => { socketRef.current?.emit('start-game') }, [])
  const sendChat       = useCallback((message) => {
    if (!message || !message.trim()) return
    socketRef.current?.emit('chat-message', { message: message.trim() })
  }, [])
  // Ship a recorded clip to the room. 400 KB matches the server's hard cap.
  const sendVoice      = useCallback(async (blob, duration = 0) => {
    if (!blob || !blob.size) return
    if (blob.size > 400 * 1024) {
      addToast('ჩანაწერი ძალიან დიდი გამოვიდა.', 'error')
      return
    }
    try {
      const buf = await blob.arrayBuffer()
      socketRef.current?.emit('voice-message', {
        audio: buf,
        mime: blob.type || 'audio/webm',
        duration,
      })
    } catch { /* ignore */ }
  }, [addToast])
  const playSound      = useCallback((soundId, targetSeat = null) => {
    socketRef.current?.emit('play-sound', { soundId, targetSeat })
  }, [])
  // Throttled "I'm typing" ping — at most one every 1.2s while keys are
  // being pressed; receivers expire the indicator on their own 2.5s timer.
  const sendTyping     = useCallback(() => {
    const now = Date.now()
    if (now - typingSentAtRef.current < 1200) return
    typingSentAtRef.current = now
    socketRef.current?.emit('chat-typing')
  }, [])
  const proposeQuit    = useCallback((kind) => { socketRef.current?.emit('propose-quit', { kind }) }, [])
  const voteQuit       = useCallback((accept) => { socketRef.current?.emit('vote-quit', { accept }) }, [])

  // ── public quick-match actions ──────────────────────────────────────────
  const sitPublic = useCallback((name, avatar = null, emoji = null, mode = 'public') => {
    setMyName(name)
    myNameRef.current   = name
    myAvatarRef.current = avatar
    socketRef.current?.emit('sit-public', { playerName: name, avatar, emoji, mode })
  }, [])
  const standPublic    = useCallback(() => { socketRef.current?.emit('stand-public') }, [])
  const setPublicEmoji = useCallback((emoji) => { socketRef.current?.emit('set-public-emoji', { emoji }) }, [])
  const selectGameType = useCallback((typeCode) => { socketRef.current?.emit('select-game-type', { typeCode }) }, [])
  const selectTrump    = useCallback((suit) => { socketRef.current?.emit('select-trump', { suit }) }, [])
  const discardCards   = useCallback((cards) => {
    socketRef.current?.emit('discard-cards', { cards })
    setSelectedDiscards([])
  }, [])

  const playCard = useCallback((card) => {
    if (playPendingRef.current) return
    setPlayPendingBoth(true)
    setHand(prev => sortHand(prev.filter(c => !(c.rank === card.rank && c.suit === card.suit))))
    socketRef.current?.emit('play-card', { card })
  }, [])

  const nextRound = useCallback(() => { socketRef.current?.emit('next-round') }, [])

  // ── Spin King actions ───────────────────────────────────────────────────
  const ackSpin  = useCallback(() => { socketRef.current?.emit('spin-ack') }, [])
  const placeBid = useCallback((amount) => { socketRef.current?.emit('place-bid', { amount }) }, [])
  const passBid  = useCallback(() => { socketRef.current?.emit('pass-bid') }, [])
  // payload: { action: 'fold'|'call'|'raise', tier?, stake? }
  const pledgeAct = useCallback((payload) => { socketRef.current?.emit('pledge-act', payload) }, [])
  // Creator-only stack edit while the table is still waiting.
  const setTableStack = useCallback((startingStack) => {
    socketRef.current?.emit('set-starting-stack', { startingStack })
  }, [])

  const leaveRoom = useCallback(() => {
    socketRef.current?.emit('leave-room')
    setAppPhase('lobby')
    setRoomCode('')
    roomCodeRef.current = ''
    setPlayers([])
    setMySeat(null)
    mySeatRef.current = null
    setIsCreator(false)
    setPublicSeatBoth(null)
    setPublicSeatMode(null)
    setRoomMode('public')
    // Reset the Spin King slice so the next (possibly King) room starts clean.
    setGameKind('king')
    setStartingStack(null)
    setChips(null)
    setPot(0)
    setAnte(0)
    setZombies(null)
    setAuction(null)
    setPledge(null)
    setSettlement(null)
    setMatchWinner(null)
    setPrikupCount(0)
    setPrikupDead(false)
    setRoundStats(null)
    prevPotRef.current = null
    prevChipsRef.current = null
    try { localStorage.removeItem('king.publicSeat') } catch { /* ignore */ }
  }, [])

  const toggleDiscard = useCallback((card) => {
    setSelectedDiscards(prev => {
      const exists = prev.find(c => c.rank === card.rank && c.suit === card.suit)
      if (exists) return prev.filter(c => !(c.rank === card.rank && c.suit === card.suit))
      if (prev.length >= 2) return prev
      return [...prev, card]
    })
  }, [])

  // Both context values are memoized so a provider re-render only invalidates
  // consumers whose slice actually changed. All the callbacks below are
  // useCallback-stable, so in practice each memo recomputes only when one of
  // its state fields updates.
  const chatValue = useMemo(() => ({
    chatMessages, chatBubbles, typingSeats,
    sendChat, sendVoice, sendTyping, playSound,
  }), [
    chatMessages, chatBubbles, typingSeats,
    sendChat, sendVoice, sendTyping, playSound,
  ])

  const gameValue = useMemo(() => ({
    connected,
    roomCode, players, mySeat, myName, isCreator,
    appPhase,
    gamePhase, round, leaderSeat, chosenGameType, trumpSuit, usedTypes,
    hand, cardCounts, centerCards, lastCenterCards,
    currentTrick, ledSuit, trickNumber, currentTurn, tricksTaken,
    lastTrickResult, trickAnimation, playPending,
    roundScores, roundDetails, cumulativeScores, finalResults,
    toasts, disconnectedPlayer, reconnecting, selectedDiscards,
    quitProposal, proposeQuit, voteQuit,
    publicRoom, publicSeat, publicSeatMode, sitPublic, standPublic, setPublicEmoji,
    roomMode,
    rematch, requestRematch,
    gameKind, startingStack, chips, pot, ante, zombies, auction, pledge,
    settlement, matchWinner, prikupCount, prikupDead, roundStats,
    ackSpin, placeBid, passBid, pledgeAct, setTableStack,
    createRoom, joinRoom, startGame, selectGameType, selectTrump, discardCards,
    playCard, nextRound, leaveRoom, toggleDiscard, addToast,
  }), [
    connected,
    roomCode, players, mySeat, myName, isCreator,
    appPhase,
    gamePhase, round, leaderSeat, chosenGameType, trumpSuit, usedTypes,
    hand, cardCounts, centerCards, lastCenterCards,
    currentTrick, ledSuit, trickNumber, currentTurn, tricksTaken,
    lastTrickResult, trickAnimation, playPending,
    roundScores, roundDetails, cumulativeScores, finalResults,
    toasts, disconnectedPlayer, reconnecting, selectedDiscards,
    quitProposal, proposeQuit, voteQuit,
    publicRoom, publicSeat, publicSeatMode, sitPublic, standPublic, setPublicEmoji,
    roomMode,
    rematch, requestRematch,
    gameKind, startingStack, chips, pot, ante, zombies, auction, pledge,
    settlement, matchWinner, prikupCount, prikupDead, roundStats,
    ackSpin, placeBid, passBid, pledgeAct, setTableStack,
    createRoom, joinRoom, startGame, selectGameType, selectTrump, discardCards,
    playCard, nextRound, leaveRoom, toggleDiscard, addToast,
  ])

  return (
    <GameContext.Provider value={gameValue}>
      <ChatContext.Provider value={chatValue}>
        {children}
      </ChatContext.Provider>
    </GameContext.Provider>
  )
}

export const useGame = () => useContext(GameContext)
export const useChat = () => useContext(ChatContext)
