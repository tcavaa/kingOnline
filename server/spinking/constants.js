'use strict';

// Spin King — poker-chip betting variant of King, played on the King table.

// Chip-stack room configuration (first sitter / creator decides).
const DEFAULT_STACK = 1000;
const MIN_STACK = 30;
const MAX_STACK = 1000000;

// Base ante = max(1, round(startingStack / ANTE_DIVISOR)). Tournament-style
// escalation: the ante DOUBLES every ANTE_LEVEL_ROUNDS rounds, capped at
// startingStack / ANTE_CAP_DIVISOR so late levels stay playable.
const ANTE_DIVISOR = 100;
const ANTE_LEVEL_ROUNDS = 5;
const ANTE_CAP_DIVISOR = 5;

// Round MVP: the best flavor score of the round takes this slice of the pot
// off the top (before pledge winners split the rest). Rank-within-the-round
// is type-neutral, so the random spin stays fair.
const MVP_SHARE = 0.15;

// The spin pool has SEVEN entries — a single PLUS instead of P1/P2/P3, so
// plus rounds aren't three times as likely. PLUS maps to the engine's 'P1'
// code (identical rules: +8/trick, trump selection, 10 tricks), which keeps
// the inherited trick/scoring engine completely untouched.
const SPIN_TYPES = ['K', 'Q', 'J', 'H', 'L2', 'T', 'P1'];

/**
 * Pledge tier ladders per game type, ordered LOOSEST → STRICTEST. The array
 * position is the raise ladder: the table plays ONE shared condition, and a
 * "raise" may tighten it (move to a higher index) — everyone still in must
 * then call the stricter condition or fold. `check(stats, seat)` evaluates
 * the condition against the round's final stat maps:
 *   stats = { tricksTaken, queensTaken, jacksTaken, heartsTaken,
 *             kingOfHeartsTakenBy, trickWinners }
 */
const PLEDGE_TIERS = {
  K: [
    { id: 'k0', label: '♥K-ს არ ავიღებ', check: (st, s) => st.kingOfHeartsTakenBy !== s },
  ],
  Q: [
    { id: 'q2', label: 'მაქს. 2 დამა', check: (st, s) => (st.queensTaken[s] || 0) <= 2 },
    { id: 'q1', label: 'მაქს. 1 დამა', check: (st, s) => (st.queensTaken[s] || 0) <= 1 },
    { id: 'q0', label: '0 დამა', check: (st, s) => (st.queensTaken[s] || 0) === 0 },
  ],
  J: [
    { id: 'j2', label: 'მაქს. 2 ვალეტი', check: (st, s) => (st.jacksTaken[s] || 0) <= 2 },
    { id: 'j1', label: 'მაქს. 1 ვალეტი', check: (st, s) => (st.jacksTaken[s] || 0) <= 1 },
    { id: 'j0', label: '0 ვალეტი', check: (st, s) => (st.jacksTaken[s] || 0) === 0 },
  ],
  H: [
    { id: 'h3', label: 'მაქს. 3 გული', check: (st, s) => (st.heartsTaken[s] || 0) <= 3 },
    { id: 'h2', label: 'მაქს. 2 გული', check: (st, s) => (st.heartsTaken[s] || 0) <= 2 },
    { id: 'h1', label: 'მაქს. 1 გული', check: (st, s) => (st.heartsTaken[s] || 0) <= 1 },
    { id: 'h0', label: '0 გული', check: (st, s) => (st.heartsTaken[s] || 0) === 0 },
  ],
  L2: [
    {
      id: 'l1', label: 'ბოლო 2-დან მაქს. 1',
      check: (st, s) => st.trickWinners.slice(-2).filter((w) => w === s).length <= 1,
    },
    {
      id: 'l0', label: 'ბოლო 2-დან არცერთი',
      check: (st, s) => st.trickWinners.slice(-2).filter((w) => w === s).length === 0,
    },
  ],
  T: [
    { id: 't4', label: 'მაქს. 4 ხელი', check: (st, s) => (st.tricksTaken[s] || 0) <= 4 },
    { id: 't3', label: 'მაქს. 3 ხელი', check: (st, s) => (st.tricksTaken[s] || 0) <= 3 },
    { id: 't2', label: 'მაქს. 2 ხელი', check: (st, s) => (st.tricksTaken[s] || 0) <= 2 },
    { id: 't1', label: 'მაქს. 1 ხელი', check: (st, s) => (st.tricksTaken[s] || 0) <= 1 },
    { id: 't0', label: '0 ხელი', check: (st, s) => (st.tricksTaken[s] || 0) === 0 },
  ],
  // PLUS (engine code P1): the player WANTS tricks.
  P1: [
    { id: 'p4', label: 'მინ. 4 ხელი', check: (st, s) => (st.tricksTaken[s] || 0) >= 4 },
    { id: 'p5', label: 'მინ. 5 ხელი', check: (st, s) => (st.tricksTaken[s] || 0) >= 5 },
    { id: 'p6', label: 'მინ. 6 ხელი', check: (st, s) => (st.tricksTaken[s] || 0) >= 6 },
    { id: 'p7', label: 'მინ. 7 ხელი', check: (st, s) => (st.tricksTaken[s] || 0) >= 7 },
    { id: 'p8', label: 'მინ. 8 ხელი', check: (st, s) => (st.tricksTaken[s] || 0) >= 8 },
  ],
};

function clampStack(value) {
  let n = Number(value);
  if (!Number.isFinite(n)) n = DEFAULT_STACK;
  return Math.round(Math.min(MAX_STACK, Math.max(MIN_STACK, n)));
}

function anteFor(startingStack) {
  return Math.max(1, Math.round(startingStack / ANTE_DIVISOR));
}

/** Ante for a given round under the doubling schedule, with the cap. */
function anteForRound(startingStack, round) {
  const base = anteFor(startingStack);
  const level = Math.floor(Math.max(0, (round || 1) - 1) / ANTE_LEVEL_ROUNDS);
  const cap = Math.max(1, Math.floor(startingStack / ANTE_CAP_DIVISOR));
  return Math.min(base * (2 ** level), cap);
}

/** Public (function-free) tier metadata safe to put on the wire. */
function tierViews() {
  const out = {};
  for (const [code, tiers] of Object.entries(PLEDGE_TIERS)) {
    out[code] = tiers.map(({ id, label }) => ({ id, label }));
  }
  return out;
}

module.exports = {
  DEFAULT_STACK, MIN_STACK, MAX_STACK, ANTE_DIVISOR,
  ANTE_LEVEL_ROUNDS, ANTE_CAP_DIVISOR, MVP_SHARE,
  SPIN_TYPES, PLEDGE_TIERS,
  clampStack, anteFor, anteForRound, tierViews,
};
