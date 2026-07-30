'use strict';

// End-to-end smoke test over real sockets: boots the actual server on a
// spare port, drives a 3-player durak room through create/join/start and a
// few turns, and regression-checks the King game's create-room + REST API.
// Run: PORT=3299 node durak/socket.smoke.js

process.env.PORT = process.env.PORT || '3299';
require('../index.js');

const path = require('path');
const { io } = require(path.join(__dirname, '..', '..', 'client', 'node_modules', 'socket.io-client'));

const URL = `http://localhost:${process.env.PORT}`;
let passed = 0, failed = 0;
const check = (name, cond, extra = '') => {
  if (cond) { passed += 1; console.log(`  ok  ${name}`); }
  else { failed += 1; console.error(`FAIL  ${name} ${extra}`); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function client() {
  const s = io(URL, { forceNew: true, transports: ['websocket'] });
  s.durakStates = [];
  s.on('durak:state', (st) => { s.durakStates.push(st); s.lastDurak = st; });
  s.on('durak:error', (e) => { s.lastError = e.message; });
  s.on('error', (e) => { s.lastKingError = e && e.message; });
  return s;
}

(async () => {
  await sleep(700); // let the server boot

  const a = client(), b = client(), c = client();
  await sleep(400);

  // ── durak: create / join ──
  let joined = null;
  a.on('durak:joined', (j) => { joined = j; });
  a.emit('durak:create', { playerName: 'ანა', targetScore: 120 });
  await sleep(250);
  check('create → joined with seat 0', joined && joined.seat === 0 && /^D/.test(joined.roomCode));
  const code = joined.roomCode;

  b.emit('durak:join', { roomCode: code, playerName: 'ბექა' });
  c.emit('durak:join', { roomCode: code, playerName: 'გია' });
  await sleep(300);
  check('roster shows 3 players', a.lastDurak?.room?.players?.length === 3);
  check('room still waiting', a.lastDurak?.room?.status === 'waiting');

  // Non-creator cannot start
  b.emit('durak:start');
  await sleep(250);
  check('non-creator start rejected', b.lastError && b.lastError.includes('შემქმნელი'));

  a.emit('durak:start');
  await sleep(350);
  const ga = a.lastDurak?.game, gb = b.lastDurak?.game;
  check('match started', ga && ga.phase === 'playing' && a.lastDurak.room.status === 'playing');
  check('dealer (creator) got 3 cards', ga.yourHand.length === 3, `got ${ga?.yourHand?.length}`);
  check('others got 4 cards', gb.yourHand.length === 4, `got ${gb?.yourHand?.length}`);
  check('one card flipped on table', !!ga.topCard);
  check('hands are private (counts only)', gb.handCounts['0'] === 3 && gb.yourHand.length === 4);
  const dealt = 3 + 4 + 4 + 1;
  check('draw pile holds the rest', ga.drawPileCount === 36 - dealt, `got ${ga.drawPileCount}`);

  // ── one legal move by whoever's on turn ──
  await sleep(150);
  const st = a.lastDurak.game;
  const seats = { 0: a, 1: b, 2: c };
  const turnSock = seats[st.currentSeat];
  if (st.awaitingSuitFrom !== null) {
    seats[st.awaitingSuitFrom].emit('durak:choose-suit', { suit: 'S' });
    await sleep(250);
    check('first-card queen: suit chosen', a.lastDurak.game.requestedSuit === 'S' || a.lastDurak.game.phase !== 'playing');
  } else if (turnSock) {
    const mySt = turnSock.lastDurak.game;
    if (mySt.pendingDraw > 0) {
      const before = mySt.yourHand.length;
      turnSock.emit('durak:penalty');
      await sleep(250);
      check('first-card six: penalty taken', turnSock.lastDurak.game.yourHand.length >= before + 1);
    } else {
      turnSock.emit('durak:draw');
      await sleep(250);
      const afterDraw = turnSock.lastDurak.game;
      check('voluntary draw adds a card', afterDraw.yourHand.length === mySt.yourHand.length + 1);
      check('drawnThisTurn flagged', afterDraw.drawnThisTurn === true);
      turnSock.emit('durak:pass');
      await sleep(250);
      check('pass after draw advances the turn', turnSock.lastDurak.game.currentSeat !== mySt.currentSeat);
    }
  }

  // ── reconnect by name keeps the seat ──
  b.disconnect();
  await sleep(250);
  const b2 = client();
  let rejoin = null;
  b2.on('durak:joined', (j) => { rejoin = j; });
  await sleep(250);
  b2.emit('durak:join', { roomCode: code, playerName: 'ბექა' });
  await sleep(300);
  check('reconnect by name re-takes seat 1', rejoin && rejoin.seat === 1 && rejoin.reconnected === true);
  check('rejoined client got game state', !!b2.lastDurak?.game);

  // ── public table: first sitter owns the target score ──
  const p1 = client(), p2 = client();
  let p1Joined = null, p2Joined = null, durakPublicView = null;
  p1.on('durak:joined', (j) => { p1Joined = j; });
  p2.on('durak:joined', (j) => { p2Joined = j; });
  p1.on('durak:public-room', (v) => { durakPublicView = v; });
  await sleep(300);
  p1.emit('durak:sit-public', { playerName: 'პუბლიკა-1' });
  await sleep(250);
  check('first sit opens the public table', p1Joined && p1Joined.seat === 0 && durakPublicView?.roomCode);
  check('public table default target 301', durakPublicView?.targetScore === 301);

  p2.emit('durak:sit-public', { playerName: 'პუბლიკა-2' });
  await sleep(250);
  check('second sit joins the same table', p2Joined && p2Joined.roomCode === p1Joined.roomCode && p2Joined.seat === 1);

  p2.emit('durak:set-target', { targetScore: 500 });
  await sleep(250);
  check('non-first sitter cannot change target', p2.lastError && p2.lastError.includes('პირველ'));
  p1.emit('durak:set-target', { targetScore: 500 });
  await sleep(250);
  check('first sitter adjusts target to 500', durakPublicView?.targetScore === 500);

  // chat relay
  let chatGot = null;
  p2.on('durak:chat', (m) => { chatGot = m; });
  p1.emit('durak:chat', { message: 'გამარჯობა მაგიდავ' });
  await sleep(250);
  check('chat relayed to the room', chatGot && chatGot.message === 'გამარჯობა მაგიდავ' && chatGot.seat === 0);

  // start clears the public slot; creator can end the match back to lobby
  p1.emit('durak:start');
  await sleep(300);
  check('public table start works', p1.lastDurak?.room?.status === 'playing');
  check('started table frees the public slot', durakPublicView?.roomCode === null);
  check('history starts empty', Array.isArray(p1.lastDurak?.game?.history) && p1.lastDurak.game.history.length === 0);
  check('recentDiscards present for stacked pile', (p1.lastDurak?.game?.recentDiscards || []).length >= 1);

  p2.emit('durak:end-match');
  await sleep(250);
  check('non-creator cannot end the match', p2.lastError && p2.lastError.includes('თამადას'));
  p1.emit('durak:end-match');
  await sleep(300);
  check('creator ends match → back to waiting', p1.lastDurak?.room?.status === 'waiting' && p1.lastDurak?.game === null);

  // ── King regression: same server, same socket space ──
  const k = client();
  let kingRoom = null;
  k.on('room-created', (r) => { kingRoom = r; });
  let publicView = null;
  k.on('public-room', (v) => { publicView = v; });
  await sleep(250);
  k.emit('create-room', { playerName: 'ჩეხა-ტესტი', avatar: null, mode: 'public' });
  k.emit('public-room-info');
  await sleep(350);
  check('KING create-room still works', kingRoom && kingRoom.roomCode && kingRoom.mode === 'public');
  check('KING public-room payload intact (two tables)', publicView && 'public' in publicView && 'championship' in publicView);
  check('KING got no durak state leakage', (k.durakStates || []).length === 0);

  const res = await fetch(`${URL}/api/public/games?limit=1`);
  check('KING public API still serves', res.ok);
  const quota = await fetch(`${URL}/api/quota/ჩეხა-ტესტი`);
  const qj = await quota.json();
  check('KING quota endpoint still works', quota.ok && qj.limit === 2);

  console.log(`\n${passed} passed, ${failed} failed`);
  ;[a, b2, c, k, p1, p2].forEach((s) => s.disconnect());
  process.exit(failed ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
