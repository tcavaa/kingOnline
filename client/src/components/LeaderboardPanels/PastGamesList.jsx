import { Trophy } from 'lucide-react'

/** Clickable list of past games on the main leaderboard. */
export default function PastGamesList({ loading, games, onSelect }) {
  return (
    <div className="rounded-2xl overflow-hidden bg-leather-dark border-brass">
      <div className="px-5 py-3" style={{ borderBottom: '1px solid rgba(218,165,32,0.32)' }}>
        <h2 className="text-sm font-western uppercase text-cream">Past Games</h2>
      </div>
      {loading ? (
        <div className="p-8 text-center text-sm font-typewriter text-cream-dim">
          Diggin' through the saloon ledger…
        </div>
      ) : games.length === 0 ? (
        <div className="p-8 text-center text-sm text-cream-dim">
          No games played yet. Finish a game to see it here.
        </div>
      ) : (
        <div>
          {games.map(g => {
            const score = g.winner?.score ?? 0
            return (
              <button key={g.id} onClick={() => onSelect(g)}
                      className="w-full flex items-center gap-3 px-5 py-3 text-left transition-all hover:bg-white/5"
                      style={{ borderTop: '1px solid rgba(218,165,32,0.18)' }}>
                <Trophy size={18} className="text-amber" />
                <div className="flex-1">
                  <div className="text-sm font-western uppercase text-cream">{g.winner?.name} won</div>
                  <div className="text-[11px] text-cream-dim">
                    {new Date(g.playedAt).toLocaleString()} · {g.players?.length} players
                  </div>
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
