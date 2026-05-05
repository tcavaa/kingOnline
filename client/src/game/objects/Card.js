export const CARD_W = 70
export const CARD_H = 100

export const SUIT_SYMBOLS = { H: '♥', D: '♦', S: '♠', C: '♣' }
export const SUIT_COLORS  = { H: '#dc2626', D: '#dc2626', S: '#0a0a0a', C: '#0a0a0a' }

/**
 * Create a face-up card Container at (x, y).
 * Designed to match the modern minimalist style of the reference picture.
 */
export function createFaceUpCard(scene, x, y, card, interactive = false) {
  const { rank, suit } = card
  const color      = SUIT_COLORS[suit]
  const suitSymbol = SUIT_SYMBOLS[suit]
  const W = CARD_W
  const H = CARD_H

  const container = scene.add.container(x, y)

  // Drop shadow
  const shadow = scene.add.graphics()
  shadow.fillStyle(0x000000, 0.45)
  shadow.fillRoundedRect(-W / 2 + 2, -H / 2 + 5, W, H, 8)
  container.add(shadow)

  // White card body
  const bg = scene.add.graphics()
  bg.fillStyle(0xffffff, 1)
  bg.fillRoundedRect(-W / 2, -H / 2, W, H, 8)
  bg.lineStyle(1, 0xe5e7eb, 1)
  bg.strokeRoundedRect(-W / 2, -H / 2, W, H, 8)
  container.add(bg)

  // Top-left rank
  const rankTL = scene.add.text(-W / 2 + 6, -H / 2 + 4, rank, {
    fontSize: '18px', color, fontFamily: 'Georgia, serif', fontStyle: 'bold',
  }).setOrigin(0, 0)

  // Top-left suit
  const suitTL = scene.add.text(-W / 2 + 6, -H / 2 + 24, suitSymbol, {
    fontSize: '16px', color, fontFamily: 'Georgia, serif', fontStyle: 'bold',
  }).setOrigin(0, 0)

  // Bottom-right large suit
  const centerSuit = scene.add.text(W / 2 - 8, H / 2 - 8, suitSymbol, {
    fontSize: '34px', color, fontFamily: 'Georgia, serif', fontStyle: 'bold',
  }).setOrigin(1, 1)

  container.add([rankTL, suitTL, centerSuit])

  if (interactive) {
    container.setSize(W, H)
    container.setInteractive()
  }

  container.cardData = card
  return container
}

/**
 * Create a face-down card Container at (x, y).
 * Renders the royal SVG card-back texture loaded by PreloadScene.
 * Falls back to a procedural navy back if the texture isn't ready (e.g. HMR).
 */
export function createFaceDownCard(scene, x, y) {
  const W = CARD_W
  const H = CARD_H

  const container = scene.add.container(x, y)

  // Shadow
  const shadow = scene.add.graphics()
  shadow.fillStyle(0x000000, 0.45)
  shadow.fillRoundedRect(-W / 2 + 2, -H / 2 + 4, W, H, 8)
  container.add(shadow)

  if (scene.textures.exists('card-back')) {
    const img = scene.add.image(0, 0, 'card-back').setDisplaySize(W, H)
    container.add(img)
  } else {
    const back = scene.add.graphics()
    back.fillStyle(0x091735, 1)
    back.fillRoundedRect(-W / 2, -H / 2, W, H, 8)
    back.lineStyle(2, 0xdba247, 1)
    back.strokeRoundedRect(-W / 2 + 4, -H / 2 + 4, W - 8, H - 8, 6)
    container.add(back)
  }

  return container
}
