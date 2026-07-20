import { useState } from 'react'
import { Check, Copy, Play, User, Trophy, Dices } from 'lucide-react'
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

const SEAT_COLOR = ['#8e2b23', '#7a532c', '#4c7a2f']

export default function WaitingRoom() {
  const { roomCode, players, mySeat, isCreator, startGame, roomMode } = useGame()
  const [copied, setCopied] = useState(false)
  const isChampionship = roomMode === 'championship'

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
            ✦ &nbsp; დუქანი &nbsp; ✦
          </p>
          <h1 className="text-4xl font-western"
              style={{ color: '#8e2b23', textShadow: '0 2px 0 rgba(255,255,255,0.35), 0 4px 12px rgba(58,36,24,0.25)' }}>
            მოსაცდელი ოთახი
          </h1>
          <p className="text-sm font-typewriter mt-1" style={{ color: 'rgba(59,35,20,0.55)' }}>
            გაუზიარე კოდი 2 მეგობარს
          </p>
          <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-typewriter font-bold"
               style={{
                 background: isChampionship ? 'rgba(184,134,11,0.14)' : 'rgba(122,83,44,0.1)',
                 border: isChampionship ? '1px solid rgba(184,134,11,0.55)' : '1px solid rgba(122,83,44,0.35)',
                 color: isChampionship ? '#b8860b' : '#3b2314',
               }}>
            {isChampionship
              ? <><Trophy size={11} /> ლიგის თამაში — ითვლება სეზონში</>
              : <><Dices size={11} /> უბრალო თამაში</>}
          </div>
        </div>

        {/* Room code card */}
        <div className="western-panel p-6 mb-5 text-center">
          <p className="text-[11px] uppercase tracking-[0.3em] mb-3 font-western"
             style={{ color: 'rgba(142,43,35,0.7)' }}>ოთახის კოდი</p>
          <div className="flex items-center justify-center gap-4 mb-2">
            <span className="text-4xl font-typewriter font-black tracking-[0.35em]"
                  style={{ color: '#8e2b23', textShadow: '0 1px 0 rgba(255,255,255,0.4), 0 0 24px rgba(142,43,35,0.25)' }}>
              {roomCode}
            </span>
            <button
              onClick={copyCode}
              className="text-xs rounded-lg px-3 py-1.5 inline-flex items-center gap-1.5 font-typewriter"
              style={{
                background: copied ? 'rgba(76,122,47,0.15)' : 'rgba(142,43,35,0.07)',
                border: copied ? '1px solid rgba(76,122,47,0.5)' : '1px solid rgba(122,83,44,0.4)',
                color: copied ? '#4c7a2f' : '#3b2314',
              }}
            >
              {copied
                ? <><Check size={12} strokeWidth={3} /><span>დაკოპირდა</span></>
                : <><Copy size={12} /><span>კოდის კოპირება</span></>}
            </button>
          </div>
          <p className="text-xs font-typewriter" style={{ color: 'rgba(59,35,20,0.4)' }}>
            ეს კოდი სჭირდებათ მეგობრებს შენს დუქანში შესასვლელად
          </p>
        </div>

        {/* Player seats */}
        <div className="western-panel p-5 mb-5">
          <p className="text-[11px] uppercase tracking-[0.3em] mb-4 font-western"
             style={{ color: 'rgba(142,43,35,0.7)' }}>მოთამაშეები ({players.length}/3)</p>

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
                         : 'rgba(59,35,20,0.04)',
                       border: player
                         ? `1px solid ${color}55`
                         : '1px dashed rgba(122,83,44,0.25)',
                     }}>
                  <div className="w-11 h-11 rounded-full flex-shrink-0 overflow-hidden flex items-center justify-center"
                       style={{
                         background: '#000',
                         border: player ? `2px solid ${color}` : '2px dashed rgba(122,83,44,0.4)',
                         boxShadow: player ? `0 0 14px ${color}55` : 'none',
                       }}>
                    {player
                      ? <img src={player.avatar || '/avatar-default.png'} alt="" className="w-full h-full object-cover" />
                      : <User size={16} style={{ color: 'rgba(142,43,35,0.4)' }} />}
                  </div>

                  <div className="flex-1 min-w-0">
                    {player ? (
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold font-western truncate" style={{ color: '#3b2314' }}>{player.name}</span>
                        {isMe && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold font-typewriter flex-shrink-0"
                                style={{ background: `${color}25`, color, border: `1px solid ${color}55` }}>
                            შენ
                          </span>
                        )}
                        {seat === 0 && isCreator && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold font-typewriter flex-shrink-0"
                                style={{ background: 'rgba(142,43,35,0.1)', color: '#8e2b23', border: '1px solid rgba(122,83,44,0.45)' }}>
                            თამადა
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-sm flex items-center font-typewriter" style={{ color: 'rgba(59,35,20,0.45)' }}>
                        ველოდებით<Dots />
                      </span>
                    )}
                  </div>

                  {player && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-typewriter inline-flex items-center gap-1 flex-shrink-0"
                          style={{ background: 'rgba(76,122,47,0.14)', color: '#4c7a2f', border: '1px solid rgba(76,122,47,0.4)' }}>
                      <Check size={10} strokeWidth={3} /> მზადაა
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
              ? <span>ველოდებით მოთამაშეებს ({players.length}/3)…</span>
              : <><Play size={14} fill="currentColor" /><span>თამაშის დაწყება</span></>}
          </button>
        ) : (
          <div className="text-center text-sm py-3 mb-3 font-typewriter" style={{ color: 'rgba(59,35,20,0.6)' }}>
            ველოდებით თამადას, რომ დაიწყოს თამაში<Dots />
          </div>
        )}
      </div>
    </div>
  )
}
