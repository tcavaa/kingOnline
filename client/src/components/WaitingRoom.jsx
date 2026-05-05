import { useState } from 'react'
import { Check, Copy, Play, User } from 'lucide-react'
import { useGame } from '../context/GameContext'

function Dots() {
  return (
    <span className="inline-flex gap-1 ml-1.5">
      {[0, 1, 2].map(i => (
        <span key={i} className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce"
              style={{ animationDelay: `${i * 150}ms` }} />
      ))}
    </span>
  )
}

const SEAT_COLOR = ['#daa520', '#a8593f', '#6dbc4f']

export default function WaitingRoom() {
  const { roomCode, players, mySeat, isCreator, startGame } = useGame()
  const [copied, setCopied] = useState(false)

  const copyCode = async () => {
    try { await navigator.clipboard.writeText(roomCode); setCopied(true); setTimeout(() => setCopied(false), 2000) }
    catch { /* ignore */ }
  }

  const canStart = isCreator && players.length === 3

  return (
    <div className="saloon-bg min-h-screen flex flex-col items-center justify-center px-4 py-8 relative overflow-hidden">
      <div className="absolute inset-0 card-pattern pointer-events-none" />

      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-6">
          <p className="text-amber-400/70 text-[11px] tracking-[0.5em] uppercase font-western mb-2">
            ★ &nbsp; Saloon &nbsp; ★
          </p>
          <h1 className="text-4xl font-western"
              style={{ color: '#f0c75a', textShadow: '0 3px 0 #2c1a10, 0 5px 18px rgba(0,0,0,0.7)' }}>
            Waiting Room
          </h1>
          <p className="text-sm font-typewriter mt-1" style={{ color: 'rgba(245,233,207,0.55)' }}>
            Pass the code along to 2 partners
          </p>
        </div>

        {/* Room code card */}
        <div className="western-panel p-6 mb-5 text-center">
          <p className="text-[11px] uppercase tracking-[0.3em] mb-3 font-western"
             style={{ color: 'rgba(218,165,32,0.7)' }}>Room Code</p>
          <div className="flex items-center justify-center gap-4 mb-2">
            <span className="text-4xl font-typewriter font-black tracking-[0.35em]"
                  style={{ color: '#f0c75a', textShadow: '0 2px 0 #2c1a10, 0 0 24px rgba(218,165,32,0.45)' }}>
              {roomCode}
            </span>
            <button
              onClick={copyCode}
              className="text-xs rounded-lg px-3 py-1.5 inline-flex items-center gap-1.5 font-typewriter"
              style={{
                background: copied ? 'rgba(109,188,79,0.15)' : 'rgba(218,165,32,0.08)',
                border: copied ? '1px solid rgba(109,188,79,0.5)' : '1px solid rgba(218,165,32,0.4)',
                color: copied ? '#a3d68a' : '#fde9b8',
              }}
            >
              {copied
                ? <><Check size={12} strokeWidth={3} /><span>Copied</span></>
                : <><Copy size={12} /><span>Copy</span></>}
            </button>
          </div>
          <p className="text-xs font-typewriter" style={{ color: 'rgba(245,233,207,0.4)' }}>
            Other riders need this to find your saloon
          </p>
        </div>

        {/* Player seats */}
        <div className="western-panel p-5 mb-5">
          <p className="text-[11px] uppercase tracking-[0.3em] mb-4 font-western"
             style={{ color: 'rgba(218,165,32,0.7)' }}>Outlaws ({players.length}/3)</p>

          <div className="flex flex-col gap-3">
            {[0, 1, 2].map(seat => {
              const player = players.find(p => p.seat === seat)
              const isMe   = seat === mySeat
              const color  = SEAT_COLOR[seat]

              return (
                <div key={seat}
                     className="flex items-center gap-4 px-4 py-3 rounded-xl transition-all"
                     style={{
                       background: player
                         ? `linear-gradient(135deg, ${color}1a, ${color}08)`
                         : 'rgba(245,233,207,0.04)',
                       border: player
                         ? `1px solid ${color}55`
                         : '1px dashed rgba(218,165,32,0.25)',
                     }}>
                  <div className="w-11 h-11 rounded-full flex-shrink-0 overflow-hidden flex items-center justify-center"
                       style={{
                         background: '#000',
                         border: player ? `2px solid ${color}` : '2px dashed rgba(218,165,32,0.4)',
                         boxShadow: player ? `0 0 14px ${color}55` : 'none',
                       }}>
                    {player
                      ? <img src={player.avatar || '/avatar-default.png'} alt="" className="w-full h-full object-cover" />
                      : <User size={16} style={{ color: 'rgba(218,165,32,0.4)' }} />}
                  </div>

                  <div className="flex-1 min-w-0">
                    {player ? (
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold font-western truncate" style={{ color: '#fde9b8' }}>{player.name}</span>
                        {isMe && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold font-typewriter flex-shrink-0"
                                style={{ background: `${color}25`, color, border: `1px solid ${color}55` }}>
                            You
                          </span>
                        )}
                        {seat === 0 && isCreator && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold font-typewriter flex-shrink-0"
                                style={{ background: 'rgba(218,165,32,0.18)', color: '#f0c75a', border: '1px solid rgba(218,165,32,0.45)' }}>
                            Sheriff
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-sm flex items-center font-typewriter" style={{ color: 'rgba(245,233,207,0.45)' }}>
                        Waiting<Dots />
                      </span>
                    )}
                  </div>

                  {player && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-typewriter inline-flex items-center gap-1 flex-shrink-0"
                          style={{ background: 'rgba(109,188,79,0.14)', color: '#a3d68a', border: '1px solid rgba(109,188,79,0.4)' }}>
                      <Check size={10} strokeWidth={3} /> Ready
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {isCreator ? (
          <button
            onClick={startGame}
            disabled={!canStart}
            className="casino-btn-primary w-full py-3 text-sm tracking-widest mb-3 inline-flex items-center justify-center gap-2 uppercase active:scale-95"
          >
            {players.length < 3
              ? <span>Waiting for outlaws ({players.length}/3)…</span>
              : <><Play size={14} fill="currentColor" /><span>Deal the Cards</span></>}
          </button>
        ) : (
          <div className="text-center text-sm py-3 mb-3 font-typewriter" style={{ color: 'rgba(245,233,207,0.6)' }}>
            Waiting on the sheriff to start<Dots />
          </div>
        )}
      </div>
    </div>
  )
}
