import { useEffect, useRef, useState } from 'react'
import { Eye, Users } from 'lucide-react'
import { useGame } from '../context/GameContext'
import AvatarImg from './AvatarImg'

const TOTAL_ROUNDS = 27

// Dot colours match the HUD's language: green at a table, blue watching,
// grey idling in the lobby.
const DOT = {
  playing:  '#4c7a2f',
  waiting:  '#b98a2f',
  watching: '#31536b',
  lobby:    'rgba(59,35,20,0.35)',
}

/** The card that opens beside a group on hover. */
function TableCard({ game, seated, hasProfile, onWatch }) {
  // Two different reasons the button can be dead, and they need different
  // words: you're playing at this table, versus you haven't picked a profile
  // yet. Collapsing them told a signed-out visitor it was "your table".
  const canWatch = hasProfile && !seated
  const label = seated ? 'შენი მაგიდაა' : !hasProfile ? 'აირჩიე პროფილი' : 'ყურება'
  const left = Math.max(0, TOTAL_ROUNDS - game.round)
  return (
    // The outer wrapper starts flush against the cluster (`left-full`, no
    // margin) and creates the visual gap with padding instead. With a margin
    // there was 8px of dead space between the two: crossing it put the
    // pointer over the page background, which fired mouseleave and closed the
    // card before it could be reached. Padding keeps the path contiguous.
    <div className="absolute left-full top-0 pl-2 z-30">
    <div className="w-52 rounded-xl p-2.5"
         style={{
           background: 'linear-gradient(180deg, #f8efdd 0%, #ecd9b6 100%)',
           border: '1px solid rgba(122,83,44,0.45)',
           boxShadow: '0 8px 24px rgba(58,36,24,0.28)',
         }}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-western uppercase tracking-wider"
              style={{ color: '#8e2b23' }}>
          {game.tournament
            ? (game.tournament.stage === 'final' ? 'ფინალი' : 'ნახევარფინალი')
            : (game.mode === 'championship' ? 'ლიგა' : 'უბრალო')}
        </span>
        {game.watchers > 0 && (
          <span className="text-[9px] font-mono inline-flex items-center gap-0.5"
                style={{ color: 'rgba(49,83,107,0.9)' }}>
            <Eye size={9} /> {game.watchers}
          </span>
        )}
      </div>

      {/* Rounds played / left — the shape of the game at a glance. */}
      <div className="text-[10px] font-typewriter mb-1" style={{ color: 'rgba(59,35,20,0.65)' }}>
        რაუნდი {game.round}/{TOTAL_ROUNDS} · დარჩა {left}
      </div>
      <div className="h-1 rounded-full mb-2 overflow-hidden" style={{ background: 'rgba(122,83,44,0.18)' }}>
        <div className="h-full rounded-full"
             style={{ width: `${(game.round / TOTAL_ROUNDS) * 100}%`, background: '#8e2b23' }} />
      </div>

      <div className="flex flex-col gap-1 mb-2">
        {[...game.players].sort((a, b) => b.score - a.score).map((p) => (
          <div key={p.seat} className="flex items-center gap-1.5">
            <AvatarImg avatar={p.avatar} size={18} ring="rgba(142,43,35,0.35)" />
            <span className="text-[11px] truncate flex-1 min-w-0"
                  style={{ color: '#3b2314', opacity: p.connected ? 1 : 0.45 }}>
              {p.name}
            </span>
            <span className="text-[11px] font-mono font-bold tabular-nums"
                  style={{ color: p.score < 0 ? '#a5372b' : '#4c7a2f' }}>
              {p.score}
            </span>
          </div>
        ))}
      </div>

      <button
        onClick={() => onWatch(game.roomCode)}
        disabled={!canWatch}
        title={label}
        className="w-full px-2 py-1 rounded-lg text-[11px] font-bold inline-flex items-center justify-center gap-1 active:scale-95 transition-transform disabled:opacity-40"
        style={{
          background: 'rgba(49,83,107,0.12)',
          border: '1px solid rgba(49,83,107,0.4)',
          color: '#31536b',
        }}
      >
        <Eye size={11} /> {label}
      </button>
    </div>
    </div>
  )
}

/**
 * Who's on the site, grouped by the table they're at.
 *
 * People playing together are drawn as one stacked cluster rather than three
 * loose faces — that's the useful unit here, since the thing a visitor wants
 * is "which games are happening", not "which individuals exist". Hovering a
 * cluster opens the table: rounds played and left, live scores, and a way in.
 *
 * Everyone not at a table (idle in the lobby, or watching someone else) sits
 * underneath as single avatars.
 *
 * Hidden below `xl` — there's no room for a side rail next to the lobby
 * panels on a laptop, let alone a phone.
 */
export default function OnlineRail({ active }) {
  const {
    onlinePlayers, liveGames, connected, announcePresence, refreshLobby, watchGame,
  } = useGame()
  const [openRoom, setOpenRoom] = useState(null)
  // Closing is deferred a beat so a quick diagonal flick between the cluster
  // and the card doesn't dismiss it mid-travel; re-entering either cancels.
  const closeTimer = useRef(null)
  const openCard  = (code) => { clearTimeout(closeTimer.current); setOpenRoom(code) }
  const closeCard = () => {
    clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => setOpenRoom(null), 160)
  }
  useEffect(() => () => clearTimeout(closeTimer.current), [])

  // Announce once we know which profile this browser is acting as, and again
  // on reconnect — the server forgets presence when a socket drops, so a
  // reconnected client would otherwise vanish from everyone else's rail.
  useEffect(() => {
    if (!connected) return
    refreshLobby()
    if (active?.name) announcePresence(active.name, active.avatar)
  }, [connected, active?.name, active?.avatar, announcePresence, refreshLobby])

  if (!onlinePlayers.length) return null

  // Anyone seated at a live table is represented by their group, not twice.
  const inGame = new Set(
    liveGames.flatMap(g => g.players.map(p => p.name.toLowerCase()))
  )
  const loose = onlinePlayers.filter(p => !inGame.has(p.name.toLowerCase()))

  // Count what's actually on screen, not just the presence registry. Someone
  // who reloaded straight into a game never mounts this component and so
  // never announces, but they're plainly visible in their group — reading
  // `onlinePlayers.length` showed "1" next to four faces.
  const shown = new Set([...inGame, ...loose.map(p => p.name.toLowerCase())]).size

  // Long tail of idle players is trimmed rather than scrolled: a scroll
  // container clips the table card that opens beside a group (see the
  // overflow note below), and a rail taller than the viewport is worse than
  // an honest "+3".
  const MAX_LOOSE = 8
  const visibleLoose = loose.slice(0, MAX_LOOSE)
  const overflowCount = loose.length - visibleLoose.length

  const watch = (roomCode) => { watchGame(roomCode, active.name, active.avatar); setOpenRoom(null) }

  return (
    // `overflow` is deliberately left alone. It previously carried
    // `overflow-y-auto overflow-x-visible`, which is not a valid pair: when
    // one axis is `visible` and the other isn't, `visible` computes to
    // `auto`. That produced scrollbars on both axes AND clipped the table
    // card that opens to the right of a group. The list is trimmed instead.
    <div className="hidden xl:flex fixed left-3 top-1/2 -translate-y-1/2 z-20 flex-col items-center gap-2
                    py-2.5 px-2 rounded-2xl"
         style={{
           background: 'rgba(248,239,221,0.72)',
           border: '1px solid rgba(122,83,44,0.3)',
           backdropFilter: 'blur(3px)',
         }}>
      <div className="text-[9px] uppercase tracking-widest font-western inline-flex items-center gap-1"
           style={{ color: 'rgba(142,43,35,0.8)' }}>
        <Users size={10} /> {shown}
      </div>

      {/* Groups: one cluster per live table. */}
      {liveGames.map((g) => {
        const seated = active?.name &&
          g.players.some(p => p.name.toLowerCase() === active.name.toLowerCase())
        return (
          <div key={g.roomCode}
               className="relative"
               onMouseEnter={() => openCard(g.roomCode)}
               onMouseLeave={closeCard}>
            <button
              onClick={() => openCard(openRoom === g.roomCode ? null : g.roomCode)}
              aria-label={g.players.map(p => p.name).join(' · ')}
              className="flex flex-col items-center gap-0.5 py-1 px-1 rounded-xl transition-colors"
              style={{
                background: openRoom === g.roomCode ? 'rgba(142,43,35,0.10)' : 'transparent',
                border: '1px solid rgba(122,83,44,0.22)',
              }}
            >
              {g.players.map((p, i) => (
                <span key={p.seat} className="block"
                      style={{ marginTop: i === 0 ? 0 : -8 }}>
                  <AvatarImg avatar={p.avatar} size={26} ring="rgba(76,122,47,0.7)" />
                </span>
              ))}
              <span className="text-[8px] font-mono leading-none mt-0.5"
                    style={{ color: 'rgba(59,35,20,0.55)' }}>
                {g.round}/{TOTAL_ROUNDS}
              </span>
            </button>

            {openRoom === g.roomCode && (
              <TableCard game={g} seated={!!seated} hasProfile={!!active} onWatch={watch} />
            )}
          </div>
        )
      })}

      {/* Everyone else: one avatar each. */}
      {visibleLoose.map((p) => (
        <div key={p.name} className="relative" title={`${p.name}`}>
          <AvatarImg avatar={p.avatar} size={28} ring="rgba(142,43,35,0.4)" />
          <span className="absolute -bottom-0.5 -right-0.5 rounded-full"
                style={{
                  width: 9, height: 9, background: DOT[p.status] || DOT.lobby,
                  border: '1.5px solid #f8efdd',
                }} />
        </div>
      ))}

      {overflowCount > 0 && (
        <span className="text-[9px] font-mono" style={{ color: 'rgba(59,35,20,0.5)' }}
              title={loose.slice(MAX_LOOSE).map(p => p.name).join(', ')}>
          +{overflowCount}
        </span>
      )}
    </div>
  )
}
