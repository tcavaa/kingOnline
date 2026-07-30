'use strict';

const {
  SUITS, cardPoints, buildDeck, shuffle, sameCard,
} = require('./constants');

/**
 * ჩეხური დურაკა (Czech Durak) — full match state machine for 2–6 players.
 *
 * A MATCH is a series of HANDS. Every hand: 36-card deck, dealer (previous
 * hand's winner, creator on the first hand) gets 3 cards, everyone else 4,
 * and one card is auto-flipped onto the table as the dealer's "play".
 * A player wins the hand by emptying their hand; everyone else scores the
 * cards left in hand (6..10 face, J=2, Q=20, Q♥=40, K=4, A=11). Reaching
 * the room's target score eliminates you; last survivor wins the match.
 *
 * Card powers:
 *   6 — next player draws +2 and is skipped; 6s stack the penalty (+2 each).
 *   7 — same player plays again; a turn (or the hand) can never end on a 7.
 *   Q — wild: plays on anything, player picks the suit to follow. A queen
 *       covering Q♥ cannot re-pick (the Q♥'s requested suit stands).
 *   A — next player is skipped.
 *
 * Turn rules: you may play one matching card (same suit or same rank as the
 * top card; the requested suit after a Q), or voluntarily draw exactly one
 * card, after which you may play or pass. Passing without drawing is only
 * possible when there is nothing left to draw.
 *
 * "კარტა": on dropping to one card you must press the კარტა button before
 * your next turn starts, or you're dealt one penalty card.
 */
class DurakGame {
  constructor(seats, targetScore) {
    // seats: [{ seat, name }] — fixed for the whole match.
    this.seats = seats.map((s) => s.seat);
    this.targetScore = targetScore;
    this.scores = {};
    this.eliminated = {};
    this.seats.forEach((s) => { this.scores[s] = 0; this.eliminated[s] = false; });

    this.phase = 'idle'; // 'playing' | 'hand_end' | 'match_end'
    this.handNumber = 0;
    this.matchWinner = null;
    this.lastResults = null; // hand-end summary for the UI
    this.history = []; // one entry per finished hand — feeds the score sheet

    // Per-hand state (created in startHand)
    this.hands = {};
    this.drawPile = [];
    this.discard = [];
    this.currentSeat = null;
    this.dealerSeat = null;
    this.pendingDraw = 0;
    this.requestedSuit = null;
    this.awaitingSuitFrom = null;
    this.drawnThisTurn = false;
    // The card played this turn (null until the player plays). A turn only
    // passes when the player presses "end turn" — gives them time to call
    // კარტა before opponents rush ahead.
    this.playedThisTurn = null;
    this.saidKarta = {};
    this.finishOrder = [];
    this.sixFinisher = null; // seat that emptied on a 6 while the chain runs
    this.events = []; // transient toasts drained by the handler layer
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  activeSeats() { return this.seats.filter((s) => !this.eliminated[s]); }

  nextActive(fromSeat, steps = 1) {
    const order = this.seats;
    let idx = order.indexOf(fromSeat);
    let remaining = steps;
    for (let i = 0; i < order.length * (steps + 1); i++) {
      idx = (idx + 1) % order.length;
      if (!this.eliminated[order[idx]]) {
        remaining -= 1;
        if (remaining === 0) return order[idx];
      }
    }
    return fromSeat;
  }

  top() { return this.discard[this.discard.length - 1] || null; }

  /** Cards still available to draw (draw pile + reshufflable discard). */
  drawableCount() {
    return this.drawPile.length + Math.max(0, this.discard.length - 1);
  }

  _drawOneCard() {
    if (this.drawPile.length === 0) {
      // Reshuffle everything except the top card back into the draw pile.
      if (this.discard.length > 1) {
        const topCard = this.discard.pop();
        this.drawPile = shuffle(this.discard);
        this.discard = [topCard];
        this._event({ type: 'reshuffle' });
      }
    }
    return this.drawPile.pop() || null;
  }

  _drawN(seat, n) {
    let drawn = 0;
    for (let i = 0; i < n; i++) {
      const card = this._drawOneCard();
      if (!card) break;
      this.hands[seat].push(card);
      drawn += 1;
    }
    // Any draw voids a standing კარტა call (hand size changed).
    if (drawn > 0) this.saidKarta[seat] = false;
    return drawn;
  }

  _event(e) { this.events.push(e); }
  drainEvents() { const out = this.events; this.events = []; return out; }

  _err(message) { return { ok: false, error: message }; }

  // ── hand lifecycle ─────────────────────────────────────────────────────────

  startHand(dealerSeat) {
    const active = this.activeSeats();
    if (active.length < 2) return this._err('Not enough players.');
    if (!active.includes(dealerSeat)) dealerSeat = this.nextActive(dealerSeat);

    this.handNumber += 1;
    this.dealerSeat = dealerSeat;
    this.phase = 'playing';
    this.lastResults = null;
    this.pendingDraw = 0;
    this.requestedSuit = null;
    this.awaitingSuitFrom = null;
    this.drawnThisTurn = false;
    this.playedThisTurn = null;
    this.finishOrder = [];
    this.sixFinisher = null;
    this.hands = {};
    this.saidKarta = {};

    this.drawPile = shuffle(buildDeck());
    // Dealer (hand starter) gets 3 — their 4th card is flipped to the table.
    for (const seat of active) {
      this.hands[seat] = [];
      this.saidKarta[seat] = false;
      const count = seat === dealerSeat ? 3 : 4;
      for (let i = 0; i < count; i++) this.hands[seat].push(this.drawPile.pop());
    }
    const first = this.drawPile.pop();
    this.discard = [first];

    // The flipped card counts as the dealer's play — its power applies.
    if (first.rank === '6') {
      this.pendingDraw = 2;
      this.currentSeat = this.nextActive(dealerSeat);
    } else if (first.rank === '7') {
      // Dealer must play again (can't end on a 7).
      this.currentSeat = dealerSeat;
    } else if (first.rank === 'Q') {
      // Dealer picks the suit before the next player moves.
      this.awaitingSuitFrom = dealerSeat;
      this.currentSeat = this.nextActive(dealerSeat);
    } else if (first.rank === 'A') {
      this.currentSeat = this.nextActive(dealerSeat, 2);
    } else {
      this.currentSeat = this.nextActive(dealerSeat);
    }
    return { ok: true };
  }

  // ── turn actions ───────────────────────────────────────────────────────────

  isPlayable(seat, card) {
    if (this.pendingDraw > 0) return card.rank === '6';
    const top = this.top();
    if (!top) return false;
    if (card.rank === 'Q') return true;
    if (this.requestedSuit) return card.suit === this.requestedSuit;
    return card.suit === top.suit || card.rank === top.rank;
  }

  hasPlayable(seat) {
    return (this.hands[seat] || []).some((c) => this.isPlayable(seat, c));
  }

  _checkTurn(seat) {
    if (this.phase !== 'playing') return 'The hand is not in progress.';
    if (this.currentSeat !== seat) return 'Not your turn.';
    if (this.awaitingSuitFrom !== null) return 'Waiting for the suit to be chosen.';
    return null;
  }

  chooseSuit(seat, suit) {
    if (this.phase !== 'playing') return this._err('The hand is not in progress.');
    if (this.awaitingSuitFrom !== seat) return this._err('You are not choosing a suit.');
    if (!SUITS.includes(suit)) return this._err('Invalid suit.');
    this.requestedSuit = suit;
    this.awaitingSuitFrom = null;
    this._event({ type: 'suit-chosen', seat, suit });
    return { ok: true };
  }

  playCard(seat, card, requestSuit = null) {
    const turnErr = this._checkTurn(seat);
    if (turnErr) return this._err(turnErr);
    // One card per turn (a 7 opens a fresh sub-turn) — after playing, the
    // player must press "end turn".
    if (this.playedThisTurn) return this._err('სვლა უკვე გააკეთე — დააჭირე „სვლის დასრულებას".');
    const hand = this.hands[seat];
    const idx = hand.findIndex((c) => sameCard(c, card));
    if (idx === -1) return this._err('You do not have that card.');
    if (!this.isPlayable(seat, hand[idx])) {
      return this._err(this.pendingDraw > 0
        ? 'Only a 6 can answer a 6.'
        : 'That card does not match.');
    }

    const prevTop = this.top();
    const prevRequest = this.requestedSuit;
    const willFinish = hand.length === 1;
    const isQueen = hand[idx].rank === 'Q';
    // A queen covering Q♥ inherits its requested suit; any other queen (that
    // doesn't empty the hand) needs a suit choice up front.
    const suitLocked = !!(prevTop && prevTop.rank === 'Q' && prevTop.suit === 'H' && prevRequest);
    if (isQueen && !willFinish && !suitLocked && !SUITS.includes(requestSuit)) {
      return this._err('Choose a suit for the queen.');
    }

    const played = hand.splice(idx, 1)[0];
    this.discard.push(played);
    this.requestedSuit = null;
    const finished = hand.length === 0;
    if (hand.length === 1) this.saidKarta[seat] = false; // must announce again
    this._event({ type: 'played', seat, card: played });

    if (isQueen && !finished) {
      if (suitLocked) {
        this.requestedSuit = prevRequest;
        this._event({ type: 'suit-locked', seat, suit: prevRequest });
      } else {
        this.requestedSuit = requestSuit;
        this._event({ type: 'suit-chosen', seat, suit: requestSuit });
      }
    }

    if (finished && this.finishOrder.indexOf(seat) === -1 && played.rank !== '7') {
      this.finishOrder.push(seat);
    }

    if (played.rank === '6') {
      this.pendingDraw += 2;
      if (finished) {
        // Finishing on a 6 resolves immediately — the chain marches on.
        this.sixFinisher = seat;
        this._advance(1);
      } else {
        this.playedThisTurn = played; // ends the turn via "end turn"
      }
    } else if (played.rank === '7') {
      // Same player again — a turn can never end on a 7, so even with an
      // empty hand they stay on the move (and will have to draw).
      this.drawnThisTurn = false;
      this.playedThisTurn = null;
    } else if (finished) {
      this._endHand(played);
    } else {
      // A/Q/plain cards: the effect is applied when the player presses
      // "end turn" (pass) — so they can still call კარტა in time.
      this.playedThisTurn = played;
    }
    return { ok: true };
  }

  drawCard(seat) {
    const turnErr = this._checkTurn(seat);
    if (turnErr) return this._err(turnErr);
    if (this.playedThisTurn) return this._err('სვლა უკვე გააკეთე — დააჭირე „სვლის დასრულებას".');
    if (this.pendingDraw > 0) return this._err('You must answer the 6 or take the penalty.');
    if (this.drawnThisTurn) return this._err('You already drew a card this turn.');
    if (this.drawableCount() === 0) return this._err('No cards left to draw.');
    this._drawN(seat, 1);
    this.drawnThisTurn = true;
    this._event({ type: 'drew', seat, count: 1 });
    return { ok: true };
  }

  takePenalty(seat) {
    const turnErr = this._checkTurn(seat);
    if (turnErr) return this._err(turnErr);
    if (this.playedThisTurn) return this._err('სვლა უკვე გააკეთე — დააჭირე „სვლის დასრულებას".');
    if (this.pendingDraw <= 0) return this._err('There is no penalty to take.');
    const amount = this.pendingDraw;
    this.pendingDraw = 0;
    const drawn = this._drawN(seat, amount);
    this._event({ type: 'penalty', seat, count: drawn });

    // If someone emptied their hand on a 6, the hand ends as soon as the
    // chain resolves on ANOTHER player. If it came all the way back to the
    // finisher, they pick the cards up and play continues.
    const emptySeats = this.activeSeats().filter((s) => (this.hands[s] || []).length === 0);
    if (emptySeats.length > 0) {
      this.sixFinisher = null;
      this._endHand(null);
      return { ok: true };
    }
    this.sixFinisher = null;
    this._advance(1); // penalty always skips the taker's turn
    return { ok: true };
  }

  /** "სვლის დასრულება" — every turn ends here (after a play or a draw). */
  pass(seat) {
    const turnErr = this._checkTurn(seat);
    if (turnErr) return this._err(turnErr);
    const played = this.playedThisTurn;
    if (!played) {
      if (this.pendingDraw > 0) return this._err('You must answer the 6 or take the penalty.');
      if (!this.drawnThisTurn && this.drawableCount() > 0) {
        return this._err('Draw a card before passing.');
      }
    }
    // კარტა deadline: ending your turn with one unannounced card costs one.
    if ((this.hands[seat] || []).length === 1 && !this.saidKarta[seat]) {
      const drawn = this._drawN(seat, 1);
      if (drawn > 0) this._event({ type: 'karta-penalty', seat });
    }
    if (played && played.rank === 'A') {
      const skipped = this.nextActive(seat);
      this._advance(2);
      this._event({ type: 'skipped', seat: skipped });
    } else {
      this._advance(1);
    }
    return { ok: true };
  }

  sayKarta(seat) {
    if (this.phase !== 'playing') return this._err('The hand is not in progress.');
    if ((this.hands[seat] || []).length !== 1) return this._err('You can only call კარტა with one card.');
    if (this.saidKarta[seat]) return { ok: true };
    this.saidKarta[seat] = true;
    this._event({ type: 'karta', seat });
    return { ok: true };
  }

  _advance(steps) {
    this.currentSeat = this.nextActive(this.currentSeat, steps);
    this.drawnThisTurn = false;
    this.playedThisTurn = null;
    // (კარტა enforcement happens when a turn is ENDED — see pass() — so a
    // player always has their whole turn to press the button.)
  }

  _endHand(lastCard) {
    this.phase = 'hand_end';
    const winnerSeat = this.finishOrder.find(
      (s) => (this.hands[s] || []).length === 0
    ) ?? this.finishOrder[0] ?? null;

    const results = {};
    let bonus = 0;
    if (lastCard && lastCard.rank === 'Q' && winnerSeat !== null) {
      bonus = lastCard.suit === 'H' ? -40 : -20;
    }
    for (const seat of this.activeSeats()) {
      const handPoints = (this.hands[seat] || []).reduce((sum, c) => sum + cardPoints(c), 0);
      const delta = seat === winnerSeat ? bonus : handPoints;
      this.scores[seat] += delta;
      results[seat] = { delta, total: this.scores[seat], eliminatedNow: false };
    }
    // Eliminations (the winner can never cross — they score 0 or negative).
    for (const seat of this.activeSeats()) {
      if (this.scores[seat] >= this.targetScore) {
        this.eliminated[seat] = true;
        results[seat].eliminatedNow = true;
        this._event({ type: 'eliminated', seat });
      }
    }
    this.lastResults = { winnerSeat, bonus, perSeat: results, handNumber: this.handNumber };
    this.history.push({
      handNumber: this.handNumber,
      winnerSeat,
      bonus,
      perSeat: Object.fromEntries(
        Object.entries(results).map(([s, r]) => [s, r.delta])
      ),
    });

    const remaining = this.activeSeats();
    if (remaining.length <= 1) {
      this.phase = 'match_end';
      this.matchWinner = remaining.length === 1 ? remaining[0] : winnerSeat;
      this._event({ type: 'match-end', seat: this.matchWinner });
    } else {
      this._event({ type: 'hand-end', seat: winnerSeat });
    }
  }

  /** Deal the next hand; the previous hand's winner deals. */
  nextHand() {
    if (this.phase !== 'hand_end') return this._err('The hand is not over.');
    const dealer = this.lastResults && this.lastResults.winnerSeat !== null
      ? this.lastResults.winnerSeat
      : this.dealerSeat;
    return this.startHand(this.eliminated[dealer] ? this.nextActive(dealer) : dealer);
  }

  /** Fresh match with the same seats/target (scores wiped). */
  resetMatch() {
    this.seats.forEach((s) => { this.scores[s] = 0; this.eliminated[s] = false; });
    this.phase = 'idle';
    this.handNumber = 0;
    this.matchWinner = null;
    this.lastResults = null;
    this.history = [];
    return { ok: true };
  }

  // ── persistence ────────────────────────────────────────────────────────────

  /** Plain-JSON snapshot of the whole match (events excluded — transient). */
  serialize() {
    return {
      seats: this.seats,
      targetScore: this.targetScore,
      scores: this.scores,
      eliminated: this.eliminated,
      phase: this.phase,
      handNumber: this.handNumber,
      matchWinner: this.matchWinner,
      lastResults: this.lastResults,
      history: this.history,
      hands: this.hands,
      drawPile: this.drawPile,
      discard: this.discard,
      currentSeat: this.currentSeat,
      dealerSeat: this.dealerSeat,
      pendingDraw: this.pendingDraw,
      requestedSuit: this.requestedSuit,
      awaitingSuitFrom: this.awaitingSuitFrom,
      drawnThisTurn: this.drawnThisTurn,
      playedThisTurn: this.playedThisTurn,
      saidKarta: this.saidKarta,
      finishOrder: this.finishOrder,
      sixFinisher: this.sixFinisher,
    };
  }

  static fromSnapshot(snap) {
    if (!snap || !Array.isArray(snap.seats)) return null;
    const game = new DurakGame(snap.seats.map((s) => ({ seat: s })), snap.targetScore);
    Object.assign(game, {
      scores: snap.scores || {},
      eliminated: snap.eliminated || {},
      phase: snap.phase || 'idle',
      handNumber: snap.handNumber || 0,
      matchWinner: snap.matchWinner ?? null,
      lastResults: snap.lastResults ?? null,
      history: snap.history || [],
      hands: snap.hands || {},
      drawPile: snap.drawPile || [],
      discard: snap.discard || [],
      currentSeat: snap.currentSeat ?? null,
      dealerSeat: snap.dealerSeat ?? null,
      pendingDraw: snap.pendingDraw || 0,
      requestedSuit: snap.requestedSuit ?? null,
      awaitingSuitFrom: snap.awaitingSuitFrom ?? null,
      drawnThisTurn: !!snap.drawnThisTurn,
      playedThisTurn: snap.playedThisTurn ?? null,
      saidKarta: snap.saidKarta || {},
      finishOrder: snap.finishOrder || [],
      sixFinisher: snap.sixFinisher ?? null,
    });
    game.events = [];
    return game;
  }

  // ── views ──────────────────────────────────────────────────────────────────

  stateFor(seat) {
    const canDraw = this.drawableCount() > 0;
    return {
      phase: this.phase,
      handNumber: this.handNumber,
      targetScore: this.targetScore,
      dealerSeat: this.dealerSeat,
      currentSeat: this.currentSeat,
      topCard: this.top(),
      // Last few pile cards so the client can draw a stacked discard heap.
      recentDiscards: this.discard.slice(-4),
      discardCount: this.discard.length,
      requestedSuit: this.requestedSuit,
      awaitingSuitFrom: this.awaitingSuitFrom,
      pendingDraw: this.pendingDraw,
      drawnThisTurn: this.drawnThisTurn,
      playedThisTurn: this.playedThisTurn,
      drawPileCount: this.drawPile.length,
      drawableCount: this.drawableCount(),
      canDraw,
      yourSeat: seat,
      yourHand: this.hands[seat] ? [...this.hands[seat]] : [],
      saidKarta: this.saidKarta[seat] || false,
      scores: { ...this.scores },
      eliminated: { ...this.eliminated },
      handCounts: Object.fromEntries(
        this.seats.map((s) => [s, (this.hands[s] || []).length])
      ),
      kartaFlags: Object.fromEntries(
        this.seats.map((s) => [s, !!this.saidKarta[s]])
      ),
      lastResults: this.lastResults,
      history: this.history,
      matchWinner: this.matchWinner,
    };
  }
}

module.exports = DurakGame;
