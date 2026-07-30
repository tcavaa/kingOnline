import { useState, useEffect } from 'react'
import { ArrowLeft, Play, Users, Copy, Check } from 'lucide-react'
import { DurakProvider, useDurak } from './DurakContext'
import DurakTable from './DurakTable'
import AvatarImg from '../components/AvatarImg'
import { unlockDurakSounds } from './sounds'
import './durak.css'

const TOAST_STYLES = {
  error:   { bg: 'rgba(111,31,26,0.96)',  color: '#fdf2df' },
  warning: { bg: 'rgba(192,138,38,0.96)', color: '#3b2314' },
  info:    { bg: 'rgba(248,239,221,0.97)', color: '#3b2314' },
}

function DurakToasts() {
  const { toasts } = useDurak()
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => {
        const s = TOAST_STYLES[t.type] ?? TOAST_STYLES.info
        return (
          <div key={t.id}
               className="toast-enter px-4 py-2.5 rounded-xl shadow-2xl text-sm font-medium max-w-xs"
               style={{ background: s.bg, color: s.color, border: '1px solid rgba(255,255,255,0.25)' }}>
            {t.message}
          </div>
        )
      })}
    </div>
  )
}

function DurakLobby({ onExit }) {
  const { connected, profile, createRoom, joinRoom, publicRoom, sitPublic } = useDurak()
  const [target, setTarget] = useState('301')
  const [code, setCode] = useState('')

  return (
    <div className="saloon-bg min-h-screen flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-xl">
        <button onClick={onExit}
                className="mb-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold font-typewriter"
                style={{ background: 'rgba(122,83,44,0.1)', border: '1px solid rgba(122,83,44,0.3)', color: '#3b2314' }}>
          <ArrowLeft size={14} /> კინგზე დაბრუნება
        </button>

        <div className="text-center mb-6 select-none">
          <h1 className="text-5xl font-western"
              style={{ color: '#1f3d2e', textShadow: '0 2px 0 rgba(255,255,255,0.35), 0 4px 14px rgba(31,61,46,0.3)', letterSpacing: '0.06em' }}>
            ჩეხური დურაკა
          </h1>
          <div className="mt-1 text-[11px] uppercase tracking-[0.4em] font-western" style={{ color: 'rgba(31,61,46,0.8)' }}>
            ✦ &nbsp; 2–6 მოთამაშე · 36 კარტი &nbsp; ✦
          </div>
          <div className="mt-3 inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-typewriter"
               style={{
                 background: connected ? 'rgba(76,122,47,0.12)' : 'rgba(165,55,43,0.12)',
                 border: connected ? '1px solid rgba(76,122,47,0.4)' : '1px solid rgba(165,55,43,0.4)',
                 color: connected ? '#4c7a2f' : '#a5372b',
               }}>
            <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`} />
            {connected ? 'კავშირი გამართულია' : 'ვემზადებით…'}
          </div>
        </div>

        {!profile?.name ? (
          <div className="western-panel p-6 text-center">
            <p className="text-sm font-typewriter" style={{ color: 'rgba(59,35,20,0.7)' }}>
              ჯერ აირჩიე პროფილი კინგის მთავარ გვერდზე, მერე დაბრუნდი აქ.
            </p>
          </div>
        ) : (
          <>
          {/* Public quick-match table — first sitter owns the losing score. */}
          <div className="western-panel p-5 mb-5">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h2 className="text-sm font-western text-ink uppercase inline-flex items-center gap-2">
                <Users size={14} /> საჯარო მაგიდა
              </h2>
              {publicRoom.roomCode ? (
                <span className="text-[11px] font-typewriter" style={{ color: 'rgba(31,61,46,0.85)' }}>
                  ლიმიტი: <strong>{publicRoom.targetScore}</strong> · {publicRoom.players.length}/6
                </span>
              ) : (
                <span className="text-[11px] font-typewriter" style={{ color: 'rgba(59,35,20,0.5)' }}>
                  მაგიდა ცარიელია
                </span>
              )}
            </div>
            {publicRoom.players.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {publicRoom.players.map((p) => (
                  <span key={p.seat}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-western"
                        style={{ background: 'rgba(31,61,46,0.08)', border: '1px solid rgba(31,61,46,0.3)', color: '#3b2314' }}>
                    <AvatarImg avatar={p.avatar} size={18} ring="rgba(31,61,46,0.4)" />
                    {p.name}
                    {p.seat === publicRoom.creatorSeat && ' ⚑'}
                  </span>
                ))}
              </div>
            )}
            <p className="text-[10px] font-typewriter mb-3" style={{ color: 'rgba(59,35,20,0.55)' }}>
              {publicRoom.roomCode
                ? 'დაჯექი და შეუერთდი — თამაშს პირველი მჯდომი დაიწყებს.'
                : 'პირველი მჯდომი ხსნის მაგიდას და წყვეტს წაგების ქულას.'}
            </p>
            <button
              onClick={sitPublic}
              disabled={!connected}
              className="casino-btn-primary w-full py-2.5 text-sm tracking-wider uppercase active:scale-95"
            >
              {publicRoom.roomCode ? 'დაჯექი მაგიდასთან' : 'გახსენი საჯარო მაგიდა'}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="western-panel p-6 flex flex-col">
              <h2 className="text-lg font-western text-ink uppercase mb-1">ახალი ოთახი</h2>
              <p className="text-xs font-typewriter mb-4" style={{ color: 'rgba(59,35,20,0.55)' }}>
                ვინც ამ ქულას მიაღწევს — გამოდის. ბოლო დარჩენილი იგებს.
              </p>
              <label className="block text-xs mb-1.5 uppercase font-western tracking-widest"
                     style={{ color: 'rgba(31,61,46,0.75)' }}>წაგების ქულა</label>
              <input type="number" min={50} max={5000} value={target}
                     onChange={(e) => setTarget(e.target.value)}
                     className="casino-input font-typewriter text-center mb-4" placeholder="301" />
              <button
                onClick={() => createRoom(Number(target) || 301)}
                disabled={!connected}
                className="casino-btn-primary mt-auto w-full py-2.5 text-sm tracking-wider uppercase active:scale-95"
              >
                ოთახის შექმნა
              </button>
            </div>

            <div className="western-panel p-6 flex flex-col">
              <h2 className="text-lg font-western text-ink uppercase mb-1">შესვლა კოდით</h2>
              <p className="text-xs font-typewriter mb-4" style={{ color: 'rgba(59,35,20,0.55)' }}>
                მეგობრის ოთახის კოდი ჩაწერე.
              </p>
              <label className="block text-xs mb-1.5 uppercase font-western tracking-widest"
                     style={{ color: 'rgba(31,61,46,0.75)' }}>ოთახის კოდი</label>
              <input type="text" maxLength={6} value={code}
                     onChange={(e) => setCode(e.target.value.toUpperCase())}
                     placeholder="DXXXXX"
                     className="casino-input font-typewriter tracking-[0.3em] uppercase text-center mb-4" />
              <button
                onClick={() => code.trim() && joinRoom(code.trim())}
                disabled={!connected || !code.trim()}
                className="casino-btn-gold mt-auto w-full py-2.5 text-sm tracking-wider uppercase active:scale-95"
              >
                შეუერთდი
              </button>
            </div>
          </div>
          </>
        )}
      </div>
    </div>
  )
}

function DurakWaiting({ onExit }) {
  const { room, mySeat, startMatch, leaveRoom, setTargetScore } = useDurak()
  const [copied, setCopied] = useState(false)
  const [editTarget, setEditTarget] = useState(null) // string while editing
  const isCreator = mySeat === room.creatorSeat
  const canStart = isCreator && room.players.length >= 2

  const applyTarget = () => {
    const n = Number(editTarget)
    if (Number.isFinite(n) && n > 0) setTargetScore(n)
    setEditTarget(null)
  }

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(room.roomCode)
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    } catch { /* ignore */ }
  }

  return (
    <div className="saloon-bg min-h-screen flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-5">
          <h1 className="text-3xl font-western" style={{ color: '#1f3d2e' }}>
            ჩეხური დურაკა{room.isPublic && <span className="ml-2 text-sm font-typewriter" style={{ color: 'rgba(31,61,46,0.7)' }}>· საჯარო</span>}
          </h1>
          <div className="text-sm font-typewriter mt-1 flex items-center justify-center gap-2 flex-wrap"
               style={{ color: 'rgba(59,35,20,0.55)' }}>
            {editTarget === null ? (
              <>
                <span>წაგების ქულა: <strong style={{ color: '#1f3d2e' }}>{room.targetScore}</strong></span>
                {isCreator && (
                  <button onClick={() => setEditTarget(String(room.targetScore))}
                          className="text-[11px] px-2 py-0.5 rounded-lg font-typewriter"
                          style={{ background: 'rgba(31,61,46,0.08)', border: '1px solid rgba(31,61,46,0.35)', color: '#1f3d2e' }}>
                    შეცვლა
                  </button>
                )}
              </>
            ) : (
              <span className="inline-flex items-center gap-2">
                <input type="number" min={50} max={5000} value={editTarget} autoFocus
                       onChange={(e) => setEditTarget(e.target.value)}
                       onKeyDown={(e) => { if (e.key === 'Enter') applyTarget() }}
                       className="w-24 px-2 py-1 rounded-lg text-center font-typewriter text-sm"
                       style={{ background: '#fffdf6', border: '1px solid rgba(31,61,46,0.5)', color: '#1f3d2e' }} />
                <button onClick={applyTarget}
                        className="text-[11px] px-2 py-1 rounded-lg font-bold font-typewriter"
                        style={{ background: '#1f3d2e', color: '#f4e8cf' }}>
                  OK
                </button>
              </span>
            )}
            <span>· 2–6 მოთამაშე</span>
          </div>
        </div>

        <div className="western-panel p-6 mb-4 text-center">
          <p className="text-[11px] uppercase tracking-[0.3em] mb-3 font-western" style={{ color: 'rgba(31,61,46,0.75)' }}>
            ოთახის კოდი
          </p>
          <div className="flex items-center justify-center gap-3">
            <span className="text-3xl font-typewriter font-black tracking-[0.3em]" style={{ color: '#1f3d2e' }}>
              {room.roomCode}
            </span>
            <button onClick={copyCode}
                    className="text-xs rounded-lg px-3 py-1.5 inline-flex items-center gap-1.5 font-typewriter"
                    style={{
                      background: copied ? 'rgba(76,122,47,0.15)' : 'rgba(122,83,44,0.07)',
                      border: copied ? '1px solid rgba(76,122,47,0.5)' : '1px solid rgba(122,83,44,0.4)',
                      color: copied ? '#4c7a2f' : '#3b2314',
                    }}>
              {copied ? <><Check size={12} strokeWidth={3} /> დაკოპირდა</> : <><Copy size={12} /> კოპირება</>}
            </button>
          </div>
        </div>

        <div className="western-panel p-5 mb-4">
          <p className="text-[11px] uppercase tracking-[0.3em] mb-3 font-western inline-flex items-center gap-2"
             style={{ color: 'rgba(31,61,46,0.75)' }}>
            <Users size={12} /> მოთამაშეები ({room.players.length}/6)
          </p>
          <div className="flex flex-col gap-2">
            {room.players.map((p) => (
              <div key={p.seat} className="flex items-center gap-3 px-3 py-2 rounded-xl"
                   style={{ background: 'rgba(31,61,46,0.06)', border: '1px solid rgba(31,61,46,0.25)' }}>
                <AvatarImg avatar={p.avatar} size={34} ring="rgba(31,61,46,0.5)" />
                <span className="text-sm font-bold font-western flex-1" style={{ color: '#3b2314' }}>
                  {p.name}
                  {p.seat === mySeat && <span className="ml-2 text-[10px] font-typewriter" style={{ color: 'rgba(31,61,46,0.7)' }}>(შენ)</span>}
                </span>
                {p.seat === room.creatorSeat && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-typewriter"
                        style={{ background: 'rgba(31,61,46,0.12)', color: '#1f3d2e', border: '1px solid rgba(31,61,46,0.35)' }}>
                    თამადა
                  </span>
                )}
                {!p.connected && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" title="გათიშულია" />}
              </div>
            ))}
          </div>
        </div>

        {isCreator ? (
          <button onClick={startMatch} disabled={!canStart}
                  className="casino-btn-primary w-full py-3 text-sm tracking-widest uppercase mb-3 inline-flex items-center justify-center gap-2 active:scale-95">
            <Play size={14} fill="currentColor" />
            {room.players.length < 2 ? 'მინიმუმ 2 მოთამაშე…' : 'თამაშის დაწყება'}
          </button>
        ) : (
          <p className="text-center text-sm py-3 mb-3 font-typewriter" style={{ color: 'rgba(59,35,20,0.6)' }}>
            ველოდებით თამადას…
          </p>
        )}

        <button onClick={() => { leaveRoom(); }}
                className="w-full py-2 text-xs font-typewriter rounded-lg"
                style={{ background: 'rgba(165,55,43,0.08)', border: '1px solid rgba(165,55,43,0.35)', color: '#a5372b' }}>
          ოთახის დატოვება
        </button>
        <button onClick={onExit}
                className="mt-2 w-full py-2 text-xs font-typewriter rounded-lg"
                style={{ background: 'rgba(122,83,44,0.07)', border: '1px solid rgba(122,83,44,0.3)', color: '#3b2314' }}>
          <span className="inline-flex items-center gap-1.5"><ArrowLeft size={12} /> კინგზე დაბრუნება (ადგილი შენარჩუნდება)</span>
        </button>
      </div>
    </div>
  )
}

function DurakInner({ onExit }) {
  const { phase, room } = useDurak()

  if (phase !== 'room' || !room) return (<><DurakToasts /><DurakLobby onExit={onExit} /></>)
  if (room.status === 'waiting') return (<><DurakToasts /><DurakWaiting onExit={onExit} /></>)
  return (<><DurakToasts /><DurakTable onExit={onExit} /></>)
}

/**
 * ჩეხური დურაკა — standalone section mounted from the King lobby. `profile`
 * is the King profile currently locked in (may be null when returning to a
 * live game after refresh — rejoin runs on the stored name).
 */
export default function DurakApp({ profile, onExit }) {
  // Prime the sound elements on the first tap/click inside the durak
  // section — required by browser autoplay policies.
  useEffect(() => {
    const unlock = () => { unlockDurakSounds() }
    document.addEventListener('pointerdown', unlock, { once: true })
    return () => document.removeEventListener('pointerdown', unlock)
  }, [])

  return (
    <DurakProvider profile={profile}>
      <DurakInner onExit={onExit} />
    </DurakProvider>
  )
}
