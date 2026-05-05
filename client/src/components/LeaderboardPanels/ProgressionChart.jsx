import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, ReferenceLine, Tooltip, Legend,
} from 'recharts'

const COLOURS = ['#f0c75a', '#a3d68a', '#e8a097']

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
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(218,165,32,0.12)" />
          <XAxis dataKey="round" stroke="#cdb87a" tick={{ fontSize: 11 }} />
          <YAxis stroke="#cdb87a" width={42} tick={{ fontSize: 11 }} />
          <ReferenceLine y={0} stroke="rgba(218,165,32,0.5)" strokeDasharray="3 3" />
          <Tooltip
            contentStyle={{
              background: '#2c1a10',
              border: '1px solid rgba(218,165,32,0.4)',
              borderRadius: 8,
              fontSize: 12,
              color: '#fde9b8',
            }}
            labelFormatter={(v) => `Round ${v}`}
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
