'use strict';

// Spin King end-to-end smoke over real sockets: boots the actual server on a
// spare port and drives 3 clients through the whole betting round shell
// (spin → auction → trump/discard → pledge → tricks → settlement), a
// mid-pledge reconnect, an all-in mini-match to game-over, then regression-
// checks a full classic King round and pings durak.
// Run: PORT=3298 node spinking/socket.smoke.js

process.env.PORT = process.env.PORT || '3298';
require('../index.js');

const path = require('path');
const { io } = require(path.join(__dirname, '..', '..', 'client', 'node_modules', 'socket.io-client'));
const { PLEDGE_TIERS } = require('./constants');

const URL = `http://localhost:${process.env.PORT}`;
let passed = 0, failed = 0;
const check = (name, cond, extra = '') => {
  if (cond) { passed += 1; console.log(`  ok  ${name}`); }
  else { failed += 1; console.error(`FAIL  ${name} ${extra}`); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function client() {
  const s = io(URL, { forceNew: true, transports: ['websocket'] });
  s.states = [];      // every game-state payload — swept for prikup leaks
  s.handDealts = [];
  s.on('game-state', (st) => { s.states.push(st); s.lastState = st; });
  s.on('hand-dealt', (p) => { s.handDealts.push(p); s.hand = p.hand; });
  s.on('hand-updated', (p) => { s.hand = p.hand; if (p.lastCenterCards) s.lastCenter = p.lastCenterCards; });
  s.on('error', (e) => { s.lastError = e && e.message; });
  s.on('round-complete', (p) => { s.lastRound = p; });
  s.on('game-over', (p) => { s.gameOver = p; });
  s.on('room-created', (p) => { s.created = p; });
  s.on('room-joined', (p) => { s.joined = p; });
  s.on('starting-stack-updated', (p) => { s.stack = p.startingStack; });
  s.on('quit-proposal', (p) => { s.quitProposal = p; });
  return s;
}

/** Fresh per-seat state via request-state (round-trips the server). */
async function fetchState(sock) {
  sock.emit('request-state');
  await sleep(140);
  return sock.lastState;
}

/** Replica of GameState.validatePlay's forced-play rules. */
function pickLegal(st) {
  const hand = st.hand || [];
  const leading = (st.currentTrick || []).length === 0;
  if (leading) {
    if (st.chosenGameType === 'K' || st.chosenGameType === 'H') {
      const nonHeart = hand.find((c) => c.suit !== 'H');
      if (nonHeart) return nonHeart;
    }
    return hand[0];
  }
  const follow = hand.find((c) => c.suit === st.ledSuit);
  if (follow) return follow;
  if (st.chosenGameType === 'K') {
    const kh = hand.find((c) => c.rank === 'K' && c.suit === 'H');
    if (kh) return kh;
  }
  if (st.trumpSuit && ['P1', 'P2', 'P3'].includes(st.chosenGameType)) {
    const t = hand.find((c) => c.suit === st.trumpSuit);
    if (t) return t;
  }
  return hand[0];
}

/** Replica of the discard rules: type restriction + keep one center card. */
function pickDiscards(st) {
  const canDrop = (c) => {
    if (st.chosenGameType === 'K' || st.chosenGameType === 'H') return c.suit !== 'H';
    if (st.chosenGameType === 'Q') return c.rank !== 'Q';
    if (st.chosenGameType === 'J') return c.rank !== 'J';
    return true;
  };
  const center = st.lastCenterCards || [];
  const isCenter = (c) => center.some((lc) => lc.rank === c.rank && lc.suit === c.suit);
  const legal = (st.hand || []).filter(canDrop);
  const nonCenter = legal.filter((c) => !isCenter(c));
  const centerLegal = legal.filter(isCenter);
  return nonCenter.length >= 2 ? [nonCenter[0], nonCenter[1]] : [nonCenter[0], centerLegal[0]];
}

/**
 * Drive one Spin King round to round_end/match_end. `shove: true` bets every
 * chip at every opportunity (fast path to a decided match); otherwise it
 * passes the auction and folds every pledge.
 */
async function driveRound(seats, { shove = false } = {}) {
  for (let guard = 0; guard < 90; guard++) {
    const st = await fetchState(seats[0]);
    if (!st) continue;
    if (st.phase === 'round_end' || st.phase === 'match_end') return st;
    if (st.phase === 'spin') { seats[0].emit('spin-ack'); await sleep(140); continue; }
    const actorSeat = st.currentTurn;
    const actor = seats[actorSeat];
    if (!actor) return null;

    if (st.phase === 'auction') {
      const shoveAmt = st.chips[actorSeat];
      if (shove && shoveAmt >= st.auction.minNextBid) actor.emit('place-bid', { amount: shoveAmt });
      else actor.emit('pass-bid');
      await sleep(140);
      continue;
    }
    if (st.phase === 'pledge') {
      if (shove && st.pledge.stake === 0 && st.pledge.cap >= st.pledge.minRaise) {
        actor.emit('pledge-act', { action: 'raise', stake: st.pledge.cap });
      } else if (shove && st.pledge.stake > 0) {
        actor.emit('pledge-act', { action: 'call' });
      } else {
        actor.emit('pledge-act', { action: 'fold' });
      }
      await sleep(140);
      continue;
    }
    // trump_selection / discard / playing need the actor's own view (hand).
    const my = await fetchState(actor);
    if (!my || my.currentTurn !== actorSeat || my.phase !== st.phase) continue;
    if (my.phase === 'trump_selection') actor.emit('select-trump', { suit: 'S' });
    else if (my.phase === 'discard') actor.emit('discard-cards', { cards: pickDiscards(my) });
    else if (my.phase === 'playing') actor.emit('play-card', { card: pickLegal(my) });
    await sleep(140);
  }
  return null;
}

(async () => {
  await sleep(700); // let the server boot

  // ════════ 1. Spin King room: create / stack / join / start ════════
  const a = client(), b = client(), c = client();
  await sleep(400);

  a.emit('create-room', { playerName: 'სპინ-ა', mode: 'championship', gameKind: 'spinking', startingStack: 500 });
  await sleep(300);
  check('spinking room created with kind + stack', a.created?.gameKind === 'spinking' && a.created?.startingStack === 500);
  check('spinking is never championship', a.created?.mode === 'public');
  const CODE = a.created.roomCode;

  a.emit('set-starting-stack', { startingStack: 5 });
  await sleep(200);
  check('stack clamped to minimum', a.stack === 30, `got ${a.stack}`);
  a.emit('set-starting-stack', { startingStack: 800 });
  await sleep(200);
  check('creator adjusts stack to 800', a.stack === 800);

  b.emit('join-room', { roomCode: CODE, playerName: 'სპინ-ბ' });
  c.emit('join-room', { roomCode: CODE, playerName: 'სპინ-გ' });
  await sleep(300);
  check('joiners told the room kind + stack', b.joined?.gameKind === 'spinking' && b.joined?.startingStack === 800);
  b.emit('set-starting-stack', { startingStack: 900 });
  await sleep(200);
  check('non-creator cannot change stack', b.lastError && b.lastError.includes('creator'));

  b.emit('start-game');
  await sleep(200);
  check('non-creator cannot start', b.lastError && b.lastError.includes('creator'));
  a.emit('start-game');
  await sleep(400);

  check('hands dealt: 10 cards each', a.hand?.length === 10 && b.hand?.length === 10 && c.hand?.length === 10);
  check('hand-dealt hides the prikup from everyone', [a, b, c].every((s) => s.handDealts.every((h) => h.centerCards.length === 0)));
  const st0 = b.lastState;
  check('opening state: spin phase with chips slice',
    st0?.phase === 'spin' && st0.gameKind === 'spinking' && st0.ante === 8 &&
    st0.pot === 24 && st0.chips[0] === 792 && st0.chips[1] === 792 && st0.chips[2] === 792,
    JSON.stringify({ phase: st0?.phase, pot: st0?.pot, ante: st0?.ante }));
  check('spin type rolled from the 7-pool', ['K', 'Q', 'J', 'H', 'L2', 'T', 'P1'].includes(st0?.chosenGameType));
  check('state carries the roster', st0?.players?.length === 3);

  // ════════ 2. Auction ════════
  c.emit('spin-ack');
  await sleep(250);
  a.emit('spin-ack'); // losing ack race must stay silent
  await sleep(200);
  const stA = a.lastState;
  check('spin ack → auction, leader to act', stA?.phase === 'auction' && stA.currentTurn === 0);
  check('server-computed minNextBid = ante', stA?.auction?.minNextBid === 8);
  check('duplicate ack raised no error', !a.lastError || !a.lastError.includes('spin'));

  b.emit('place-bid', { amount: 8 });
  await sleep(200);
  check('out-of-turn bid rejected', b.lastError && b.lastError.includes('turn'));
  a.emit('place-bid', { amount: 7 });
  await sleep(200);
  check('below-minimum bid rejected', a.lastError && a.lastError.includes('Minimum'));
  a.emit('place-bid', { amount: 8 });
  await sleep(200);
  check('opening bid lands', a.lastState?.auction?.bid === 8 && a.lastState?.currentTurn === 1);
  b.emit('pass-bid');
  await sleep(200);
  c.emit('pass-bid');
  await sleep(300);

  let stw = a.lastState;
  check('auction resolves to the leader', stw?.auctionWinner === 0 && stw?.auctionPrice === 8);
  const ROUND1_TYPE = stw.chosenGameType;
  if (stw.phase === 'trump_selection') {
    check('PLUS buyer picks trump before the merge (hand still 10)', a.hand.length === 10);
    a.emit('select-trump', { suit: 'S' });
    await sleep(300);
    stw = a.lastState;
  }
  check('buyer is discarding with the merged 12', stw?.phase === 'discard' && a.hand?.length === 12);
  check('non-buyers never see prikup contents pre/post merge',
    [b, c].every((s) => s.states.every((v) => (v.centerCards || []).length === 0)));

  a.emit('discard-cards', { cards: pickDiscards({ ...a.lastState, hand: a.hand, lastCenterCards: a.lastCenter }) });
  await sleep(300);

  // ════════ 3. Pledge ════════
  const stP = b.lastState;
  check('discard exits into pledge, leader acts first', stP?.phase === 'pledge' && stP.currentTurn === 0);
  c.emit('pledge-act', { action: 'fold' });
  await sleep(200);
  check('out-of-turn pledge rejected', c.lastError && c.lastError.includes('turn'));

  // Raise the stake AND (when the ladder allows) tighten the shared
  // condition one step — the escalation mechanic in one move.
  const tiers = PLEDGE_TIERS[ROUND1_TYPE];
  const stricter = tiers[1] || null;
  a.emit('pledge-act', { action: 'raise', stake: 8, ...(stricter ? { tier: stricter.id } : {}) });
  await sleep(200);
  b.emit('pledge-act', { action: 'call' });
  await sleep(200);
  c.emit('pledge-act', { action: 'fold' });
  await sleep(300);

  const stT = c.lastState;
  check('pledge closes into trick play, buyer leads', stT?.phase === 'playing' && stT.currentTurn === 0);
  check('pot holds antes + auction + stakes', stT?.pot === 48, `got ${stT?.pot}`);
  check('chips conserved entering tricks',
    stT && (stT.chips[0] + stT.chips[1] + stT.chips[2] + stT.pot === 2400));
  check('shared condition + statuses on the wire',
    stT?.pledge?.tierId === (stricter ? stricter.id : tiers[0].id) &&
    stT?.pledge?.entries?.[1]?.status === 'in' &&
    stT?.pledge?.entries?.[2]?.status === 'folded');

  a.emit('propose-quit', { kind: 'round' });
  await sleep(200);
  check('quit votes blocked in Spin King',
    a.lastError && a.lastError.includes('Spin King') && !a.quitProposal);

  // ════════ 4. Tricks → settlement ════════
  const endSt = await driveRound([a, b, c]); // pledge already done; plays out tricks
  check('round reached settlement', !!endSt && (endSt.phase === 'round_end' || endSt.phase === 'match_end'));
  const rc1 = a.lastRound;
  check('round-complete carries the settlement', !!rc1 && !!rc1.settlement && rc1.settlement.potBefore === 48);
  const chipsAfter = rc1?.settlement?.chipsAfter;
  check('settlement conserves every chip', chipsAfter &&
    (chipsAfter[0] + chipsAfter[1] + chipsAfter[2] + rc1.settlement.potAfter === 2400));
  check('folded seat cannot win the pot', rc1?.settlement?.payouts?.[2] === 0);
  check('flavor scores ride along', rc1 && rc1.scores && rc1.cumulativeScores);
  check('match continues (no game over)', rc1?.isGameOver === false && !a.gameOver);

  // ════════ 5. Round 2 + mid-pledge reconnect ════════
  b.emit('next-round');
  await sleep(200);
  check('only the creator advances the round', b.lastError && b.lastError.includes('creator'));
  a.emit('next-round');
  await sleep(400);
  const st2 = a.lastState;
  check('round 2 opens on spin with fresh antes', st2?.phase === 'spin' && st2.round === 2 &&
    (st2.chips[0] + st2.chips[1] + st2.chips[2] + st2.pot === 2400));
  check('round 2 hand-dealt also hides the prikup',
    [a, b, c].every((s) => s.handDealts.every((h) => h.centerCards.length === 0)));

  a.emit('spin-ack');
  await sleep(250);
  // Everyone passes the auction; a no-buyer PLUS needs the leader's trump.
  for (let i = 0; i < 4; i++) {
    const st = await fetchState(a);
    if (st.phase !== 'auction') break;
    [a, b, c][st.currentTurn].emit('pass-bid');
    await sleep(160);
  }
  {
    const st = await fetchState(a);
    if (st.phase === 'trump_selection') {
      [a, b, c][st.currentTurn].emit('select-trump', { suit: 'H' });
      await sleep(250);
    }
  }
  const stPl = await fetchState(a);
  check('all-pass auction buries the prikup into pledge',
    stPl.phase === 'pledge' && stPl.auctionWinner === null && stPl.currentTurn === 1);
  check('dead prikup flagged for the table view', stPl.prikupDead === true && stPl.prikupCount === 2);

  // Seat 1 must act — kill its socket and reconnect by name mid-pledge.
  b.disconnect();
  await sleep(300);
  const b2 = client();
  await sleep(250);
  b2.emit('join-room', { roomCode: CODE, playerName: 'სპინ-ბ' });
  await sleep(400);
  check('mid-pledge reconnect re-takes the seat',
    b2.joined?.reconnected === true && b2.joined?.seat === 1 && b2.joined?.gameKind === 'spinking');
  check('reconnect state restores the pledge', b2.lastState?.phase === 'pledge' &&
    !!b2.lastState?.pledge && b2.lastState.currentTurn === 1 && b2.lastState.hand?.length === 10);
  b2.emit('pledge-act', { action: 'fold' });
  await sleep(200);
  c.emit('pledge-act', { action: 'fold' });
  await sleep(200);
  a.emit('pledge-act', { action: 'fold' });
  await sleep(300);
  const stAf = await fetchState(b2);
  check('all-fold still plays the tricks', stAf.phase === 'playing');

  // Prikup privacy sweep across every state every client ever received.
  check('no game-state ever leaked prikup contents',
    [a, b, b2, c].every((s) => s.states.every((v) => (v.centerCards || []).length === 0)));

  [a, b2, c].forEach((s) => s.emit('leave-room'));
  await sleep(250);
  [a, b, b2, c].forEach((s) => s.disconnect());

  // ════════ 6. All-in mini-match → game-over ════════
  const m1 = client(), m2 = client(), m3 = client();
  await sleep(350);
  m1.emit('create-room', { playerName: 'ოლ-ინ-1', gameKind: 'spinking', startingStack: 30 });
  await sleep(300);
  const MCODE = m1.created.roomCode;
  m2.emit('join-room', { roomCode: MCODE, playerName: 'ოლ-ინ-2' });
  m3.emit('join-room', { roomCode: MCODE, playerName: 'ოლ-ინ-3' });
  await sleep(300);
  m1.emit('start-game');
  await sleep(400);

  let rounds = 0;
  for (; rounds < 8 && !m1.gameOver; rounds++) {
    const st = await driveRound([m1, m2, m3], { shove: true });
    if (!st) break;
    await sleep(250);
    if (m1.gameOver) break;
    m1.emit('next-round');
    await sleep(300);
  }
  const over = m1.gameOver;
  check('all-in match reaches game-over', !!over, `rounds=${rounds}`);
  check('game-over is chip-flavored', over?.gameKind === 'spinking' && over?.matchWinner !== null && over?.mode === 'public');
  check('winner holds every chip', over && over.chips?.[over.matchWinner] === 90, JSON.stringify(over?.chips));
  check('settlement history shipped', Array.isArray(over?.settlements) && over.settlements.length >= 1);
  [m1, m2, m3].forEach((s) => { s.emit('leave-room'); });
  await sleep(200);
  [m1, m2, m3].forEach((s) => s.disconnect());

  // ════════ 7. King regression: a full classic round, untouched ════════
  const k1 = client(), k2 = client(), k3 = client();
  await sleep(350);
  k1.emit('create-room', { playerName: 'კინგ-1', mode: 'public' });
  await sleep(300);
  check('KING room defaults to kind king', k1.created?.gameKind === 'king' && k1.created?.startingStack === null);
  const KCODE = k1.created.roomCode;
  k2.emit('join-room', { roomCode: KCODE, playerName: 'კინგ-2' });
  k3.emit('join-room', { roomCode: KCODE, playerName: 'კინგ-3' });
  await sleep(300);
  k1.emit('start-game');
  await sleep(400);
  check('KING non-leader still sees the open prikup',
    k2.handDealts[0]?.centerCards?.length === 2 && k1.handDealts[0]?.centerCards?.length === 0);

  k1.emit('spin-ack');
  await sleep(200);
  check('KING rooms reject spinking events', k1.lastError === 'Not a Spin King room.');

  k1.emit('select-game-type', { typeCode: 'T' });
  await sleep(300);
  check('KING leader merged to 12', k1.hand?.length === 12);
  k1.emit('discard-cards', { cards: pickDiscards({ chosenGameType: 'T', hand: k1.hand, lastCenterCards: k1.lastCenter }) });
  await sleep(300);

  for (let guard = 0; guard < 40; guard++) {
    const st = await fetchState(k1);
    if (st.phase !== 'playing') break;
    const actor = [k1, k2, k3][st.currentTurn];
    const my = await fetchState(actor);
    if (my.phase !== 'playing') break;
    actor.emit('play-card', { card: pickLegal(my) });
    await sleep(140);
  }
  const krc = k1.lastRound;
  check('KING round completed with scores', !!krc && krc.roundEnds === true && !!krc.scores);
  check('KING round-complete has no settlement field', krc && krc.settlement === undefined);
  check('KING game continues to round 2', krc?.isGameOver === false);
  [k1, k2, k3].forEach((s) => s.emit('leave-room'));
  await sleep(200);
  [k1, k2, k3].forEach((s) => s.disconnect());

  // ════════ 8. Durak ping ════════
  const d = client();
  let durakJoined = null;
  d.on('durak:joined', (j) => { durakJoined = j; });
  await sleep(250);
  d.emit('durak:create', { playerName: 'დურაკ-პინგ' });
  await sleep(300);
  check('DURAK create still works', durakJoined && durakJoined.seat === 0);
  d.disconnect();

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
