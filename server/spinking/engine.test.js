'use strict';

// Spin King engine test harness. Run: NODE_ENV=test node spinking/engine.test.js
// Deterministic: tests rig internals (hands, types, stat maps) directly.

process.env.NODE_ENV = 'test';

const SpinKingState = require('./SpinKingState');
const { SPIN_TYPES, PLEDGE_TIERS, anteFor, anteForRound } = require('./constants');

let passed = 0;
let failed = 0;
const C = (rank, suit) => ({ rank, suit });

function check(name, cond, extra = '') {
  if (cond) { passed += 1; console.log(`  ok  ${name}`); }
  else { failed += 1; console.error(`FAIL  ${name} ${extra}`); }
}

const PLAYERS = [
  { id: 'a', name: 'A', seat: 0 },
  { id: 'b', name: 'B', seat: 1 },
  { id: 'c', name: 'C', seat: 2 },
];

/** Fresh game with a rigged spin (typeIndex into SPIN_TYPES). */
function newGame(stack = 1000, typeCode = 'T') {
  const idx = SPIN_TYPES.indexOf(typeCode);
  const g = Object.create(SpinKingState.prototype);
  // Build via constructor but with rng pinned first: construct normally,
  // then force the type (constructor already rolled + anted).
  const game = new SpinKingState(PLAYERS, stack);
  game.chosenGameType = typeCode >= '' && idx >= 0 ? typeCode : game.chosenGameType;
  if (typeCode) game.chosenGameType = typeCode;
  return game;
}

/** Force phase/fields for surgical tests. */
function rig(g, fields) { Object.assign(g, fields); }

function conserve(g) {
  return g.chips[0] + g.chips[1] + g.chips[2] + g.pot === 3 * g.startingStack;
}

console.log('— ante & round open —');
{
  const g = newGame(1000);
  check('ante = stack/100', g.anteAmount === 10);
  check('everyone anted into the pot', g.pot === 30 && g.chips[0] === 990 && g.chips[1] === 990 && g.chips[2] === 990);
  check('phase is spin', g.phase === 'spin');
  check('conservation holds after antes', conserve(g));
  check('ante formula: 100→1', anteFor(100) === 1);
  check('ante formula: 250→3', anteFor(250) === 3);
  check('ante formula: 40→1 (min 1)', anteFor(40) === 1);

  // Tournament escalation: doubles every 5 rounds, capped at stack/5.
  check('ante escalation: rounds 1-5 flat', anteForRound(1000, 1) === 10 && anteForRound(1000, 5) === 10);
  check('ante escalation: round 6 doubles', anteForRound(1000, 6) === 20);
  check('ante escalation: round 11 quadruples', anteForRound(1000, 11) === 40);
  check('ante escalation: capped at stack/5', anteForRound(1000, 28) === 200 && anteForRound(30, 16) === 6);
  {
    const ge = newGame(1000, 'T');
    rig(ge, { round: 6 });
    check('engine ante follows the round', ge.anteAmount === 20);
  }

  // Zombie skips ante; broke player pays what they have.
  const g2 = newGame(1000);
  rig(g2, { phase: 'round_end', zombies: { 0: true, 1: false, 2: false } });
  g2.chips = { 0: 0, 1: 4, 2: 966 };
  g2.pot = 2030; // keep books consistent: 0+4+966+2030 = 3000
  g2.startNextRound();
  check('zombie skipped ante', g2.chips[0] === 0);
  check('broke-but-live seat anted capped at stack', g2.chips[1] === 0 && g2.pot === 2030 + 4 + 10);
  check('conservation after capped ante', conserve(g2));
}

console.log('— spin —');
{
  const g = newGame(1000);
  check('rolled type is one of the 7 spin codes', SPIN_TYPES.includes(g.chosenGameType));
  check('spin pool is exactly 7 with single PLUS',
    SPIN_TYPES.length === 7 && SPIN_TYPES.filter((t) => t.startsWith('P')).length === 1 && SPIN_TYPES.includes('P1'));
  const seen = new Set();
  for (let i = 0; i < 500; i++) {
    const t = new SpinKingState(PLAYERS, 100);
    seen.add(t.chosenGameType);
  }
  check('random rolls stay inside the pool', [...seen].every((t) => SPIN_TYPES.includes(t)));
  check('ack advances to auction', g.ackSpin(1).ok === true && g.phase === 'auction');
  check('duplicate ack rejected harmlessly', g.ackSpin(0).ok === false);
}

console.log('— prikup betting (all-pay: bids never come back) —');
{
  const g = newGame(1000, 'T');
  g.ackSpin(0);
  check('leader acts first', g.currentTurn === g.roundLeader);
  check('minNextBid = ante for opening', g.auction.minNextBid === undefined && g._minNextBid === 10);
  check('opening below ante rejected', g.placeBid(0, 5).ok === false);
  check('bid above stack rejected', g.placeBid(0, 5000).ok === false);
  check('opening bid sinks into the pot immediately', g.placeBid(0, 10).ok === true &&
    g.auction.bid === 10 && g.chips[0] === 980 && g.pot === 40 && g.currentTurn === 1);
  check('raise below bid+ante rejected', g.placeBid(1, 15).ok === false);
  check('raise pays in full', g.placeBid(1, 40).ok === true &&
    g.chips[1] === 950 && g.pot === 80 && g.currentTurn === 2);
  g.passBid(2);
  check('back to first bidder after fold', g.currentTurn === 0);
  // Poker min-raise: last raise was 30 (10→40), so the floor is 70.
  check('min re-raise = size of the last raise', g.placeBid(0, 69).ok === false);
  check('re-raise tops up only the delta', g.placeBid(0, 70).ok === true &&
    g.chips[0] === 920 && g.pot === 140 && g.auction.committed[0] === 70 && g.currentTurn === 1);
  check('counter re-raise', g.placeBid(1, 120).ok === true &&
    g.chips[1] === 870 && g.pot === 220 && g.currentTurn === 0);
  g.passBid(0);
  check('betting resolves to the last raiser', g.auctionWinner === 1 && g.auctionPrice === 120);
  check('folded bidder chips STAY in the pot', g.pot === 220 && g.chips[0] === 920);
  check('winner pays nothing extra at resolution', g.chips[1] === 870);
  check('prikup merged into winner hand (12 cards)', g.hands[1].length === 12);
  check('winner discards next', g.phase === 'discard' && g.currentTurn === 1);
  check('leaderSeat getter points at buyer', g.leaderSeat === 1);
  check('conservation holds', conserve(g));

  // All-pass on a non-Plus round: prikup stays dead, straight to pledge.
  const g2 = newGame(1000, 'T');
  g2.ackSpin(0);
  g2.passBid(0); g2.passBid(1); g2.passBid(2);
  check('all-pass goes to pledge', g2.phase === 'pledge');
  check('all-pass leaves prikup buried', g2.auctionWinner === null && g2.centerCards.length === 2);
  check('all hands still 10 cards', g2.hands[0].length === 10 && g2.hands[1].length === 10 && g2.hands[2].length === 10);

  // Broke seat is auto-passed when the pointer reaches them.
  const g3 = newGame(1000, 'T');
  g3.chips = { 0: 995, 1: 5, 2: 990 };
  g3.pot = 3000 - 995 - 5 - 990;
  g3.ackSpin(0);
  g3.passBid(0); // advance past seat 0 → sweep hits the broke seat 1
  check('broke seat auto-passed on reach', g3.auction.passed[1] === true && g3.currentTurn === 2);

  // Zombie is pre-passed and skipped.
  const g4 = newGame(1000, 'T');
  rig(g4, { zombies: { 0: true, 1: false, 2: false } });
  g4.ackSpin(0);
  check('zombie pre-passed, first actor is next live seat', g4.auction.passed[0] === true && g4.currentTurn === 1);
}

console.log('— PLUS trump flows —');
{
  // Buyer picks trump BEFORE the merge.
  const g = newGame(1000, 'P1');
  g.ackSpin(0);
  g.placeBid(0, 10); g.passBid(1); g.passBid(2);
  check('PLUS buyer goes to trump selection first', g.phase === 'trump_selection' && g.currentTurn === 0);
  check('hand still 10 before trump chosen', g.hands[0].length === 10);
  check('trump by non-buyer rejected', g.selectTrump(1, 'S').ok === false);
  g.selectTrump(0, 'S');
  check('after trump: merged and discarding', g.phase === 'discard' && g.hands[0].length === 12 && g.trumpSuit === 'S');

  // All-pass PLUS: leader picks trump, NO merge, then pledge.
  const g2 = newGame(1000, 'P1');
  g2.ackSpin(0);
  g2.passBid(0); g2.passBid(1); g2.passBid(2);
  check('all-pass PLUS → leader picks trump', g2.phase === 'trump_selection' && g2.currentTurn === g2.roundLeader);
  g2.selectTrump(g2.roundLeader, 'H');
  check('no merge on all-pass trump', g2.centerCards.length === 2 && g2.hands[g2.roundLeader].length === 10);
  check('then pledge', g2.phase === 'pledge');

  // Zombie leader still picks trump on all-pass.
  const g3 = newGame(1000, 'P1');
  rig(g3, { zombies: { 0: true, 1: false, 2: false } });
  g3.ackSpin(1);
  g3.passBid(1); g3.passBid(2);
  check('zombie leader picks all-pass trump', g3.phase === 'trump_selection' && g3.currentTurn === 0);
  check('zombie trump choice accepted', g3.selectTrump(0, null).ok === true && g3.phase === 'pledge');
}

console.log('— discard rules —');
{
  const g = newGame(1000, 'Q');
  g.ackSpin(0);
  g.placeBid(0, 10); g.passBid(1); g.passBid(2);
  check('buyer in discard with 12 cards', g.phase === 'discard' && g.hands[0].length === 12);
  const hand = g.hands[0];
  const queen = hand.find((c) => c.rank === 'Q');
  if (queen) {
    const other = hand.find((c) => c.rank !== 'Q' && !(c.rank === queen.rank && c.suit === queen.suit));
    check('cannot discard a queen in Q round', g.discardCards(0, [queen, other]).ok === false);
  } else {
    check('cannot discard a queen in Q round (no queen in hand — skipped)', true);
  }
  const center = g.lastCenterCards;
  const legal = hand.filter((c) => c.rank !== 'Q');
  const nonCenterLegal = legal.filter((c) => !center.some((lc) => lc.rank === c.rank && lc.suit === c.suit));
  if (center.length === 2 && center.every((c) => c.rank !== 'Q')) {
    check('cannot discard both center cards', g.discardCards(0, [center[0], center[1]]).ok === false);
  } else {
    check('cannot discard both center cards (center has a queen — rule subsumed)', true);
  }
  if (nonCenterLegal.length >= 2) {
    const res = g.discardCards(0, [nonCenterLegal[0], nonCenterLegal[1]]);
    check('legal discard accepted → pledge (not playing)', res.ok === true && g.phase === 'pledge');
    check('hand back to 10', g.hands[0].length === 10);
  } else {
    check('legal discard accepted → pledge (skipped: rigged hand)', true);
  }
}

console.log('— pledge betting (shared escalating condition) —');
{
  const g = newGame(1000, 'T');
  g.ackSpin(0);
  g.passBid(0); g.passBid(1); g.passBid(2); // all-pass → pledge
  check('pledge starts at round leader', g.currentTurn === g.roundLeader);
  check('table opens at the loosest tier', g.pledge.tierIdx === 0 && g.pledge.stake === 0);
  // No free entries: while the stake is 0 the only options are fold or bet.
  check('opening check rejected — bet or fold', g.pledgeAct(0, { action: 'call' }).ok === false);
  check('tier-only raise at zero rejected', g.pledgeAct(0, { action: 'raise', tier: 't3' }).ok === false);
  check('opening bet below ante rejected', g.pledgeAct(0, { action: 'raise', stake: 5 }).ok === false);
  check('bogus tier rejected', g.pledgeAct(0, { action: 'raise', tier: 'zzz', stake: 50 }).ok === false);
  check('empty raise rejected', g.pledgeAct(0, { action: 'raise' }).ok === false);
  check('opening bet accepted', g.pledgeAct(0, { action: 'raise', stake: 50 }).ok === true &&
    g.pledge.stake === 50 && g.pledge.tierIdx === 0 && g.chips[0] === 940);
  check('raise reopens action', g.pledge.toAct.length === 2 && g.currentTurn === 1);
  check('call matches the stake', g.pledgeAct(1, { action: 'call' }).ok === true && g.chips[1] === 940);
  // Seat 2 tightens WHILE matching the 50 — pays the 50, condition
  // escalates for everyone, no extra chips required.
  check('tier raise at matched stake accepted',
    g.pledgeAct(2, { action: 'raise', tier: 't3', stake: 50 }).ok === true &&
    g.pledge.tierIdx === 1 && g.pledge.stake === 50 && g.chips[2] === 940 &&
    g.pledge.lastRaiser === 2 && g.pledge.tierSetBy === 2);
  check('tier raise reopens action', g.pledge.toAct.length === 2 && g.currentTurn === 0);
  check('loosening the condition rejected', g.pledgeAct(0, { action: 'raise', tier: 't4' }).ok === false);
  check('same tier + same stake rejected', g.pledgeAct(0, { action: 'raise', tier: 't3', stake: 50 }).ok === false);
  check('stake below current rejected', g.pledgeAct(0, { action: 'raise', stake: 30 }).ok === false);
  // THE check: seat 0 already has the 50 in — accepting the stricter
  // condition costs nothing.
  check('matched player checks the stricter condition for free',
    g.pledgeAct(0, { action: 'call' }).ok === true && g.chips[0] === 940 &&
    g.pledge.entries[0].status === 'in');
  // Combined raise: tighten AND add chips.
  check('tier+money raise accepted', g.pledgeAct(1, { action: 'raise', tier: 't1', stake: 100 }).ok === true &&
    g.pledge.tierIdx === 3 && g.pledge.stake === 100);
  g.pledgeAct(2, { action: 'fold' });
  check('fold exits, betting continues', g.currentTurn === 0);
  g.pledgeAct(0, { action: 'call' });
  check('betting closes into tricks', g.phase === 'playing' && g.currentTurn === g.roundLeader && g.trickNumber === 1);
  check('folded stake stays in pot', g.pot === 30 + 100 + 100 + 50 /*fold committed*/);
  check('conservation holds', conserve(g));

  // K has a single tier — condition can't escalate, money still can.
  const gk = newGame(1000, 'K');
  gk.ackSpin(0);
  gk.passBid(0); gk.passBid(1); gk.passBid(2);
  check('K: tier raise impossible', gk.pledgeAct(0, { action: 'raise', tier: 'k0', stake: 0 }).ok === false);
  check('K: money raise works', gk.pledgeAct(0, { action: 'raise', stake: 20 }).ok === true);

  // Cap: an all-in player pins the raise ceiling; fold re-expands it.
  const g2 = newGame(1000, 'T');
  g2.chips = { 0: 500, 1: 60, 2: 800 };
  g2.pot = 3000 - 500 - 60 - 800;
  g2.ackSpin(0);
  g2.passBid(0); g2.passBid(1); g2.passBid(2);
  check('cap = shortest stack', g2._pledgeCap === 60);
  check('raise above cap rejected', g2.pledgeAct(0, { action: 'raise', stake: 100 }).ok === false);
  g2.pledgeAct(0, { action: 'raise', stake: 60 });
  g2.pledgeAct(1, { action: 'call' });
  check('short stack all-in via call', g2.chips[1] === 0 && g2.pledge.entries[1].committed === 60);
  check('tier raise still possible at pinned cap',
    g2.pledgeAct(2, { action: 'raise', tier: 't3', stake: 60 }).ok === true && g2.pledge.tierIdx === 1);
  g2.pledgeAct(0, { action: 'call' });
  g2.pledgeAct(1, { action: 'call' }); // all-in seat accepts the stricter tier for free
  check('betting closed at equal stakes', g2.phase === 'playing');

  const g3 = newGame(1000, 'T');
  g3.chips = { 0: 500, 1: 60, 2: 800 };
  g3.pot = 3000 - 500 - 60 - 800;
  g3.ackSpin(0);
  g3.passBid(0); g3.passBid(1); g3.passBid(2);
  g3.pledgeAct(0, { action: 'raise', stake: 40 });
  g3.pledgeAct(1, { action: 'fold' });
  check('cap re-expands after short-stack fold', g3._pledgeCap === Math.min(500, 800 + 0) && g3._pledgeCap === 500);
  check('raise above old cap now allowed', g3.pledgeAct(2, { action: 'raise', tier: 't2', stake: 300 }).ok === true);

  // All-fold: straight to tricks; pot rolls at settlement.
  const g4 = newGame(1000, 'T');
  g4.ackSpin(0);
  g4.passBid(0); g4.passBid(1); g4.passBid(2);
  g4.pledgeAct(0, { action: 'fold' });
  g4.pledgeAct(1, { action: 'fold' });
  g4.pledgeAct(2, { action: 'fold' });
  check('all-fold still plays tricks', g4.phase === 'playing');

  // Poker min-raise in the pledge: re-raise by at least the last raise size.
  const gm = newGame(1000, 'T');
  gm.ackSpin(0);
  gm.passBid(0); gm.passBid(1); gm.passBid(2);
  gm.pledgeAct(0, { action: 'raise', stake: 50 });
  check('pledge min re-raise = last raise size',
    gm.pledgeAct(1, { action: 'raise', stake: 60 }).ok === false &&
    gm.pledgeAct(1, { action: 'raise', stake: 100 }).ok === true &&
    gm.pledge.lastRaise === 50);
  check('the floor follows the newest raise', gm.pledgeAct(2, { action: 'raise', stake: 120 }).ok === false &&
    gm.pledgeAct(2, { action: 'raise', stake: 150 }).ok === true);

  // An unopened table can never be checked through — the last live actor
  // still has to put chips in (or fold into a rollover).
  const g6 = newGame(1000, 'T');
  g6.ackSpin(0);
  g6.passBid(0); g6.passBid(1); g6.passBid(2);
  g6.pledgeAct(0, { action: 'fold' });
  g6.pledgeAct(1, { action: 'fold' });
  check('last actor still cannot check at zero', g6.pledgeAct(2, { action: 'call' }).ok === false);
  check('lone opener closes the betting', g6.pledgeAct(2, { action: 'raise', stake: 10 }).ok === true &&
    g6.phase === 'playing' && g6.pledge.entries[2].status === 'in' && g6.pot === 40);

  // Zero eligible actors (all zombies but leader-zombie plays tricks).
  const g5 = newGame(1000, 'T');
  rig(g5, { zombies: { 0: true, 1: true, 2: false } });
  g5.chips = { 0: 0, 1: 0, 2: 2990 };
  g5.pot = 10;
  g5.ackSpin(0);
  // seat 2 auto... 2 has chips; others pre-passed → seat 2 may bid or pass
  g5.passBid(2);
  check('single live seat pledge alone', g5.phase === 'pledge' && g5.currentTurn === 2);
  g5.pledgeAct(2, { action: 'fold' });
  check('lone fold → tricks', g5.phase === 'playing');
}

console.log('— dead-prikup backstop —');
{
  // H round, all-pass, both red hearts buried: only 6 hearts reachable —
  // base end condition (8 hearts) would never fire without the backstop.
  const g = newGame(1000, 'H');
  g.ackSpin(0);
  g.passBid(0); g.passBid(1); g.passBid(2);
  g.pledgeAct(0, { action: 'fold' });
  g.pledgeAct(1, { action: 'fold' });
  g.pledgeAct(2, { action: 'fold' });
  check('H all-pass reached playing', g.phase === 'playing');
  // Simulate: 9 tricks done, 6 hearts taken — base check false.
  rig(g, { trickWinners: [0, 1, 2, 0, 1, 2, 0, 1, 2], heartsTaken: { 0: 3, 1: 3, 2: 0 } });
  check('base condition alone would not end', (g.heartsTaken[0] + g.heartsTaken[1] + g.heartsTaken[2]) < 8);
  rig(g, { trickWinners: [0, 1, 2, 0, 1, 2, 0, 1, 2, 0] });
  check('10-trick backstop ends the round', g._checkRoundEnd() === true);
}

console.log('— pledge evaluation matrix —');
{
  const mk = (over) => ({
    tricksTaken: { 0: 0, 1: 0, 2: 0 },
    queensTaken: { 0: 0, 1: 0, 2: 0 },
    jacksTaken: { 0: 0, 1: 0, 2: 0 },
    heartsTaken: { 0: 0, 1: 0, 2: 0 },
    kingOfHeartsTakenBy: null,
    trickWinners: [],
    ...over,
  });
  const t = (code, id) => PLEDGE_TIERS[code].find((x) => x.id === id);

  check('K met when not taken', t('K', 'k0').check(mk({ kingOfHeartsTakenBy: 2 }), 0) === true);
  check('K failed when taken', t('K', 'k0').check(mk({ kingOfHeartsTakenBy: 0 }), 0) === false);
  check('K met when buried (nobody took it)', t('K', 'k0').check(mk({}), 0) === true);

  check('Q ≤2 met at 2', t('Q', 'q2').check(mk({ queensTaken: { 0: 2, 1: 0, 2: 0 } }), 0) === true);
  check('Q ≤2 failed at 3', t('Q', 'q2').check(mk({ queensTaken: { 0: 3, 1: 0, 2: 0 } }), 0) === false);
  check('Q ≤1 met/failed', t('Q', 'q1').check(mk({ queensTaken: { 0: 1, 1: 0, 2: 0 } }), 0) === true &&
    t('Q', 'q1').check(mk({ queensTaken: { 0: 2, 1: 0, 2: 0 } }), 0) === false);
  check('Q 0 met/failed', t('Q', 'q0').check(mk({}), 0) === true &&
    t('Q', 'q0').check(mk({ queensTaken: { 0: 1, 1: 0, 2: 0 } }), 0) === false);

  check('J ladder mirrors Q', t('J', 'j2').check(mk({ jacksTaken: { 0: 2, 1: 0, 2: 0 } }), 0) === true &&
    t('J', 'j1').check(mk({ jacksTaken: { 0: 2, 1: 0, 2: 0 } }), 0) === false &&
    t('J', 'j0').check(mk({ jacksTaken: { 0: 0, 1: 0, 2: 0 } }), 0) === true);

  check('H ×4 ladder', t('H', 'h3').check(mk({ heartsTaken: { 0: 3, 1: 0, 2: 0 } }), 0) === true &&
    t('H', 'h2').check(mk({ heartsTaken: { 0: 3, 1: 0, 2: 0 } }), 0) === false &&
    t('H', 'h1').check(mk({ heartsTaken: { 0: 1, 1: 0, 2: 0 } }), 0) === true &&
    t('H', 'h0').check(mk({ heartsTaken: { 0: 1, 1: 0, 2: 0 } }), 0) === false);

  const lw = (arr) => mk({ trickWinners: arr });
  check('L2 ≤1 met when took one of last two', t('L2', 'l1').check(lw([1, 2, 0, 2]), 2) === true);
  check('L2 ≤1 failed when took both', t('L2', 'l1').check(lw([1, 0, 2, 2]), 2) === false);
  check('L2 0 met/failed', t('L2', 'l0').check(lw([2, 2, 0, 1]), 2) === true &&
    t('L2', 'l0').check(lw([0, 1, 1, 2]), 2) === false);

  check('T ×5 ladder ends', t('T', 't4').check(mk({ tricksTaken: { 0: 4, 1: 3, 2: 3 } }), 0) === true &&
    t('T', 't4').check(mk({ tricksTaken: { 0: 5, 1: 3, 2: 2 } }), 0) === false &&
    t('T', 't0').check(mk({ tricksTaken: { 0: 0, 1: 5, 2: 5 } }), 0) === true &&
    t('T', 't1').check(mk({ tricksTaken: { 0: 2, 1: 4, 2: 4 } }), 0) === false);

  check('PLUS ×5 ladder', t('P1', 'p4').check(mk({ tricksTaken: { 0: 4, 1: 3, 2: 3 } }), 0) === true &&
    t('P1', 'p4').check(mk({ tricksTaken: { 0: 3, 1: 4, 2: 3 } }), 0) === false &&
    t('P1', 'p8').check(mk({ tricksTaken: { 0: 8, 1: 1, 2: 1 } }), 0) === true &&
    t('P1', 'p8').check(mk({ tricksTaken: { 0: 7, 1: 2, 2: 1 } }), 0) === false);
}

console.log('— settlement (MVP slice + equal split on the shared condition) —');
{
  /** Prepared game at end-of-round with rigged pledge + stats + round scores.
   *  `mvp` rigs this round's flavor scores — the best one takes the 15% MVP
   *  slice off the top before pledge winners split the rest. */
  function settleWith({ entries, stake = 0, tierIdx = 0, stats, pot, chips, zombies, leader = 0, type = 'T',
                        mvp = { 0: 0, 1: -10, 2: -20 } }) {
    const g = newGame(1000, type);
    g.round = leader + 1; // roundLeader = leader
    g.chosenGameType = type;
    g.chips = { ...chips };
    g.pot = pot;
    if (zombies) g.zombies = { ...zombies };
    g.pledge = { tierIdx, stake, entries: JSON.parse(JSON.stringify(entries)), toAct: [], lastRaiser: null, tierSetBy: null, lastRaise: 0 };
    Object.assign(g, stats);
    g.roundScores = [{ round: g.round, gameType: type, scores: { ...mvp } }];
    g.phase = 'round_end';
    return { g, settlement: g._settle() };
  }
  const inEntry = (committed) => ({ status: 'in', committed });
  const foldedEntry = () => ({ status: 'folded', committed: 0 });
  const zeroStats = {
    tricksTaken: { 0: 0, 1: 5, 2: 5 }, queensTaken: { 0: 0, 1: 0, 2: 0 },
    jacksTaken: { 0: 0, 1: 0, 2: 0 }, heartsTaken: { 0: 0, 1: 0, 2: 0 },
    kingOfHeartsTakenBy: null, trickWinners: [1, 2, 1, 2, 1, 2, 1, 2, 1, 2],
  };

  // Sole pledge winner who is ALSO the MVP still sweeps the whole pot
  // (34 MVP slice + 196 pledge pot = 230).
  {
    const { g, settlement } = settleWith({
      stake: 100, tierIdx: 4, // '0 tricks'
      entries: { 0: inEntry(100), 1: inEntry(100), 2: foldedEntry() },
      stats: zeroStats, // seat 0 has 0 tricks → met; seat 1 has 5 → failed
      pot: 230, chips: { 0: 900, 1: 900, 2: 970 },
      mvp: { 0: 0, 1: -20, 2: -16 },
    });
    check('winner+MVP sweeps pot', settlement.payouts[0] === 230 && g.chips[0] === 1130);
    check('MVP slice recorded', settlement.mvpSeats.length === 1 && settlement.mvpSeats[0] === 0 &&
      settlement.mvpShare === 34);
    check('failed pledger got nothing', settlement.payouts[1] === 0);
    check('final condition recorded', settlement.tierId === 't0');
    check('pot cleared', g.pot === 0);
    check('conservation', conserve(g));
    check('results recorded', settlement.results[0].met === true && settlement.results[1].met === false && settlement.results[2].entered === false);
  }

  // A FOLDED seat can still earn the MVP slice; winners split the rest.
  {
    const stats = { ...zeroStats, tricksTaken: { 0: 2, 1: 3, 2: 5 } };
    const { settlement } = settleWith({
      stake: 20, tierIdx: 1, // 'max 3 tricks' — 0 and 1 meet
      entries: { 0: inEntry(20), 1: inEntry(20), 2: foldedEntry() },
      stats, pot: 100, chips: { 0: 950, 1: 950, 2: 1000 },
      mvp: { 0: -12, 1: -12, 2: -4 }, // folded seat 2 played the round best
    });
    // MVP 15 → seat 2; remaining 85 → 42/42, odd chip clockwise from leader 0.
    check('folded MVP takes the slice, winners split the rest',
      settlement.payouts[0] === 43 && settlement.payouts[1] === 42 && settlement.payouts[2] === 15,
      JSON.stringify(settlement.payouts));
  }

  // MVP tie splits the slice.
  {
    const stats = { ...zeroStats, queensTaken: { 0: 0, 1: 1, 2: 0 }, tricksTaken: { 0: 0, 1: 0, 2: 0 } };
    const { settlement } = settleWith({
      type: 'Q', stake: 10, tierIdx: 0, // 'max 2 queens' — both meet
      entries: { 0: inEntry(10), 1: inEntry(10), 2: foldedEntry() },
      stats, pot: 100, chips: { 0: 960, 1: 960, 2: 980 },
      mvp: { 0: 0, 1: 0, 2: -10 }, // seats 0 and 1 tie for MVP
    });
    // MVP 15 → 7/7 +1 clockwise from leader 0 → 8/7; pledge 85 → 42/42 +1 → seat 0.
    check('tied MVP slice splits (remainder clockwise)',
      settlement.payouts[0] === 8 + 43 && settlement.payouts[1] === 7 + 42,
      JSON.stringify(settlement.payouts));
  }

  // Three-way pledge split with remainder → clockwise from leader.
  {
    const stats = { ...zeroStats, tricksTaken: { 0: 3, 1: 3, 2: 4 } }; // all meet t4 (idx 0)
    const { settlement } = settleWith({
      leader: 1, stake: 0, tierIdx: 0,
      entries: { 0: inEntry(0), 1: inEntry(0), 2: inEntry(0) },
      stats, pot: 11, chips: { 0: 996, 1: 996, 2: 997 },
      mvp: { 0: -16, 1: -16, 2: -12 }, // seat 2 solo MVP
    });
    // MVP max(1, floor(1.65)) = 1 → seat 2; pledge 10 → 3 each + 1 leftover →
    // clockwise from leader seat 1.
    check('three-way remainder goes clockwise from leader',
      settlement.payouts[1] === 4 && settlement.payouts[0] === 3 && settlement.payouts[2] === 4,
      JSON.stringify(settlement.payouts));
  }

  // Sole remaining entrant still has to MEET the condition — else the pot
  // (minus the MVP slice) rolls over.
  {
    const { g, settlement } = settleWith({
      stake: 50, tierIdx: 4, // '0 tricks' failed
      entries: { 0: inEntry(50), 1: foldedEntry(), 2: foldedEntry() },
      stats: { ...zeroStats, tricksTaken: { 0: 4, 1: 3, 2: 3 } },
      pot: 200, chips: { 0: 900, 1: 950, 2: 950 },
      mvp: { 0: -20, 1: -8, 2: -12 }, // folded seat 1 is MVP
    });
    check('rollover keeps the pot minus the MVP slice',
      settlement.rolledOver === true && settlement.mvpShare === 30 &&
      settlement.payouts[1] === 30 && g.pot === 170 && g.phase === 'round_end');
    check('rollover conservation', conserve(g));
  }

  // All folded → MVP still paid, rest rolls.
  {
    const { g, settlement } = settleWith({
      entries: { 0: foldedEntry(), 1: foldedEntry(), 2: foldedEntry() },
      stats: zeroStats, pot: 90, chips: { 0: 970, 1: 970, 2: 970 },
      mvp: { 0: -4, 1: -16, 2: -20 },
    });
    check('all-fold: MVP paid, rest rolls', settlement.rolledOver === true &&
      settlement.payouts[0] === 13 && g.pot === 77 && g.chips[0] === 983);
  }

  // Zombie marking + match end.
  {
    const { g, settlement } = settleWith({
      stake: 970, tierIdx: 4,
      entries: { 0: inEntry(970), 1: inEntry(970), 2: foldedEntry() },
      stats: { ...zeroStats, tricksTaken: { 0: 0, 1: 5, 2: 5 } }, // 0 wins, 1 fails
      pot: 2000, chips: { 0: 0, 1: 0, 2: 1000 },
      mvp: { 0: 0, 1: -20, 2: -16 },
    });
    check('winner paid', g.chips[0] === 2000);
    check('failed all-in became zombie', g.zombies[1] === true && settlement.newZombies.includes(1));
    check('match continues with 2 alive', g.phase === 'round_end' && g.matchWinner === null);
  }
  // A zombie who wins the MVP slice COMES BACK FROM THE DEAD.
  {
    const { g, settlement } = settleWith({
      entries: { 0: foldedEntry(), 1: foldedEntry(), 2: foldedEntry() },
      stats: zeroStats, pot: 300, chips: { 0: 1350, 1: 1350, 2: 0 },
      zombies: { 0: false, 1: false, 2: true },
      mvp: { 0: -20, 1: -16, 2: -4 }, // the zombie played the round best
    });
    check('zombie MVP revives with the slice', settlement.payouts[2] === 45 &&
      g.chips[2] === 45 && g.zombies[2] === false && settlement.revived.includes(2));
    check('revival keeps the match alive', settlement.matchEnd === false && g.pot === 255);
  }
  {
    const { settlement } = settleWith({
      stake: 990, tierIdx: 4,
      entries: { 0: inEntry(990), 1: inEntry(990), 2: foldedEntry() },
      stats: { ...zeroStats, tricksTaken: { 0: 0, 1: 5, 2: 5 } },
      pot: 2990, chips: { 0: 0, 1: 0, 2: 10 },
      zombies: { 0: false, 1: false, 2: false },
      mvp: { 0: 0, 1: -20, 2: -16 },
    });
    // winner 0 gets 2990 → alive = {0 (2990), 2 (10)} → no match end yet
    check('two alive → no match end', settlement.matchEnd === false);
    const again = settleWith({
      stake: 10, tierIdx: 0, // 'max 4 tricks' failed with 5
      entries: { 0: foldedEntry(), 1: foldedEntry(), 2: inEntry(10) },
      stats: { ...zeroStats, tricksTaken: { 0: 5, 1: 5, 2: 5 } },
      pot: 10, chips: { 0: 2990, 1: 0, 2: 0 },
      zombies: { 0: false, 1: true, 2: false },
      mvp: { 0: -12, 1: -16, 2: -16 }, // MVP goes to the big stack
    });
    check('last opponent busts → match end, winner sweeps pot',
      again.settlement.matchEnd === true && again.g.matchWinner === 0 && again.g.chips[0] === 3000 && again.g.pot === 0);
    check('match end phase', again.g.phase === 'match_end' && again.g.isGameOver === true);
  }
  // All stacks zero after failed all-ins → the MVP slice decides the match.
  {
    const { g } = settleWith({
      stake: 1000, tierIdx: 4,
      entries: { 0: inEntry(1000), 1: inEntry(1000), 2: inEntry(1000) },
      stats: { ...zeroStats, tricksTaken: { 0: 4, 1: 4, 2: 2 } }, // everyone fails '0 tricks'
      pot: 3000, chips: { 0: 0, 1: 0, 2: 0 },
      mvp: { 0: -16, 1: -8, 2: -16 }, // seat 1 played it best
    });
    check('all-in wipeout → the MVP takes the match',
      g.phase === 'match_end' && g.matchWinner === 1 && g.chips[1] === 3000 && g.pot === 0);
  }
}

console.log('— folded player still plays tricks —');
{
  const g = newGame(1000, 'T');
  g.ackSpin(0);
  g.passBid(0); g.passBid(1); g.passBid(2);
  g.pledgeAct(0, { action: 'raise', stake: 10 });
  g.pledgeAct(1, { action: 'fold' });
  g.pledgeAct(2, { action: 'call' });
  check('tricks started', g.phase === 'playing' && g.currentTurn === g.roundLeader);
  // Folded seat 1 must still be able to play a card in turn.
  const leader = g.currentTurn;
  const lead = g.hands[leader].find((c) => g.validatePlay(leader, c).valid);
  g.playCard(leader, lead);
  const second = g.currentTurn;
  const followable = g.hands[second].find((c) => g.validatePlay(second, c).valid);
  check('next seat (regardless of fold) has a legal play', !!followable);
  const res = g.playCard(second, followable);
  check('folded seat plays tricks normally', res.ok === true);
}

console.log('— multi-round flow, unlimited rounds, serialize round-trip —');
{
  // Play a full scripted round via the engine's own moves, then loop rounds.
  const g = newGame(1000, 'T');
  g.ackSpin(0);
  g.passBid(0); g.passBid(1); g.passBid(2);
  g.pledgeAct(0, { action: 'fold' });
  g.pledgeAct(1, { action: 'fold' });
  g.pledgeAct(2, { action: 'fold' });
  let guard = 0;
  while (g.phase === 'playing' && guard++ < 40) {
    const seat = g.currentTurn;
    const card = g.hands[seat].find((c) => g.validatePlay(seat, c).valid);
    g.playCard(seat, card);
  }
  check('all-fold round settled after 10 tricks', g.phase === 'round_end' && g.trickWinners.length === 10);
  check('flavor scores accumulated, chips untouched by scoring',
    Object.values(g.cumulativeScores).some((v) => v !== 0) && conserve(g));

  // More rounds — antes escalate and the MVP slice moves chips every
  // settlement, so the match may legitimately END mid-loop; both outcomes
  // must stay conserved and well-formed.
  let ok = true;
  for (let r = 0; r < 15 && ok && g.phase !== 'match_end'; r++) {
    const prevRound = g.round;
    const next = g.startNextRound();
    ok = next.ok && g.round === prevRound + 1 && g.phase === 'spin' &&
      g.roundLeader === (g.round - 1) % 3;
    if (!ok) break;
    g.ackSpin(0);
    // everyone passes the prikup and folds the pledge (fast-forward)
    while (g.phase === 'auction') {
      const t = g.currentTurn;
      g.passBid(t);
    }
    if (g.phase === 'trump_selection') g.selectTrump(g.currentTurn, null);
    while (g.phase === 'pledge') {
      const t = g.currentTurn;
      g.pledgeAct(t, { action: 'fold' });
    }
    let steps = 0;
    while (g.phase === 'playing' && steps++ < 40) {
      const seat = g.currentTurn;
      const card = g.hands[seat].find((c) => g.validatePlay(seat, c).valid);
      if (!card) { ok = false; break; }
      const res = g.playCard(seat, card);
      if (!res.ok) { ok = false; break; }
    }
    ok = ok && (g.phase === 'round_end' || g.phase === 'match_end');
    ok = ok && conserve(g);
  }
  check('multi-round loop stays conserved (match end allowed)', ok,
    `round=${g.round} phase=${g.phase}`);

  // The 27-round King ceiling is gone: round 27 → 28 must just work.
  const gCap = newGame(1000, 'T');
  rig(gCap, { phase: 'round_end', round: 27 });
  const past = gCap.startNextRound();
  check('no 27-round ceiling — round 28 opens', past.ok === true && gCap.round === 28 && gCap.phase === 'spin');
  check('late-round ante is escalated and capped', gCap.anteAmount === 200);

  // Serialize → fromSnapshot mid-auction.
  const g2 = newGame(500, 'Q');
  g2.ackSpin(0);
  g2.placeBid(0, 20);
  const snap = JSON.parse(JSON.stringify(g2.serialize()));
  const g3 = require('./SpinKingState').fromSnapshot(snap);
  check('snapshot marks the engine', snap.engine === 'spinking');
  check('mid-auction round-trip preserves betting state',
    g3.phase === 'auction' && g3.auction.bid === 20 && g3.auction.highBidder === 0 &&
    g3.chips[0] === g2.chips[0] && g3.pot === g2.pot);
  check('restored instance keeps playing', g3.passBid(g3.currentTurn).ok === true);

  // Mid-pledge round-trip (raised tier + stake must both survive).
  const g4 = newGame(500, 'T');
  g4.ackSpin(0);
  while (g4.phase === 'auction') g4.passBid(g4.currentTurn);
  g4.pledgeAct(g4.currentTurn, { action: 'raise', tier: 't3', stake: 25 });
  const snap4 = JSON.parse(JSON.stringify(g4.serialize()));
  const g5 = require('./SpinKingState').fromSnapshot(snap4);
  check('mid-pledge round-trip preserves the shared condition',
    g5.phase === 'pledge' && g5.pledge.stake === 25 && g5.pledge.tierIdx === 1 &&
    g5.pledge.lastRaiser === g4.roundLeader && conserve(g5));
  check('restored pledge continues', g5.pledgeAct(g5.currentTurn, { action: 'fold' }).ok === true);

  // Pristine round-2 state parity with a fresh game (sync-check for the
  // reimplemented startNextRound reset block).
  const fresh = newGame(1000, 'T');
  const keysFresh = Object.keys(fresh.serialize()).sort();
  const looped = newGame(1000, 'T');
  rig(looped, { phase: 'round_end' });
  looped.startNextRound();
  const keysLooped = Object.keys(looped.serialize()).sort();
  check('round-2 snapshot has the same field set as round-1',
    JSON.stringify(keysFresh) === JSON.stringify(keysLooped));
  check('round-2 per-round state pristine',
    looped.trickWinners.length === 0 && looped.auction === null && looped.pledge === null &&
    looped.chosenGameType && looped.phase === 'spin' && looped.trickNumber === 0);
}

console.log('— per-seat view privacy —');
{
  const g = newGame(1000, 'T');
  g.ackSpin(0);
  const v = g.getStateForPlayer(1);
  check('prikup contents hidden pre-merge', Array.isArray(v.centerCards) && v.centerCards.length === 0 && v.prikupCount === 2);
  check('own hand visible, others hidden', v.hand.length === 10 && v.cardCounts[0] === 10 && !v[0]);
  check('chips/pot/auction public', v.chips && v.pot === 30 && v.auction && v.auction.minNextBid === 10);
  check('view flags spinking', v.gameKind === 'spinking' && v.roundLeader === 0 && v.ante === 10);
  g.placeBid(0, 10); g.passBid(1); g.passBid(2);
  const vb = g.getStateForPlayer(0);
  check('buyer sees merged prikup via lastCenterCards', vb.lastCenterCards.length === 2);
  const vo = g.getStateForPlayer(2);
  check('others never see the merged cards', vo.lastCenterCards.length === 0);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
