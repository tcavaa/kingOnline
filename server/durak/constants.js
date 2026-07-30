'use strict';

// ჩეხური დურაკა — 36-card deck, 6 through Ace.
const SUITS = ['S', 'H', 'D', 'C'];
const RANKS = ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 6;

const DEFAULT_TARGET_SCORE = 301;
const MIN_TARGET_SCORE = 50;
const MAX_TARGET_SCORE = 5000;

/**
 * Hand-scoring value of a card (counted for cards left in hand when a
 * hand ends). Q♥ is worth double a normal queen.
 */
function cardPoints(card) {
  switch (card.rank) {
    case '6': return 6;
    case '7': return 7;
    case '8': return 8;
    case '9': return 9;
    case '10': return 10;
    case 'J': return 2;
    case 'Q': return card.suit === 'H' ? 40 : 20;
    case 'K': return 4;
    case 'A': return 11;
    default: return 0;
  }
}

function buildDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) deck.push({ rank, suit });
  }
  return deck;
}

function shuffle(cards) {
  const arr = [...cards];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    ;[arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const sameCard = (a, b) => !!a && !!b && a.rank === b.rank && a.suit === b.suit;

module.exports = {
  SUITS, RANKS, MIN_PLAYERS, MAX_PLAYERS,
  DEFAULT_TARGET_SCORE, MIN_TARGET_SCORE, MAX_TARGET_SCORE,
  cardPoints, buildDeck, shuffle, sameCard,
};
