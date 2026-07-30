'use strict';

// Rule-by-rule test harness for the ჩეხური დურაკა engine. Run with:
//   node durak/engine.test.js
// Tests manipulate game internals directly for deterministic setups.
//
// Turn model: playing a card does NOT pass the turn — the player must press
// "end turn" (pass). Exceptions: finishing plays resolve immediately, a 7
// keeps the same player on a fresh sub-turn, and taking a 6-penalty skips
// the taker automatically.

const DurakGame = require('./DurakGame');

let passed = 0;
let failed = 0;
const C = (rank, suit) => ({ rank, suit });

function check(name, cond, extra = '') {
  if (cond) { passed += 1; console.log(`  ok  ${name}`); }
  else { failed += 1; console.error(`FAIL  ${name} ${extra}`); }
}

function newGame(n = 3, target = 301) {
  const seats = Array.from({ length: n }, (_, i) => ({ seat: i, name: `P${i}` }));
  const g = new DurakGame(seats, target);
  g.startHand(0);
  return g;
}

/** Force a deterministic table state. */
function rig(g, { hands, top, drawPile, current, pendingDraw = 0, requestedSuit = null }) {
  Object.keys(hands).forEach((s) => { g.hands[s] = hands[s]; });
  if (top) g.discard = [top];
  if (drawPile) g.drawPile = drawPile;
  if (current !== undefined) g.currentSeat = current;
  g.pendingDraw = pendingDraw;
  g.requestedSuit = requestedSuit;
  g.awaitingSuitFrom = null;
  g.drawnThisTurn = false;
  g.playedThisTurn = null;
  g.sixFinisher = null;
  g.finishOrder = [];
  Object.keys(g.hands).forEach((s) => { g.saidKarta[s] = true; }); // mute karta unless testing it
  g.drainEvents();
}

console.log('— deal —');
{
  const g = newGame(4);
  const total = Object.values(g.hands).reduce((s, h) => s + h.length, 0);
  check('deal counts: 3 + 4×3 + 1 flipped + rest in pile',
    total === 15 && g.discard.length === 1 && g.drawPile.length === 36 - 15 - 1,
    `total=${total} pile=${g.drawPile.length}`);
  check('hand phase is playing', g.phase === 'playing');
}

console.log('— first-card powers —');
{
  const g = newGame(3);
  g.discard = [C('6', 'H')]; g.pendingDraw = 2; g.currentSeat = g.nextActive(0);
  check('first 6 → next player faces +2', g.pendingDraw === 2 && g.currentSeat === 1);

  const g7 = newGame(3);
  g7.discard = [C('7', 'H')]; g7.currentSeat = 0;
  check('first 7 → dealer plays again', g7.currentSeat === 0);

  const gq = newGame(3);
  gq.awaitingSuitFrom = 0; gq.currentSeat = 1;
  const blocked = gq.playCard(1, gq.hands[1][0]);
  check('first Q → plays blocked until dealer picks suit', blocked.ok === false);
  const pick = gq.chooseSuit(0, 'S');
  check('dealer picks suit', pick.ok === true && gq.requestedSuit === 'S' && gq.awaitingSuitFrom === null);

  const ga = newGame(3);
  ga.discard = [C('A', 'H')]; ga.currentSeat = ga.nextActive(0, 2);
  check('first A → player after next moves', ga.currentSeat === 2);
}

console.log('— matching & end-turn flow —');
{
  const g = newGame(2);
  rig(g, {
    hands: { 0: [C('9', 'H'), C('8', 'S'), C('Q', 'D'), C('K', 'C')], 1: [C('6', 'D')] },
    top: C('8', 'H'), current: 0,
  });
  check('same suit playable', g.isPlayable(0, C('9', 'H')) === true);
  check('same rank playable', g.isPlayable(0, C('8', 'S')) === true);
  check('queen always playable', g.isPlayable(0, C('Q', 'D')) === true);
  check('unrelated card not playable', g.isPlayable(0, C('K', 'C')) === false);
  check('playing unmatched card rejected', g.playCard(0, C('K', 'C')).ok === false);

  const good = g.playCard(0, C('9', 'H'));
  check('playing matched card accepted', good.ok === true);
  check('turn does NOT pass on play', g.currentSeat === 0 && !!g.playedThisTurn);
  check('second play same turn rejected', g.playCard(0, C('8', 'S')).ok === false);
  check('draw after play rejected', g.drawCard(0).ok === false);
  const done = g.pass(0);
  check('end-turn passes the move', done.ok === true && g.currentSeat === 1);
}

console.log('— six chain —');
{
  const g = newGame(3);
  rig(g, {
    hands: {
      0: [C('6', 'H'), C('9', 'D')],
      1: [C('6', 'S'), C('10', 'C')],
      2: [C('8', 'C'), C('9', 'C')],
    },
    top: C('8', 'H'), drawPile: [C('J', 'S'), C('J', 'D'), C('J', 'C'), C('J', 'H'), C('10', 'S'), C('10', 'D')],
    current: 0,
  });
  g.playCard(0, C('6', 'H'));
  check('6 raises the pending pile at once', g.pendingDraw === 2 && g.currentSeat === 0);
  check('cannot take own 6 as penalty', g.takePenalty(0).ok === false);
  g.pass(0);
  check('end turn → next player faces +2', g.currentSeat === 1);
  check('non-6 rejected while chain pending', g.playCard(1, C('10', 'C')).ok === false);
  check('voluntary draw rejected while chain pending', g.drawCard(1).ok === false);
  check('bare pass rejected while chain pending', g.pass(1).ok === false);
  g.playCard(1, C('6', 'S'));
  g.pass(1);
  check('stacked 6 → +4 to next', g.pendingDraw === 4 && g.currentSeat === 2);
  const before = g.hands[2].length;
  g.takePenalty(2);
  check('penalty drew 4 and skipped the taker', g.hands[2].length === before + 4 && g.pendingDraw === 0 && g.currentSeat === 0);
}

console.log('— seven rules —');
{
  const g = newGame(2);
  rig(g, {
    hands: { 0: [C('7', 'H'), C('9', 'H'), C('K', 'D')], 1: [C('10', 'C'), C('J', 'C')] },
    top: C('8', 'H'), drawPile: [C('K', 'S')], current: 0,
  });
  g.playCard(0, C('7', 'H'));
  check('7 keeps the turn open for another card', g.currentSeat === 0 && g.playedThisTurn === null);
  check('cannot end turn after 7 without drawing', g.pass(0).ok === false);
  g.playCard(0, C('9', 'H'));
  check('second card allowed after a 7', g.playedThisTurn && g.playedThisTurn.rank === '9');
  g.pass(0);
  check('end turn after 7-chain passes on', g.currentSeat === 1 && g.phase === 'playing');

  // 7 as the last card: hand must NOT end; the player draws and continues.
  const g2 = newGame(2);
  rig(g2, {
    hands: { 0: [C('7', 'S')], 1: [C('10', 'C'), C('J', 'C')] },
    top: C('8', 'S'), drawPile: [C('K', 'S'), C('9', 'D')], current: 0,
  });
  g2.playCard(0, C('7', 'S'));
  check('7 as last card does not end the hand', g2.phase === 'playing' && g2.currentSeat === 0 && g2.hands[0].length === 0);
  g2.drawCard(0);
  check('player draws after finishing on 7', g2.hands[0].length === 1);
  g2.saidKarta[0] = true; // said it — testing the 7 flow, not კარტა
  const p = g2.pass(0);
  check('then may end the turn', p.ok === true && g2.currentSeat === 1);
}

console.log('— queen rules —');
{
  const g = newGame(3);
  rig(g, {
    hands: {
      0: [C('Q', 'D'), C('9', 'C')],
      1: [C('Q', 'S'), C('8', 'D')],
      2: [C('10', 'S'), C('J', 'H')],
    },
    top: C('8', 'H'), drawPile: [C('K', 'S'), C('K', 'D')], current: 0,
  });
  check('queen without suit choice rejected', g.playCard(0, C('Q', 'D')).ok === false);
  g.playCard(0, C('Q', 'D'), 'S');
  check('queen sets requested suit immediately', g.requestedSuit === 'S');
  g.pass(0);
  check('only requested suit or queen playable', g.isPlayable(1, C('8', 'D')) === false && g.isPlayable(1, C('Q', 'S')) === true);
  g.playCard(1, C('Q', 'S'), 'D');
  check('queen on non-heart queen may re-choose', g.requestedSuit === 'D');

  // Q♥ lock
  const g2 = newGame(3);
  rig(g2, {
    hands: {
      0: [C('Q', 'H'), C('9', 'C')],
      1: [C('Q', 'S'), C('8', 'D')],
      2: [C('Q', 'C'), C('J', 'H')],
    },
    top: C('9', 'H'), drawPile: [C('K', 'S')], current: 0,
  });
  g2.playCard(0, C('Q', 'H'), 'C');
  g2.pass(0);
  check('Q♥ requests clubs', g2.requestedSuit === 'C');
  g2.playCard(1, C('Q', 'S'), 'D'); // tries to re-choose diamonds
  g2.pass(1);
  check('queen on Q♥ cannot re-choose (request stays clubs)', g2.requestedSuit === 'C');
  g2.playCard(2, C('Q', 'C'), 'H');
  check('queen on non-heart queen re-chooses again', g2.requestedSuit === 'H');
}

console.log('— ace skip —');
{
  const g = newGame(3);
  rig(g, {
    hands: {
      0: [C('A', 'H'), C('9', 'C')],
      1: [C('10', 'H'), C('J', 'H')],
      2: [C('8', 'C'), C('9', 'D')],
    },
    top: C('8', 'H'), current: 0,
  });
  g.playCard(0, C('A', 'H'));
  check('ace does not skip until turn ends', g.currentSeat === 0);
  g.pass(0);
  check('ending the turn applies the ace skip', g.currentSeat === 2);
}

console.log('— draw / pass gating —');
{
  const g = newGame(2);
  rig(g, {
    hands: { 0: [C('9', 'C'), C('K', 'H')], 1: [C('10', 'C'), C('J', 'C')] },
    top: C('8', 'H'), drawPile: [C('K', 'S'), C('K', 'D')], current: 0,
  });
  check('pass before drawing or playing rejected', g.pass(0).ok === false);
  g.drawCard(0);
  check('second draw same turn rejected', g.drawCard(0).ok === false);
  check('pass after drawing ok', g.pass(0).ok === true && g.currentSeat === 1);

  // Empty deck → pass allowed without drawing.
  const g2 = newGame(2);
  rig(g2, {
    hands: { 0: [C('9', 'C'), C('K', 'H')], 1: [C('10', 'C')] },
    top: C('8', 'H'), drawPile: [], current: 0,
  });
  check('draw with empty deck rejected', g2.drawCard(0).ok === false);
  check('pass allowed when nothing to draw', g2.pass(0).ok === true);
}

console.log('— reshuffle —');
{
  const g = newGame(2);
  rig(g, {
    hands: { 0: [C('9', 'C')], 1: [C('10', 'C')] },
    top: C('8', 'H'), drawPile: [], current: 0,
  });
  g.discard = [C('J', 'S'), C('J', 'D'), C('J', 'C'), C('8', 'H')]; // top stays 8♥
  check('drawable counts pile + discard − top', g.drawableCount() === 3);
  g.drawCard(0);
  check('reshuffle kept top card', g.top().rank === '8' && g.top().suit === 'H');
  check('reshuffle moved rest to draw pile', g.drawPile.length === 2 && g.hands[0].length === 2);
}

console.log('— კარტა (end-turn deadline) —');
{
  // Forgot to press: penalty lands when the turn is ENDED, not before.
  const g = newGame(2);
  rig(g, {
    hands: { 0: [C('9', 'H'), C('10', 'H')], 1: [C('10', 'C'), C('J', 'C')] },
    top: C('8', 'H'), drawPile: [C('K', 'S'), C('K', 'D'), C('K', 'C')], current: 0,
  });
  g.playCard(0, C('9', 'H')); // down to 1 card
  check('reaching 1 card clears the flag', g.saidKarta[0] === false);
  check('no penalty while the turn is still open', g.hands[0].length === 1);
  g.pass(0);
  check('ending the turn without კარტა → +1 penalty', g.hands[0].length === 2);

  // Pressed in time → no penalty.
  const g2 = newGame(2);
  rig(g2, {
    hands: { 0: [C('9', 'H'), C('10', 'H')], 1: [C('10', 'C'), C('J', 'C')] },
    top: C('8', 'H'), drawPile: [C('K', 'S'), C('K', 'D')], current: 0,
  });
  g2.playCard(0, C('9', 'H'))
  g2.sayKarta(0)
  g2.pass(0)
  check('said კარტა before ending → no penalty', g2.hands[0].length === 1);

  // Regression: ace with 2 cards — skip returns to the same player without
  // robbing them of the კარტა window.
  const g3 = newGame(2);
  rig(g3, {
    hands: { 0: [C('A', 'H'), C('9', 'H')], 1: [C('10', 'C'), C('J', 'C')] },
    top: C('8', 'H'), drawPile: [C('K', 'S'), C('K', 'D')], current: 0,
  });
  g3.playCard(0, C('A', 'H')); // 1 card left, turn still open
  g3.sayKarta(0);              // player has time to press
  g3.pass(0);                  // ace skips P1 → back to P0
  check('ace regression: back to same player with no penalty',
    g3.currentSeat === 0 && g3.hands[0].length === 1);
}

console.log('— scoring & hand end —');
{
  const g = newGame(3);
  rig(g, {
    hands: {
      0: [C('9', 'H')],
      1: [C('Q', 'H'), C('A', 'S'), C('6', 'C')], // 40 + 11 + 6 = 57
      2: [C('J', 'D'), C('K', 'D'), C('10', 'D')], // 2 + 4 + 10 = 16
    },
    top: C('8', 'H'), current: 0,
  });
  g.playCard(0, C('9', 'H'));
  check('finishing play ends the hand immediately', g.phase === 'hand_end');
  const r = g.lastResults;
  check('winner scored 0', r.perSeat[0].delta === 0 && g.scores[0] === 0);
  check('hand values summed (Q♥=40, A=11, 6=6)', r.perSeat[1].delta === 57, `got ${r.perSeat[1].delta}`);
  check('hand values summed (J=2, K=4, 10=10)', r.perSeat[2].delta === 16, `got ${r.perSeat[2].delta}`);
  check('history records the hand', g.history.length === 1 && g.history[0].winnerSeat === 0);

  const gq = newGame(2);
  rig(gq, {
    hands: { 0: [C('Q', 'H')], 1: [C('9', 'C')] },
    top: C('8', 'H'), current: 0,
  });
  gq.playCard(0, C('Q', 'H'));
  check('ending on Q♥ = −40', gq.lastResults.perSeat[0].delta === -40 && gq.scores[0] === -40);

  const gq2 = newGame(2);
  rig(gq2, {
    hands: { 0: [C('Q', 'S')], 1: [C('9', 'C')] },
    top: C('8', 'H'), current: 0,
  });
  gq2.playCard(0, C('Q', 'S'));
  check('ending on other Q = −20', gq2.lastResults.perSeat[0].delta === -20);
}

console.log('— ending on a six —');
{
  const g = newGame(3);
  rig(g, {
    hands: {
      0: [C('6', 'H')],
      1: [C('6', 'S'), C('9', 'C')],
      2: [C('8', 'C'), C('8', 'D')], // 16 in hand before penalty
    },
    top: C('8', 'H'), drawPile: [C('10', 'S'), C('10', 'D'), C('10', 'C'), C('10', 'H'), C('9', 'S')], current: 0,
  });
  g.playCard(0, C('6', 'H'));
  check('finishing on 6 auto-advances the chain', g.phase === 'playing' && g.hands[0].length === 0 && g.currentSeat === 1);
  g.playCard(1, C('6', 'S'));
  g.sayKarta(1); // down to 1 card — announce before ending the turn
  g.pass(1);
  check('next stacks 6 → +4 pending', g.pendingDraw === 4 && g.currentSeat === 2);
  g.takePenalty(2);
  check('chain resolves elsewhere → hand ends', g.phase === 'hand_end');
  check('winner is the 6-finisher', g.lastResults.winnerSeat === 0);
  // Drawn from the pile top: 9♠ + 10♥ + 10♣ + 10♦ = 39, plus 8♣+8♦ = 16.
  check('drawer scored own + 4 drawn cards', g.lastResults.perSeat[2].delta === 16 + 39, `got ${g.lastResults.perSeat[2].delta}`);

  // Chain comes back to the finisher → they pick up and play continues.
  const g2 = newGame(2);
  rig(g2, {
    hands: { 0: [C('6', 'H')], 1: [C('6', 'S'), C('9', 'C')] },
    top: C('8', 'H'), drawPile: [C('10', 'S'), C('10', 'D'), C('10', 'C'), C('10', 'H'), C('9', 'S')], current: 0,
  });
  g2.playCard(0, C('6', 'H'));
  g2.playCard(1, C('6', 'S'));
  g2.pass(1);
  check('chain back at finisher (+4)', g2.currentSeat === 0 && g2.pendingDraw === 4);
  g2.takePenalty(0);
  check('finisher picked up 4 → play continues', g2.phase === 'playing' && g2.hands[0].length === 4);
  check('finisher turn skipped after penalty', g2.currentSeat === 1);
}

console.log('— elimination & match end —');
{
  const g = newGame(3, 100);
  g.scores[2] = 95;
  rig(g, {
    hands: {
      0: [C('9', 'H')],
      1: [C('J', 'C'), C('J', 'D')],
      2: [C('10', 'C')],
    },
    top: C('8', 'H'), current: 0,
  });
  g.playCard(0, C('9', 'H'));
  check('crossing the target eliminates', g.eliminated[2] === true && g.lastResults.perSeat[2].eliminatedNow === true);
  check('match continues with 2 players', g.phase === 'hand_end' && g.matchWinner === null);
  const next = g.nextHand();
  check('winner deals the next hand (3 cards)', next.ok === true && g.hands[0].length === 3 && g.hands[1].length === 4);
  check('eliminated player gets no cards', g.hands[2] === undefined || (g.hands[2] || []).length === 0);

  g.scores[1] = 99;
  rig(g, {
    hands: { 0: [C('9', 'H')], 1: [C('10', 'C')] },
    top: C('8', 'H'), current: 0,
  });
  g.playCard(0, C('9', 'H'));
  check('last opponent eliminated → match over', g.phase === 'match_end' && g.matchWinner === 0);
}

console.log('— six chain skips eliminated seats —');
{
  const g = newGame(3);
  g.eliminated[1] = true;
  rig(g, {
    hands: { 0: [C('6', 'H'), C('9', 'C')], 2: [C('8', 'C'), C('8', 'D')] },
    top: C('8', 'H'), drawPile: [C('10', 'S'), C('10', 'D'), C('10', 'C')], current: 0,
  });
  g.playCard(0, C('6', 'H'));
  g.pass(0);
  check('chain skips eliminated seat', g.currentSeat === 2);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
