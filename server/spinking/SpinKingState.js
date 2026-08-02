'use strict';

const GameState = require('../game/GameState');
const { SPIN_TYPES, PLEDGE_TIERS, anteFor } = require('./constants');

/**
 * Spin King — the King trick game played for poker chips.
 *
 * Extends the battle-tested King GameState so ALL trick mechanics are
 * inherited untouched (follow-suit, K♥ dump, trumps, trick resolution,
 * per-round stat maps, flavor scoring). What changes is the round shell:
 *
 *   ante → 'spin' (random type from the 7-entry pool)
 *        → 'auction' (rising bids for the face-down prikup)
 *        → ['trump_selection' → 'discard'] (buyer; or leader on all-pass PLUS)
 *        → 'pledge' (fold / call / raise on a self-chosen tier)
 *        → 'playing' (inherited trick engine; buyer or leader leads)
 *        → settlement inside 'round_end', or 'match_end'
 *
 * Chips move ONLY through betting: antes, the auction price and pledge
 * stakes form the pot. The pledge is a POKER-STYLE ESCALATION on a single
 * shared condition: the table starts at the loosest tier of the round
 * type's ladder, and a raise may add chips, tighten the condition (move up
 * the ladder), or both — everyone still in must then call the new (tier,
 * stake) pair or fold. At settlement the non-folded players who fulfilled
 * the FINAL condition split the pot EQUALLY (remainder chips clockwise
 * from the round leader); if nobody fulfilled it the pot ROLLS OVER.
 * Folding never excuses trick play — a folded player still plays the
 * round, they just can't win this pot. Players at 0 chips become zombies:
 * they keep playing tricks (three bodies are required) but never bet
 * again. The match ends when a single player holds chips.
 */
class SpinKingState extends GameState {
  constructor(players, startingStack) {
    super(players); // deals round 1; phase is replaced by _openRound below

    this.startingStack = startingStack;
    this.chips = { 0: startingStack, 1: startingStack, 2: startingStack };
    this.pot = 0;
    this.zombies = { 0: false, 1: false, 2: false };

    this.auctionWinner = null;
    this.auctionPrice = null;
    this.auction = null; // { bid, highBidder, passed: {seat: bool} }
    // { tierIdx, stake, entries: {seat: {status, committed}}, toAct: [seats], lastRaiser }
    this.pledge = null;

    this.lastSettlement = null;
    this.settlements = [];
    this.matchWinner = null;

    this.events = []; // transient — drained by the socket layer, never persisted
    this._rng = Math.random; // injectable for deterministic tests

    this._openRound({ deal: false });
  }

  // ── derived ────────────────────────────────────────────────────────────────

  get anteAmount() { return anteFor(this.startingStack); }

  /** The rotating round leader (zombies still take their turn as leader). */
  get roundLeader() { return (this.round - 1) % 3; }

  /**
   * The base engine's "leader" is whoever owns the prikup privileges this
   * round: the auction winner, or the rotating leader when nobody bought.
   * This single override points the inherited trump/discard guards and the
   * first-trick lead at the right seat.
   */
  get leaderSeat() { return this.auctionWinner ?? this.roundLeader; }

  get isGameOver() { return this.phase === 'match_end'; }

  _event(e) { this.events.push(e); }
  drainEvents() { const out = this.events; this.events = []; return out; }
  _err(error) { return { ok: false, error }; }

  _aliveSeats() { return [0, 1, 2].filter((s) => !this.zombies[s]); }

  _statsBundle() {
    return {
      tricksTaken: this.tricksTaken,
      queensTaken: this.queensTaken,
      jacksTaken: this.jacksTaken,
      heartsTaken: this.heartsTaken,
      kingOfHeartsTakenBy: this.kingOfHeartsTakenBy,
      trickWinners: this.trickWinners,
    };
  }

  // ── round opening: ante + spin ─────────────────────────────────────────────

  _openRound({ deal }) {
    if (deal) this.dealCards();
    // Ante from every non-zombie, capped at their stack.
    for (const seat of this._aliveSeats()) {
      const paid = Math.min(this.anteAmount, this.chips[seat]);
      if (paid > 0) {
        this.chips[seat] -= paid;
        this.pot += paid;
        this._event({ type: 'ante', seat, paid });
      }
    }
    this.chosenGameType = SPIN_TYPES[Math.floor(this._rng() * SPIN_TYPES.length)];
    this.phase = 'spin';
    this.currentTurn = null;
    this._event({ type: 'spin', code: this.chosenGameType });
  }

  /** Any seat's reel finishing advances the table (first ack wins). */
  ackSpin(seat) {
    if (this.phase !== 'spin') return this._err('Not in spin phase.');
    if (![0, 1, 2].includes(seat)) return this._err('Invalid seat.');
    this._startAuction();
    return { ok: true };
  }

  // ── prikup auction (rising) ────────────────────────────────────────────────

  get _minNextBid() {
    if (!this.auction) return this.anteAmount;
    return this.auction.bid === 0 ? this.anteAmount : this.auction.bid + this.anteAmount;
  }

  _startAuction() {
    this.auction = {
      bid: 0,
      highBidder: null,
      passed: { 0: !!this.zombies[0], 1: !!this.zombies[1], 2: !!this.zombies[2] },
    };
    this.phase = 'auction';
    this._advanceAuction(this.roundLeader, true);
  }

  /**
   * Move the auction pointer to the next seat that can act, sweeping in
   * auto-passes for seats that can't afford the minimum bid. Resolves the
   * auction when nobody is left to act.
   */
  _advanceAuction(fromSeat, inclusive = false) {
    const a = this.auction;
    for (let i = inclusive ? 0 : 1; i <= 3; i++) {
      const seat = (fromSeat + i) % 3;
      if (i === 3 && !inclusive) break;
      if (a.passed[seat]) continue;
      if (seat === a.highBidder) continue; // nobody left to outbid them
      if (this.chips[seat] < this._minNextBid) {
        a.passed[seat] = true;
        this._event({ type: 'auction-autopass', seat });
        continue;
      }
      this.currentTurn = seat;
      return;
    }
    this._resolveAuction();
  }

  placeBid(seat, amount) {
    if (this.phase !== 'auction') return this._err('Not in auction phase.');
    if (seat !== this.currentTurn) return this._err('Not your turn.');
    const a = this.auction;
    if (a.passed[seat]) return this._err('You already passed.');
    const bid = Math.round(Number(amount));
    if (!Number.isFinite(bid)) return this._err('Invalid bid.');
    if (bid < this._minNextBid) return this._err(`Minimum bid is ${this._minNextBid}.`);
    if (bid > this.chips[seat]) return this._err('Not enough chips.');
    a.bid = bid;
    a.highBidder = seat;
    this._event({ type: 'auction-bid', seat, amount: bid });
    this._advanceAuction(seat);
    return { ok: true };
  }

  passBid(seat) {
    if (this.phase !== 'auction') return this._err('Not in auction phase.');
    if (seat !== this.currentTurn) return this._err('Not your turn.');
    this.auction.passed[seat] = true;
    this._event({ type: 'auction-pass', seat });
    this._advanceAuction(seat);
    return { ok: true };
  }

  _resolveAuction() {
    const a = this.auction;
    if (a.highBidder !== null) {
      const winner = a.highBidder;
      this.chips[winner] -= a.bid;
      this.pot += a.bid;
      this.auctionWinner = winner;
      this.auctionPrice = a.bid;
      this._event({ type: 'auction-won', seat: winner, amount: a.bid });
      if (this.isTrumpType) {
        // Buyer picks trump BEFORE seeing the prikup (King rule preserved).
        this.phase = 'trump_selection';
        this.currentTurn = winner;
      } else {
        // Merge the prikup exactly like the base engine does.
        this.lastCenterCards = [...this.centerCards];
        this.hands[winner] = this.hands[winner].concat(this.centerCards);
        this.centerCards = [];
        this.trumpSuit = null;
        this.phase = 'discard';
        this.currentTurn = winner;
      }
      return;
    }
    // All passed — the prikup stays face-down and OUT OF PLAY.
    this.auctionWinner = null;
    this.auctionPrice = null;
    this._event({ type: 'auction-allpass' });
    if (this.isTrumpType) {
      // PLUS with no buyer: the rotating leader still picks trump (no merge).
      this.phase = 'trump_selection';
      this.currentTurn = this.roundLeader;
    } else {
      this._startPledge();
    }
  }

  // ── trump / discard rewiring ───────────────────────────────────────────────

  selectTrump(seat, suit) {
    if (this.auctionWinner !== null) {
      // Buyer path: base guard/merge/discard flow is exactly right (the
      // leaderSeat getter already points at the buyer).
      const res = super.selectTrump(seat, suit);
      if (res.ok) this.currentTurn = this.auctionWinner;
      return res;
    }
    // All-pass path: leader picks trump, prikup stays buried, no discard.
    if (this.phase !== 'trump_selection') return this._err('Not in trump selection phase.');
    if (seat !== this.roundLeader) return this._err('Only the leader can select trump.');
    if (!['H', 'D', 'S', 'C'].includes(suit) && suit !== null) return this._err('Invalid suit.');
    this.trumpSuit = suit;
    this._event({ type: 'trump', seat, suit });
    this._startPledge();
    return { ok: true };
  }

  discardCards(seat, cards) {
    const res = super.discardCards(seat, cards);
    if (res.ok) {
      // Base put us straight into 'playing' — the pledge round goes first.
      this._startPledge();
    }
    return res;
  }

  // ── pledge betting ─────────────────────────────────────────────────────────

  _startPledge() {
    const entries = {};
    const toAct = [];
    for (let i = 0; i < 3; i++) {
      const seat = (this.roundLeader + i) % 3;
      const out = this.zombies[seat] || this.chips[seat] === 0;
      entries[seat] = { status: out ? 'folded' : 'pending', committed: 0 };
      if (!out) toAct.push(seat);
    }
    // One SHARED condition for the whole table: tierIdx indexes the round
    // type's ladder (0 = loosest). Raising may tighten it; calling accepts
    // it. tierSetBy remembers WHO last tightened the condition (badge/UI).
    this.pledge = { tierIdx: 0, stake: 0, entries, toAct, lastRaiser: null, tierSetBy: null };
    this.phase = 'pledge';
    if (toAct.length === 0) {
      this._beginTrickPlay();
      return;
    }
    this.currentTurn = toAct[0];
  }

  /** Raise ceiling: the shortest committed+stack among non-folded seats —
   *  an all-in player pins the cap until they fold (no side pots). */
  get _pledgeCap() {
    if (!this.pledge) return 0;
    let cap = Infinity;
    for (let s = 0; s < 3; s++) {
      const e = this.pledge.entries[s];
      if (!e || e.status === 'folded') continue;
      cap = Math.min(cap, e.committed + this.chips[s]);
    }
    return cap === Infinity ? 0 : cap;
  }

  get _pledgeLadder() {
    return PLEDGE_TIERS[this.chosenGameType] || [];
  }

  /**
   * fold / call / raise on the shared (tier, stake) pair.
   *  - While the stake is 0 the only options are fold or raise (open with
   *    at least an ante) — there is NO free entry into the pot.
   *  - call matches the current stake AND accepts the current condition.
   *    A player who has already matched the stake and faces a tier-only
   *    escalation calls for free — that's the "check".
   *  - raise must tighten the condition (higher ladder index), add at least
   *    an ante of chips, or both. A tier-only raise at the matched stake
   *    costs nothing extra — the stricter condition IS the aggression —
   *    but still reopens the action for everyone else.
   */
  pledgeAct(seat, { action, tier, stake } = {}) {
    if (this.phase !== 'pledge') return this._err('Not in pledge phase.');
    if (seat !== this.currentTurn) return this._err('Not your turn.');
    const p = this.pledge;
    const entry = p.entries[seat];
    if (!entry || entry.status === 'folded') return this._err('You are out of this pot.');

    if (action === 'fold') {
      entry.status = 'folded';
      p.toAct = p.toAct.filter((s) => s !== seat);
      this._event({ type: 'pledge-fold', seat });
    } else if (action === 'call') {
      if (p.stake === 0) return this._err('Open with a bet or fold.');
      const delta = p.stake - entry.committed;
      if (delta > this.chips[seat]) return this._err('Not enough chips.'); // unreachable via cap, kept as a guard
      this.chips[seat] -= delta;
      this.pot += delta;
      entry.committed = p.stake;
      entry.status = 'in';
      p.toAct = p.toAct.filter((s) => s !== seat);
      this._event({ type: 'pledge-call', seat, stake: p.stake, tierIdx: p.tierIdx });
    } else if (action === 'raise') {
      const ladder = this._pledgeLadder;
      let newTierIdx = p.tierIdx;
      if (tier !== undefined && tier !== null) {
        const idx = ladder.findIndex((t) => t.id === tier);
        if (idx === -1) return this._err('Unknown pledge tier.');
        if (idx < p.tierIdx) return this._err('The pledge can only get stricter.');
        newTierIdx = idx;
      }
      const tierRaised = newTierIdx > p.tierIdx;
      let newStake = (stake === undefined || stake === null) ? p.stake : Math.round(Number(stake));
      if (!Number.isFinite(newStake)) return this._err('Invalid stake.');
      if (newStake < p.stake) return this._err('The stake cannot go down.');
      // No zero-chip pledges: every entry into the pot costs at least an
      // ante, even when the raise is "just" a tier tighten on an unopened
      // table.
      if (newStake < this.anteAmount) {
        return this._err(`Minimum bet is ${this.anteAmount}.`);
      }
      const moneyRaised = newStake > p.stake;
      if (moneyRaised && newStake < p.stake + this.anteAmount) {
        return this._err(`Minimum raise is ${p.stake + this.anteAmount}.`);
      }
      if (!tierRaised && !moneyRaised) {
        return this._err('Raise must tighten the pledge or add chips.');
      }
      if (newStake > this._pledgeCap) return this._err(`Maximum is ${this._pledgeCap}.`);
      const delta = newStake - entry.committed;
      if (delta > this.chips[seat]) return this._err('Not enough chips.');
      this.chips[seat] -= delta;
      this.pot += delta;
      entry.committed = newStake;
      entry.status = 'in';
      p.stake = newStake;
      if (tierRaised) p.tierSetBy = seat;
      p.tierIdx = newTierIdx;
      p.lastRaiser = seat;
      // Everyone else who is still in must respond to the raise.
      p.toAct = [];
      for (let i = 1; i < 3; i++) {
        const other = (seat + i) % 3;
        const oe = p.entries[other];
        if (oe && oe.status !== 'folded') p.toAct.push(other);
      }
      this._event({ type: 'pledge-raise', seat, stake: newStake, tierIdx: newTierIdx });
    } else {
      return this._err('Invalid pledge action.');
    }

    if (p.toAct.length === 0) {
      this._beginTrickPlay();
    } else {
      this.currentTurn = p.toAct[0];
    }
    return { ok: true };
  }

  _beginTrickPlay() {
    this.phase = 'playing';
    this.currentTurn = this.leaderSeat; // buyer, or the rotating leader
    this.trickNumber = 1;
    this.currentTrick = [];
    this.ledSuit = null;
    this._event({ type: 'tricks-begin', seat: this.leaderSeat });
  }

  // ── trick play (inherited) + settlement hook ──────────────────────────────

  /**
   * All-pass rounds bury the prikup, which can make the base K/Q/J/H end
   * conditions unreachable (e.g. K♥ face-down on the table). The base game
   * can never hit this — the leader always merges the prikup — so it gets a
   * universal 10-trick backstop here.
   */
  _checkRoundEnd() {
    return super._checkRoundEnd() || this.trickWinners.length >= 10;
  }

  playCard(seat, card) {
    const res = super.playCard(seat, card);
    if (res.ok && res.roundEnds) {
      this._settle();
      res.settlement = this.lastSettlement;
      // Base computed isGameOver from TOTAL_ROUNDS — meaningless here.
      res.isGameOver = this.phase === 'match_end';
      res.matchWinner = this.matchWinner;
    } else if (res.ok) {
      res.isGameOver = false;
    }
    return res;
  }

  // ── settlement ─────────────────────────────────────────────────────────────

  _settle() {
    const stats = this._statsBundle();
    const potBefore = this.pot;
    // Everyone still in competes on the SAME final condition.
    const activeTier = this.pledge ? (this._pledgeLadder[this.pledge.tierIdx] || null) : null;

    const results = {};
    const winners = [];
    for (let s = 0; s < 3; s++) {
      const entry = this.pledge ? this.pledge.entries[s] : null;
      const entered = !!entry && entry.status === 'in';
      const met = entered && !!activeTier && activeTier.check(stats, s);
      results[s] = {
        entered,
        committed: entry ? entry.committed : 0,
        met,
      };
      if (met) winners.push(s);
    }

    // Payouts: whoever fulfilled the final condition splits the WHOLE pot
    // equally; remainder chips go one at a time clockwise from the leader.
    const payouts = { 0: 0, 1: 0, 2: 0 };
    let rolledOver = false;
    if (winners.length > 0) {
      const share = Math.floor(potBefore / winners.length);
      let leftover = potBefore - share * winners.length;
      const clockwisePos = (s) => (s - this.roundLeader + 3) % 3;
      const order = [...winners].sort((a, b) => clockwisePos(a) - clockwisePos(b));
      for (const s of winners) payouts[s] = share;
      for (let i = 0; leftover > 0; i++, leftover--) {
        payouts[order[i % order.length]] += 1;
      }
      for (const s of winners) this.chips[s] += payouts[s];
      this.pot = 0;
    } else {
      rolledOver = potBefore > 0;
      if (rolledOver) this._event({ type: 'rollover', amount: potBefore });
    }

    // Zombie marking happens only here, at settlement.
    const newZombies = [];
    for (let s = 0; s < 3; s++) {
      if (!this.zombies[s] && this.chips[s] === 0) {
        this.zombies[s] = true;
        newZombies.push(s);
        this._event({ type: 'zombie', seat: s });
      }
    }

    // Match end?
    const alive = this._aliveSeats().filter((s) => this.chips[s] > 0);
    let matchEnd = false;
    if (alive.length === 1) {
      matchEnd = true;
      this.matchWinner = alive[0];
    } else if (alive.length === 0) {
      // Everything landed in a rolled-over pot and every stack died — pick
      // the flavor-score leader so the match always has a winner.
      matchEnd = true;
      let best = 0;
      for (let s = 1; s < 3; s++) {
        if (this.cumulativeScores[s] > this.cumulativeScores[best]) best = s;
      }
      this.matchWinner = best;
    }
    if (matchEnd) {
      // The winner sweeps any rolled-over pot — keeps chip conservation tidy.
      this.chips[this.matchWinner] += this.pot;
      this.pot = 0;
      this.phase = 'match_end';
      this._event({ type: 'match-end', seat: this.matchWinner });
    }

    this.lastSettlement = {
      round: this.round,
      gameType: this.chosenGameType,
      trumpSuit: this.trumpSuit,
      roundLeader: this.roundLeader,
      auctionWinner: this.auctionWinner,
      auctionPrice: this.auctionPrice,
      // The final shared condition the round settled on.
      tierId: activeTier ? activeTier.id : null,
      potBefore,
      results,
      payouts,
      rolledOver,
      potAfter: this.pot,
      chipsAfter: { ...this.chips },
      newZombies,
      flavorScores: { ...this.cumulativeScores },
      matchEnd,
      matchWinner: this.matchWinner,
    };
    this.settlements.push(this.lastSettlement);

    this._assertConservation();
    return this.lastSettlement;
  }

  _assertConservation() {
    const total = this.chips[0] + this.chips[1] + this.chips[2] + this.pot;
    const expected = 3 * this.startingStack;
    if (total !== expected) {
      const msg = `[spinking] chip conservation broken: ${total} !== ${expected}`;
      if (process.env.NODE_ENV === 'test') throw new Error(msg);
      console.warn(msg);
    }
  }

  // ── next round ─────────────────────────────────────────────────────────────

  /**
   * Reimplementation (base startNextRound refuses past TOTAL_ROUNDS and
   * targets 'type_selection'). The per-round reset block mirrors
   * GameState.startNextRound (:546-562) — keep them in sync.
   */
  startNextRound() {
    if (this.phase !== 'round_end') {
      return { ok: false, error: 'Round is not over yet.' };
    }

    this.round++;
    this.chosenGameType = null;
    this.trumpSuit = null;
    this.lastCenterCards = [];
    this.tricksTaken = { 0: 0, 1: 0, 2: 0 };
    this.queensTaken = { 0: 0, 1: 0, 2: 0 };
    this.jacksTaken = { 0: 0, 1: 0, 2: 0 };
    this.heartsTaken = { 0: 0, 1: 0, 2: 0 };
    this.kingOfHeartsTakenBy = null;
    this.trickWinners = [];
    this.lastTrick = null;
    this.currentTrick = [];
    this.ledSuit = null;
    this.trickNumber = 0;
    this.currentTurn = null;

    // Spin King round state
    this.auctionWinner = null;
    this.auctionPrice = null;
    this.auction = null;
    this.pledge = null;
    this.lastSettlement = null;

    this._openRound({ deal: true });
    return { ok: true };
  }

  // ── persistence ────────────────────────────────────────────────────────────

  serialize() {
    return {
      ...super.serialize(),
      engine: 'spinking',
      startingStack: this.startingStack,
      chips: this.chips,
      pot: this.pot,
      zombies: this.zombies,
      auctionWinner: this.auctionWinner,
      auctionPrice: this.auctionPrice,
      auction: this.auction,
      pledge: this.pledge ? {
        tierIdx: this.pledge.tierIdx,
        stake: this.pledge.stake,
        entries: this.pledge.entries,
        toAct: this.pledge.toAct,
        lastRaiser: this.pledge.lastRaiser,
        tierSetBy: this.pledge.tierSetBy ?? null,
      } : null,
      lastSettlement: this.lastSettlement,
      settlements: this.settlements,
      matchWinner: this.matchWinner,
    };
  }

  /**
   * Reimplementation (base hardcodes GameState.prototype). The base default
   * block mirrors GameState.fromSnapshot (:116-141) — keep them in sync.
   */
  static fromSnapshot(snapshot) {
    if (!snapshot || !Array.isArray(snapshot.players)) return null;
    const gs = Object.create(SpinKingState.prototype);
    Object.assign(gs, {
      // base defaults
      hands: { 0: [], 1: [], 2: [] },
      centerCards: [],
      lastCenterCards: [],
      chosenGameType: null,
      trumpSuit: null,
      usedTypes: { 0: [], 1: [], 2: [] },
      currentTrick: [],
      ledSuit: null,
      trickNumber: 0,
      currentTurn: null,
      tricksTaken: { 0: 0, 1: 0, 2: 0 },
      queensTaken: { 0: 0, 1: 0, 2: 0 },
      jacksTaken: { 0: 0, 1: 0, 2: 0 },
      heartsTaken: { 0: 0, 1: 0, 2: 0 },
      kingOfHeartsTakenBy: null,
      trickWinners: [],
      lastTrick: null,
      roundScores: [],
      roundDetails: [],
      cumulativeScores: { 0: 0, 1: 0, 2: 0 },
      round: 1,
      phase: 'spin',
      // spinking defaults
      startingStack: 1000,
      chips: { 0: 0, 1: 0, 2: 0 },
      pot: 0,
      zombies: { 0: false, 1: false, 2: false },
      auctionWinner: null,
      auctionPrice: null,
      auction: null,
      pledge: null,
      lastSettlement: null,
      settlements: [],
      matchWinner: null,
    }, snapshot);
    gs.events = [];
    gs._rng = Math.random;
    return gs;
  }

  // ── per-seat view ──────────────────────────────────────────────────────────

  getStateForPlayer(seat) {
    const view = super.getStateForPlayer(seat);

    // The prikup is a face-down gamble — its contents must NEVER reach a
    // client before the merge (the base view reveals them to non-leaders).
    view.centerCards = [];
    view.prikupCount = this.centerCards.length;
    view.prikupDead = this.auctionWinner === null && this.centerCards.length === 2 &&
      ['pledge', 'playing', 'round_end', 'match_end'].includes(this.phase);

    view.gameKind = 'spinking';
    // Trick-winner history feeds the live L2 pledge readout on resync (the
    // base view exposes only the per-suit tallies).
    view.trickWinners = [...this.trickWinners];
    view.roundLeader = this.roundLeader;
    view.startingStack = this.startingStack;
    view.ante = this.anteAmount;
    view.chips = { ...this.chips };
    view.pot = this.pot;
    view.zombies = { ...this.zombies };
    view.auctionWinner = this.auctionWinner;
    view.auctionPrice = this.auctionPrice;
    view.auction = this.auction ? {
      bid: this.auction.bid,
      highBidder: this.auction.highBidder,
      passed: { ...this.auction.passed },
      minNextBid: this._minNextBid,
    } : null;
    view.pledge = this.pledge ? {
      tierIdx: this.pledge.tierIdx,
      tierId: this._pledgeLadder[this.pledge.tierIdx]?.id ?? null,
      stake: this.pledge.stake,
      entries: JSON.parse(JSON.stringify(this.pledge.entries)),
      toAct: [...this.pledge.toAct],
      cap: this._pledgeCap,
      minRaise: this.pledge.stake + this.anteAmount,
      canTighten: this.pledge.tierIdx < this._pledgeLadder.length - 1,
      lastRaiser: this.pledge.lastRaiser,
      tierSetBy: this.pledge.tierSetBy ?? null,
    } : null;
    view.lastSettlement = this.lastSettlement;
    view.settlements = this.settlements;
    view.matchWinner = this.matchWinner;
    view.isGameOver = this.isGameOver;
    return view;
  }
}

module.exports = SpinKingState;
