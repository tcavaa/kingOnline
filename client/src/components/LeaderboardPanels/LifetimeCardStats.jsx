import { useEffect, useState } from 'react'
import { ScrollText } from 'lucide-react'
import { Heart, Crown, Diamond, Spade } from 'lucide-react'
import { api } from '../../lib/api'
import AvatarImg from './AvatarImg'

/**
 * "Lifetime card stats" panel — fetches per-player counts from the server,
 * which scans every stored finished_game's roundDetails JSON.
 */
export default function LifetimeCardStats({ players }) {
  const [byName, setByName] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    Promise.all(players.map(p => api.getLifetimeStats(p.name).catch(() => null)))
      .then(results => {
        if (cancelled) return
        const map = {}
        players.forEach((p, i) => { if (results[i]) map[p.name] = results[i] })
        setByName(map)
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [players])

  if (!players.length) return null

  return (
    <div className="rounded-2xl overflow-hidden mb-5 bg-leather-dark border-brass">
      <div className="px-5 py-3" style={{ borderBottom: '1px solid rgba(122,83,44,0.32)' }}>
        <h2 className="text-sm font-western uppercase text-cream inline-flex items-center gap-2">
          <ScrollText size={14} className="text-amber" /> საერთო სტატისტიკა
        </h2>
        <p className="text-[11px] mt-0.5 font-typewriter text-cream-dim">
          დუქნის დავთარში ჩაწერილი ყველა თამაშიდან
        </p>
      </div>
      {loading ? (
        <div className="p-6 text-center text-sm font-typewriter text-cream-dim">
          დავთარს ვფურცლავთ…
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4">
          {players.map(p => {
            const s = byName[p.name] || {
              kingsOfHearts: 0, queens: 0, jacks: 0, hearts: 0,
              gamesPlayed: 0, wins: 0, totalScore: 0,
            }
            return (
              <div key={p.name} className="rounded-xl p-3"
                   style={{ background: 'rgba(236,222,196,0.85)', border: '1px solid rgba(122,83,44,0.3)' }}>
                <div className="flex items-center gap-2 mb-2">
                  <AvatarImg avatar={p.avatar} size={32} />
                  <span className="text-sm font-black text-ink">{p.name}</span>
                </div>
                <Stat icon={Crown}   label="გულის მეფე ♥"   value={s.kingsOfHearts} />
                <Stat icon={Diamond} label="აღებული დამები" value={s.queens} />
                <Stat icon={Spade}   label="აღებული ვალეტები"  value={s.jacks} />
                <Stat icon={Heart}   label="აღებული გულები" value={s.hearts} />
                <div className="border-t mt-2 pt-2 text-[10px] font-typewriter text-cream-dim"
                     style={{ borderColor: 'rgba(122,83,44,0.2)' }}>
                  {s.gamesPlayed} თამაში · {s.wins} მოგება · ჯამში {s.totalScore > 0 ? '+' : ''}{s.totalScore}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center justify-between text-[11px] mb-1">
      <span className="inline-flex items-center gap-1.5 text-amber-dim">
        <Icon size={11} /> {label}
      </span>
      <span className="font-mono font-bold text-cream">{value ?? 0}</span>
    </div>
  )
}
