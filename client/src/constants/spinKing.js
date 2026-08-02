// Spin King display constants — a labels/multipliers mirror of
// server/spinking/constants.js (the `check` evaluators stay server-side;
// the `stat`/`limit` meta here only powers the LIVE progress readouts on
// the table so players can see who is about to bust their pledge).
// Keep the ladders in sync with that file.

export const SPIN_TYPES = ['K', 'Q', 'J', 'H', 'L2', 'T', 'P1']

// The reel/pledge UI shows the single PLUS entry as plain "პლიუსი" —
// engine-wise it's the P1 code (identical rules), but there is only one
// plus in the spin pool so the numbered King name would be confusing.
export const SPIN_TYPE_NAME_OVERRIDE = { P1: 'პლიუსი' }

// Ladders are ordered LOOSEST → STRICTEST; the array position is the raise
// ladder — the table plays ONE shared condition and raising may tighten it.
export const PLEDGE_TIERS = {
  K: [
    { id: 'k0', label: '♥K-ს არ ავიღებ', stat: 'kh', limit: 0 },
  ],
  Q: [
    { id: 'q2', label: 'მაქს. 2 დამა', stat: 'queens', limit: 2 },
    { id: 'q1', label: 'მაქს. 1 დამა', stat: 'queens', limit: 1 },
    { id: 'q0', label: '0 დამა',       stat: 'queens', limit: 0 },
  ],
  J: [
    { id: 'j2', label: 'მაქს. 2 ვალეტი', stat: 'jacks', limit: 2 },
    { id: 'j1', label: 'მაქს. 1 ვალეტი', stat: 'jacks', limit: 1 },
    { id: 'j0', label: '0 ვალეტი',       stat: 'jacks', limit: 0 },
  ],
  H: [
    { id: 'h3', label: 'მაქს. 3 გული', stat: 'hearts', limit: 3 },
    { id: 'h2', label: 'მაქს. 2 გული', stat: 'hearts', limit: 2 },
    { id: 'h1', label: 'მაქს. 1 გული', stat: 'hearts', limit: 1 },
    { id: 'h0', label: '0 გული',       stat: 'hearts', limit: 0 },
  ],
  L2: [
    { id: 'l1', label: 'ბოლო 2-დან მაქს. 1', stat: 'last2', limit: 1 },
    { id: 'l0', label: 'ბოლო 2-დან არცერთი', stat: 'last2', limit: 0 },
  ],
  T: [
    { id: 't4', label: 'მაქს. 4 ხელი', stat: 'tricks', limit: 4 },
    { id: 't3', label: 'მაქს. 3 ხელი', stat: 'tricks', limit: 3 },
    { id: 't2', label: 'მაქს. 2 ხელი', stat: 'tricks', limit: 2 },
    { id: 't1', label: 'მაქს. 1 ხელი', stat: 'tricks', limit: 1 },
    { id: 't0', label: '0 ხელი',       stat: 'tricks', limit: 0 },
  ],
  P1: [
    { id: 'p4', label: 'მინ. 4 ხელი', stat: 'tricksMin', limit: 4 },
    { id: 'p5', label: 'მინ. 5 ხელი', stat: 'tricksMin', limit: 5 },
    { id: 'p6', label: 'მინ. 6 ხელი', stat: 'tricksMin', limit: 6 },
    { id: 'p7', label: 'მინ. 7 ხელი', stat: 'tricksMin', limit: 7 },
    { id: 'p8', label: 'მინ. 8 ხელი', stat: 'tricksMin', limit: 8 },
  ],
}

/**
 * The stat readout for a seat under the current game type — what everyone
 * needs to see about everyone ("she already has 1 jack"). Returns
 * { text, danger } where danger flags the K♥ holder.
 */
export function seatStatText(typeCode, stats, tricksTaken, seat) {
  const rs = stats || {}
  const tricks = (tricksTaken || {})[seat] ?? 0
  switch (typeCode) {
    case 'Q': return { text: `დამა: ${rs.queensTaken?.[seat] ?? 0}`, danger: false }
    case 'J': return { text: `ვალეტი: ${rs.jacksTaken?.[seat] ?? 0}`, danger: false }
    case 'H': return { text: `გული: ${rs.heartsTaken?.[seat] ?? 0}`, danger: false }
    case 'K':
      return rs.kingOfHeartsTakenBy === seat
        ? { text: '♥K აიღო!', danger: true }
        : { text: `ხელი: ${tricks}`, danger: false }
    case 'L2': {
      const tw = rs.trickWinners || []
      if (tw.length >= 8) {
        return { text: `ბოლო 2: ${tw.slice(8).filter(w => w === seat).length}`, danger: false }
      }
      return { text: `ხელი: ${tricks}`, danger: false }
    }
    default: return { text: `ხელი: ${tricks}`, danger: false } // T, P1
  }
}

export const getTier = (typeCode, tierId) =>
  (PLEDGE_TIERS[typeCode] || []).find(t => t.id === tierId) || null

/**
 * Live progress of a pledge against the running round stats.
 * Returns { text, state } where state is:
 *   'safe'   — pledge currently holding (green)
 *   'broken' — already busted, their stake is dead money (red)
 *   'met'    — PLUS minimum already reached (gold)
 */
export function tierProgress(typeCode, tierId, stats, seat) {
  const t = getTier(typeCode, tierId)
  if (!t || !stats) return null
  const {
    tricksTaken = {}, queensTaken = {}, jacksTaken = {}, heartsTaken = {},
    kingOfHeartsTakenBy = null, trickWinners = [],
  } = stats
  const cap = (cur) => ({ cur, state: cur > t.limit ? 'broken' : 'safe' })
  switch (t.stat) {
    case 'kh':
      return kingOfHeartsTakenBy === seat
        ? { text: '♥K აიღო!', state: 'broken' }
        : { text: '♥K-ს გაურბის', state: 'safe' }
    case 'queens': {
      const { cur, state } = cap(queensTaken[seat] ?? 0)
      return { text: `დამა ${cur}/${t.limit}`, state }
    }
    case 'jacks': {
      const { cur, state } = cap(jacksTaken[seat] ?? 0)
      return { text: `ვალეტი ${cur}/${t.limit}`, state }
    }
    case 'hearts': {
      const { cur, state } = cap(heartsTaken[seat] ?? 0)
      return { text: `გული ${cur}/${t.limit}`, state }
    }
    case 'tricks': {
      const { cur, state } = cap(tricksTaken[seat] ?? 0)
      return { text: `ხელი ${cur}/${t.limit}`, state }
    }
    case 'tricksMin': {
      const cur = tricksTaken[seat] ?? 0
      return { text: `ხელი ${cur}/${t.limit}+`, state: cur >= t.limit ? 'met' : 'safe' }
    }
    case 'last2': {
      // Only tricks 9 and 10 count. Before that window opens, the pledge
      // can't be judged — show the condition as pending.
      if (trickWinners.length < 8) return { text: 'ბოლო 2 ხელი…', state: 'safe' }
      const cur = trickWinners.slice(8).filter(w => w === seat).length
      return { text: `ბოლო 2: ${cur}/${t.limit}`, state: cur > t.limit ? 'broken' : 'safe' }
    }
    default:
      return null
  }
}

export const PROGRESS_COLOR = {
  safe:   '#4c7a2f',
  broken: '#a5372b',
  met:    '#b8860b',
}

// ── Chip visuals ────────────────────────────────────────────────────────────
// Poker-style denominations; an amount renders as one stack column per
// denomination so the pile's size tracks its value at a glance.
export const CHIP_DENOMS = [
  { v: 1000, color: '#e0a83c', dark: '#a97c22' }, // gold
  { v: 500,  color: '#8e5cc7', dark: '#63409a' }, // purple
  { v: 100,  color: '#43434b', dark: '#26262c' }, // black
  { v: 25,   color: '#3f8f4a', dark: '#2a6b33' }, // green
  { v: 5,    color: '#c04a3d', dark: '#8e332a' }, // red
  { v: 1,    color: '#efe9dc', dark: '#bdb29a' }, // white
]

/**
 * Break an amount into denomination columns for rendering.
 * Each column: { v, color, dark, count } with count capped at `maxPerCol`
 * (the numeric label carries the exact value; the pile is the impression).
 */
export function chipBreakdown(amount, maxPerCol = 8) {
  const out = []
  let rest = Math.max(0, Math.round(Number(amount) || 0))
  for (const d of CHIP_DENOMS) {
    if (rest < d.v) continue
    const count = Math.floor(rest / d.v)
    rest -= count * d.v
    out.push({ ...d, count: Math.min(count, maxPerCol) })
  }
  return out
}
