import { useMemo, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { GAME_TYPES, getGameType } from '../../constants/gameTypes'

/**
 * Per-game-type performance for the chosen player.
 *
 * For each of the 9 game types we average their score across every game
 * they've played, plus track best/worst single-round score in that type.
 */
function buildPerf(games, playerName) {
  const perType = {}
  for (const code of GAME_TYPES.map(t => t.code)) {
    perType[code] = { code, count: 0, total: 0, best: -Infinity, worst: Infinity }
  }
  for (const g of games) {
    const me = (g.players || []).find(p => p.name === playerName)
    if (!me) continue
    for (const d of g.roundDetails || []) {
      const code = d.gameType
      if (!perType[code]) continue
      const s = d.scores?.[me.seat] ?? 0
      perType[code].count += 1
      perType[code].total += s
      if (s > perType[code].best)  perType[code].best  = s
      if (s < perType[code].worst) perType[code].worst = s
    }
  }
  return Object.values(perType)
    .filter(t => t.count > 0)
    .map(t => ({ ...t, avg: t.total / t.count }))
}

export default function GameTypePerformance({ games, players }) {
  const [me, setMe] = useState(players[0]?.name || '')
  const rows = useMemo(() => buildPerf(games, me), [games, me])

  const sorted = useMemo(() => [...rows].sort((a, b) => b.avg - a.avg), [rows])

  if (!players.length) return null

  return (
    <div className="rounded-2xl overflow-hidden mb-5 bg-leather-dark border-brass">
      <div className="px-5 py-3 flex items-center justify-between"
           style={{ borderBottom: '1px solid rgba(218,165,32,0.32)' }}>
        <h2 className="text-sm font-western uppercase text-cream inline-flex items-center gap-2">
          <Sparkles size={14} className="text-amber" /> Hand Performance
        </h2>
        <select value={me} onChange={e => setMe(e.target.value)}
                className="casino-input text-xs font-typewriter px-2 py-1 max-w-[160px]"
                style={{ width: 'auto' }}>
          {players.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
        </select>
      </div>
      {sorted.length === 0 ? (
        <div className="p-6 text-center text-sm font-typewriter text-cream-dim">
          {me} hasn't played any rounds yet.
        </div>
      ) : (
        <table className="w-full text-xs">
          <thead style={{ background: 'rgba(218,165,32,0.1)' }}>
            <tr>
              <th className="px-3 py-2 text-left">Hand</th>
              <th className="px-3 py-2 text-center">Played</th>
              <th className="px-3 py-2 text-center">Avg</th>
              <th className="px-3 py-2 text-center">Best</th>
              <th className="px-3 py-2 text-center">Worst</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(r => {
              const gt = getGameType(r.code)
              const Icon = gt?.Icon
              const avgRounded = Math.round(r.avg * 10) / 10
              const avgCls = r.avg > 0 ? 'text-green-400' : r.avg < 0 ? 'text-red-400' : 'text-gray-500'
              return (
                <tr key={r.code} style={{ borderTop: '1px solid rgba(218,165,32,0.18)' }}>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1.5 font-typewriter"
                          style={{ color: gt?.color }}>
                      {Icon && <Icon size={11} />} {gt?.name || r.code}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center font-mono">{r.count}</td>
                  <td className={`px-3 py-2 text-center font-mono font-bold ${avgCls}`}>
                    {avgRounded > 0 ? '+' : ''}{avgRounded}
                  </td>
                  <td className="px-3 py-2 text-center font-mono text-green-400">
                    {r.best > -Infinity ? (r.best > 0 ? '+' : '') + r.best : '—'}
                  </td>
                  <td className="px-3 py-2 text-center font-mono text-red-400">
                    {r.worst < Infinity ? (r.worst > 0 ? '+' : '') + r.worst : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
