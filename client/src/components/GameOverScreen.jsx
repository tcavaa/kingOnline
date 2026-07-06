import { useEffect, useMemo, useRef } from 'react'
import confetti from 'canvas-confetti'
import { Trophy, Award, Medal, Check, RefreshCw } from 'lucide-react'
import { useGame } from '../context/GameContext'
import { getGameType } from '../constants/gameTypes'
import { SuitIcon } from './Icons'
import ScoreChart from './ScoreChart'
import AchievementBadges from './AchievementBadges'
import { computePerGameAchievements, countCodes } from '../utils/achievements'

const RANK_ICON = [Trophy, Award, Medal]
const RANK_COLOR = ['#b8860b', '#8c8f96', '#a0642d']

export default function GameOverScreen({ onOpenLeaderboard }) {
  const { finalResults, players, roundScores, roundDetails, mySeat,
          rematch, requestRematch } = useGame()

  // Set of seats (in the OLD room) who have clicked Play Again.
  const joinedSet = useMemo(
    () => new Set(rematch?.joinedOldSeats || []),
    [rematch?.joinedOldSeats]
  )
  const iJoined = joinedSet.has(mySeat)

  const handlePlayAgain = () => {
    if (iJoined) return                  // already pressed — don't double-fire
    requestRematch()
    // No navigation here — the server will respond with `room-joined`
    // for the new lobby, which GameContext's existing handler routes to
    // the WaitingRoom screen.
  }

  // Win parade: a generous confetti burst on mount, *louder* if this player
  // actually won. The trophy PNG also gets a slow zoom via the
  // `parade-pulse` CSS class below.
  const playedRef = useRef(false)
  useEffect(() => {
    if (playedRef.current || !finalResults) return
    playedRef.current = true
    const iWon = finalResults.winner?.seat === mySeat
    const colors = ['#8e2b23', '#e3b04b', '#4c7a2f', '#c08a26', '#a5372b']
    confetti({
      particleCount: iWon ? 240 : 100,
      spread: iWon ? 110 : 70,
      startVelocity: iWon ? 60 : 40,
      origin: { y: 0.65 },
      colors,
    })
    if (iWon) {
      // Side cannons a beat later for extra "you actually won this thing" punch.
      setTimeout(() => {
        confetti({ particleCount: 80, angle: 60,  spread: 55, origin: { x: 0,   y: 0.7 }, colors })
        confetti({ particleCount: 80, angle: 120, spread: 55, origin: { x: 1,   y: 0.7 }, colors })
      }, 280)
    }
  }, [finalResults, mySeat])

  if (!finalResults) {
    return (
      <div className="min-h-screen bg-[#f2e4c8] flex items-center justify-center text-cream-dim">
        შედეგები იტვირთება...
      </div>
    )
  }

  const { winner, finalScores, players: fp } = finalResults
  const playerList = (fp || players).slice().sort((a, b) => a.seat - b.seat)
  const allPlayers = (fp || players).slice().sort((a, b) =>
    (finalScores?.[b.seat] ?? 0) - (finalScores?.[a.seat] ?? 0)
  )
  const details = roundDetails && roundDetails.length ? roundDetails : (finalResults.roundDetails || [])

  const stats = useMemo(() => {
    const tally = {}
    playerList.forEach(p => {
      tally[p.seat] = {
        roundsLed: 0,
        totalTricks: 0,
        queensTaken: 0,
        jacksTaken: 0,
        heartsTaken: 0,
        kingsOfHeartsTaken: 0,
        bestRound: { score: -Infinity, round: null, type: null },
        worstRound: { score: Infinity, round: null, type: null },
      }
    })
    details.forEach(d => {
      const ld = d.leaderSeat
      if (tally[ld]) tally[ld].roundsLed++
      for (const seat of [0, 1, 2]) {
        if (!tally[seat]) continue
        tally[seat].totalTricks  += d.tricksTaken?.[seat] ?? 0
        tally[seat].queensTaken  += d.queensTaken?.[seat] ?? 0
        tally[seat].jacksTaken   += d.jacksTaken?.[seat]  ?? 0
        tally[seat].heartsTaken  += d.heartsTaken?.[seat] ?? 0
        if (d.kingOfHeartsTakenBy === seat) tally[seat].kingsOfHeartsTaken++
        const sc = d.scores?.[seat] ?? 0
        if (sc > tally[seat].bestRound.score) {
          tally[seat].bestRound = { score: sc, round: d.round, type: d.gameType }
        }
        if (sc < tally[seat].worstRound.score) {
          tally[seat].worstRound = { score: sc, round: d.round, type: d.gameType }
        }
      }
    })
    return tally
  }, [details, playerList])

  // Per-game achievements, computed on the fly from this game's rounds.
  const achievements = useMemo(
    () => computePerGameAchievements(playerList, details),
    [playerList, details]
  )
  const achieversList = playerList.filter(p => (achievements[p.seat] || []).length > 0)

  return (
    <div className="saloon-bg min-h-screen flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-3xl">
        {/* Hero podium banner with the winner overlaid */}
        <div className="relative rounded-2xl overflow-hidden mb-6"
             style={{ aspectRatio: '1280 / 720', border: '1px solid rgba(240,165,0,0.25)' }}>
          <img src="/trophy-podium.png" alt=""
               className="absolute inset-0 w-full h-full object-cover parade-pulse" />
          <div className="absolute inset-0"
               style={{ background: 'linear-gradient(180deg, rgba(13,10,26,0) 45%, rgba(13,10,26,0.92) 100%)' }} />
          <div className="absolute inset-x-0 bottom-0 px-6 py-6 text-center">
            <p className="text-xs uppercase tracking-[0.35em] mb-2"
               style={{ color: 'rgba(255,255,255,0.65)' }}>გამარჯვებული</p>
            <h1 className="text-4xl sm:text-5xl font-black mb-2"
                style={{ color: '#f0a500', textShadow: '0 4px 28px rgba(0,0,0,0.85), 0 0 36px rgba(240,165,0,0.45)', fontFamily: 'Georgia, serif' }}>
              {winner?.name}
            </h1>
            <div className="inline-block rounded-xl px-5 py-1.5 text-sm font-bold backdrop-blur-md"
                 style={{ background: 'rgba(240,165,0,0.18)', border: '1px solid rgba(240,165,0,0.45)', color: '#fbe7a3' }}>
              საბოლოო ქულა: {finalScores?.[winner?.seat] > 0 ? '+' : ''}{finalScores?.[winner?.seat] ?? 0}
            </div>
          </div>
        </div>

        <div className="rounded-2xl overflow-hidden mb-5"
             style={{ background: 'linear-gradient(180deg, #f8efdd 0%, #ecd9b6 100%)', border: '1px solid rgba(122,83,44,0.35)' }}>
          <div className="px-5 py-4" style={{ borderBottom: '1px solid rgba(122,83,44,0.32)' }}>
            <h2 className="text-base font-bold text-white" style={{ color: '#3b2314' }}>საბოლოო ქულები</h2>
          </div>
          <div>
            {allPlayers.map((p, idx) => {
              const score = finalScores?.[p.seat] ?? 0
              const RankIcon = RANK_ICON[idx]
              return (
                <div key={p.seat} className="flex items-center gap-4 px-5 py-4"
                     style={{
                       borderBottom: idx < allPlayers.length - 1 ? '1px solid rgba(122,83,44,0.12)' : 'none',
                       background: idx === 0 ? 'rgba(142,43,35,0.07)' : 'transparent',
                     }}>
                  <div className="w-8 flex items-center justify-center">
                    {RankIcon ? <RankIcon size={24} style={{ color: RANK_COLOR[idx] }} /> : null}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-white" style={{ color: '#3b2314' }}>{p.name}</span>
                      {p.seat === winner?.seat && (
                        <span className="text-[10px] rounded-full px-2 py-0.5 font-bold"
                              style={{ background: 'rgba(142,43,35,0.1)', color: '#8e2b23', border: '1px solid rgba(142,43,35,0.3)' }}>
                          გამარჯვებული
                        </span>
                      )}
                      {joinedSet.has(p.seat) && (
                        <span className="inline-flex items-center gap-1 text-[10px] rounded-full px-2 py-0.5 font-bold"
                              style={{ background: 'rgba(76,122,47,0.12)', color: '#4c7a2f', border: '1px solid rgba(76,122,47,0.35)' }}
                              title="ამ მოთამაშეს კიდევ თამაში უნდა">
                          <Check size={10} /> კიდევ თამაში უნდა
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-2xl font-black font-mono"
                       style={{ color: score > 0 ? '#4c7a2f' : score < 0 ? '#a5372b' : 'rgba(59,35,20,0.45)' }}>
                    {score > 0 ? '+' : ''}{score}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="mb-5">
          <ScoreChart />
        </div>

        {details.length > 0 && (
          <div className="rounded-2xl overflow-hidden mb-5"
               style={{ background: 'linear-gradient(180deg, #f8efdd 0%, #ecd9b6 100%)', border: '1px solid rgba(122,83,44,0.35)' }}>
            <div className="px-5 py-4" style={{ borderBottom: '1px solid rgba(122,83,44,0.32)' }}>
              <h2 className="text-base font-bold text-white" style={{ color: '#3b2314' }}>მოთამაშეების სტატისტიკა</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4">
              {playerList.map(p => {
                const s = stats[p.seat] || {}
                const best = s.bestRound?.round ? `+${s.bestRound.score} (ხელი ${s.bestRound.round}, ${s.bestRound.type})` : '—'
                const worst = s.worstRound?.round ? `${s.worstRound.score} (ხელი ${s.worstRound.round}, ${s.worstRound.type})` : '—'
                return (
                  <div key={p.seat} className="rounded-xl p-3"
                       style={{ background: 'rgba(236,222,196,0.85)', border: '1px solid rgba(122,83,44,0.3)' }}>
                    <p className="text-xs font-black text-white mb-2" style={{ color: '#3b2314' }}>{p.name}</p>
                    <div className="space-y-1 text-[11px]">
                      <Row label="წამყვანი ხელები"  value={s.roundsLed} />
                      <Row label="მინუსები"          value={s.totalTricks} />
                      <Row label="აღებული დამები"   value={s.queensTaken} />
                      <Row label="აღებული ვალეტები" value={s.jacksTaken} />
                      <Row label="აღებული გულები"   value={s.heartsTaken} />
                      <Row label="აღებული კინგი"    value={s.kingsOfHeartsTaken} />
                      <Row label="საუკეთესო ხელი"   value={best}  color="#4c7a2f" />
                      <Row label="ყველაზე ცუდი ხელი" value={worst} color="#a5372b" />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {achieversList.length > 0 && (
          <div className="rounded-2xl overflow-hidden mb-5"
               style={{ background: 'linear-gradient(180deg, #f8efdd 0%, #ecd9b6 100%)', border: '1px solid rgba(122,83,44,0.35)' }}>
            <div className="px-5 py-4" style={{ borderBottom: '1px solid rgba(122,83,44,0.32)' }}>
              <h2 className="text-base font-bold text-white" style={{ color: '#3b2314' }}>მიღწევები</h2>
            </div>
            <div className="p-4 flex flex-col gap-4">
              {achieversList.map(p => (
                <div key={p.seat}>
                  <p className="text-xs font-black text-white mb-2" style={{ color: '#3b2314' }}>{p.name}</p>
                  <AchievementBadges achievements={countCodes(achievements[p.seat] || [])} />
                </div>
              ))}
            </div>
          </div>
        )}

        {(roundScores.length > 0 || details.length > 0) && (
          <div className="rounded-2xl overflow-hidden mb-6"
               style={{ background: 'linear-gradient(180deg, #f8efdd 0%, #ecd9b6 100%)', border: '1px solid rgba(122,83,44,0.35)' }}>
            <div className="px-5 py-4" style={{ borderBottom: '1px solid rgba(122,83,44,0.32)' }}>
              <h2 className="text-base font-bold text-white" style={{ color: '#3b2314' }}>ხელების დეტალები</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead style={{ background: 'rgba(142,43,35,0.07)' }}>
                  <tr>
                    <th className="px-3 py-2 text-left text-[10px] uppercase tracking-widest" style={{ color: 'rgba(142,43,35,0.7)' }}>ხელი</th>
                    <th className="px-3 py-2 text-left text-[10px] uppercase tracking-widest" style={{ color: 'rgba(142,43,35,0.7)' }}>თამაში</th>
                    <th className="px-3 py-2 text-left text-[10px] uppercase tracking-widest" style={{ color: 'rgba(142,43,35,0.7)' }}>წამყვანი</th>
                    <th className="px-3 py-2 text-left text-[10px] uppercase tracking-widest" style={{ color: 'rgba(142,43,35,0.7)' }}>კოზირი</th>
                    {playerList.map(p => (
                      <th key={p.seat} className="px-3 py-2 text-center text-[10px] uppercase tracking-widest" style={{ color: 'rgba(142,43,35,0.7)' }}>{p.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(details.length ? details : roundScores).map((rs, idx) => {
                    const gt = getGameType(rs.gameType)
                    const TypeIcon = gt?.Icon
                    const leaderName = playerList.find(p => p.seat === rs.leaderSeat)?.name ?? '—'
                    return (
                      <tr key={idx} style={{ borderTop: '1px solid rgba(122,83,44,0.18)' }}>
                        <td className="px-3 py-2 font-mono" style={{ color: 'rgba(142,43,35,0.7)' }}>{rs.round}</td>
                        <td className="px-3 py-2">
                          <span className="inline-flex items-center gap-1 text-xs rounded-md px-1.5 py-0.5"
                                style={{ backgroundColor: `${gt?.color ?? '#555'}22`, color: gt?.color ?? '#3b2314' }}>
                            {TypeIcon && <TypeIcon size={11} />} {rs.gameType}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-[11px]" style={{ color: 'rgba(59,35,20,0.7)' }}>{leaderName}</td>
                        <td className="px-3 py-2 text-[11px]"
                            style={{ color: rs.trumpSuit ? '#8e2b23' : 'rgba(59,35,20,0.4)' }}>
                          {rs.trumpSuit
                            ? <span className="inline-flex items-center gap-1"><SuitIcon suit={rs.trumpSuit} size={11} mono style={{ color: '#8e2b23' }} />{rs.trumpSuit}</span>
                            : '—'}
                        </td>
                        {playerList.map(p => {
                          const v = rs.scores?.[p.seat] ?? 0
                          return (
                            <td key={p.seat} className={`px-3 py-2 text-center font-mono font-semibold
                              ${v > 0 ? 'score-pos-soft' : v < 0 ? 'score-neg-soft' : 'text-cream-dim'}`}
                                style={{ color: v > 0 ? '#4c7a2f' : v < 0 ? '#a5372b' : 'rgba(59,35,20,0.45)' }}>
                              {v > 0 ? '+' : ''}{v}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Rematch status banner — shown the moment any player presses Play
            Again. Tells everyone left on this screen that a fresh lobby
            exists and where to find it. Disappears for players who already
            joined (they navigate away to the new WaitingRoom). */}
        {rematch?.newRoomCode && !iJoined && (
          <div className="mb-3 rounded-xl px-4 py-3 flex items-center justify-between gap-3"
               style={{ background: 'rgba(76,122,47,0.1)', border: '1px solid rgba(76,122,47,0.35)' }}>
            <span className="inline-flex items-center gap-2 text-sm font-bold" style={{ color: '#4c7a2f' }}>
              <RefreshCw size={14} /> ახალი თამაში იწყება — ოთახი <span className="font-mono">{rematch.newRoomCode}</span>
            </span>
            <span className="text-[11px]" style={{ color: 'rgba(76,122,47,0.8)' }}>
              შემოვიდა {joinedSet.size} / {playerList.length}
            </span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          {onOpenLeaderboard && (
            <button
              onClick={onOpenLeaderboard}
              className="py-3.5 rounded-xl font-bold text-base transition-all active:scale-95 inline-flex items-center justify-center gap-2"
              style={{
                background: 'rgba(142,43,35,0.1)',
                border: '1px solid rgba(142,43,35,0.4)',
                color: '#8e2b23',
              }}
            >
              <Trophy size={16} /> რეიტინგი
            </button>
          )}
          <button
            onClick={handlePlayAgain}
            disabled={iJoined}
            className={`${onOpenLeaderboard ? '' : 'col-span-2'} py-3.5 rounded-xl font-bold text-white text-base transition-all active:scale-95 casino-btn-primary inline-flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-default`}
          >
            {iJoined ? (<><Check size={16} /> ველოდებით დანარჩენებს…</>) : (
              rematch?.newRoomCode ? 'შეუერთდი ახალ თამაშს' : 'კიდევ ვითამაშოთ'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, color }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span style={{ color: 'rgba(142,43,35,0.7)' }}>{label}</span>
      <span className="font-mono font-bold" style={{ color: color || '#3b2314' }}>{value}</span>
    </div>
  )
}
