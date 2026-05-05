import AvatarImg from './AvatarImg'

function Row({ label, value, color }) {
  return (
    <div className="flex items-center justify-between gap-2 text-[11px]">
      <span className="text-amber-dim">{label}</span>
      <span className="font-mono font-bold" style={{ color: color || '#fde9b8' }}>{value}</span>
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
        const colour = score > 0 ? '#4ade80' : score < 0 ? '#f87171' : '#9ca3af'
        return (
          <div key={p.seat} className="rounded-xl p-3"
               style={{ background: 'rgba(28,16,10,0.7)', border: '1px solid rgba(218,165,32,0.3)' }}>
            <div className="flex items-center gap-2 mb-2">
              <AvatarImg avatar={p.avatar} size={32} />
              <span className="text-sm font-black text-white">{p.name}</span>
            </div>
            <Row label="Final score"     value={(score > 0 ? '+' : '') + score} color={colour} />
            <Row label="Rounds led"      value={s.roundsLed ?? 0} />
            <Row label="Tricks taken"    value={s.totalTricks ?? 0} />
            <Row label="Queens taken"    value={s.queens ?? 0} />
            <Row label="Jacks taken"     value={s.jacks ?? 0} />
            <Row label="Hearts taken"    value={s.hearts ?? 0} />
            <Row label="King of Hearts"  value={s.kingsOfHearts ?? 0} />
          </div>
        )
      })}
    </div>
  )
}
