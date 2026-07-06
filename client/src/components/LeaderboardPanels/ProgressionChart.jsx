import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, ReferenceLine, Tooltip, Legend,
} from 'recharts'

const COLOURS = ['#8e2b23', '#4c7a2f', '#31536b']

/**
 * Recharts line chart of the running tally per round. Same data as
 * `ProgressionTable`, just visual.
 */
export default function ProgressionChart({ rows, players }) {
  if (!rows.length) return null
  return (
    <div className="px-3 py-3">
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={rows} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(122,83,44,0.12)" />
          <XAxis dataKey="round" stroke="rgba(59,35,20,0.6)" tick={{ fontSize: 11 }} />
          <YAxis stroke="rgba(59,35,20,0.6)" width={42} tick={{ fontSize: 11 }} />
          <ReferenceLine y={0} stroke="rgba(122,83,44,0.5)" strokeDasharray="3 3" />
          <Tooltip
            contentStyle={{
              background: '#f8efdd',
              border: '1px solid rgba(122,83,44,0.4)',
              borderRadius: 8,
              fontSize: 12,
              color: '#3b2314',
            }}
            labelFormatter={(v) => `ხელი ${v}`}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {players.map((p, i) => (
            <Line
              key={p.seat}
              dataKey={String(p.seat)}
              name={p.name}
              stroke={COLOURS[i % COLOURS.length]}
              strokeWidth={2.4}
              dot={false}
              activeDot={{ r: 4 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
