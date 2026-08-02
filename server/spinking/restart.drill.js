'use strict';

// Restart drill: boots the real server as a child process, drives a Spin
// King table to MID-PLEDGE over real sockets, SIGKILLs the server, boots a
// fresh one on the same port, and proves all three seats resume the same
// pledge from the persisted live_games snapshot (MySQL) and can finish the
// betting + keep playing tricks.
// Run: node spinking/restart.drill.js

const { spawn } = require('child_process');
const path = require('path');
const { io } = require(path.join(__dirname, '..', '..', 'client', 'node_modules', 'socket.io-client'));
const { PLEDGE_TIERS } = require('./constants');

const PORT = 3296;
const URL = `http://localhost:${PORT}`;
let passed = 0, failed = 0;
const check = (name, cond, extra = '') => {
  if (cond) { passed += 1; console.log(`  ok  ${name}`); }
  else { failed += 1; console.error(`FAIL  ${name} ${extra}`); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function bootServer() {
  const child = spawn(process.execPath, ['index.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'ignore',
  });
  return child;
}

function client() {
  const s = io(URL, { forceNew: true, transports: ['websocket'], reconnection: false });
  s.on('game-state', (st) => { s.lastState = st; });
  s.on('room-created', (p) => { s.created = p; });
  s.on('room-joined', (p) => { s.joined = p; });
  s.on('hand-updated', (p) => { s.hand = p.hand; s.lastCenter = p.lastCenterCards || s.lastCenter; });
  s.on('error', (e) => { s.lastError = e && e.message; });
  return s;
}

async function fetchState(sock) {
  sock.emit('request-state');
  await sleep(150);
  return sock.lastState;
}

(async () => {
  let server = bootServer();
  await sleep(900);

  // ── Drive to mid-pledge ──────────────────────────────────────────────────
  const a = client(), b = client(), c = client();
  await sleep(400);
  a.emit('create-room', { playerName: 'დრილ-ა', gameKind: 'spinking', startingStack: 400 });
  await sleep(300);
  check('room created', !!a.created?.roomCode);
  const CODE = a.created.roomCode;
  b.emit('join-room', { roomCode: CODE, playerName: 'დრილ-ბ' });
  c.emit('join-room', { roomCode: CODE, playerName: 'დრილ-გ' });
  await sleep(300);
  a.emit('start-game');
  await sleep(400);
  a.emit('spin-ack');
  await sleep(300);

  const seats = [a, b, c];
  for (let i = 0; i < 4; i++) {
    const st = await fetchState(a);
    if (st.phase !== 'auction') break;
    seats[st.currentTurn].emit('pass-bid');
    await sleep(160);
  }
  {
    const st = await fetchState(a);
    if (st.phase === 'trump_selection') {
      seats[st.currentTurn].emit('select-trump', { suit: 'S' });
      await sleep(250);
    }
  }
  let st = await fetchState(a);
  check('reached pledge', st.phase === 'pledge' && st.currentTurn === 0);
  const TYPE = st.chosenGameType;
  const stricter = PLEDGE_TIERS[TYPE][1] || null;
  a.emit('pledge-act', { action: 'raise', stake: st.ante * 2, ...(stricter ? { tier: stricter.id } : {}) });
  await sleep(350); // one raise in → _persist has flushed the mid-pledge snapshot

  st = await fetchState(b);
  check('mid-pledge state on the wire', st.pledge?.stake === st.ante * 2 && st.currentTurn === 1);
  const potBefore = st.pot;

  // ── SIGKILL → fresh boot → resume ────────────────────────────────────────
  server.kill('SIGKILL');
  await sleep(400);
  [a, b, c].forEach((s) => s.disconnect());
  server = bootServer();
  await sleep(1100); // boot + hydrateAll

  const a2 = client(), b2 = client(), c2 = client();
  await sleep(400);
  a2.emit('join-room', { roomCode: CODE, playerName: 'დრილ-ა' });
  b2.emit('join-room', { roomCode: CODE, playerName: 'დრილ-ბ' });
  c2.emit('join-room', { roomCode: CODE, playerName: 'დრილ-გ' });
  await sleep(600);

  check('all three re-attached to their seats',
    a2.joined?.seat === 0 && b2.joined?.seat === 1 && c2.joined?.seat === 2 &&
    a2.joined?.reconnected === true && a2.joined?.gameKind === 'spinking');
  const rb = b2.lastState;
  check('pledge survived the kill',
    rb?.phase === 'pledge' && rb.pledge?.stake === rb.ante * 2 &&
    rb.pledge?.tierId === (stricter ? stricter.id : PLEDGE_TIERS[TYPE][0].id) &&
    rb.currentTurn === 1);
  check('chips & pot survived', rb?.pot === potBefore &&
    (rb.chips[0] + rb.chips[1] + rb.chips[2] + rb.pot === 3 * 400));
  check('type & hand survived', rb?.chosenGameType === TYPE && rb.hand?.length === 10);

  // Finish the pledge on the restored engine and play one legal card.
  b2.emit('pledge-act', { action: 'call' });
  await sleep(250);
  c2.emit('pledge-act', { action: 'fold' });
  await sleep(350);
  const seats2 = [a2, b2, c2];
  let pst = await fetchState(a2);
  check('restored pledge closed into tricks', pst.phase === 'playing');
  const actor = seats2[pst.currentTurn];
  const my = await fetchState(actor);
  const lead = (my.hand || []).find((card) => {
    if ((my.chosenGameType === 'K' || my.chosenGameType === 'H') &&
        card.suit === 'H' && my.hand.some((x) => x.suit !== 'H')) return false;
    return true;
  });
  actor.emit('play-card', { card: lead });
  await sleep(300);
  pst = await fetchState(actor);
  check('restored engine accepts trick play', (pst.currentTrick || []).length === 1 || pst.hand.length === 9);

  [a2, b2, c2].forEach((s) => s.emit('leave-room'));
  await sleep(300);
  [a2, b2, c2].forEach((s) => s.disconnect());
  server.kill('SIGKILL');

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
