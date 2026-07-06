import { useMemo } from 'react'
import { useGame } from '../context/GameContext'
import { GAME_TYPES } from '../constants/gameTypes'

// Same duqani tri-color used by ScoreChart, indexed by sorted seat order.
const COLORS = ['#8e2b23', '#4c7a2f', '#1f4e79']

/**
 * Live win-probability bars for the current game.
 *
 * Model: across all *remaining* rounds, compute the maximum any single player
 * can gain (all Plus units) or lose (all penalty units). The total "swing" is
 * the widest gap that can still open or close between any two players. Pairwise
 * win chance is a clamped linear model over that achievable range:
 *   P(X beats O) = clamp01( (current[X] - current[O] + swing) / (2 * swing) )
 * Each player's score is the product of beating every opponent, then
 * normalised so the bars sum to 100%.
 *
 * In this engine every penalty type's best case is "take 0", so K (a single
 * target) and the count types collapse to the same magnitude formula
 * (remaining × totalUnits × |pointPerUnit|).
 */
export default function WinProbability() {
  const { players, roundScores, roundDetails, cumulativeScores } = useGame()
  const rounds = (roundDetails && roundDetails.length) ? roundDetails : roundScores

  const probs = useMemo(() => {
    if (!players || players.length === 0) return []
    const sorted = [...players].sort((a, b) => a.seat - b.seat)
    const n = sorted.length

    const totals = {}
    sorted.forEach(p => { totals[p.seat] = cumulativeScores?.[p.seat] ?? 0 })

    const playedCount = {}
    GAME_TYPES.forEach(t => { playedCount[t.code] = 0 })
    rounds.forEach(r => { if (playedCount[r.gameType] !== undefined) playedCount[r.gameType]++ })

    let maxGain = 0 // best possible remaining boost
    let maxLoss = 0 // best possible remaining drop (positive number)
    GAME_TYPES.forEach(type => {
      const remaining = Math.max(0, n - (playedCount[type.code] || 0))
      if (remaining <= 0) return
      const magnitude = remaining * type.totalUnits * Math.abs(type.pointPerUnit)
      if (type.pointPerUnit < 0) maxLoss += magnitude
      else maxGain += magnitude
    })

    const swing = maxGain + maxLoss

    if (swing === 0) {
      // No rounds left — winner is decided.
      const maxTotal = Math.max(...sorted.map(p => totals[p.seat]))
      return sorted.map((p, i) => ({
        player: p,
        prob: totals[p.seat] === maxTotal ? 1 : 0,
        color: COLORS[i % COLORS.length],
      }))
    }

    const clamp01 = v => Math.max(0, Math.min(1, v))
    const raw = sorted.map(p => {
      let prob = 1
      sorted.forEach(o => {
        if (o.seat === p.seat) return
        const gap = totals[p.seat] - totals[o.seat]
        prob *= clamp01((gap + swing) / (2 * swing))
      })
      return prob
    })

    const total = raw.reduce((a, b) => a + b, 0)
    const sum = total > 0 ? total : 1
    return sorted.map((p, i) => ({
      player: p,
      prob: raw[i] / sum,
      color: COLORS[i % COLORS.length],
    }))
  }, [players, rounds, cumulativeScores])

  if (!probs.length || rounds.length === 0) return null

  return (
    <div className="rounded-xl p-4"
         style={{
           background: 'linear-gradient(180deg, #f8efdd 0%, #ecd9b6 100%)',
           border: '1px solid rgba(122,83,44,0.4)',
           boxShadow: '0 4px 18px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)',
         }}>
      <h3 className="text-sm font-western uppercase tracking-wider mb-3"
          style={{ color: '#3b2314' }}>მოგების შანსი</h3>
      <div className="flex flex-col gap-2.5">
        {probs.map(({ player, prob, color }) => (
          <div key={player.seat} className="flex items-center gap-2">
            <div className="w-20 shrink-0 text-xs font-typewriter truncate"
                 style={{ color: '#3b2314' }}>{player.name}</div>
            <div className="flex-1 h-3 rounded-full overflow-hidden"
                 style={{ background: 'rgba(122,83,44,0.1)', border: '1px solid rgba(122,83,44,0.25)' }}>
              <div className="h-full rounded-full transition-all duration-500"
                   style={{ width: `${(prob * 100).toFixed(1)}%`, background: color }} />
            </div>
            <div className="w-10 shrink-0 text-right text-xs font-mono font-bold"
                 style={{ color }}>{(prob * 100).toFixed(0)}%</div>
          </div>
        ))}
      </div>
    </div>
  )
}
