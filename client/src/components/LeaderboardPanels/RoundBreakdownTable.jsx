import { getGameType } from '../../constants/gameTypes'
import { SuitIcon } from '../Icons'

/** Per-round breakdown table inside a single game's detail view. */
export default function RoundBreakdownTable({ details, playerList }) {
  if (!details.length) return null
  return (
    <div className="rounded-2xl overflow-hidden mb-5 bg-leather-dark border-brass">
      <div className="px-5 py-3" style={{ borderBottom: '1px solid rgba(218,165,32,0.32)' }}>
        <h2 className="text-sm font-western uppercase text-cream">Round Breakdown</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead style={{ background: 'rgba(218,165,32,0.1)' }}>
            <tr>
              <th className="px-3 py-2 text-left">Rnd</th>
              <th className="px-3 py-2 text-left">Type</th>
              <th className="px-3 py-2 text-left">Trump</th>
              {playerList.map(p => <th key={p.seat} className="px-3 py-2 text-center">{p.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {details.map((d, idx) => {
              const gt = getGameType(d.gameType)
              const TypeIcon = gt?.Icon
              return (
                <tr key={idx} style={{ borderTop: '1px solid rgba(218,165,32,0.18)' }}>
                  <td className="px-3 py-2 font-mono text-amber-dim">{d.round}</td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1 text-xs rounded-md px-1.5 py-0.5"
                          style={{ backgroundColor: `${gt?.color ?? '#555'}22`, color: gt?.color ?? '#aaa' }}>
                      {TypeIcon && <TypeIcon size={10} />} {d.gameType}
                    </span>
                  </td>
                  <td className="px-3 py-2"
                      style={{ color: d.trumpSuit ? '#f0a500' : 'rgba(167,139,250,0.4)' }}>
                    {d.trumpSuit
                      ? <span className="inline-flex items-center gap-1">
                          <SuitIcon suit={d.trumpSuit} size={10} mono style={{ color: '#f0a500' }} />
                          {d.trumpSuit}
                        </span>
                      : '—'}
                  </td>
                  {playerList.map(p => {
                    const v = d.scores?.[p.seat] ?? 0
                    const cls = v > 0 ? 'text-green-400' : v < 0 ? 'text-red-400' : 'text-gray-500'
                    return (
                      <td key={p.seat} className={`px-3 py-2 text-center font-mono font-semibold ${cls}`}>
                        {v > 0 ? '+' : ''}{v}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
