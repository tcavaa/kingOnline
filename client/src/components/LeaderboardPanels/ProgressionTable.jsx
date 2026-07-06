/** Running cumulative score per round (the Tally Trail table). */
export default function ProgressionTable({ rows, players }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead style={{ background: 'rgba(142,43,35,0.07)' }}>
          <tr>
            <th className="px-3 py-2 text-left">ხელი</th>
            {players.map(p => <th key={p.seat} className="px-3 py-2 text-center">{p.name}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderTop: '1px solid rgba(122,83,44,0.18)' }}>
              <td className="px-3 py-2 font-mono text-amber-dim">{r.round}</td>
              {players.map(p => {
                const v = r[p.seat] ?? 0
                const cls = v > 0 ? 'score-pos-soft' : v < 0 ? 'score-neg-soft' : 'text-cream-dim'
                return (
                  <td key={p.seat} className={`px-3 py-2 text-center font-mono font-semibold ${cls}`}>
                    {v > 0 ? '+' : ''}{v}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
