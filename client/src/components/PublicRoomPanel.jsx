import { useMemo } from 'react'
import { Users } from 'lucide-react'
import { useGame } from '../context/GameContext'

// Pool the 4 offered reaction emojis are drawn from (re-rolled per sit-down).
const EMOJI_POOL = ['🍇', '🔥', '😎', '🃏', '💀', '🍺', '🐴', '🌵']

/**
 * Homepage public quick-match table: 3 seats, click to sit. Sitters stay on
 * the homepage (profile shown seated, optional reaction emoji above the
 * avatar) until the 3rd seat fills — then the game starts for all three and
 * the seats free up for the next trio.
 */
export default function PublicRoomPanel({ active }) {
  const {
    connected, publicRoom, publicSeat,
    sitPublic, standPublic, setPublicEmoji,
  } = useGame()

  const seats  = publicRoom.seats || []
  const seated = publicSeat !== null
  const mySeatInfo = seats.find(s => s.seat === publicSeat)
  const openCount  = Math.max(0, 3 - seats.length)

  // 4 "random" reactions, re-rolled every time we take a seat.
  const emojiChoices = useMemo(() => {
    const pool = [...EMOJI_POOL]
    const picks = []
    while (picks.length < 4 && pool.length) {
      picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0])
    }
    return picks
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicSeat])

  const handleSeatClick = (occupant) => {
    if (!connected || !active) return
    if (occupant && occupant.seat === publicSeat) { standPublic(); return }
    if (occupant || seated) return
    sitPublic(active.name, active.avatar)
  }

  return (
    <div className="western-panel p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-western text-ink uppercase inline-flex items-center gap-2">
          <Users size={14} />
          <span className="inline-flex flex-col leading-tight">
            <span>საჯარო ოთახი</span>
            <span className="text-[9px] font-typewriter tracking-widest" style={{ opacity: 0.55 }}>
              PUBLIC ROOM
            </span>
          </span>
        </h2>
        <span className="inline-flex items-center gap-3">
          {publicRoom.roomCode && (
            <span className="text-[10px] font-typewriter tracking-[0.3em]"
                  style={{ color: 'rgba(142,43,35,0.55)' }}>
              {publicRoom.roomCode}
            </span>
          )}
          <img src="/ornament-2.png" alt=""
               className="w-8 h-8 object-contain pointer-events-none select-none"
               style={{ opacity: 0.85 }} />
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map(idx => {
          const occ  = seats.find(s => s.seat === idx)
          const isMe = !!occ && idx === publicSeat
          const clickable = connected && active && (isMe || (!occ && !seated))
          return (
            <button
              key={idx}
              onClick={() => handleSeatClick(occ)}
              disabled={!clickable}
              className="relative rounded-xl px-2 py-3 flex flex-col items-center gap-1.5 transition-all active:scale-95"
              style={{
                background: isMe ? 'rgba(142,43,35,0.07)' : 'rgba(122,83,44,0.1)',
                border: isMe ? '1px solid rgba(142,43,35,0.65)' : '1px solid rgba(122,83,44,0.28)',
                cursor: clickable ? 'pointer' : 'default',
                opacity: !occ && seated ? 0.55 : 1,
              }}
            >
              {occ ? (
                <>
                  <div className="relative">
                    {occ.emoji && (
                      <div className="absolute -top-3 -right-2.5 text-lg z-10 select-none"
                           style={{ filter: 'drop-shadow(0 2px 2px rgba(58,36,24,0.35))' }}>
                        {occ.emoji}
                      </div>
                    )}
                    <div className="w-12 h-12 rounded-full overflow-hidden flex items-center justify-center"
                         style={{ background: '#000', border: '2px solid rgba(142,43,35,0.55)' }}>
                      <img src={occ.avatar || '/avatar-default.png'} alt=""
                           className="w-full h-full object-cover" />
                    </div>
                  </div>
                  <div className="text-[11px] font-western uppercase tracking-wide truncate max-w-full"
                       style={{ color: '#3b2314' }}>
                    {occ.name}
                  </div>
                  <div className="text-[9px] font-typewriter"
                       style={{ color: 'rgba(59,35,20,0.5)' }}>
                    {isMe ? 'დააჭირე ასადგომად' : 'ზის მაგიდასთან'}
                  </div>
                </>
              ) : (
                <>
                  <img src="/seat.png" alt=""
                       className="w-14 h-14 object-contain pointer-events-none select-none"
                       style={{ filter: 'drop-shadow(0 2px 3px rgba(58,36,24,0.2))' }} />
                  <div className="text-[11px] font-western uppercase tracking-wide"
                       style={{ color: '#3b2314' }}>
                    თავისუფალი ადგილი
                  </div>
                  <div className="text-[8px] font-typewriter tracking-widest"
                       style={{ color: 'rgba(59,35,20,0.55)' }}>
                    OPEN SEAT
                  </div>
                  <div className="text-[9px] font-typewriter"
                       style={{ color: 'rgba(59,35,20,0.5)' }}>
                    დააჭირე დასაჯდომად
                  </div>
                </>
              )}
            </button>
          )
        })}
      </div>

      {seated && (
        <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-xs font-typewriter" style={{ color: 'rgba(59,35,20,0.65)' }}>
            ველოდებით კიდევ {openCount} მოთამაშეს — თამაში დაიწყება, როცა მაგიდა შეივსება.
          </div>
          <div className="flex items-center gap-1.5">
            {emojiChoices.map(e => {
              const chosen = mySeatInfo?.emoji === e
              return (
                <button
                  key={e}
                  onClick={() => setPublicEmoji(chosen ? null : e)}
                  title="რეაქცია"
                  className="w-8 h-8 rounded-lg text-base flex items-center justify-center transition-all active:scale-90"
                  style={{
                    background: chosen ? 'rgba(142,43,35,0.25)' : 'rgba(122,83,44,0.1)',
                    border: chosen ? '1px solid rgba(142,43,35,0.7)' : '1px solid rgba(122,83,44,0.3)',
                  }}
                >
                  {e}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {!active && (
        <div className="mt-3 text-[11px] font-typewriter"
             style={{ color: 'rgba(59,35,20,0.45)' }}>
          ჯერ აირჩიე პროფილი ზემოთ.
        </div>
      )}
    </div>
  )
}
