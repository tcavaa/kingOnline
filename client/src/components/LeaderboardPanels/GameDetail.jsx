import { useMemo } from 'react'
import { ArrowLeft } from 'lucide-react'
import PodiumView          from './PodiumView'
import PlayerStatsCards    from './PlayerStatsCards'
import RoundBreakdownTable from './RoundBreakdownTable'
import ProgressionTable    from './ProgressionTable'
import ProgressionChart    from './ProgressionChart'
import AchievementBadges   from '../AchievementBadges'
import { computePerGameAchievements, countCodes } from '../../utils/achievements'

/** Detail page for one finished game. */
export default function GameDetail({ game, onBack }) {
  const sortedPlayers = useMemo(
    () => [...(game.players || [])].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)),
    [game]
  )
  const playerList = [...(game.players || [])].sort((a, b) => a.seat - b.seat)
  const details = game.roundDetails || []

  // Running cumulative score per round.
  const progression = useMemo(() => {
    const running = {}
    playerList.forEach(p => running[p.seat] = 0)
    return details.map(d => {
      const point = { round: d.round }
      playerList.forEach(p => {
        running[p.seat] = (running[p.seat] || 0) + (d.scores?.[p.seat] ?? 0)
        point[p.seat] = running[p.seat]
      })
      return point
    })
  }, [details, playerList])

  // Per-player stats — only count items in the rounds where they actually
  // mattered (queens during 'Q' rounds, K♥ during 'K', etc.) so totals can
  // never exceed the in-game maximums (3 K♥ events, 12 queens, 12 jacks,
  // 24 hearts across a full game).
  const stats = useMemo(() => {
    const tally = {}
    playerList.forEach(p => {
      tally[p.seat] = {
        roundsLed: 0, totalTricks: 0, queens: 0, jacks: 0, hearts: 0, kingsOfHearts: 0,
      }
    })
    details.forEach(d => {
      if (tally[d.leaderSeat]) tally[d.leaderSeat].roundsLed++
      for (const seat of [0, 1, 2]) {
        if (!tally[seat]) continue
        tally[seat].totalTricks += d.tricksTaken?.[seat] ?? 0
        if (d.gameType === 'Q') tally[seat].queens += d.queensTaken?.[seat] ?? 0
        if (d.gameType === 'J') tally[seat].jacks  += d.jacksTaken?.[seat]  ?? 0
        if (d.gameType === 'H') tally[seat].hearts += d.heartsTaken?.[seat] ?? 0
        if (d.gameType === 'K' && d.kingOfHeartsTakenBy === seat) tally[seat].kingsOfHearts++
      }
    })
    return tally
  }, [details, playerList])

  const achievements = useMemo(
    () => computePerGameAchievements(playerList, details),
    [playerList, details]
  )
  const achieversList = playerList.filter(p => (achievements[p.seat] || []).length > 0)

  return (
    <div className="w-full max-w-3xl">
      <button onClick={onBack}
              className="mb-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold"
              style={{ background: 'rgba(122,83,44,0.1)', border: '1px solid rgba(122,83,44,0.3)', color: '#3b2314' }}>
        <ArrowLeft size={14} /> უკან ყველა თამაშთან
      </button>

      <PodiumView game={game} sortedPlayers={sortedPlayers} />

      <PlayerStatsCards playerList={playerList} stats={stats} />

      {achieversList.length > 0 && (
        <div className="rounded-2xl overflow-hidden mb-5 bg-leather-dark border-brass">
          <div className="px-5 py-3" style={{ borderBottom: '1px solid rgba(122,83,44,0.32)' }}>
            <h2 className="text-sm font-western uppercase text-cream">მიღწევები</h2>
          </div>
          <div className="p-4 flex flex-col gap-4">
            {achieversList.map(p => (
              <div key={p.seat}>
                <p className="text-xs font-black text-ink mb-2">{p.name}</p>
                <AchievementBadges achievements={countCodes(achievements[p.seat] || [])} />
              </div>
            ))}
          </div>
        </div>
      )}

      <RoundBreakdownTable details={details} playerList={playerList} />

      {/* Tally Trail — the cumulative line chart + table */}
      {progression.length >= 1 && (
        <div className="rounded-2xl overflow-hidden mb-5 bg-leather-dark border-brass">
          <div className="px-5 py-3" style={{ borderBottom: '1px solid rgba(122,83,44,0.32)' }}>
            <h2 className="text-sm font-western uppercase text-cream">პროგრესი</h2>
            <p className="text-[11px] mt-0.5 font-typewriter text-cream-dim">
              ჯამური ქულა ყოველი ხელის შემდეგ
            </p>
          </div>
          {progression.length >= 2 && (
            <ProgressionChart rows={progression} players={playerList} />
          )}
          <ProgressionTable rows={progression} players={playerList} />
        </div>
      )}
    </div>
  )
}
