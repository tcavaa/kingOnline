import { useMemo } from 'react'
import AvatarImg from './AvatarImg'
import AchievementBadges from '../AchievementBadges'
import { computeAllLifetimeAchievements } from '../../utils/achievements'

/**
 * Lifetime achievements per player, computed on the fly from every stored
 * game's roundDetails + results. Players with no achievements are omitted.
 */
export default function AchievementsPanel({ games = [], players = [] }) {
  const lifetime = useMemo(() => computeAllLifetimeAchievements(games), [games])

  // Order by the aggregated table (wins, then total score) for a stable layout;
  // fall back to alphabetical for any name not in the aggregate.
  const order = useMemo(() => {
    const idx = new Map()
    players.forEach((p, i) => idx.set(p.name, i))
    return Object.keys(lifetime).sort((a, b) => {
      const ia = idx.has(a) ? idx.get(a) : Infinity
      const ib = idx.has(b) ? idx.get(b) : Infinity
      if (ia !== ib) return ia - ib
      return a.localeCompare(b)
    })
  }, [lifetime, players])

  if (!order.length) return null

  const avatarOf = name => players.find(p => p.name === name)?.avatar || null

  return (
    <div className="rounded-2xl overflow-hidden mb-5 bg-leather-dark border-brass">
      <div className="px-5 py-3" style={{ borderBottom: '1px solid rgba(218,165,32,0.32)' }}>
        <h2 className="text-sm font-western uppercase text-cream">Achievements</h2>
      </div>
      <div className="p-4 flex flex-col gap-4">
        {order.map(name => (
          <div key={name}>
            <div className="flex items-center gap-2 mb-2">
              <AvatarImg avatar={avatarOf(name)} size={24} />
              <span className="font-bold text-white text-sm">{name}</span>
            </div>
            <AchievementBadges achievements={lifetime[name]} />
          </div>
        ))}
      </div>
    </div>
  )
}
