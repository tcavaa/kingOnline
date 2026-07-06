import AvatarImg from './AvatarImg'

/** Lifetime "All Players" table on the main leaderboard. */
export default function PlayersTable({ aggregated }) {
  if (!aggregated.length) return null
  return (
    <div className="rounded-2xl overflow-hidden mb-5 bg-leather-dark border-brass">
      <div className="px-5 py-3" style={{ borderBottom: '1px solid rgba(122,83,44,0.32)' }}>
        <h2 className="text-sm font-western uppercase text-cream">ყველა მოთამაშე (საერთო)</h2>
      </div>
      <table className="w-full text-xs">
        <thead style={{ background: 'rgba(142,43,35,0.07)' }}>
          <tr>
            <th className="px-3 py-2 text-left">#</th>
            <th className="px-3 py-2 text-left">მოთამაშე</th>
            <th className="px-3 py-2 text-center">თამაშები</th>
            <th className="px-3 py-2 text-center">მოგებები</th>
            <th className="px-3 py-2 text-center">ჯამური ქულა</th>
          </tr>
        </thead>
        <tbody>
          {aggregated.map((a, i) => {
            const cls = a.totalScore > 0 ? 'score-pos-soft'
                      : a.totalScore < 0 ? 'score-neg-soft' : 'text-cream-dim'
            return (
              <tr key={a.name} style={{ borderTop: '1px solid rgba(122,83,44,0.18)' }}>
                <td className="px-3 py-2 font-mono text-amber-dim">{i + 1}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <AvatarImg avatar={a.avatar} size={24} />
                    <span className="font-bold text-ink">{a.name}</span>
                  </div>
                </td>
                <td className="px-3 py-2 text-center font-mono">{a.gamesPlayed}</td>
                <td className="px-3 py-2 text-center font-mono font-bold" style={{ color: '#8e2b23' }}>{a.wins}</td>
                <td className={`px-3 py-2 text-center font-mono font-semibold ${cls}`}>
                  {a.totalScore > 0 ? '+' : ''}{a.totalScore}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
