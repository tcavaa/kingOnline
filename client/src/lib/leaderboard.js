// Leaderboard reads/writes go straight to the server (MySQL). No local
// cache — the leaderboard is shared across everyone, so a per-device cache
// would just hide newly-saved games until the user manually refreshes.

import { api } from './api'

export const listGames = (limit = 50) => api.listGames(limit)
export const saveGame  = (record)     => api.saveGame(record)

/** Aggregate stats per player name across the supplied games array. */
export function aggregatePlayers(games = []) {
  const tally = new Map()
  for (const g of games) {
    for (const p of g.players || []) {
      const k = p.name
      const t = tally.get(k) || {
        name: p.name, avatar: p.avatar || null,
        gamesPlayed: 0, wins: 0, totalScore: 0,
        bestScore: -Infinity, worstScore: Infinity,
      }
      t.gamesPlayed++
      if (g.winner?.name === p.name) t.wins++
      t.totalScore += p.score ?? 0
      if ((p.score ?? 0) > t.bestScore)  t.bestScore  = p.score
      if ((p.score ?? 0) < t.worstScore) t.worstScore = p.score
      if (!t.avatar && p.avatar) t.avatar = p.avatar
      tally.set(k, t)
    }
  }
  return Array.from(tally.values())
    .sort((a, b) => b.wins - a.wins || b.totalScore - a.totalScore)
}
