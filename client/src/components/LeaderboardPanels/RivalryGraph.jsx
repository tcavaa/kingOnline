import { useMemo } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from 'recharts'
import { Users } from 'lucide-react'

/**
 * Stacked bar chart of pairwise wins between every duo of friends across
 * every stored game.
 *
 *   x-axis : "Alice vs Bob" pairs
 *   each bar : 2 stacked segments, one per name in the pair, height = wins
 */
function buildPairData(games) {
  // pair-key (sorted names) -> { label, [nameA]: aWins, [nameB]: bWins }
  const map = new Map()
  for (const g of games) {
    const players = g.players || []
    if (players.length < 2 || !g.winner?.name) continue
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const A = players[i].name, B = players[j].name
        const [first, second] = [A, B].sort()
        const key = `${first}|${second}`
        const row = map.get(key) || { pair: `${first} vs ${second}`, [first]: 0, [second]: 0 }
        if (g.winner.name === first)       row[first]  = (row[first]  || 0) + 1
        else if (g.winner.name === second) row[second] = (row[second] || 0) + 1
        map.set(key, row)
      }
    }
  }
  return Array.from(map.values())
}

export default function RivalryGraph({ games }) {
  const data = useMemo(() => buildPairData(games), [games])

  // Each pair has its own pair of name keys, but recharts wants a stable set
  // of dataKeys. We collect all unique names that ever won a pair-game, sort
  // alphabetically, and render a `Bar` per name. Names not in a particular
  // pair will be 0/undefined for that row, which recharts skips automatically.
  const allNames = useMemo(() => {
    const set = new Set()
    for (const row of data) {
      for (const k of Object.keys(row)) {
        if (k !== 'pair') set.add(k)
      }
    }
    return Array.from(set).sort()
  }, [data])

  const COLOURS = ['#f0c75a', '#a3d68a', '#e8a097', '#7fa7d6', '#c084fc', '#fb923c']

  if (data.length === 0) return null

  return (
    <div className="rounded-2xl overflow-hidden mb-5 bg-leather-dark border-brass">
      <div className="px-5 py-3" style={{ borderBottom: '1px solid rgba(218,165,32,0.32)' }}>
        <h2 className="text-sm font-western uppercase text-cream inline-flex items-center gap-2">
          <Users size={14} className="text-amber" /> Rivalries
        </h2>
        <p className="text-[11px] mt-0.5 font-typewriter text-cream-dim">
          Wins between every pair of outlaws
        </p>
      </div>
      <div className="px-3 py-3">
        <ResponsiveContainer width="100%" height={Math.max(180, data.length * 32 + 60)}>
          <BarChart data={data} layout="vertical"
                    margin={{ top: 6, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(218,165,32,0.12)" />
            <XAxis type="number" stroke="#cdb87a" tick={{ fontSize: 11 }} />
            <YAxis dataKey="pair" type="category" stroke="#cdb87a"
                   width={140} tick={{ fontSize: 11 }} />
            <Tooltip
              contentStyle={{
                background: '#2c1a10',
                border: '1px solid rgba(218,165,32,0.4)',
                borderRadius: 8,
                fontSize: 12,
                color: '#fde9b8',
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {allNames.map((name, i) => (
              <Bar key={name} dataKey={name} stackId="a"
                   fill={COLOURS[i % COLOURS.length]}
                   radius={i === allNames.length - 1 ? [0, 4, 4, 0] : 0} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
