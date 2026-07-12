import { getGameType } from '../../constants/gameTypes'
import { SuitIcon } from '../Icons'
import { scoreColorClass } from '../../utils/scoreColor'

/** Per-round breakdown table inside a single game's detail view. */
export default function RoundBreakdownTable({ details, playerList }) {
  if (!details.length) return null
  return (
    <div className="rounded-2xl overflow-hidden mb-5 bg-leather-dark border-brass">
      <div className="px-5 py-3" style={{ borderBottom: '1px solid rgba(122,83,44,0.32)' }}>
        <h2 className="text-sm font-western uppercase text-cream">ხელების ჩაშლა</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead style={{ background: 'rgba(142,43,35,0.07)' }}>
            <tr>
              <th className="px-3 py-2 text-left">ხელი</th>
              <th className="px-3 py-2 text-left">ტიპი</th>
              <th className="px-3 py-2 text-left">კოზირი</th>
              {playerList.map(p => <th key={p.seat} className="px-3 py-2 text-center">{p.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {details.map((d, idx) => {
              const gt = getGameType(d.gameType)
              const TypeIcon = gt?.Icon
              return (
                <tr key={idx} style={{ borderTop: '1px solid rgba(122,83,44,0.18)' }}>
                  <td className="px-3 py-2 font-mono text-amber-dim">{d.round}</td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1 text-xs rounded-md px-1.5 py-0.5"
                          style={{ backgroundColor: `${gt?.color ?? '#555'}22`, color: gt?.color ?? '#7a532c' }}>
                      {TypeIcon && <TypeIcon size={10} />} {d.gameType}
                    </span>
                  </td>
                  <td className="px-3 py-2"
                      style={{ color: d.trumpSuit ? '#8e2b23' : 'rgba(59,35,20,0.35)' }}>
                    {d.trumpSuit
                      ? <span className="inline-flex items-center gap-1">
                          <SuitIcon suit={d.trumpSuit} size={10} mono style={{ color: '#8e2b23' }} />
                          {d.trumpSuit}
                        </span>
                      : '—'}
                  </td>
                  {playerList.map(p => {
                    const v = d.scores?.[p.seat] ?? 0
                    const cls = scoreColorClass(v)
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
