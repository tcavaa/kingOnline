import Phaser from 'phaser'
import { EventBus } from '../EventBus.js'
import { createFaceUpCard, createFaceDownCard, CARD_W, CARD_H } from '../objects/Card.js'
import { SOUNDS } from '../../constants/sounds.js'
import { getTier, tierProgress, PROGRESS_COLOR, chipBreakdown, seatStatText } from '../../constants/spinKing.js'

// CSS hex string ("#daa520") → Phaser color int (0xdaa520).
const hexToInt = (hex) => parseInt(hex.slice(1), 16)

const W = 1100
const H = 700

// ── Table geometry ────────────────────────────────────────────────────────────
const TABLE_CX = W / 2
const TABLE_CY = H / 2 - 30
const TABLE_RX = 470
const TABLE_RY = 240

// ── Player slot positions, by relative seat (0 = self at bottom) ──────────────
// We place own avatar at the very bottom of the canvas (under the cards),
// and the two opponents on the left/right sides where their card-fans sit.
const AVATAR_POS = [
  { x: TABLE_CX, y: H - 70 },  // self (bottom)
  { x: 100,      y: H / 2 - 40 }, // left opponent
  { x: W - 100,  y: H / 2 - 40 }, // right opponent
]

// Position of the opponent card fans
const OPP_FAN_POS = [
  null,
  { baseX: 230, y: H / 2 - 40, dir: 1  }, // left
  { baseX: W - 230, y: H / 2 - 40, dir: -1 }, // right
]

// Centre trick drop zones (3 cards in a slight overlap stack)
const TRICK_POS = [
  { x: TABLE_CX,       y: TABLE_CY + 50, angle: -4 }, // self
  { x: TABLE_CX - 60,  y: TABLE_CY,      angle: -10 }, // left
  { x: TABLE_CX + 60,  y: TABLE_CY,      angle: 10 },  // right
]

// Avatar accent colours
const AVATAR_COLOR = [0xf0a500, 0x4ade80, 0x4ade80] // self gold, opps green
const AVATAR_COLOR_HEX = ['#f0a500', '#4ade80', '#4ade80']

// Mirror of server-side validatePlay() so the UI greys out cards that the
// server would reject. Source of truth lives in server/game/GameState.js —
// keep the rules here in sync with that file.
const TRUMP_TYPES = new Set(['P1', 'P2', 'P3'])

function isPlayableCard(card, state) {
  const { currentTurn, mySeat, gamePhase, currentTrick, ledSuit, chosenGameType, trumpSuit, hand, trickAnimation, playPending } = state
  if (gamePhase !== 'playing') return false
  if (currentTurn !== mySeat)  return false
  // Lock interaction while the just-completed trick is being revealed/animated.
  if (trickAnimation)          return false
  // Lock the entire hand the moment the user has clicked a card and the
  // server hasn't yet acked. Stops rapid-fire clicks from optimistically
  // removing additional cards before the first round-trip completes.
  if (playPending)             return false

  // Leading a new trick (or a fresh one after a 3-card-clear).
  if (!currentTrick || currentTrick.length === 0 || currentTrick.length === 3) {
    if (chosenGameType === 'K' || chosenGameType === 'H') {
      const nonHearts = (hand || []).filter(c => c.suit !== 'H')
      if (nonHearts.length > 0) return card.suit !== 'H'
    }
    return true
  }

  // Following a trick.
  if (ledSuit) {
    const hasSuit = (hand || []).some(c => c.suit === ledSuit)
    if (hasSuit) return card.suit === ledSuit

    // Cannot follow suit — apply the same forced-play rules as the server.
    // 'K' game: if the player still holds K♥, they must play it.
    if (chosenGameType === 'K') {
      const hasKingOfHearts = (hand || []).some(c => c.rank === 'K' && c.suit === 'H')
      if (hasKingOfHearts) return card.rank === 'K' && card.suit === 'H'
    }
    // Pluses with trump: must play a trump card if any.
    if (trumpSuit && TRUMP_TYPES.has(chosenGameType)) {
      const hasTrump = (hand || []).some(c => c.suit === trumpSuit)
      if (hasTrump) return card.suit === trumpSuit
    }
  }
  return true
}

export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' })
    this.gameState     = null
    this.handCards     = []
    this.trickCards    = []
    this.opponentCards = { 1: [], 2: [] }
    this.avatarObjs    = []
    this.centerObjs    = []
    this.chatObjs      = []
    this._avatarKeys   = new Map()  // seat -> texture-key
    this._animatingTrick = false
    // Track when a fresh deal happens so we play the deal animation only on
    // the moment hands materialise (round start), not on every re-render.
    this._lastDealRound = null
    this._lastTrickWinner = null
    this._lastTrickKingHearts = false
  }

  _ensureAvatarTexture(player) {
    if (!player?.avatar) return null
    const key = `avatar_${player.seat}_${player.name}`
    if (this.textures.exists(key)) return key
    const stored = this._avatarKeys.get(player.seat)
    if (stored && stored.src === player.avatar && this.textures.exists(stored.key)) return stored.key
    const img = new window.Image()
    img.onload = () => {
      if (!this.scene || !this.sys?.isActive()) return
      if (!this.textures.exists(key)) {
        this.textures.addImage(key, img)
      }
      this._avatarKeys.set(player.seat, { src: player.avatar, key })
      if (this.gameState) this._renderAll(this.gameState)
    }
    img.src = player.avatar
    return null  // not ready yet — render initial fallback
  }

  create() {
    this._drawBackground()
    this._drawTable()
    this._drawWatermark()

    // Bind handlers so we can detach the exact same references on shutdown
    this._onStateUpdate = (state) => {
      // ALWAYS cache the freshest snapshot, even if we can't draw it right
      // now (scene still booting, or mid trick-animation). The gate-release,
      // force-render and visibility paths all repaint from `this.gameState`,
      // so it must never lag the server — otherwise a render that was skipped
      // during an animation replays stale data (the "I can't see the card
      // they just played" desync).
      this.gameState = state
      // Guard against late events arriving after the scene has been torn down
      // or before it's active: store-but-don't-draw, the re-push / scene-ready
      // / force-render paths will paint it once we're live.
      if (!this.sys || !this.sys.displayList || !this.sys.isActive()) return
      this._renderAll(state)
    }
    this._onAnimateTrickWinner = ({ winnerSeat }) => {
      if (!this.sys || !this.sys.displayList || !this.sys.isActive()) return
      this._animateTrickToWinner(winnerSeat)
    }
    // Hard resync hook: force the canvas to drop any stuck animation gate and
    // repaint from the freshest cached state. Fired by the client when it
    // becomes our turn (defeats a Phaser-side stale render) and after a
    // game-state rehydrate (defeats the blank-table-on-rejoin race).
    this._onForceRender = () => {
      if (!this.sys || !this.sys.displayList || !this.sys.isActive()) return
      this._animatingTrick = false
      if (this._trickWatchdog) { clearTimeout(this._trickWatchdog); this._trickWatchdog = null }
      this._sweepFlyingChips()
      if (this.gameState) this._renderAll(this.gameState)
    }

    // Spin King chip flights: bets sliding into the pot, payouts sliding
    // out to the winners.
    this._onChipsFly = ({ moves, direction }) => {
      if (!this.sys || !this.sys.displayList || !this.sys.isActive()) return
      this._animateChips(moves || [], direction)
    }

    EventBus.on('state-update', this._onStateUpdate)
    EventBus.on('animate-trick-winner', this._onAnimateTrickWinner)
    EventBus.on('force-render', this._onForceRender)
    EventBus.on('spin-chips-fly', this._onChipsFly)

    // ── Visibility-change recovery ────────────────────────────────────────
    // When a tab is backgrounded mid-animation, Phaser pauses the scene
    // clock and the `delayedCall(750)` inside `_animateTrickToWinner`
    // never fires — leaving `_animatingTrick = true` and silently
    // dropping every render until the next refresh. On `visibilitychange
    // → visible`, force the gate open and re-render with the latest
    // server state we have cached. The wall-clock watchdog covers the
    // case where the user never backgrounds but the scene clock still
    // stalls; this covers the explicit-background case for free.
    this._onVisibility = () => {
      if (typeof document === 'undefined') return
      if (document.visibilityState !== 'visible') return
      if (!this.sys || !this.sys.isActive()) return
      this._animatingTrick = false
      if (this._trickWatchdog) { clearTimeout(this._trickWatchdog); this._trickWatchdog = null }
      this._sweepFlyingChips()
      if (this.gameState) this._renderAll(this.gameState)
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this._onVisibility)
    }

    // Detach listeners as soon as the scene shuts down or gets destroyed,
    // so dev-mode double-mounts (React strict mode + HMR) don't fire
    // callbacks against a dead displayList.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this._cleanupBus, this)
    this.events.once(Phaser.Scenes.Events.DESTROY, this._cleanupBus, this)

    // Tell React the listener is now wired. PhaserGame re-emits its latest
    // cached state-update on this signal — fixes the "table is blank after
    // refresh until I open a drawer" race where the first state-update was
    // emitted before this listener existed and got dropped on the floor.
    EventBus.emit('scene-ready')
  }

  _cleanupBus() {
    if (this._onStateUpdate)        EventBus.off('state-update', this._onStateUpdate)
    if (this._onAnimateTrickWinner) EventBus.off('animate-trick-winner', this._onAnimateTrickWinner)
    if (this._onForceRender)        EventBus.off('force-render', this._onForceRender)
    if (this._onChipsFly)           EventBus.off('spin-chips-fly', this._onChipsFly)
    if (this._onVisibility && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this._onVisibility)
    }
    if (this._trickWatchdog) { clearTimeout(this._trickWatchdog); this._trickWatchdog = null }
    this._onStateUpdate = null
    this._onAnimateTrickWinner = null
    this._onForceRender = null
    this._onChipsFly = null
    this._onVisibility = null
  }

  // ── Saloon-felt background (PNG) with a procedural fallback ──────────────
  _drawBackground() {
    if (this.textures.exists('table-felt')) {
      // The PNG is wider than the canvas; cover the full frame, slight upward
      // bias so the bright radial highlight roughly aligns with TABLE_CY.
      const img = this.add.image(W / 2, H / 2 - 30, 'table-felt')
      const tex = this.textures.get('table-felt').getSourceImage()
      const scale = Math.max(W / tex.width, H / tex.height) * 1.02
      img.setScale(scale)
      // The felt PNG already bakes in a radial highlight + dark edges, no
      // additional vignette needed.
      return
    }
    // Fallback: procedural wine-cellar table (deep Kakhetian reds)
    const g = this.add.graphics()
    g.fillStyle(0x0a0a0a, 1); g.fillRect(0, 0, W, H)
    g.fillStyle(0x24100c, 1); g.fillRect(0, 0, W, H)
    const layers = [
      { col: 0x341410, a: 0.7,  ew: W * 0.95, eh: H * 0.95 },
      { col: 0x4d1d16, a: 0.55, ew: W * 0.7,  eh: H * 0.65 },
      { col: 0x66261b, a: 0.4,  ew: W * 0.5,  eh: H * 0.45 },
      { col: 0x7e2f20, a: 0.25, ew: W * 0.32, eh: H * 0.28 },
    ]
    layers.forEach(({ col, a, ew, eh }) => {
      g.fillStyle(col, a); g.fillEllipse(TABLE_CX, TABLE_CY, ew, eh)
    })
  }

  // ── Table-center accent ───────────────────────────────────────────────────
  // Intentionally draws nothing: the background art already carries the
  // table framing, and the old dark/tan ellipse overlays muddied it.
  _drawTable() {}

  _drawWatermark() {
    this.add.text(TABLE_CX, TABLE_CY, 'დ უ ქ ა ნ ი', {
      fontSize: '22px',
      color: '#3a2410',
      fontFamily: 'Noto Serif Georgian, Georgia, Times New Roman, serif',
      fontStyle: 'bold',
    }).setOrigin(0.5).setAlpha(0.45)
  }

  _renderAll(state) {
    if (!state) return
    if (this._animatingTrick) return
    this._clearDynamic()
    this._renderOpponentCards(state)
    this._renderAvatars(state)
    this._renderHand(state)
    this._renderTrickArea(state)
    this._renderCenterCards(state)
    this._renderSpinTable(state)
    this._renderChatBubbles(state)
    this._maybeReactToTrickWinner(state)
  }

  /**
   * Draw a poker chip pile for `amount`: one column per denomination
   * (gold 1000 / purple 500 / black 100 / green 25 / red 5 / white 1),
   * column height tracking the count — so the pile's size reads the value
   * at a glance. Drawn into `container` when given (coords become
   * container-relative), else onto the scene root.
   */
  _drawChipPile(x, y, amount, scale = 1, container = null) {
    const cols = chipBreakdown(amount, 8)
    if (!cols.length) return null
    const colW  = 21 * scale
    const chipH = 5.2 * scale
    const rw    = 18 * scale   // chip ellipse width
    const rh    = 7.5 * scale  // chip ellipse height
    const totalW = cols.length * colW
    const g = this.add.graphics()
    cols.forEach((c, ci) => {
      const cx = x - totalW / 2 + colW * (ci + 0.5)
      const colInt  = hexToInt(c.color)
      const darkInt = hexToInt(c.dark)
      for (let i = 0; i < c.count; i++) {
        const cy = y - i * chipH
        g.fillStyle(darkInt, 1)
        g.fillEllipse(cx, cy + 1.8 * scale, rw, rh)
        g.fillStyle(colInt, 1)
        g.fillEllipse(cx, cy, rw, rh)
      }
      // Top-face ring on the pile's top chip.
      g.lineStyle(Math.max(1, scale), 0xffffff, 0.4)
      g.strokeEllipse(cx, y - (c.count - 1) * chipH, rw * 0.62, rh * 0.6)
    })
    if (container) container.add(g)
    return g
  }

  /**
   * Chip flight: bets sliding from a seat's avatar into the pot
   * (direction 'in') or payouts sliding from the pot to the winners
   * (direction 'out'). Fire-and-forget — sprites destroy themselves.
   */
  _animateChips(moves, direction) {
    const state = this.gameState
    if (!state || state.gameKind !== 'spinking') return
    if (!moves.length) return
    // Chip clatter rides every flight — antes, bets, calls, raises going in
    // and payouts going out. One clip per betting action, not per chip.
    try {
      const snd = new window.Audio('/sounds/pokerchips.mp3')
      snd.volume = 0.65
      snd.play().catch(() => { /* needs a first gesture — silent until then */ })
    } catch { /* ignore */ }
    const mySeat = state.mySeat ?? 0
    const POT = { x: TABLE_CX, y: TABLE_CY - 118 }
    if (!this._flyingChips) this._flyingChips = []
    moves.forEach(({ seat, amount }, mi) => {
      const rel = (seat - mySeat + 3) % 3
      const av = AVATAR_POS[rel]
      if (!av) return
      const from = direction === 'in' ? av : POT
      const to   = direction === 'in' ? POT : av
      // More chips for bigger sums, capped so a monster pot stays smooth.
      const n = Math.max(3, Math.min(10, Math.ceil(Math.log2((amount || 1) + 1)) + 1))
      const palette = chipBreakdown(amount, 8)
      const colors = palette.length ? palette : [{ color: '#e0a83c', dark: '#a97c22' }]
      for (let i = 0; i < n; i++) {
        const c = colors[i % colors.length]
        const g = this.add.graphics().setDepth(90)
        g.fillStyle(hexToInt(c.dark), 1)
        g.fillEllipse(0, 2, 22, 9.5)
        g.fillStyle(hexToInt(c.color), 1)
        g.fillEllipse(0, 0, 22, 9.5)
        g.setPosition(
          from.x + Phaser.Math.Between(-16, 16),
          from.y + Phaser.Math.Between(-10, 10)
        )
        g.setAlpha(0)
        this._flyingChips.push(g)
        const untrack = () => {
          this._flyingChips = (this._flyingChips || []).filter((s) => s !== g)
        }
        this.tweens.add({
          targets: g,
          alpha: 1,
          duration: 90,
          delay: mi * 90 + i * 42,
        })
        this.tweens.add({
          targets: g,
          x: to.x + Phaser.Math.Between(-20, 20),
          y: to.y + Phaser.Math.Between(-12, 12),
          duration: 520 + Phaser.Math.Between(0, 140),
          delay: mi * 90 + i * 42,
          ease: 'Cubic.easeInOut',
          onComplete: () => {
            this.tweens.add({
              targets: g, alpha: 0, duration: 160,
              onComplete: () => { untrack(); g.destroy() },
            })
          },
        })
      }
    })
    // Backgrounded tabs pause the scene clock and can strand chips mid-air
    // (their tweens only resume on re-focus). A wall-clock sweep guarantees
    // nothing lingers past the flight window regardless of tab state.
    setTimeout(() => this._sweepFlyingChips(), 2600)
  }

  _sweepFlyingChips() {
    (this._flyingChips || []).forEach((g) => { try { g.destroy() } catch { /* gone */ } })
    this._flyingChips = []
  }

  // ── Spin King table dressing: centre pot + face-down prikup ──────────────
  // No-op for King states (they never carry `gameKind: 'spinking'`), so the
  // classic table is pixel-identical to before.
  _renderSpinTable(state) {
    if (state.gameKind !== 'spinking') return

    // The pot: a real chip pile hovering above the trick zone + the exact
    // number on a pill right under it.
    if ((state.pot ?? 0) > 0) {
      const potY = TABLE_CY - 92
      const pile = this._drawChipPile(TABLE_CX, potY - 30, state.pot, 1.35)
      if (pile) { pile.setDepth(6); this.centerObjs.push(pile) }
      const label = this.add.text(TABLE_CX, potY, `ბანკი: ${state.pot.toLocaleString()}`, {
        fontSize: '14px', color: '#f4d06f',
        fontFamily: 'Noto Sans Georgian, Inter, Arial', fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(6)
      const w = label.width + 30
      const bg = this.add.graphics().setDepth(5)
      bg.fillStyle(0x1a120a, 0.72)
      bg.fillRoundedRect(TABLE_CX - w / 2, potY - 15, w, 30, 15)
      bg.lineStyle(1.5, 0xe3b04b, 0.85)
      bg.strokeRoundedRect(TABLE_CX - w / 2, potY - 15, w, 30, 15)
      this.centerObjs.push(bg, label)
    }

    const count = state.prikupCount ?? 0
    if (!count) return

    if (['spin', 'auction', 'trump_selection'].includes(state.gamePhase)) {
      // The hidden 2-card prikup up for auction — face-down for EVERYONE
      // (its contents are the gamble; King's face-up prikup never applies).
      for (let i = 0; i < count; i++) {
        const card = createFaceDownCard(this, TABLE_CX - 40 + i * 80, TABLE_CY + 6)
        card.setDepth(4)
        this.centerObjs.push(card)
      }
      const lbl = this.add.text(TABLE_CX, TABLE_CY + CARD_H / 2 + 28, '❖  ფარული პრიკუპი  ❖', {
        fontSize: '11px', color: '#e3b04b',
        fontFamily: 'Noto Sans Georgian, Inter, Arial', stroke: '#000', strokeThickness: 3,
      }).setOrigin(0.5)
      this.centerObjs.push(lbl)
    } else if (state.prikupDead) {
      // All-pass round: the prikup stays buried. Park two dimmed mini-backs
      // off-centre so the table remembers the dead cards without colliding
      // with the trick zone.
      const px = TABLE_CX - 205
      const py = TABLE_CY - 80
      for (let i = 0; i < count; i++) {
        const card = createFaceDownCard(this, px + i * 24, py)
        card.setScale(0.5)
        card.setAlpha(0.38)
        card.setAngle(-8 + i * 12)
        card.setDepth(3)
        this.centerObjs.push(card)
      }
      const lbl = this.add.text(px + 12, py + CARD_H * 0.25 + 16, 'მკვდარი პრიკუპი', {
        fontSize: '9px', color: '#b7a488',
        fontFamily: 'Noto Sans Georgian, Inter, Arial', stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5).setAlpha(0.65)
      this.centerObjs.push(lbl)
    }
  }

  /**
   * If a brand-new lastTrick has appeared since the last render, run the
   * "winner reaction" effects: avatar pulse on the winner + camera shake +
   * red flash if the K♥ was in the trick.
   */
  _maybeReactToTrickWinner(state) {
    const lt = state.lastTrickResult
    if (!lt || !Array.isArray(lt.trick)) return
    // Use the trick's first-card identity as a cheap "is this a new event?"
    // probe — round changes and trick number both reset elsewhere, this is
    // robust enough for visual fanfare.
    const probe = `${state.round}:${lt.trick.map(t => t.card.rank + t.card.suit).join('')}`
    if (this._lastTrickProbe === probe) return
    this._lastTrickProbe = probe

    const tookKingHearts = lt.trick.some(t => t.card.rank === 'K' && t.card.suit === 'H')
    this._pulseAvatarFor(lt.winnerSeat, tookKingHearts ? 0xd4574d : 0xf0c75a)
    if (tookKingHearts) this._shakeOnKingOfHearts()
  }

  _pulseAvatarFor(seat, colour) {
    const state = this.gameState
    if (!state) return
    const mySeat = state.mySeat ?? 0
    const rel = (seat - mySeat + 3) % 3
    const pos = AVATAR_POS[rel]
    if (!pos) return
    const ring = this.add.graphics()
    ring.lineStyle(4, colour, 1)
    ring.strokeCircle(pos.x, pos.y, 44)
    ring.setDepth(120)
    this.tweens.add({
      targets: ring,
      alpha: { from: 1, to: 0 },
      scaleX: { from: 1, to: 1.6 },
      scaleY: { from: 1, to: 1.6 },
      duration: 700,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    })
  }

  _shakeOnKingOfHearts() {
    if (!this.cameras?.main) return
    this.cameras.main.shake(220, 0.014)
    // Brief red vignette — overlay rectangle that fades out
    const flash = this.add.rectangle(W / 2, H / 2, W, H, 0xc92020, 0)
    flash.setDepth(999)
    this.tweens.add({
      targets: flash,
      alpha: { from: 0.32, to: 0 },
      duration: 360,
      ease: 'Cubic.easeOut',
      onComplete: () => flash.destroy(),
    })
  }

  _clearDynamic() {
    this.handCards.forEach(c => c.destroy());     this.handCards = []
    this.trickCards.forEach(c => c.destroy());    this.trickCards = []
    ;[1, 2].forEach(side => {
      this.opponentCards[side].forEach(c => c.destroy())
      this.opponentCards[side] = []
    })
    this.centerObjs.forEach(c => c.destroy());    this.centerObjs = []
    this.avatarObjs.forEach(c => c.destroy());    this.avatarObjs = []
    if (this.chatObjs) this.chatObjs.forEach(c => c.destroy())
    this.chatObjs = []
  }

  // ── Opponent face-down card fans on left/right ───────────────────────────
  _renderOpponentCards(state) {
    const { mySeat = 0, cardCounts = {}, gamePhase, round } = state

    const round1Hidden = round === 1 && gamePhase === 'type_selection'

    const specs = [
      { rel: 1, seat: (mySeat + 1) % 3, ...OPP_FAN_POS[1] },
      { rel: 2, seat: (mySeat + 2) % 3, ...OPP_FAN_POS[2] },
    ]

    specs.forEach(({ rel, seat, baseX, y, dir }) => {
      if (round1Hidden) return
      const count = Math.min(cardCounts[seat] ?? 0, 10)
      // Fan: small spread, cards angle outward like in the reference
      const spread = 14
      for (let i = 0; i < count; i++) {
        const t = (count > 1) ? (i / (count - 1)) - 0.5 : 0
        const cx = baseX + dir * t * spread * 4
        const cy = y + Math.abs(t) * 8
        const card = createFaceDownCard(this, cx, cy)
        card.setAngle(dir * t * 28)
        card.setDepth(i)
        this.opponentCards[rel].push(card)
      }
    })
  }

  _renderAvatars(state) {
    const { players = [], mySeat = 0, cumulativeScores = {}, currentTurn, gamePhase, cardCounts = {}, leaderSeat, round } = state

    const slots = [
      { rel: 0, seat: mySeat },
      { rel: 1, seat: (mySeat + 1) % 3 },
      { rel: 2, seat: (mySeat + 2) % 3 },
    ]

    slots.forEach(({ rel, seat }) => {
      const player = players.find(p => p.seat === seat)
      if (!player) return

      const pos       = AVATAR_POS[rel]
      const accentHex = AVATAR_COLOR_HEX[rel]
      const accentInt = AVATAR_COLOR[rel]
      const isOwn     = rel === 0
      const isActive  = gamePhase === 'playing' && currentTurn === seat
      const isLeader  = seat === leaderSeat
      const score     = cumulativeScores[seat] ?? 0
      const cardCount = cardCounts[seat] ?? 0
      const round1Hide = round === 1 && gamePhase === 'type_selection' && !isLeader && !isOwn

      const radius = isOwn ? 38 : 36
      const container = this.add.container(pos.x, pos.y)

      // Outer glow when active
      if (isActive) {
        const glowG = this.add.graphics()
        for (let gi = 5; gi >= 1; gi--) {
          glowG.fillStyle(0x4ade80, 0.04 * gi)
          glowG.fillCircle(0, 0, radius + 18 + gi * 4)
        }
        container.add(glowG)
        this.tweens.add({
          targets: glowG, alpha: { from: 1, to: 0.3 },
          duration: 800, yoyo: true, repeat: -1,
        })
      }

      // Avatar circle background (dark)
      const circleBg = this.add.graphics()
      circleBg.fillStyle(0x1a1f1c, 1)
      circleBg.fillCircle(0, 0, radius)
      container.add(circleBg)

      // Coloured ring
      const ring = this.add.graphics()
      const ringCol = isActive ? 0x4ade80 : accentInt
      ring.lineStyle(3, ringCol, 1)
      ring.strokeCircle(0, 0, radius)
      container.add(ring)

      // Profile picture (data URL → texture) → avatar-default → initial letter
      const avatarKey = this._ensureAvatarTexture(player)
      const pickedKey = avatarKey
        || (this.textures.exists('avatar-default') ? 'avatar-default' : null)

      if (pickedKey) {
        const pic = this.add.image(0, 0, pickedKey)
          .setDisplaySize(radius * 2 - 6, radius * 2 - 6)
        const maskShape = this.make.graphics({ x: 0, y: 0, add: false })
        maskShape.fillCircle(pos.x, pos.y, radius - 3)
        pic.setMask(maskShape.createGeometryMask())
        container.add(pic)
      } else {
        const initText = this.add.text(0, 0, player.name[0].toUpperCase(), {
          fontSize: isOwn ? '28px' : '26px',
          color: '#ffffff',
          fontFamily: 'Georgia, serif',
          fontStyle: 'bold',
        }).setOrigin(0.5)
        container.add(initText)
      }

      // Card-count badge top-right corner
      if (cardCount > 0 && !round1Hide) {
        const bx = radius - 4, by = -radius + 4
        const badgeBg = this.add.graphics()
        badgeBg.fillStyle(0x0a0a0a, 1)
        badgeBg.fillRoundedRect(bx - 12, by - 12, 24, 22, 6)
        badgeBg.lineStyle(2, ringCol, 1)
        badgeBg.strokeRoundedRect(bx - 12, by - 12, 24, 22, 6)
        container.add(badgeBg)
        container.add(this.add.text(bx, by - 1, String(cardCount), {
          fontSize: '13px', color: '#ffffff', fontFamily: 'Arial', fontStyle: 'bold',
        }).setOrigin(0.5))
      }

      // Name + score chip (mimics 'Frank / 1,860' style)
      const nameOffY = isOwn ? radius + 16 : radius + 18
      const nameLabel = isOwn ? 'შენ' : player.name
      const nameTxt = this.add.text(0, nameOffY, nameLabel, {
        fontSize: '14px', color: '#ffffff',
        fontFamily: 'Noto Sans Georgian, Inter, system-ui, Arial, sans-serif',
        fontStyle: 'bold',
      }).setOrigin(0.5)
      container.add(nameTxt)

      const scoreOffY = nameOffY + 18
      // Spin King tables show the live chip stack where King shows the
      // cumulative score (classic points still exist there, but only as
      // flavor — chips are what the match is about).
      const isSpin    = state.gameKind === 'spinking' && !!state.chips
      const isZombie  = isSpin && !!state.zombies?.[seat]
      const chipsVal  = isSpin ? (state.chips[seat] ?? 0) : 0
      const scoreStr  = isSpin
        ? (isZombie ? '0 ☠' : chipsVal.toLocaleString())
        : (score > 0 ? `+${score}` : `${score}`)
      const scoreCol  = isSpin
        ? (isZombie ? '#9ca3af' : '#fbbf24')
        : (score > 0 ? '#fbbf24' : score < 0 ? '#f87171' : '#cccccc')
      if (isSpin && isOwn) {
        // The own row sits at the canvas' bottom edge — the below-name slot
        // is OFF-SCREEN. Park the pile + amount to the LEFT of the avatar.
        this._drawChipPile(-126, -12, chipsVal, 0.75, container)
        const amt = this.add.text(-126, 18, scoreStr, {
          fontSize: '16px', color: scoreCol,
          fontFamily: 'Inter, system-ui, Arial, sans-serif', fontStyle: 'bold',
          stroke: '#1a120a', strokeThickness: 3,
        }).setOrigin(0.5)
        container.add(amt)
      } else if (isSpin) {
        // A real (mini) chip pile in place of King's coin dot — its size
        // tracks the stack, so a glance around the table reads the money.
        this._drawChipPile(-40, scoreOffY + 5, chipsVal, 0.7, container)
        const scoreTxt = this.add.text(14, scoreOffY, scoreStr, {
          fontSize: '15px', color: scoreCol,
          fontFamily: 'Inter, system-ui, Arial, sans-serif', fontStyle: 'bold',
        }).setOrigin(0, 0.5)
        container.add(scoreTxt)
      } else {
        // small coin icon
        const coin = this.add.graphics()
        coin.fillStyle(0xfbbf24, 1)
        coin.fillCircle(-22, scoreOffY, 5)
        coin.fillStyle(0xfde68a, 1)
        coin.fillCircle(-22, scoreOffY, 3)
        container.add(coin)
        const scoreTxt = this.add.text(-12, scoreOffY, scoreStr, {
          fontSize: '13px', color: scoreCol,
          fontFamily: 'Inter, system-ui, Arial, sans-serif', fontStyle: 'bold',
        }).setOrigin(0, 0.5)
        container.add(scoreTxt)
      }

      // Spin King table intel during trick play. Seats with chips in the
      // pot get the pledge plaque: the SHARED condition, their stake, and a
      // LIVE counter. Every other seat still gets a small public stat chip
      // (queens/jacks/hearts/tricks taken under the current game type) so
      // the whole table can read who to feed cards to.
      const entry = isSpin ? state.pledge?.entries?.[seat] : null
      const inTrickPhases = ['playing', 'round_end'].includes(gamePhase)
      // Own plaque goes LEFT of the avatar, past the chip pile (below is
      // off-canvas and above is the hand fan); opponents' hang underneath
      // their name block.
      const px = isOwn ? -262 : 0
      const py = isOwn ? 0 : scoreOffY + (isLeader ? 40 : 26)
      const showPlaque = entry && inTrickPhases &&
        (entry.status === 'in' || (entry.status === 'folded' && entry.committed > 0))
      if (showPlaque) {
        const folded = entry.status === 'folded'
        const sharedTier = folded ? null : getTier(state.chosenGameType, state.pledge?.tierId)
        const prog = sharedTier ? tierProgress(
          state.chosenGameType, sharedTier.id,
          { ...(state.roundStats || {}), tricksTaken: state.tricksTaken || {} },
          seat
        ) : null
        const line1 = folded ? 'ფოლდი' : (sharedTier?.label ?? '')
        // Own seat reads as money AT RISK — loss framing sharpens decisions.
        const stakeWord = isOwn && !folded ? 'რისკზე' : 'ფსონი'
        const line2 = folded
          ? `${entry.committed.toLocaleString()} დაკარგა`
          : `${stakeWord} ${entry.committed.toLocaleString()}${prog ? ' · ' + prog.text : ''}`
        const accentHexStr = folded ? '#9ca3af' : (PROGRESS_COLOR[prog?.state] || '#cccccc')
        const accent = hexToInt(accentHexStr)

        const t1 = this.add.text(px, py - 9, line1, {
          fontSize: '11px', color: '#f4ead2',
          fontFamily: 'Noto Sans Georgian, Inter, Arial', fontStyle: 'bold',
        }).setOrigin(0.5)
        const t2 = this.add.text(px, py + 8, line2, {
          fontSize: '11px', color: accentHexStr,
          fontFamily: 'Noto Sans Georgian, Inter, Arial', fontStyle: 'bold',
        }).setOrigin(0.5)
        const pw = Math.max(t1.width, t2.width) + 18
        const plaqueBg = this.add.graphics()
        plaqueBg.fillStyle(0x140d08, 0.8)
        plaqueBg.fillRoundedRect(px - pw / 2, py - 20, pw, 40, 10)
        plaqueBg.lineStyle(1.5, accent, folded ? 0.5 : 0.95)
        plaqueBg.strokeRoundedRect(px - pw / 2, py - 20, pw, 40, 10)
        container.add(plaqueBg)
        container.add(t1)
        container.add(t2)
      } else if (isSpin && inTrickPhases && state.chosenGameType) {
        const stat = seatStatText(state.chosenGameType, state.roundStats, state.tricksTaken, seat)
        this._addSeatBadge(container, px, py, stat.text,
          stat.danger ? '#ffb1a6' : '#e8dcbf', stat.danger ? 0xa5372b : 0x7a532c)
      } else if (isSpin && gamePhase === 'auction' && state.auction) {
        // Who bid what / who folded (their chips stay in the pot!), live
        // under every avatar.
        const a = state.auction
        const sunk = a.committed?.[seat] ?? 0
        let text = 'ელოდება'
        let color = '#c9b895'
        let border = 0x7a532c
        if (a.highBidder === seat) {
          text = `★ ფსონი ${(a.bid ?? 0).toLocaleString()}`
          color = '#f4d06f'; border = 0xb8860b
        } else if (a.passed?.[seat]) {
          text = sunk > 0 ? `ფოლდი · ${sunk.toLocaleString()}` : 'პასი'
          color = '#9ca3af'; border = 0x555a63
        } else if (state.currentTurn === seat) {
          text = sunk > 0 ? `ფიქრობს… (დადო ${sunk.toLocaleString()})` : 'ფიქრობს…'
          color = '#ffb1a6'; border = 0xa5372b
        } else if (sunk > 0) {
          text = `დადო ${sunk.toLocaleString()}`
          color = '#b8e6a3'; border = 0x4c7a2f
        }
        this._addSeatBadge(container, px, py, text, color, border)
      } else if (isSpin && gamePhase === 'pledge' && state.pledge) {
        // Who set the condition, who has chips in, who folded.
        const p = state.pledge
        const e = p.entries?.[seat]
        const sharedTier = getTier(state.chosenGameType, p.tierId)
        let text = 'ელოდება'
        let color = '#c9b895'
        let border = 0x7a532c
        if (e?.status === 'folded') {
          text = e.committed > 0 ? `ფოლდი · ${e.committed.toLocaleString()}` : 'ფოლდი'
          color = '#9ca3af'; border = 0x555a63
        } else if (e?.status === 'in' && p.tierSetBy === seat && sharedTier) {
          text = `⇧ ${sharedTier.label} · ${e.committed.toLocaleString()}`
          color = '#f4d06f'; border = 0xb8860b
        } else if (e?.status === 'in') {
          text = `დადო ${e.committed.toLocaleString()} ✓`
          color = '#b8e6a3'; border = 0x4c7a2f
        } else if (state.currentTurn === seat) {
          text = 'ფიქრობს…'
          color = '#ffb1a6'; border = 0xa5372b
        }
        this._addSeatBadge(container, px, py, text, color, border)
      }

      // Leader / "Dealer" pill
      if (isLeader) {
        const pillY = scoreOffY + 18
        const pillBg = this.add.graphics()
        pillBg.fillStyle(0x8e2b23, 1)  // Kakhetian wine
        pillBg.fillRoundedRect(-32, pillY - 9, 64, 18, 9)
        pillBg.lineStyle(1, 0xe3b04b, 0.75)
        pillBg.strokeRoundedRect(-32, pillY - 9, 64, 18, 9)
        container.add(pillBg)
        container.add(this.add.text(0, pillY, 'თამადა', {
          fontSize: '10px', color: '#fdf2df',
          fontFamily: 'Noto Sans Georgian, Georgia, Roboto Slab, serif',
          fontStyle: 'bold',
        }).setOrigin(0.5))
      }

      // Sound buttons (3 different reactions) next to the avatar
      this._addSoundButtons(container, seat, radius, isOwn)

      this.avatarObjs.push(container)
    })
  }

  /** One-line status chip under an avatar (betting states, table stats). */
  _addSeatBadge(container, px, py, text, colorHex, borderInt) {
    const t = this.add.text(px, py, text, {
      fontSize: '11px', color: colorHex,
      fontFamily: 'Noto Sans Georgian, Inter, Arial', fontStyle: 'bold',
    }).setOrigin(0.5)
    const cw = t.width + 18
    const bg = this.add.graphics()
    bg.fillStyle(0x140d08, 0.72)
    bg.fillRoundedRect(px - cw / 2, py - 11, cw, 22, 11)
    bg.lineStyle(1.2, borderInt, 0.85)
    bg.strokeRoundedRect(px - cw / 2, py - 11, cw, 22, 11)
    container.add(bg)
    container.add(t)
  }

  /**
   * Small clickable circles to the side of the local player's avatar, each
   * playing one of the saloon reactions for everyone in the room. Opponents
   * (left/right) intentionally get no buttons — three full grids on screen
   * was visually noisy and the broadcast still reaches both opponents when
   * we play a sound from our own avatar.
   */
  _addSoundButtons(container, seat, radius, isOwn) {
    if (!isOwn) return
    // On touch devices these compact canvas buttons are too small to tap
    // reliably — the DOM Sound Board modal (a big button next to the own
    // avatar) is the mobile path instead, so skip drawing them here.
    const isTouch = typeof window !== 'undefined' &&
      (('ontouchstart' in window) ||
       (window.matchMedia && window.matchMedia('(pointer: coarse)').matches))
    if (isTouch) return

    // Reaction clips live in a shared constant (also used by the DOM Sound
    // Board modal). `glyph` is the single character drawn here; `color` is a
    // CSS hex string converted to a Phaser int for the canvas stroke.

    // 3-row grid that grows out to the right of the own avatar. Column-major
    // fill, so every column holds exactly 3 sounds (the last one tails off
    // if the count isn't a multiple of 3). Three short rows is a lot less
    // vertical footprint than the previous five-row column.
    const side = 1
    const r = 10
    const colGap = 24
    const rowGap = 22
    const baseX = (radius + 14) * side
    const rows = 3
    const yStart = -((rows - 1) * rowGap) / 2

    SOUNDS.forEach((s, i) => {
      const row = i % rows
      const col = Math.floor(i / rows)
      const bx = baseX + side * col * colGap
      const by = yStart + row * rowGap

      const btn = this.add.container(bx, by)
      const bg = this.add.graphics()
      bg.fillStyle(0x4a2e1a, 1); bg.fillCircle(0, 0, r)
      bg.lineStyle(1.5, hexToInt(s.color), 0.95); bg.strokeCircle(0, 0, r)
      btn.add(bg)
      btn.add(this.add.text(0, 0, s.glyph, {
        fontSize: '11px', color: '#fde9b8',
        fontFamily: 'Noto Sans Georgian, Roboto Slab, Georgia, serif', fontStyle: 'bold',
      }).setOrigin(0.5))
      btn.setSize(r * 2, r * 2)
      btn.setInteractive({ useHandCursor: true })
      btn.on('pointerover', () => {
        this.tweens.add({ targets: btn, scale: 1.22, duration: 90 })
      })
      btn.on('pointerout', () => {
        this.tweens.add({ targets: btn, scale: 1, duration: 110 })
      })
      btn.on('pointerdown', () => {
        EventBus.emit('request-play-sound', { soundId: s.id, targetSeat: seat })
      })
      container.add(btn)
    })
  }

  // ── Own hand: fanned at bottom, selected/playable cards lift with golden glow ──
  _renderHand(state) {
    const { hand = [], mySeat, gamePhase, currentTurn } = state
    if (!hand.length) return

    // On narrow viewports the canvas is FIT-scaled down and individual cards
    // become finger-unfriendly — push spacing up a touch so adjacent cards
    // don't overlap into a single tap-target.
    const isNarrow   = typeof window !== 'undefined' && window.innerWidth < 720
    const total      = hand.length
    const maxSpacing = isNarrow ? 78 : 64
    const minSpacing = isNarrow ? 46 : 36
    const spacing    = Math.max(minSpacing, Math.min(maxSpacing, (W - 200) / Math.max(1, total)))
    const startX     = W / 2 - ((total - 1) * spacing) / 2
    // Lifted so the fan clears the own avatar + sound button underneath.
    const baseY      = H - 192
    const isMyTurn   = gamePhase === 'playing' && currentTurn === mySeat
    const midIdx     = (total - 1) / 2

    // Detect a fresh deal: round changed AND we now have a full(ish) hand.
    const isFreshDeal = state.round !== this._lastDealRound && hand.length >= 9
    if (isFreshDeal) {
      this._lastDealRound = state.round
      // Try to play a shuffle SFX if it exists. No-op if the file isn't
      // present (browser will silently fail and our catch swallows it).
      try {
        const shuffle = new window.Audio('/sounds/shuffle.mp3')
        shuffle.volume = 0.5
        shuffle.play().catch(() => {})
      } catch { /* ignore */ }
    }

    hand.forEach((card, i) => {
      const x        = startX + i * spacing
      const fanAngle = (i - midIdx) * 1.6
      // slight curve: ends drop a bit
      const yCurve   = Math.abs(i - midIdx) * 1.2
      const y        = baseY + yCurve
      const playable = isPlayableCard(card, state)
      const inter    = isMyTurn && playable
      const isTrump  = state.trumpSuit && card.suit === state.trumpSuit

      const container = createFaceUpCard(this, x, y, card, inter)
      container.setAngle(fanAngle)
      container.setDepth(20 + i)
      container.origY = y
      container.fanAngle = fanAngle

      if (gamePhase === 'playing' && !playable) {
        container.setAlpha(0.4)
      }

      // Subtle gold sparkle border on trump-suit cards in hand.
      if (isTrump) {
        const sparkle = this.add.graphics()
        sparkle.lineStyle(2, 0xf0c75a, 0.85)
        sparkle.strokeRoundedRect(-CARD_W / 2 - 2, -CARD_H / 2 - 2, CARD_W + 4, CARD_H + 4, 8)
        container.add(sparkle)
        this.tweens.add({
          targets: sparkle, alpha: { from: 0.4, to: 0.95 },
          duration: 1100, yoyo: true, repeat: -1,
        })
      }

      // Card-deal entrance: cards fly in from a center "deck" stack at the
      // top of the table, staggered by index, into their fanned position.
      if (isFreshDeal) {
        const fromX = TABLE_CX + (Math.random() - 0.5) * 14
        const fromY = TABLE_CY - 10
        container.setPosition(fromX, fromY)
        container.setAngle(0)
        container.setScale(0.55)
        container.setAlpha(0)
        this.tweens.add({
          targets: container,
          x, y,
          angle: fanAngle,
          scaleX: 1, scaleY: 1,
          alpha: 1,
          duration: 380,
          delay: i * 55,
          ease: 'Cubic.easeOut',
        })
      }

      if (inter) {
        // Golden glow ring (matches the highlighted yellow cards in the picture)
        const glow = this.add.graphics()
        glow.lineStyle(3, 0xfbbf24, 0.95)
        glow.strokeRoundedRect(-CARD_W / 2 - 3, -CARD_H / 2 - 3, CARD_W + 6, CARD_H + 6, 9)
        container.add(glow)
        this.tweens.add({
          targets: glow, alpha: { from: 1, to: 0.45 },
          duration: 700, yoyo: true, repeat: -1,
        })

        container.on('pointerover', () => {
          this.tweens.killTweensOf(container)
          this.tweens.add({
            targets: container, y: y - 24, angle: 0, scaleX: 1.06, scaleY: 1.06,
            duration: 160, ease: 'Quad.easeOut',
          })
        })
        container.on('pointerout', () => {
          this.tweens.killTweensOf(container)
          this.tweens.add({
            targets: container, y, angle: fanAngle, scaleX: 1, scaleY: 1,
            duration: 160, ease: 'Quad.easeIn',
          })
        })
        container.on('pointerdown', () => EventBus.emit('card-clicked', card))
      }

      this.handCards.push(container)
    })
  }

  // ── Trick: 3 cards arranged as in the reference (overlap with rotation) ──
  _renderTrickArea(state) {
    const { currentTrick = [], mySeat = 0 } = state
    if (!currentTrick.length) return

    // Track which card identities we've already animated this trick — so a
    // re-render in the middle of an existing trick doesn't replay the swoop.
    const seenKey = currentTrick.map(t => t.card.rank + t.card.suit).join('|')
    const wasNew = seenKey !== this._lastTrickCardsKey
    this._lastTrickCardsKey = seenKey

    currentTrick.forEach(({ seat, card }, i) => {
      const rel = (seat - mySeat + 3) % 3
      const pos = TRICK_POS[rel]
      const container = createFaceUpCard(this, pos.x, pos.y, card, false)
      container.setAngle(pos.angle)
      container.setDepth(50 + rel)
      container.trickRel = rel
      this.trickCards.push(container)

      // Card-play swoop: enter from the seat's avatar position, rotate +
      // bounce into the trick spot. Only the most-recently-played card on a
      // *new* trick state animates; earlier cards in this trick (and re-
      // renders of an existing trick) snap to place silently.
      if (!wasNew) return
      const isNewest = i === currentTrick.length - 1
      if (!isNewest) return
      const from = AVATAR_POS[rel] || pos
      container.setPosition(from.x, from.y)
      container.setAngle(0)
      container.setScale(0.7)
      container.setAlpha(0)
      this.tweens.add({
        targets: container,
        x: pos.x, y: pos.y,
        angle: pos.angle,
        scaleX: 1, scaleY: 1,
        alpha: 1,
        duration: 320,
        ease: 'Back.easeOut',
      })
    })
  }

  _animateTrickToWinner(winnerSeat) {
    const state = this.gameState
    if (!state || !this.trickCards.length) return
    const mySeat = state.mySeat ?? 0
    const rel = (winnerSeat - mySeat + 3) % 3
    const target = AVATAR_POS[rel]

    this._animatingTrick = true

    const cards = this.trickCards.slice()
    cards.forEach((c, i) => {
      this.tweens.add({
        targets: c,
        x: target.x,
        y: target.y,
        scaleX: 0.3,
        scaleY: 0.3,
        alpha: 0,
        angle: Phaser.Math.Between(-25, 25),
        duration: 550,
        ease: 'Cubic.easeIn',
        delay: i * 50,
        onComplete: () => c.destroy(),
      })
    })

    // Clear the gate in two ways: Phaser's scene-clock timer (normal happy
    // path, fires exactly when the animation finishes), and a wall-clock
    // watchdog (covers the case where the scene clock stalls — mobile
    // background tab on iOS, visibility transitions, WebGL context loss).
    // The first one to fire wins; the second is a no-op because the flag
    // is already false. Without the watchdog, a stalled scene clock left
    // `_animatingTrick = true` forever and all subsequent state-updates
    // were silently dropped from the canvas (chats still worked because
    // they're React-driven), which manifested as "I can't see the card
    // they played until I refresh".
    const releaseGate = () => {
      if (!this._animatingTrick) return
      this._animatingTrick = false
      this.trickCards = []
      if (this.gameState && this.sys?.isActive?.()) {
        this._renderAll(this.gameState)
      }
    }
    this.time.delayedCall(750, releaseGate)
    // 1500ms ≈ 2× the animation duration. Long enough that the happy path
    // always wins under normal conditions, short enough that a stuck gate
    // self-heals before the next trick.
    if (this._trickWatchdog) clearTimeout(this._trickWatchdog)
    this._trickWatchdog = setTimeout(() => {
      this._trickWatchdog = null
      releaseGate()
    }, 1500)
  }

  _renderCenterCards(state) {
    const { centerCards = [], gamePhase, mySeat, leaderSeat } = state
    // Show during type/trump selection and the discard window (so non-leaders
    // still see what 2 cards came from the center after the leader picks).
    const visiblePhases = ['type_selection', 'trump_selection', 'discard']
    if (!visiblePhases.includes(gamePhase)) return
    if (mySeat === leaderSeat) return
    if (!centerCards?.length) return

    centerCards.forEach((card, i) => {
      const x = TABLE_CX - 50 + i * 100
      const container = createFaceUpCard(this, x, TABLE_CY + 10, card, false)

      const border = this.add.graphics()
      border.lineStyle(3, 0xe3b04b, 1)
      border.strokeRoundedRect(-CARD_W / 2 - 3, -CARD_H / 2 - 3, CARD_W + 6, CARD_H + 6, 11)
      container.add(border)

      this.centerObjs.push(container)
    })

    const lbl = this.add.text(TABLE_CX, TABLE_CY + CARD_H / 2 + 28, '❖  პრიკუპი  ❖', {
      fontSize: '11px', color: '#e3b04b',
      fontFamily: 'Noto Sans Georgian, Inter, Arial', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5)
    this.centerObjs.push(lbl)
  }

  // ── Chat bubbles above each speaking player's avatar ─────────────────────
  _renderChatBubbles(state) {
    const { chatBubbles = {}, players = [], mySeat = 0 } = state
    if (!chatBubbles || !Object.keys(chatBubbles).length) return

    Object.entries(chatBubbles).forEach(([seatStr, msg]) => {
      const seat = Number(seatStr)
      if (!players.find(p => p.seat === seat)) return
      const rel = (seat - mySeat + 3) % 3
      const pos = AVATAR_POS[rel]

      // Anchor the bubble above the avatar (own at bottom: place above; opps at top: also place above)
      const bubbleY = pos.y - 78

      // Measure text first by creating a hidden text obj
      const textStyle = {
        fontSize: '13px', color: '#1a1a1a',
        fontFamily: 'Inter, system-ui, Arial, sans-serif',
        fontStyle: 'bold',
        wordWrap: { width: 240, useAdvancedWrap: true },
        align: 'center',
      }
      const tmpText = this.add.text(0, 0, msg.message || '', textStyle).setVisible(false)
      const tw = Math.max(40, Math.min(260, tmpText.width + 24))
      const th = tmpText.height + 14
      tmpText.destroy()

      // Bubble container
      const bubble = this.add.container(pos.x, bubbleY)
      const bg = this.add.graphics()
      bg.fillStyle(0xffffff, 1)
      bg.fillRoundedRect(-tw / 2, -th / 2, tw, th, 10)
      bg.lineStyle(2, 0xfbbf24, 1)
      bg.strokeRoundedRect(-tw / 2, -th / 2, tw, th, 10)
      // Tail pointing toward avatar
      bg.fillTriangle(-6, th / 2 - 1, 6, th / 2 - 1, 0, th / 2 + 7)
      bg.lineStyle(2, 0xfbbf24, 1)
      bg.strokeTriangle(-6, th / 2 - 1, 6, th / 2 - 1, 0, th / 2 + 7)
      bubble.add(bg)
      const text = this.add.text(0, 0, msg.message || '', textStyle).setOrigin(0.5)
      bubble.add(text)
      bubble.setDepth(100)

      // Subtle entrance
      bubble.setScale(0.7).setAlpha(0)
      this.tweens.add({
        targets: bubble, scale: 1, alpha: 1, duration: 180, ease: 'Back.easeOut',
      })

      this.chatObjs.push(bubble)
    })
  }

  shutdown() {
    this._cleanupBus()
  }
}

// Re-export for PhaserGame to know the canvas size
export const SCENE_W = W
export const SCENE_H = H
