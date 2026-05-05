import { useEffect, useMemo, useRef } from 'react'
import confetti from 'canvas-confetti'
import { Trophy, Award, Medal } from 'lucide-react'
import { useGame } from '../context/GameContext'
import { getGameType } from '../constants/gameTypes'
import { SuitIcon } from './Icons'
import ScoreChart from './ScoreChart'

const RANK_ICON = [Trophy, Award, Medal]
const RANK_COLOR = ['#f0a500', '#cbd5e1', '#cd7f32']

export default function GameOverScreen({ onOpenLeaderboard }) {
  const { finalResults, players, roundScores, roundDetails, mySeat } = useGame()

  const handlePlayAgain = () => window.location.reload()

  // Win parade: a generous confetti burst on mount, *louder* if this player
  // actually won. The trophy PNG also gets a slow zoom via the
  // `parade-pulse` CSS class below.
  const playedRef = useRef(false)
  useEffect(() => {
    if (playedRef.current || !finalResults) return
    playedRef.current = true
    const iWon = finalResults.winner?.seat === mySeat
    const colors = ['#f0c75a', '#fde9b8', '#a3d68a', '#daa520', '#fff8e6']
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
      <div className="min-h-screen bg-[#0d1117] flex items-center justify-center text-gray-400">
        Loading results...
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
               style={{ color: 'rgba(255,255,255,0.65)' }}>Champion</p>
            <h1 className="text-4xl sm:text-5xl font-black mb-2"
                style={{ color: '#f0a500', textShadow: '0 4px 28px rgba(0,0,0,0.85), 0 0 36px rgba(240,165,0,0.45)', fontFamily: 'Georgia, serif' }}>
              {winner?.name}
            </h1>
            <div className="inline-block rounded-xl px-5 py-1.5 text-sm font-bold backdrop-blur-md"
                 style={{ background: 'rgba(240,165,0,0.18)', border: '1px solid rgba(240,165,0,0.45)', color: '#fbe7a3' }}>
              Final Score: {finalScores?.[winner?.seat] > 0 ? '+' : ''}{finalScores?.[winner?.seat] ?? 0}
            </div>
          </div>
        </div>

        <div className="rounded-2xl overflow-hidden mb-5"
             style={{ background: 'linear-gradient(180deg, #4a2e1a 0%, #3a2316 100%)', border: '1px solid rgba(218,165,32,0.35)' }}>
          <div className="px-5 py-4" style={{ borderBottom: '1px solid rgba(218,165,32,0.32)' }}>
            <h2 className="text-base font-bold text-white">Final Rankings</h2>
          </div>
          <div>
            {allPlayers.map((p, idx) => {
              const score = finalScores?.[p.seat] ?? 0
              const RankIcon = RANK_ICON[idx]
              return (
                <div key={p.seat} className="flex items-center gap-4 px-5 py-4"
                     style={{
                       borderBottom: idx < allPlayers.length - 1 ? '1px solid rgba(147,51,234,0.12)' : 'none',
                       background: idx === 0 ? 'rgba(240,165,0,0.06)' : 'transparent',
                     }}>
                  <div className="w-8 flex items-center justify-center">
                    {RankIcon ? <RankIcon size={24} style={{ color: RANK_COLOR[idx] }} /> : null}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white">{p.name}</span>
                      {p.seat === winner?.seat && (
                        <span className="text-[10px] rounded-full px-2 py-0.5 font-bold"
                              style={{ background: 'rgba(240,165,0,0.15)', color: '#f0a500', border: '1px solid rgba(240,165,0,0.3)' }}>
                          Winner
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-2xl font-black font-mono"
                       style={{ color: score > 0 ? '#4ade80' : score < 0 ? '#f87171' : '#6b7280' }}>
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
               style={{ background: 'linear-gradient(180deg, #4a2e1a 0%, #3a2316 100%)', border: '1px solid rgba(218,165,32,0.35)' }}>
            <div className="px-5 py-4" style={{ borderBottom: '1px solid rgba(218,165,32,0.32)' }}>
              <h2 className="text-base font-bold text-white">Player Statistics</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4">
              {playerList.map(p => {
                const s = stats[p.seat] || {}
                const best = s.bestRound?.round ? `+${s.bestRound.score} (R${s.bestRound.round} ${s.bestRound.type})` : '—'
                const worst = s.worstRound?.round ? `${s.worstRound.score} (R${s.worstRound.round} ${s.worstRound.type})` : '—'
                return (
                  <div key={p.seat} className="rounded-xl p-3"
                       style={{ background: 'rgba(28,16,10,0.7)', border: '1px solid rgba(218,165,32,0.3)' }}>
                    <p className="text-xs font-black text-white mb-2">{p.name}</p>
                    <div className="space-y-1 text-[11px]">
                      <Row label="Rounds led"      value={s.roundsLed} />
                      <Row label="Tricks taken"    value={s.totalTricks} />
                      <Row label="Queens taken"    value={s.queensTaken} />
                      <Row label="Jacks taken"     value={s.jacksTaken} />
                      <Row label="Hearts taken"    value={s.heartsTaken} />
                      <Row label="King of Hearts taken" value={s.kingsOfHeartsTaken} />
                      <Row label="Best round"      value={best}  color="#4ade80" />
                      <Row label="Worst round"     value={worst} color="#f87171" />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {(roundScores.length > 0 || details.length > 0) && (
          <div className="rounded-2xl overflow-hidden mb-6"
               style={{ background: 'linear-gradient(180deg, #4a2e1a 0%, #3a2316 100%)', border: '1px solid rgba(218,165,32,0.35)' }}>
            <div className="px-5 py-4" style={{ borderBottom: '1px solid rgba(218,165,32,0.32)' }}>
              <h2 className="text-base font-bold text-white">Round Breakdown</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead style={{ background: 'rgba(218,165,32,0.1)' }}>
                  <tr>
                    <th className="px-3 py-2 text-left text-[10px] uppercase tracking-widest" style={{ color: 'rgba(218,165,32,0.7)' }}>Rnd</th>
                    <th className="px-3 py-2 text-left text-[10px] uppercase tracking-widest" style={{ color: 'rgba(218,165,32,0.7)' }}>Type</th>
                    <th className="px-3 py-2 text-left text-[10px] uppercase tracking-widest" style={{ color: 'rgba(218,165,32,0.7)' }}>Leader</th>
                    <th className="px-3 py-2 text-left text-[10px] uppercase tracking-widest" style={{ color: 'rgba(218,165,32,0.7)' }}>Trump</th>
                    {playerList.map(p => (
                      <th key={p.seat} className="px-3 py-2 text-center text-[10px] uppercase tracking-widest" style={{ color: 'rgba(218,165,32,0.7)' }}>{p.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(details.length ? details : roundScores).map((rs, idx) => {
                    const gt = getGameType(rs.gameType)
                    const TypeIcon = gt?.Icon
                    const leaderName = playerList.find(p => p.seat === rs.leaderSeat)?.name ?? '—'
                    return (
                      <tr key={idx} style={{ borderTop: '1px solid rgba(218,165,32,0.18)' }}>
                        <td className="px-3 py-2 font-mono" style={{ color: 'rgba(218,165,32,0.7)' }}>{rs.round}</td>
                        <td className="px-3 py-2">
                          <span className="inline-flex items-center gap-1 text-xs rounded-md px-1.5 py-0.5"
                                style={{ backgroundColor: `${gt?.color ?? '#555'}22`, color: gt?.color ?? '#aaa' }}>
                            {TypeIcon && <TypeIcon size={11} />} {rs.gameType}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-[11px]" style={{ color: 'rgba(167,139,250,0.7)' }}>{leaderName}</td>
                        <td className="px-3 py-2 text-[11px]"
                            style={{ color: rs.trumpSuit ? '#f0a500' : 'rgba(167,139,250,0.4)' }}>
                          {rs.trumpSuit
                            ? <span className="inline-flex items-center gap-1"><SuitIcon suit={rs.trumpSuit} size={11} mono style={{ color: '#f0a500' }} />{rs.trumpSuit}</span>
                            : '—'}
                        </td>
                        {playerList.map(p => {
                          const v = rs.scores?.[p.seat] ?? 0
                          return (
                            <td key={p.seat} className={`px-3 py-2 text-center font-mono font-semibold
                              ${v > 0 ? 'text-green-400' : v < 0 ? 'text-red-400' : 'text-gray-500'}`}>
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

        <div className="grid grid-cols-2 gap-3">
          {onOpenLeaderboard && (
            <button
              onClick={onOpenLeaderboard}
              className="py-3.5 rounded-xl font-bold text-base transition-all active:scale-95 inline-flex items-center justify-center gap-2"
              style={{
                background: 'rgba(240,165,0,0.12)',
                border: '1px solid rgba(240,165,0,0.4)',
                color: '#f0a500',
              }}
            >
              <Trophy size={16} /> Leaderboards
            </button>
          )}
          <button
            onClick={handlePlayAgain}
            className={`${onOpenLeaderboard ? '' : 'col-span-2'} py-3.5 rounded-xl font-bold text-white text-base transition-all active:scale-95 casino-btn-primary`}
          >
            Play Again
          </button>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, color }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span style={{ color: 'rgba(218,165,32,0.7)' }}>{label}</span>
      <span className="font-mono font-bold" style={{ color: color || '#e6edf3' }}>{value}</span>
    </div>
  )
}
