import { useMemo } from 'react'
import { Trophy } from 'lucide-react'
import AchievementBadges from '../AchievementBadges'
import { computePerGameAchievements, countCodes } from '../../utils/achievements'

/** Small ლიგა/უბრალო pill shown on each game row (and the detail header). */
export function GameModeTag({ isChampionship, className = '' }) {
  const championship = isChampionship !== false // records without the flag are legacy championship games
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold font-typewriter flex-shrink-0 ${className}`}
      style={championship
        ? { background: 'rgba(184,134,11,0.14)', border: '1px solid rgba(184,134,11,0.5)', color: '#b8860b' }
        : { background: 'rgba(122,83,44,0.1)', border: '1px solid rgba(122,83,44,0.35)', color: '#7a532c' }}
    >
      {championship ? <>🏆 ლიგა</> : <>🎲 უბრალო</>}
    </span>
  )
}

/** Clickable list of past games on the main leaderboard. */
export default function PastGamesList({ loading, games, onSelect }) {
  // Precompute { [gameId]: { [playerName]: { [code]: count } } } once.
  const byGame = useMemo(() => {
    const map = {}
    for (const g of games || []) {
      const players = g.players || []
      const rounds = g.roundDetails || []
      if (!players.length || !rounds.length) continue
      const perSeat = computePerGameAchievements(players, rounds)
      const perName = {}
      players.forEach(p => {
        const codes = perSeat[p.seat] || []
        if (codes.length) perName[p.name] = countCodes(codes)
      })
      if (Object.keys(perName).length) map[g.id] = perName
    }
    return map
  }, [games])

  return (
    <div className="rounded-2xl overflow-hidden bg-leather-dark border-brass">
      <div className="px-5 py-3" style={{ borderBottom: '1px solid rgba(122,83,44,0.32)' }}>
        <h2 className="text-sm font-western uppercase text-cream">ძველი თამაშები</h2>
      </div>
      {loading ? (
        <div className="p-8 text-center text-sm font-typewriter text-cream-dim">
          დუქნის დავთარს ვქექავთ…
        </div>
      ) : games.length === 0 ? (
        <div className="p-8 text-center text-sm text-cream-dim">
          ჯერ არც ერთი თამაში არ არის. დაამთავრე თამაში და აქ გამოჩნდება.
        </div>
      ) : (
        <div>
          {games.map(g => {
            const score = g.winner?.score ?? 0
            const earned = byGame[g.id]
            return (
              <button key={g.id} onClick={() => onSelect(g)}
                      className="w-full flex items-center gap-3 px-5 py-3 text-left transition-all hover:bg-white/5"
                      style={{ borderTop: '1px solid rgba(122,83,44,0.18)' }}>
                <Trophy size={18} className="text-amber" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-western uppercase text-cream flex items-center gap-2 flex-wrap">
                    <span>
                      {(g.winners?.length ?? 0) > 1
                        ? <>🤝 ფრე: {g.winners.map(w => w.name).join(' & ')}</>
                        : <>გამარჯვებული: {g.winner?.name}</>}
                    </span>
                    <GameModeTag isChampionship={g.isChampionship} />
                  </div>
                  <div className="text-[11px] text-cream-dim">
                    {new Date(g.playedAt).toLocaleString()} · {g.players?.length} მოთამაშე
                  </div>
                  {earned && (
                    <div className="mt-1 flex flex-col gap-0.5">
                      {Object.entries(earned).map(([name, codes]) => (
                        <div key={name} className="flex items-center gap-1.5 text-[11px] text-cream-dim">
                          <span className="font-bold text-cream truncate max-w-[6rem]">{name}:</span>
                          <AchievementBadges achievements={codes} variant="inline" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="text-sm font-mono font-bold score-pos-soft">
                  {score > 0 ? '+' : ''}{score}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
