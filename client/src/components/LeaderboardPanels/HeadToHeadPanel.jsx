import { useMemo, useState } from 'react'
import AvatarImg from './AvatarImg'
import { Swords } from 'lucide-react'

/**
 * "You vs Ramaz" panel: select a player from the dropdown and see your record
 * against everyone else, computed from the games array.
 */
function buildH2H(games) {
  // pair-key (sorted player names) -> { a, b, aWins, bWins, aTotal, bTotal,
  //                                     aBest, bBest, gamesShared }
  const map = new Map()
  for (const g of games) {
    const players = g.players || []
    if (players.length < 2) continue
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const A = players[i], B = players[j]
        const [first, second] = [A.name, B.name].sort()
        const key = `${first}${second}`
        const Afirst = first === A.name
        const row = map.get(key) || {
          a: first, b: second, aWins: 0, bWins: 0, aTotal: 0, bTotal: 0,
          aBest: -Infinity, bBest: -Infinity, gamesShared: 0,
        }
        row.gamesShared += 1
        const aScore = Afirst ? (A.score ?? 0) : (B.score ?? 0)
        const bScore = Afirst ? (B.score ?? 0) : (A.score ?? 0)
        row.aTotal += aScore
        row.bTotal += bScore
        if (aScore > row.aBest) row.aBest = aScore
        if (bScore > row.bBest) row.bBest = bScore
        if (g.winner?.name === row.a)      row.aWins += 1
        else if (g.winner?.name === row.b) row.bWins += 1
        map.set(key, row)
      }
    }
  }
  return Array.from(map.values())
}

export default function HeadToHeadPanel({ games, players }) {
  const [me, setMe] = useState(players[0]?.name || '')
  const h2h = useMemo(() => buildH2H(games), [games])

  // Filter rows to those involving "me" and orient them so "me" is on the left.
  const mine = useMemo(() => {
    if (!me) return []
    return h2h
      .filter(r => r.a === me || r.b === me)
      .map(r => r.a === me
        ? { other: r.b, avatarOf: r.b, wins: r.aWins, losses: r.bWins, total: r.aTotal, best: r.aBest, games: r.gamesShared }
        : { other: r.a, avatarOf: r.a, wins: r.bWins, losses: r.aWins, total: r.bTotal, best: r.bBest, games: r.gamesShared })
      .sort((x, y) => y.games - x.games)
  }, [h2h, me])

  // Find avatars by name (best-effort lookup).
  const avatarFor = (name) => {
    for (const g of games) {
      const p = (g.players || []).find(pp => pp.name === name)
      if (p?.avatar) return p.avatar
    }
    return null
  }

  if (!players.length) return null

  return (
    <div className="rounded-2xl overflow-hidden mb-5 bg-leather-dark border-brass">
      <div className="px-5 py-3 flex items-center justify-between"
           style={{ borderBottom: '1px solid rgba(122,83,44,0.32)' }}>
        <h2 className="text-sm font-western uppercase text-cream inline-flex items-center gap-2">
          <Swords size={14} className="text-amber" /> პირისპირ
        </h2>
        <select value={me} onChange={e => setMe(e.target.value)}
                className="casino-input text-xs font-typewriter px-2 py-1 max-w-[160px]"
                style={{ width: 'auto' }}>
          {players.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
        </select>
      </div>
      {mine.length === 0 ? (
        <div className="p-6 text-center text-sm font-typewriter text-cream-dim">
          {me || '—'}-ს ჯერ საერთო თამაშები არ აქვს.
        </div>
      ) : (
        <table className="w-full text-xs">
          <thead style={{ background: 'rgba(142,43,35,0.07)' }}>
            <tr>
              <th className="px-3 py-2 text-left">მეტოქე</th>
              <th className="px-3 py-2 text-center">თამაშები</th>
              <th className="px-3 py-2 text-center">მოგ.&nbsp;–&nbsp;წაგ.</th>
              <th className="px-3 py-2 text-center">ჯამური Δ</th>
              <th className="px-3 py-2 text-center">საუკეთესო ხელი მის წინააღმდეგ</th>
            </tr>
          </thead>
          <tbody>
            {mine.map(row => {
              const delta = row.total
              const cls = delta > 0 ? 'score-pos-soft' : delta < 0 ? 'score-neg-soft' : 'text-cream-dim'
              return (
                <tr key={row.other} style={{ borderTop: '1px solid rgba(122,83,44,0.18)' }}>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <AvatarImg avatar={avatarFor(row.avatarOf)} size={24} />
                      <span className="font-bold text-ink">{row.other}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center font-mono">{row.games}</td>
                  <td className="px-3 py-2 text-center font-mono">
                    <span className="score-pos-soft font-bold">{row.wins}</span>
                    <span className="text-cream-dim mx-1">·</span>
                    <span className="score-neg-soft font-bold">{row.losses}</span>
                  </td>
                  <td className={`px-3 py-2 text-center font-mono font-semibold ${cls}`}>
                    {delta > 0 ? '+' : ''}{delta}
                  </td>
                  <td className="px-3 py-2 text-center font-mono text-amber">
                    {row.best > -Infinity ? (row.best > 0 ? '+' : '') + row.best : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
