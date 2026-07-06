import {
  ResponsiveContainer, LineChart, CartesianGrid, XAxis, YAxis,
  ReferenceLine, Tooltip, Legend, Line,
} from 'recharts'
import { useGame } from '../context/GameContext'

// Duqani tri-color: wine-red, vine-green, deep-blue — readable on light parchment.
const COLORS = ['#8e2b23', '#4c7a2f', '#1f4e79']

export default function ScoreChart() {
  const { roundScores, players } = useGame()

  if (!players.length || roundScores.length === 0) return null

  const sortedPlayers = [...players].sort((a, b) => a.seat - b.seat)

  const running = { 0: 0, 1: 0, 2: 0 }
  const chartData = roundScores.map(rs => {
    sortedPlayers.forEach(p => { running[p.seat] = (running[p.seat] ?? 0) + (rs.scores?.[p.seat] ?? 0) })
    const point = { round: rs.round }
    sortedPlayers.forEach(p => { point[`p${p.seat}`] = running[p.seat] })
    return point
  })

  return (
    <div className="rounded-xl p-4"
         style={{
           background: 'linear-gradient(180deg, #f8efdd 0%, #ecd9b6 100%)',
           border: '1px solid rgba(122,83,44,0.4)',
           boxShadow: '0 4px 18px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)',
         }}>
      <h3 className="text-sm font-western uppercase tracking-wider mb-3"
          style={{ color: '#3b2314' }}>ქულების გრაფიკი</h3>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(122,83,44,0.18)" />
          <XAxis dataKey="round"
                 stroke="rgba(59,35,20,0.6)"
                 tick={{ fontSize: 11, fontFamily: 'Special Elite, Courier New, monospace' }} />
          <YAxis stroke="rgba(59,35,20,0.6)"
                 width={44}
                 tick={{ fontSize: 11, fontFamily: 'Special Elite, Courier New, monospace' }} />
          <ReferenceLine y={0} stroke="rgba(122,83,44,0.55)" strokeDasharray="3 3" />
          <Tooltip
            contentStyle={{
              background: '#f8efdd',
              border: '1px solid rgba(122,83,44,0.55)',
              borderRadius: 8,
              fontSize: 12,
              fontFamily: 'Special Elite, Courier New, monospace',
              color: '#3b2314',
            }}
            labelStyle={{ color: '#8e2b23' }}
            labelFormatter={(v) => `ხელი ${v}`}
          />
          <Legend wrapperStyle={{ fontSize: 11, color: '#3b2314', fontFamily: 'Special Elite, Courier New, monospace' }} />
          {sortedPlayers.map((p, i) => (
            <Line
              key={p.seat}
              dataKey={`p${p.seat}`}
              name={p.name}
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
