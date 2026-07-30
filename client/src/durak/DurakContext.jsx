import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { io } from 'socket.io-client'
import { API_BASE } from '../lib/api'
import { voicePlayer } from '../lib/voicePlayer'
import { playDurakSound } from './sounds'

// ჩეხური დურაკა client state. Fully isolated from the King GameContext:
// its own socket connection (forceNew) that lives only while the durak
// section is open, and only `durak:*` events on the wire.

const DurakContext = createContext(null)

const SESSION_KEY = 'king.durak.session'

export function readDurakSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null') }
  catch { return null }
}

function writeDurakSession(session) {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    else localStorage.removeItem(SESSION_KEY)
  } catch { /* ignore */ }
}

const EVENT_TOASTS = {
  'penalty':       (e, name) => `${name} იღებს +${e.count} კარტს`,
  'karta':         (e, name) => `${name}: კარტა!`,
  'karta-penalty': (e, name) => `${name} დაავიწყდა „კარტა" — +1 კარტი`,
  'reshuffle':     () => 'დასტა აირია თავიდან 🔄',
  'skipped':       (e, name) => `${name} ტოვებს სვლას`,
  'suit-locked':   () => 'გულის დამა — ფერი უცვლელი რჩება',
  'eliminated':    (e, name) => `${name} გამოეთიშა თამაშს`,
}

export function DurakProvider({ profile, children }) {
  const socketRef = useRef(null)
  const [connected, setConnected] = useState(false)
  const [phase, setPhase] = useState('lobby') // 'lobby' | 'room' (waiting or game — driven by room.status)
  const [room, setRoom] = useState(null)
  const [game, setGame] = useState(null)
  const [mySeat, setMySeat] = useState(null)
  const [toasts, setToasts] = useState([])
  const [chatMessages, setChatMessages] = useState([]) // [{seat,name,avatar,message|url,at,type?}]
  const [typingSeats, setTypingSeats] = useState({})   // seat -> true (auto-expires)
  const [publicRoom, setPublicRoom] = useState({ roomCode: null, targetScore: null, players: [] })
  const myNameRef = useRef(profile?.name || readDurakSession()?.name || '')
  const prevHandRef = useRef(0)
  // The very first durak:state after (re)joining is a catch-up sync, not a
  // live event — never play sounds for it (no deal sting on rejoin).
  const firstStateRef = useRef(true)
  const typingTimersRef = useRef({})
  const typingSentAtRef = useRef(0)

  const addToast = useCallback((message, type = 'info') => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    setToasts((prev) => [...prev.slice(-3), { id, message, type }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500)
  }, [])

  useEffect(() => {
    // forceNew keeps this connection completely separate from the King
    // game's socket — closing it here can never touch the King session.
    const socket = io(API_BASE || undefined, {
      withCredentials: false,
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 600,
      reconnectionDelayMax: 5000,
      timeout: 8000,
    })
    socketRef.current = socket

    socket.on('connect', () => {
      setConnected(true)
      socket.emit('durak:public-info')
      // Refresh / reconnect: silently re-take our seat by room code + name.
      const session = readDurakSession()
      if (session?.roomCode && session?.name) {
        myNameRef.current = session.name
        socket.emit('durak:join', { roomCode: session.roomCode, playerName: session.name })
      }
    })

    socket.on('durak:public-room', (view) => {
      setPublicRoom({
        roomCode: view?.roomCode || null,
        targetScore: view?.targetScore ?? null,
        creatorSeat: view?.creatorSeat,
        players: Array.isArray(view?.players) ? view.players : [],
      })
    })
    socket.on('disconnect', () => setConnected(false))

    socket.on('durak:joined', ({ roomCode, seat }) => {
      setMySeat(seat)
      setPhase('room')
      writeDurakSession({ roomCode, name: myNameRef.current })
    })

    socket.on('durak:state', ({ room: r, game: g, events }) => {
      setRoom(r)
      setGame(g)
      setPhase('room')
      const isFirstSync = firstStateRef.current
      firstStateRef.current = false
      // Deal sound whenever a fresh hand's cards land on the table — but
      // never for the initial catch-up snapshot after (re)joining.
      if (!g) {
        prevHandRef.current = 0
      } else if (g.handNumber !== prevHandRef.current) {
        if (g.phase === 'playing' && !isFirstSync) playDurakSound('deal')
        prevHandRef.current = g.handNumber
      }
      const nameOf = (seat) => r?.players?.find((p) => p.seat === seat)?.name || `#${seat}`
      for (const e of events || []) {
        if (e.type === 'karta' && !isFirstSync) playDurakSound('karta') // everyone hears the shout
        const fmt = EVENT_TOASTS[e.type]
        if (fmt) addToast(fmt(e, nameOf(e.seat)), e.type === 'eliminated' ? 'warning' : 'info')
      }
    })

    socket.on('durak:chat', (msg) => {
      setChatMessages((prev) => [...prev.slice(-49), { ...msg, type: 'text' }])
      setTypingSeats((prev) => {
        if (!prev[msg.seat]) return prev
        const next = { ...prev }; delete next[msg.seat]; return next
      })
    })

    socket.on('durak:voice', (msg) => {
      try {
        if (!msg || !msg.audio) return
        const blob = new Blob([msg.audio], { type: msg.mime || 'audio/webm' })
        const url = URL.createObjectURL(blob)
        const entry = {
          type: 'voice', url, duration: msg.duration || 0,
          seat: msg.seat, name: msg.name, avatar: msg.avatar || null, at: msg.at || Date.now(),
        }
        setChatMessages((prev) => {
          const next = [...prev, entry]
          const dropped = next.length > 50 ? next.slice(0, next.length - 50) : []
          dropped.forEach((m) => {
            if (m.type === 'voice' && m.url && voicePlayer.playingUrl() !== m.url) {
              URL.revokeObjectURL(m.url)
            }
          })
          return next.slice(-50)
        })
      } catch { /* ignore malformed clip */ }
    })

    socket.on('durak:typing', ({ seat }) => {
      setTypingSeats((prev) => ({ ...prev, [seat]: true }))
      clearTimeout(typingTimersRef.current[seat])
      typingTimersRef.current[seat] = setTimeout(() => {
        setTypingSeats((prev) => {
          const next = { ...prev }; delete next[seat]; return next
        })
      }, 2500)
    })

    socket.on('durak:toast', ({ message }) => addToast(message, 'warning'))

    socket.on('durak:left', () => {
      writeDurakSession(null)
      setRoom(null); setGame(null); setMySeat(null)
      setPhase('lobby')
    })

    socket.on('durak:error', ({ message }) => {
      // A dead session (server restarted / room swept) shouldn't trap the
      // user on a broken screen — fall back to the durak lobby.
      if (message === 'ოთახი ვერ მოიძებნა.' && readDurakSession()) {
        writeDurakSession(null)
        setRoom(null); setGame(null); setMySeat(null)
        setPhase('lobby')
      }
      addToast(message, 'error')
    })

    // Mobile browsers throttle background tabs hard — when the tab comes
    // back, ask for the authoritative snapshot (same safety net as King).
    let lastResyncAt = 0
    const onResumeVisibility = () => {
      if (typeof document === 'undefined' || document.visibilityState !== 'visible') return
      if (!readDurakSession()) return
      const now = Date.now()
      if (now - lastResyncAt < 1000) return
      lastResyncAt = now
      socket.emit('durak:state')
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onResumeVisibility)
    }

    return () => {
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onResumeVisibility)
      }
      socket.removeAllListeners()
      socket.disconnect()
      socketRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const createRoom = useCallback((targetScore) => {
    if (!profile?.name) return
    myNameRef.current = profile.name
    socketRef.current?.emit('durak:create', {
      playerName: profile.name, avatar: profile.avatar || null, targetScore,
    })
  }, [profile])

  const joinRoom = useCallback((roomCode) => {
    if (!profile?.name) return
    myNameRef.current = profile.name
    socketRef.current?.emit('durak:join', {
      roomCode, playerName: profile.name, avatar: profile.avatar || null,
    })
  }, [profile])

  const leaveRoom  = useCallback(() => { socketRef.current?.emit('durak:leave') }, [])
  const startMatch = useCallback(() => { socketRef.current?.emit('durak:start') }, [])
  const playCard   = useCallback((card, requestSuit = null) => {
    socketRef.current?.emit('durak:play', { card, requestSuit })
  }, [])
  const drawCard    = useCallback(() => { socketRef.current?.emit('durak:draw') }, [])
  const takePenalty = useCallback(() => { socketRef.current?.emit('durak:penalty') }, [])
  const pass        = useCallback(() => { socketRef.current?.emit('durak:pass') }, [])
  const sayKarta    = useCallback(() => { socketRef.current?.emit('durak:karta') }, [])
  const chooseSuit  = useCallback((suit) => { socketRef.current?.emit('durak:choose-suit', { suit }) }, [])
  const nextHand    = useCallback(() => { socketRef.current?.emit('durak:next-hand') }, [])
  const rematch     = useCallback(() => { socketRef.current?.emit('durak:rematch') }, [])
  const endMatch    = useCallback(() => { socketRef.current?.emit('durak:end-match') }, [])
  const sendChat    = useCallback((message) => {
    if (!message || !message.trim()) return
    socketRef.current?.emit('durak:chat', { message: message.trim() })
  }, [])
  const sendVoice = useCallback(async (blob, duration = 0) => {
    if (!blob || !blob.size) return
    if (blob.size > 400 * 1024) {
      addToast('ჩანაწერი ძალიან დიდი გამოვიდა.', 'error')
      return
    }
    try {
      const buf = await blob.arrayBuffer()
      socketRef.current?.emit('durak:voice', {
        audio: buf, mime: blob.type || 'audio/webm', duration,
      })
    } catch { /* ignore */ }
  }, [addToast])
  const sendTyping = useCallback(() => {
    const now = Date.now()
    if (now - typingSentAtRef.current < 1200) return
    typingSentAtRef.current = now
    socketRef.current?.emit('durak:typing')
  }, [])
  const sitPublic = useCallback(() => {
    if (!profile?.name) return
    myNameRef.current = profile.name
    socketRef.current?.emit('durak:sit-public', {
      playerName: profile.name, avatar: profile.avatar || null,
    })
  }, [profile])
  const setTargetScore = useCallback((targetScore) => {
    socketRef.current?.emit('durak:set-target', { targetScore })
  }, [])

  const value = useMemo(() => ({
    connected, phase, room, game, mySeat, toasts, profile, chatMessages, typingSeats, publicRoom,
    createRoom, joinRoom, leaveRoom, startMatch,
    playCard, drawCard, takePenalty, pass, sayKarta, chooseSuit, nextHand, rematch,
    endMatch, sendChat, sendVoice, sendTyping, sitPublic, setTargetScore, addToast,
  }), [
    connected, phase, room, game, mySeat, toasts, profile, chatMessages, typingSeats, publicRoom,
    createRoom, joinRoom, leaveRoom, startMatch,
    playCard, drawCard, takePenalty, pass, sayKarta, chooseSuit, nextHand, rematch,
    endMatch, sendChat, sendVoice, sendTyping, sitPublic, setTargetScore, addToast,
  ])

  return <DurakContext.Provider value={value}>{children}</DurakContext.Provider>
}

export const useDurak = () => useContext(DurakContext)
