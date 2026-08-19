import { useEffect, useState } from 'react'
import { Swords, Users, LogOut, Plus } from 'lucide-react'
import { useGame } from '../../context/GameContext'
import AvatarImg from '../AvatarImg'

const SIZES = [6, 9]

/**
 * Lobby entry point for King tournaments.
 *
 * A tournament needs exactly 6 or 9 entrants; the creator picks which. Once
 * the last seat fills the server draws the tables and everyone is dropped
 * straight onto a table, so this panel only ever shows the waiting stage.
 */
export default function TournamentPanel({ active }) {
  const {
    connected, tournament, tournamentList,
    createTournament, joinTournament, leaveTournament, refreshTournaments,
  } = useGame()

  const [size, setSize] = useState(6)
  const [code, setCode] = useState('')

  // Refresh the open-tournament list on mount and whenever ours changes
  // (creating or leaving one changes what everybody else should see).
  useEffect(() => {
    if (connected) refreshTournaments()
  }, [connected, tournament, refreshTournaments])

  const canAct = connected && !!active

  // ── already entered: show the roster and the fill counter ───────────────
  if (tournament) {
    const filled = tournament.players.length
    const remaining = tournament.size - filled
    return (
      <div className="western-panel p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-western text-lg inline-flex items-center gap-2" style={{ color: '#8e2b23' }}>
            <Swords size={18} /> ტურნირი
          </h3>
          <span className="font-mono text-sm font-bold px-2 py-1 rounded"
                style={{ background: 'rgba(142,43,35,0.1)', color: '#8e2b23' }}>
            {tournament.code}
          </span>
        </div>

        <div className="text-sm font-typewriter mb-3" style={{ color: '#3b2314' }}>
          {remaining > 0
            ? <>ველოდებით კიდევ <b>{remaining}</b> მოთამაშეს ({filled}/{tournament.size})</>
            : <>სრულია — მაგიდები იყრება…</>}
        </div>

        {/* Fill meter — reads faster than the counter alone. */}
        <div className="h-1.5 rounded-full mb-4 overflow-hidden" style={{ background: 'rgba(122,83,44,0.18)' }}>
          <div className="h-full rounded-full transition-all duration-500"
               style={{ width: `${(filled / tournament.size) * 100}%`, background: '#8e2b23' }} />
        </div>

        <div className="grid grid-cols-3 gap-2 mb-4">
          {Array.from({ length: tournament.size }).map((_, i) => {
            const p = tournament.players[i]
            return (
              <div key={i}
                   className="flex items-center gap-2 px-2 py-1.5 rounded-lg min-w-0"
                   style={{
                     background: p ? 'rgba(255,255,255,0.5)' : 'rgba(122,83,44,0.06)',
                     border: `1px dashed ${p ? 'transparent' : 'rgba(122,83,44,0.3)'}`,
                     opacity: p?.connected === false ? 0.5 : 1,
                   }}>
                {p ? (
                  <>
                    <AvatarImg src={p.avatar} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
                    <span className="text-xs truncate" style={{ color: '#3b2314' }}>{p.name}</span>
                  </>
                ) : (
                  <span className="text-xs font-typewriter" style={{ color: 'rgba(59,35,20,0.4)' }}>
                    თავისუფალი
                  </span>
                )}
              </div>
            )
          })}
        </div>

        {tournament.status === 'lobby' && (
          <button onClick={leaveTournament}
                  className="western-pill w-full px-4 py-2 text-sm font-bold inline-flex items-center justify-center gap-2"
                  style={{ color: '#3b2314' }}>
            <LogOut size={15} /> გასვლა
          </button>
        )}
      </div>
    )
  }

  // ── not entered: create one, or join an open one ────────────────────────
  return (
    <div className="western-panel p-5">
      <h3 className="font-western text-lg mb-1 inline-flex items-center gap-2" style={{ color: '#8e2b23' }}>
        <Swords size={18} /> ტურნირი
      </h3>
      <p className="text-xs font-typewriter mb-4" style={{ color: 'rgba(59,35,20,0.6)' }}>
        6 ან 9 მოთამაშე · ნახევარფინალი და ფინალი · ითვლება რეიტინგში
      </p>

      <div className="flex gap-2 mb-3">
        {SIZES.map(n => (
          <button key={n} onClick={() => setSize(n)}
                  className="flex-1 px-3 py-2 rounded-lg text-sm font-bold transition-all"
                  style={{
                    background: size === n ? '#8e2b23' : 'rgba(255,255,255,0.5)',
                    color: size === n ? '#f8efdd' : '#3b2314',
                    border: '1px solid rgba(122,83,44,0.4)',
                  }}>
            {n} <Users size={13} className="inline -mt-0.5" />
          </button>
        ))}
      </div>

      <button onClick={() => createTournament(active.name, active.avatar, size)}
              disabled={!canAct}
              className="western-pill w-full px-4 py-2.5 text-sm font-bold mb-4 inline-flex items-center justify-center gap-2 disabled:opacity-40"
              style={{ color: '#3b2314' }}>
        <Plus size={15} /> ტურნირის შექმნა
      </button>

      {tournamentList.length > 0 && (
        <>
          <div className="text-[10px] uppercase tracking-wider font-western mb-2"
               style={{ color: 'rgba(59,35,20,0.5)' }}>
            ღია ტურნირები
          </div>
          <div className="flex flex-col gap-1.5 mb-3">
            {tournamentList.map(t => (
              <button key={t.id}
                      onClick={() => joinTournament(t.code, active.name, active.avatar)}
                      disabled={!canAct}
                      className="flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all active:scale-95 disabled:opacity-40"
                      style={{ background: 'rgba(255,255,255,0.5)', border: '1px solid rgba(122,83,44,0.3)' }}>
                <span className="font-mono font-bold" style={{ color: '#8e2b23' }}>{t.code}</span>
                <span className="text-xs font-typewriter" style={{ color: '#3b2314' }}>
                  {t.players.length}/{t.size} · {t.createdBy}
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      <div className="flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
          placeholder="კოდი"
          className="flex-1 min-w-0 px-3 py-2 rounded-lg text-sm font-mono tracking-widest text-center"
          style={{ background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(122,83,44,0.4)', color: '#3b2314' }}
        />
        <button onClick={() => joinTournament(code, active.name, active.avatar)}
                disabled={!canAct || code.trim().length < 4}
                className="western-pill px-4 py-2 text-sm font-bold shrink-0 disabled:opacity-40"
                style={{ color: '#3b2314' }}>
          შესვლა
        </button>
      </div>
    </div>
  )
}
