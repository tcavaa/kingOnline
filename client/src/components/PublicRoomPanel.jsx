import { useMemo } from 'react'
import { Users, Trophy } from 'lucide-react'
import { useGame } from '../context/GameContext'
import AvatarImg from './AvatarImg'

// Pool the 4 offered reaction emojis are drawn from (re-rolled per sit-down).
const EMOJI_POOL = ['🍇', '🔥', '😎', '🃏', '💀', '🍺', '🐴', '🌵']

/**
 * Homepage quick-match table: 3 seats, click to sit. Sitters stay on the
 * homepage (profile shown seated, optional reaction emoji above the avatar)
 * until the 3rd seat fills — then the game starts for all three and the
 * seats free up for the next trio.
 *
 * Two instances render on the lobby: `mode="public"` (casual) and
 * `mode="championship"` (counts toward seasons; 2 games per player per day —
 * pass `quota` so the panel can lock itself once the limit is spent).
 */
export default function PublicRoomPanel({ active, mode = 'public', quota = null }) {
  const {
    connected, publicRoom, publicSeat, publicSeatMode,
    sitPublic, standPublic, setPublicEmoji,
  } = useGame()

  const isChampionship = mode === 'championship'
  const table  = publicRoom?.[mode] || { roomCode: null, seats: [] }
  const seats  = table.seats || []
  // Seated anywhere (either table) blocks sitting again; seatedHere unlocks
  // the stand-up / emoji controls on this panel only.
  const seatedAnywhere = publicSeat !== null
  const seatedHere     = seatedAnywhere && publicSeatMode === mode
  const mySeatInfo = seatedHere ? seats.find(s => s.seat === publicSeat) : null
  const openCount  = Math.max(0, 3 - seats.length)
  const quotaSpent = isChampionship && quota != null && quota.remaining <= 0

  const accent      = isChampionship ? '#b8860b' : '#8e2b23'
  const accentSoft  = isChampionship ? 'rgba(184,134,11,' : 'rgba(142,43,35,'

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
    if (occupant && seatedHere && occupant.seat === publicSeat) { standPublic(); return }
    if (occupant || seatedAnywhere || quotaSpent) return
    sitPublic(active.name, active.avatar, null, mode)
  }

  return (
    <div className="western-panel p-5"
         style={isChampionship ? { border: '1px solid rgba(184,134,11,0.5)', boxShadow: '0 0 24px rgba(184,134,11,0.12)' } : undefined}>
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-western text-ink uppercase inline-flex items-center gap-2">
          {isChampionship ? <Trophy size={14} style={{ color: accent }} /> : <Users size={14} />}
          <span className="inline-flex flex-col leading-tight">
            <span>{isChampionship ? 'ლიგის ოთახი' : 'საჯარო ოთახი'}</span>
          </span>
        </h2>
        <span className="inline-flex items-center gap-3">
          {table.roomCode && (
            <span className="text-[10px] font-typewriter tracking-[0.3em]"
                  style={{ color: `${accentSoft}0.55)` }}>
              {table.roomCode}
            </span>
          )}
          <img src="/ornament-2.webp" alt=""
               className="w-8 h-8 object-contain pointer-events-none select-none"
               style={{ opacity: 0.85 }} />
        </span>
      </div>

      <div className="mb-4 text-[10px] font-typewriter" style={{ color: 'rgba(59,35,20,0.55)' }}>
        {isChampionship
          ? <>ითვლება სეზონის ჩემპიონატში · დღეში 8 თამაში
              {quota != null && (
                <span className="ml-1 font-bold" style={{ color: quotaSpent ? '#a5372b' : '#4c7a2f' }}>
                  · დღეს დარჩა: {quota.remaining}/{quota.limit}
                </span>
              )}
            </>
          : 'მეგობრული თამაში — შედეგები ჩემპიონატში არ ითვლება'}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map(idx => {
          const occ  = seats.find(s => s.seat === idx)
          const isMe = !!occ && seatedHere && idx === publicSeat
          const clickable = connected && active && (isMe || (!occ && !seatedAnywhere && !quotaSpent))
          return (
            <button
              key={idx}
              onClick={() => handleSeatClick(occ)}
              disabled={!clickable}
              className="relative rounded-xl px-2 py-3 flex flex-col items-center gap-1.5 transition-all active:scale-95"
              style={{
                background: isMe ? `${accentSoft}0.07)` : 'rgba(122,83,44,0.1)',
                border: isMe ? `1px solid ${accentSoft}0.65)` : '1px solid rgba(122,83,44,0.28)',
                cursor: clickable ? 'pointer' : 'default',
                opacity: (!occ && (seatedAnywhere || quotaSpent)) ? 0.55 : 1,
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
                    <AvatarImg avatar={occ.avatar} size={48} ring={`${accentSoft}0.55)`} />
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
                  <img src="/seat.webp" alt=""
                       className="w-14 h-14 object-contain pointer-events-none select-none"
                       style={{ filter: 'drop-shadow(0 2px 3px rgba(58,36,24,0.2))' }} />
                  <div className="text-[11px] font-western uppercase tracking-wide"
                       style={{ color: '#3b2314' }}>
                    თავისუფალი ადგილი
                  </div>
                  <div className="text-[9px] font-typewriter"
                       style={{ color: 'rgba(59,35,20,0.5)' }}>
                    {quotaSpent ? 'ლიმიტი ამოიწურა' : 'დააჭირე დასაჯდომად'}
                  </div>
                </>
              )}
            </button>
          )
        })}
      </div>

      {seatedHere && (
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
                    background: chosen ? `${accentSoft}0.25)` : 'rgba(122,83,44,0.1)',
                    border: chosen ? `1px solid ${accentSoft}0.7)` : '1px solid rgba(122,83,44,0.3)',
                  }}
                >
                  {e}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {isChampionship && quotaSpent && !seatedHere && (
        <div className="mt-3 text-[11px] font-typewriter" style={{ color: '#a5372b' }}>
          დღეს უკვე ითამაშე {quota.limit} ლიგის თამაში — ხვალ ისევ შეძლებ, დღეს კი უბრალო ოთახი გელოდება.
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
