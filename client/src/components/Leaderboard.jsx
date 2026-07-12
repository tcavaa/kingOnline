import { useEffect, useMemo, useState } from 'react'
import { Trophy, ArrowLeft } from 'lucide-react'
import { listGames, aggregatePlayers } from '../lib/leaderboard'
import PodiumView           from './LeaderboardPanels/PodiumView'
import PlayersTable         from './LeaderboardPanels/PlayersTable'
import PastGamesList        from './LeaderboardPanels/PastGamesList'
import HeadToHeadPanel      from './LeaderboardPanels/HeadToHeadPanel'
import GameTypePerformance  from './LeaderboardPanels/GameTypePerformance'
import RivalryGraph         from './LeaderboardPanels/RivalryGraph'
import LifetimeCardStats    from './LeaderboardPanels/LifetimeCardStats'
import AchievementsPanel    from './LeaderboardPanels/AchievementsPanel'
import GameDetail           from './LeaderboardPanels/GameDetail'

/** Hall of Fame — orchestrator only; every panel lives in its own file. */
export default function Leaderboard({ onBack }) {
  const [games, setGames] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const aggregated = useMemo(() => aggregatePlayers(games), [games])

  useEffect(() => {
    let cancelled = false
    // Hall of Fame needs the full game history for accurate per-player
    // aggregates, head-to-head graphs, and lifetime card stats — not just
    // the most recent batch. `limit=all` bypasses the 200-row default cap.
    listGames('all')
      .then(list => { if (!cancelled) setGames(Array.isArray(list) ? list : []) })
      .catch(err => console.warn('[leaderboard] failed to load games:', err.message))
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  return (
    <div className="saloon-bg min-h-screen flex flex-col items-center px-4 py-8">
      {/* Hero podium banner */}
      <div className="w-full max-w-3xl mb-5 relative rounded-2xl overflow-hidden"
           style={{ aspectRatio: '1280 / 480', border: '1px solid rgba(122,83,44,0.25)' }}>
        <img src="/trophy-podium.webp" alt=""
             className="absolute inset-0 w-full h-full object-cover object-[center_42%]" />
        <div className="absolute inset-0"
             style={{ background: 'linear-gradient(180deg, rgba(246,234,208,0) 35%, rgba(246,234,208,0.9) 100%)' }} />
        <div className="absolute inset-0 flex items-end justify-between px-5 pb-4">
          <button onClick={onBack}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold backdrop-blur-md"
                  style={{ background: 'rgba(248,239,221,0.8)', border: '1px solid rgba(122,83,44,0.4)', color: '#3b2314' }}>
            <ArrowLeft size={14} /> უკან
          </button>
          <h1 className="text-3xl sm:text-4xl font-western inline-flex items-center gap-3"
              style={{ color: '#8e2b23', textShadow: '0 4px 24px rgba(58,36,24,0.25), 0 2px 0 rgba(255,255,255,0.55)' }}>
            <Trophy size={32} className="parade-pulse"
                    style={{ color: '#6f4e1e', fill: 'rgba(111,78,30,0.25)', filter: 'drop-shadow(0 1px 2px rgba(58,36,24,0.35))' }} />
            დიდების დარბაზი
          </h1>
          <span aria-hidden className="w-[88px]" />
        </div>
      </div>

      {selected ? (
        <GameDetail game={selected} onBack={() => setSelected(null)} />
      ) : (
        <div className="w-full max-w-3xl">
          {/* All-time aggregate top 3 */}
          {aggregated.length > 0 && (
            <PodiumView
              game={{ playedAt: new Date().toISOString() }}
              sortedPlayers={aggregated.slice(0, 3).map(a => ({
                name: a.name, avatar: a.avatar, score: a.totalScore,
              }))}
            />
          )}

          <PlayersTable aggregated={aggregated} />

          {games.length > 0 && (
            <AchievementsPanel games={games} players={aggregated} />
          )}

          {/* Per-player insight panels (only render once we have ≥1 game) */}
          {aggregated.length > 1 && games.length > 0 && (
            <>
              <HeadToHeadPanel    games={games} players={aggregated} />
              <GameTypePerformance games={games} players={aggregated} />
              <RivalryGraph        games={games} />
              <LifetimeCardStats   players={aggregated} />
            </>
          )}

          <PastGamesList loading={loading} games={games} onSelect={setSelected} />
        </div>
      )}
    </div>
  )
}
