import { Check } from 'lucide-react'
import { useGame } from '../context/GameContext'
import { GAME_TYPES } from '../constants/gameTypes'

/**
 * Rotated layout: rows = game types, columns = players. Avoids horizontal
 * scroll for the 9-column wide variant.
 */
export default function GameTypeMatrix() {
  const { players, usedTypes, chosenGameType } = useGame()

  if (!players.length) return null

  const sortedPlayers = [...players].sort((a, b) => a.seat - b.seat)

  return (
    <div className="rounded-xl overflow-hidden"
         style={{
           background: 'linear-gradient(180deg, #4a2e1a 0%, #2c1a10 100%)',
           border: '1px solid rgba(218,165,32,0.4)',
           boxShadow: '0 4px 18px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,220,170,0.1)',
         }}>
      <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(218,165,32,0.3)' }}>
        <h3 className="text-sm font-western uppercase tracking-wider" style={{ color: '#fde9b8' }}>
          Hands Played
        </h3>
        <p className="text-xs mt-0.5 font-typewriter" style={{ color: 'rgba(245,233,207,0.55)' }}>
          Each gunslinger calls all 9 hands (3 rounds × 3 players)
        </p>
      </div>
      <table className="w-full text-xs">
        <thead style={{ background: 'rgba(218,165,32,0.12)' }}>
          <tr>
            <th className="px-2 py-2 text-left font-western uppercase tracking-wider"
                style={{ color: 'rgba(218,165,32,0.85)' }}>
              Hand
            </th>
            {sortedPlayers.map(p => (
              <th key={p.seat}
                  className="px-2 py-2 text-center font-typewriter font-bold"
                  style={{ color: '#fde9b8' }}>
                <span className="block max-w-[80px] truncate mx-auto">{p.name}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {GAME_TYPES.map(t => {
            const Icon = t.Icon
            const isCurrent = chosenGameType === t.code
            return (
              <tr key={t.code} style={{ borderTop: '1px solid rgba(218,165,32,0.18)' }}>
                <td className="px-2 py-2"
                    style={{
                      ...(isCurrent ? { background: 'rgba(240,199,90,0.1)' } : {}),
                    }}>
                  <div className="inline-flex items-center gap-1.5"
                       style={{ color: t.color }}
                       title={t.name}>
                    <Icon size={13} />
                    <span className="font-western text-[11px]">{t.code}</span>
                    <span className="font-typewriter text-[10px]"
                          style={{ color: 'rgba(245,233,207,0.55)' }}>
                      {t.name}
                    </span>
                  </div>
                </td>
                {sortedPlayers.map(p => {
                  const isUsed = (usedTypes?.[p.seat] ?? []).includes(t.code)
                  return (
                    <td key={p.seat} className="px-2 py-2 text-center"
                        style={isCurrent ? { background: 'rgba(240,199,90,0.05)' } : undefined}>
                      {isUsed ? (
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded mx-auto"
                              style={{
                                backgroundColor: `${t.color}33`,
                                color: t.color,
                                ...(isCurrent ? { boxShadow: '0 0 0 1px #f0c75a' } : {}),
                              }}>
                          <Check size={12} strokeWidth={3} />
                        </span>
                      ) : (
                        <span className="inline-block w-5 h-5 rounded mx-auto"
                              style={{
                                background: 'rgba(15,8,4,0.55)',
                                border: '1px solid rgba(218,165,32,0.18)',
                              }} />
                      )}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
