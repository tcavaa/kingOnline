import AvatarImg from './AvatarImg'

function Row({ label, value, color }) {
  return (
    <div className="flex items-center justify-between gap-2 text-[11px]">
      <span className="text-amber-dim">{label}</span>
      <span className="font-mono font-bold" style={{ color: color || '#3b2314' }}>{value}</span>
    </div>
  )
}

/** Per-player stat cards inside a single game's detail. */
export default function PlayerStatsCards({ playerList, stats }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
      {playerList.map(p => {
        const s = stats[p.seat] || {}
        const score = p.score ?? 0
        const colour = score > 0 ? '#4c7a2f' : score < 0 ? '#a5372b' : 'rgba(59,35,20,0.6)'
        return (
          <div key={p.seat} className="rounded-xl p-3"
               style={{ background: 'rgba(236,222,196,0.85)', border: '1px solid rgba(122,83,44,0.3)' }}>
            <div className="flex items-center gap-2 mb-2">
              <AvatarImg avatar={p.avatar} size={32} />
              <span className="text-sm font-black text-ink">{p.name}</span>
            </div>
            <Row label="საბოლოო ქულა"     value={(score > 0 ? '+' : '') + score} color={colour} />
            <Row label="წაყვანილი ხელები"      value={s.roundsLed ?? 0} />
            <Row label="აღებული მინუსები"    value={s.totalTricks ?? 0} />
            <Row label="აღებული დამები"    value={s.queens ?? 0} />
            <Row label="აღებული ვალეტები"     value={s.jacks ?? 0} />
            <Row label="აღებული გულები"    value={s.hearts ?? 0} />
            <Row label="გულის მეფე"  value={s.kingsOfHearts ?? 0} />
          </div>
        )
      })}
    </div>
  )
}
