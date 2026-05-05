import { useGame } from '../context/GameContext'
import { getGameType } from '../constants/gameTypes'

const POS = '#a3d68a'
const NEG = '#e8a097'
const NIL = '#a08a6a'

function scoreColor(v) { return v > 0 ? POS : v < 0 ? NEG : NIL }

function ScoreCell({ value }) {
  if (value === undefined || value === null) {
    return <td className="px-1.5 py-2 text-center font-mono" style={{ color: NIL }}>—</td>
  }
  return (
    <td className="px-1.5 py-2 text-center font-mono text-sm font-bold"
        style={{ color: scoreColor(value) }}>
      {value > 0 ? '+' : ''}{value}
    </td>
  )
}

export default function ScoreTable() {
  const { roundScores, cumulativeScores, players } = useGame()

  if (!players.length) return null

  const sortedPlayers = [...players].sort((a, b) => a.seat - b.seat)

  return (
    <div className="rounded-xl overflow-hidden"
         style={{
           background: 'linear-gradient(180deg, #4a2e1a 0%, #2c1a10 100%)',
           border: '1px solid rgba(218,165,32,0.4)',
           boxShadow: '0 4px 18px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,220,170,0.1)',
         }}>
      <div className="px-4 py-3"
           style={{ borderBottom: '1px solid rgba(218,165,32,0.3)' }}>
        <h3 className="text-sm font-western uppercase tracking-wider"
            style={{ color: '#fde9b8' }}>Tally Sheet</h3>
      </div>

      {/* Cumulative scores highlight */}
      <div className="grid grid-cols-3 gap-2 px-4 py-3"
           style={{ borderBottom: '1px solid rgba(218,165,32,0.25)', background: 'rgba(218,165,32,0.06)' }}>
        {sortedPlayers.map(p => {
          const total = cumulativeScores[p.seat] ?? 0
          return (
            <div key={p.seat} className="text-center">
              <div className="text-[10px] uppercase tracking-widest font-western truncate mb-0.5"
                   style={{ color: 'rgba(218,165,32,0.85)' }}>{p.name}</div>
              <div className="text-xl font-black font-mono"
                   style={{ color: scoreColor(total) }}>
                {total > 0 ? '+' : ''}{total}
              </div>
            </div>
          )
        })}
      </div>

      {roundScores.length === 0 ? (
        <div className="px-4 py-6 text-center text-xs font-typewriter"
             style={{ color: 'rgba(245,233,207,0.55)' }}>
          No hands played yet
        </div>
      ) : (
        // Drawer is now wide enough to fit the whole table; squeeze the
        // padding & font a little so it never needs an inner horizontal
        // scrollbar regardless of player-name length. `table-fixed` keeps
        // long names from blowing the column widths out either.
        <div>
          <table className="w-full text-xs table-fixed">
            <thead className="sticky top-0"
                   style={{ background: 'rgba(218,165,32,0.12)' }}>
              <tr>
                <th className="px-2 py-2 text-left font-western uppercase tracking-wider w-10"
                    style={{ color: 'rgba(218,165,32,0.85)' }}>Rnd</th>
                <th className="px-2 py-2 text-left font-western uppercase tracking-wider w-16"
                    style={{ color: 'rgba(218,165,32,0.85)' }}>Hand</th>
                {sortedPlayers.map(p => (
                  <th key={p.seat}
                      className="px-1.5 py-2 text-center font-western uppercase tracking-wider truncate"
                      title={p.name}
                      style={{ color: 'rgba(218,165,32,0.85)' }}>
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {roundScores.map((rs, idx) => {
                const gt = getGameType(rs.gameType)
                return (
                  <tr key={idx}
                      style={{ borderTop: '1px solid rgba(218,165,32,0.18)' }}>
                    <td className="px-2 py-2 font-mono"
                        style={{ color: 'rgba(245,233,207,0.65)' }}>{rs.round}</td>
                    <td className="px-2 py-2">
                      <span className="inline-flex items-center gap-1 text-[11px] rounded-md px-1.5 py-0.5 font-mono font-bold"
                            style={{
                              backgroundColor: `${gt?.color ?? '#8a6f4d'}22`,
                              color: gt?.color ?? '#fde9b8',
                              border: `1px solid ${gt?.color ?? '#8a6f4d'}55`,
                            }}>
                        <span>{gt?.emoji}</span>
                        <span>{rs.gameType}</span>
                      </span>
                    </td>
                    {sortedPlayers.map(p => (
                      <ScoreCell key={p.seat} value={rs.scores?.[p.seat]} />
                    ))}
                  </tr>
                )
              })}
            </tbody>
            <tfoot style={{ background: 'rgba(218,165,32,0.14)', borderTop: '2px solid rgba(218,165,32,0.45)' }}>
              <tr>
                <td className="px-2 py-2 font-western uppercase text-xs tracking-wider"
                    style={{ color: '#fde9b8' }} colSpan={2}>Total</td>
                {sortedPlayers.map(p => {
                  const total = cumulativeScores[p.seat] ?? 0
                  return (
                    <td key={p.seat}
                        className="px-1.5 py-2 text-center font-mono font-black text-sm"
                        style={{ color: scoreColor(total) }}>
                      {total > 0 ? '+' : ''}{total}
                    </td>
                  )
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
