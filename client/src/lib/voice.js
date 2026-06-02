/**
 * VoiceClient
 *
 * WebRTC peer-mesh audio for the 3-player room. Pure JS, no React.
 *
 * Responsibilities:
 *   - Hold the local microphone MediaStream (one shared track per peer).
 *   - For every remote seat in voice, maintain one RTCPeerConnection.
 *   - Handle the offer/answer/ICE handshake by emitting and receiving
 *     `voice-offer` / `voice-answer` / `voice-ice` socket events.
 *   - Attach incoming remote tracks to hidden <audio> elements and play them.
 *   - Cleanly tear everything down on `leave()` or `dispose()`.
 *
 * Glare-free signalling pattern (3-peer mesh, no perfect-negotiation needed):
 *   - When _you_ join, the server tells everyone via `voice-roster`. The
 *     joining client iterates over the *existing* members and sends each
 *     one an offer. Existing members do NOT send back offers — they wait
 *     for the incoming one. No two peers ever initiate to each other, so
 *     there's no glare to resolve.
 *
 * Mic permission / autoplay:
 *   - getUserMedia() is invoked from inside `join()`, which the caller is
 *     expected to wire up to a real click handler. That click is the user
 *     gesture required by every browser, including iOS Safari.
 *   - Remote <audio>.play() is called immediately after setRemoteDescription
 *     succeeds, still inside the original join click's task chain. iOS
 *     allows this because the audio elements were created in response to a
 *     user gesture.
 *
 * The class is intentionally framework-free so it can be exercised from a
 * test harness or replaced with a different transport without touching
 * React.
 */

const STUN_SERVERS = [
  // Public, free, unauthenticated STUN. Sufficient for hairpin / cone
  // NATs (most home Wi-Fi routers). NOT sufficient for symmetric NATs
  // common on mobile carriers, hotel networks, corporate firewalls —
  // those require a TURN relay (see buildIceServers below).
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

/**
 * Assemble the ICE-server list. STUN is always included; TURN is added
 * when the deployment's `VITE_TURN_URLS` / `VITE_TURN_USERNAME` /
 * `VITE_TURN_CREDENTIAL` env vars are populated.
 *
 * Without TURN, two peers behind different NATs (e.g. one player on
 * Wi-Fi + one on cellular) often cannot establish a direct media path
 * and voice will appear "joined" but never produce audio.
 *
 * Example (self-hosted coturn):
 *   VITE_TURN_URLS=turn:turn.kingcards.example.com:3478,turns:turn.kingcards.example.com:5349
 *   VITE_TURN_USERNAME=kingcards
 *   VITE_TURN_CREDENTIAL=replaceme
 */
function buildIceServers() {
  const turnUrls = (import.meta.env.VITE_TURN_URLS || '').trim()
  const turnUser = (import.meta.env.VITE_TURN_USERNAME || '').trim()
  const turnCred = (import.meta.env.VITE_TURN_CREDENTIAL || '').trim()
  if (turnUrls && turnUser && turnCred) {
    return [
      ...STUN_SERVERS,
      {
        urls: turnUrls.split(',').map((s) => s.trim()).filter(Boolean),
        username: turnUser,
        credential: turnCred,
      },
    ]
  }
  return STUN_SERVERS
}

// Diagnostic: appending `?forceRelay=1` to the URL forces WebRTC to use TURN
// only (no host/STUN candidates). If voice works with the flag but fails
// without it, the TURN server is fine but the NAT can't be punched directly.
// If it fails WITH the flag too, the TURN credentials or URLs are broken.
function readForceRelay() {
  if (typeof window === 'undefined') return false
  try {
    return new URLSearchParams(window.location.search).get('forceRelay') === '1'
  } catch { return false }
}

function buildPeerConfig() {
  const cfg = { iceServers: buildIceServers() }
  if (readForceRelay()) {
    cfg.iceTransportPolicy = 'relay'
    console.info('[voice] forceRelay=1 — using TURN-only ICE policy')
  }
  return cfg
}

// Up to 2 remote peers in a 3-player mesh, plus one extra slot in case a
// peer's pre-armed element gets consumed by an early reconnect.
const PRIME_POOL_SIZE = 3

export class VoiceClient {
  /**
   * @param {Object}   opts
   * @param {import('socket.io-client').Socket} opts.socket
   * @param {Function} opts.onStateChange  Called whenever the public state
   *                                       (`joined`, `muted`, last error)
   *                                       changes. Receives `getState()`.
   */
  constructor({ socket, onStateChange, onLocalSpeakingChange }) {
    this.socket = socket
    this.onStateChange = onStateChange || (() => {})
    // Fires on every transition of the *local* speaking flag. Kept
    // separate from onStateChange so we don't re-render the entire React
    // tree 10× a second while someone's talking.
    this.onLocalSpeakingChange = onLocalSpeakingChange || (() => {})

    /** @type {MediaStream|null} */
    this.localStream = null
    /** @type {Map<number, RTCPeerConnection>} seat → pc */
    this.peers = new Map()
    /** @type {Map<number, HTMLAudioElement>} seat → audio element */
    this.audios = new Map()

    this._joined = false
    this._muted = false
    this._lastError = null
    // Aggregate of every peer's connectionState. UI reads this to show
    // "Connecting…" / "Reconnecting" / "Connection problem" so users don't
    // have to guess whether voice is wired up.
    this._connection = 'idle'  // idle|connecting|connected|reconnecting|failed
    /** @type {number|null} cached own seat so we can ignore self-rosters */
    this._mySeat = null
    /** Pool of pre-armed `<audio>` elements created inside the user gesture
     *  that called `join()`. Reused for remote streams so iOS Safari's
     *  autoplay gate doesn't block the first remote audio. */
    this._primedAudios = []
    /** Seats whose audio.play() was rejected (typically iOS autoplay).
     *  Retried on the next user gesture (see `resumePlayback`). */
    this._pendingPlays = new Set()

    // Speaking-now detection state.
    this._audioCtx = null
    this._analyser = null
    this._analyserSrc = null
    this._speakBuf = null
    this._speakTimer = null
    this._lastBroadcastSpeaking = false
    this._lastAboveAt = 0

    this._onSocketOffer  = this._onSocketOffer.bind(this)
    this._onSocketAnswer = this._onSocketAnswer.bind(this)
    this._onSocketIce    = this._onSocketIce.bind(this)
    this._onSocketRoster = this._onSocketRoster.bind(this)

    socket.on('voice-offer',  this._onSocketOffer)
    socket.on('voice-answer', this._onSocketAnswer)
    socket.on('voice-ice',    this._onSocketIce)
    socket.on('voice-roster', this._onSocketRoster)
  }

  // ─── public API ─────────────────────────────────────────────────────────

  getState() {
    return {
      joined:     this._joined,
      muted:      this._muted,
      error:      this._lastError,
      connection: this._connection,
    }
  }

  /**
   * @param {number} mySeat  The current player's seat number. Needed to
   *                         filter self-roster entries.
   */
  async join(mySeat) {
    this._mySeat = mySeat
    if (this._joined) return
    this._lastError = null
    this._emitState()

    // ── iOS autoplay gate ───────────────────────────────────────────────
    // Pre-arm hidden <audio> elements *synchronously* while the click
    // gesture is still active. By the time SDP negotiation finishes and
    // ontrack fires, that gesture has expired (~5s window) and a fresh
    // audio.play() would reject on iOS — leaving "joined but silent"
    // peers. Priming the elements now means we can just attach the
    // srcObject later and call .play() on an already-authorised element.
    this._armAudioPool(PRIME_POOL_SIZE)

    try {
      // Browser AEC + noise suppression. The constraints below are widely
      // supported; un-supported ones are silently ignored.
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      })
    } catch (err) {
      this._lastError = err?.name === 'NotAllowedError'
        ? 'Microphone permission denied.'
        : (err?.message || 'Could not access microphone.')
      this._emitState()
      return
    }

    // Respect any prior mute toggle (user could have muted before joining).
    this._applyMuteToTracks()

    // Mic-level analyser → "is the user actually talking right now?". Must
    // be created from inside the same user-gesture that called join() so
    // the AudioContext starts in `running` state on iOS/Safari.
    this._startSpeakingDetection()

    this._joined = true
    this._connection = 'connecting'
    this._emitState()

    // Defensive iOS retry: any tap anywhere on the page counts as a fresh
    // user gesture. As long as voice is joined, replay pending audio
    // plays + resume the audio context whenever the user touches the UI.
    // This eliminates the "mute/unmute to hear" workaround — the very
    // next tap (a card, a chip, anything) does it automatically.
    this._installGestureRetry()

    // Tell the server we're in. The server will broadcast a `voice-roster`
    // including us — we react to that by sending offers to the OTHERS.
    this.socket.emit('voice-join')
  }

  leave() {
    if (!this._joined) return
    this._stopSpeakingDetection()
    this._removeGestureRetry()
    this.socket.emit('voice-leave')
    this._teardownAllPeers()
    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop())
      this.localStream = null
    }
    // Release any audio elements we pre-armed for this session but
    // didn't end up using — they'd otherwise leak. The pool is rebuilt
    // on the next `join()`.
    for (const a of this._primedAudios) {
      try { a.pause(); a.srcObject = null } catch {}
    }
    this._primedAudios = []
    this._pendingPlays.clear()
    this._joined = false
    this._connection = 'idle'
    this._emitState()
  }

  setMuted(muted) {
    const next = !!muted
    // Whether or not the mute state actually changes, treat this call as
    // a user gesture and retry any audio plays the autoplay gate blocked.
    // This is the deterministic version of the "I have to tap mute to
    // hear the others" trick on iOS — instead of relying on the toggle
    // happening to trigger something, we explicitly retry here.
    this.resumePlayback()
    if (next === this._muted) return
    this._muted = next
    this._applyMuteToTracks()
    this._emitState()
    if (this._joined) this.socket.emit('voice-mute', { muted: next })
  }

  /**
   * Retry any remote-audio playback that was blocked by the browser's
   * autoplay policy. Safe to call from any user-gesture handler (mute
   * toggle, sound button, card click, …). No-op when there's nothing
   * pending.
   *
   * Also resumes the speaking-detection AudioContext if iOS suspended it
   * while the tab was backgrounded.
   */
  resumePlayback() {
    if (this._audioCtx && this._audioCtx.state === 'suspended') {
      try { this._audioCtx.resume().catch(() => {}) } catch {}
    }
    if (this._pendingPlays.size === 0) return
    for (const seat of [...this._pendingPlays]) {
      const audio = this.audios.get(seat)
      if (audio && audio.srcObject) {
        audio.play()
          .then(() => { this._pendingPlays.delete(seat) })
          .catch(() => { /* still blocked — wait for next gesture */ })
      } else {
        this._pendingPlays.delete(seat)
      }
    }
  }

  /** Called once when the GameContext provider unmounts. */
  dispose() {
    this.leave()
    this.socket.off('voice-offer',  this._onSocketOffer)
    this.socket.off('voice-answer', this._onSocketAnswer)
    this.socket.off('voice-ice',    this._onSocketIce)
    this.socket.off('voice-roster', this._onSocketRoster)
  }

  // ─── peer lifecycle ─────────────────────────────────────────────────────

  /**
   * Create a peer connection to a specific remote seat and send them an
   * offer. The "I'm the one initiating" side of the handshake.
   *
   * Only called for seats already in the roster when WE joined — every
   * other case is initiated by the other side.
   */
  async _initiatePeer(targetSeat) {
    if (this.peers.has(targetSeat)) return
    const pc = this._createPeer(targetSeat, /* asInitiator */ true)
    try {
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      this.socket.emit('voice-offer', { targetSeat, payload: pc.localDescription })
    } catch (err) {
      console.warn('[voice] offer to seat', targetSeat, 'failed:', err.message)
      this._teardownPeer(targetSeat)
    }
  }

  _createPeer(targetSeat, asInitiator = false) {
    const pc = new RTCPeerConnection(buildPeerConfig())
    // Remember which side is the offerer so only that side attempts an
    // ICE restart on failure — preventing two simultaneous restart
    // offers from colliding (glare).
    pc._initiator = !!asInitiator
    pc._restartedOnce = false

    // Push our local audio track onto the connection so the remote side
    // hears us. addTrack is preferred over the deprecated addStream API.
    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        pc.addTrack(track, this.localStream)
      }
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        this.socket.emit('voice-ice', { targetSeat, payload: e.candidate })
      }
    }

    pc.ontrack = (e) => {
      // First inbound stream from this peer — wire it up to an <audio>.
      const [stream] = e.streams
      this._playRemoteStream(targetSeat, stream)
    }

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState
      // 'connected' is the moment audio frames can actually flow. iOS may
      // have parked our remote-audio play() in `_pendingPlays` because the
      // user-gesture window already expired by the time ontrack fired;
      // retry it now while we're still in the same task as the underlying
      // ICE state change (sometimes good enough; otherwise the global
      // tap listener catches it).
      if (state === 'connected') {
        this.resumePlayback()
        this._logSelectedCandidatePair(pc, targetSeat)
      }
      this._refreshAggregateIceState()
      // 'failed' is the terminal-but-recoverable state: usually it means
      // ICE walked through all its candidate pairs and none worked.
      // Restarting ICE renegotiates a fresh candidate set, which often
      // succeeds when a network change (Wi-Fi → cellular, NAT timeout,
      // VPN reconnect) invalidated the original pair.
      if (state === 'failed' && pc._initiator && !pc._restartedOnce && this._joined) {
        pc._restartedOnce = true
        this._restartIce(targetSeat)
        return
      }
      if (state === 'failed' || state === 'closed') {
        this._teardownPeer(targetSeat)
      }
    }

    this.peers.set(targetSeat, pc)
    return pc
  }

  /**
   * Re-offer with `iceRestart: true` to recover a failed connection
   * without tearing down the entire peer. Only the side that originally
   * sent the offer should do this; the other side just receives the new
   * offer in `_onSocketOffer` and answers it.
   */
  async _restartIce(targetSeat) {
    const pc = this.peers.get(targetSeat)
    if (!pc) return
    try {
      const offer = await pc.createOffer({ iceRestart: true })
      await pc.setLocalDescription(offer)
      this.socket.emit('voice-offer', { targetSeat, payload: pc.localDescription })
      console.log('[voice] ICE restart sent for seat', targetSeat)
    } catch (err) {
      console.warn('[voice] ICE restart failed for seat', targetSeat, '-', err.message)
      this._teardownPeer(targetSeat)
    }
  }

  _playRemoteStream(seat, stream) {
    let audio = this.audios.get(seat)
    if (!audio) {
      // Prefer a pre-armed element from the gesture-time pool; only fall
      // back to creating a fresh <audio> when the pool is exhausted (e.g.
      // a third peer joins after we ran out of priming slots).
      audio = this._primedAudios.shift() || this._buildAudioElement()
      this.audios.set(seat, audio)
    }
    audio.srcObject = stream
    this._safePlay(seat, audio)
  }

  /**
   * Build a fresh hidden audio element configured for inline / autoplay
   * behaviour. Does NOT call `.play()` — that's the caller's job inside
   * a user gesture.
   */
  _buildAudioElement() {
    const a = new Audio()
    a.autoplay = true
    a.playsInline = true                  // iOS Safari requirement
    a.setAttribute('playsinline', 'true')
    return a
  }

  /**
   * Top up the pre-armed audio pool to `size` elements. Called
   * synchronously from inside the user-gesture handler that invokes
   * `join()` (and again on `resumePlayback` if we're short).
   *
   * Priming trick: setting `muted = true` then calling `play()` + `pause()`
   * inside the gesture marks the element as authorised, so when we
   * eventually attach a remote stream and call `play()` again the
   * browser doesn't gate it on a fresh gesture.
   */
  _armAudioPool(size) {
    while (this._primedAudios.length < size) {
      const a = this._buildAudioElement()
      a.muted = true
      const p = a.play()
      if (p && typeof p.then === 'function') {
        p.then(() => { a.pause(); a.muted = false }).catch(() => { a.muted = false })
      } else {
        try { a.pause() } catch {}
        a.muted = false
      }
      this._primedAudios.push(a)
    }
  }

  /**
   * Wrap `audio.play()` so a rejection (typical iOS autoplay block)
   * doesn't silently strand the peer — instead we record the seat and
   * retry on the next user gesture via `resumePlayback`.
   */
  _safePlay(seat, audio) {
    const p = audio.play()
    if (p && typeof p.catch === 'function') {
      p.then(() => { this._pendingPlays.delete(seat) }).catch((err) => {
        console.warn('[voice] remote audio play() rejected for seat', seat, '-', err.message)
        this._pendingPlays.add(seat)
      })
    }
  }

  _teardownPeer(seat) {
    const pc = this.peers.get(seat)
    if (pc) {
      try { pc.ontrack = null; pc.onicecandidate = null; pc.onconnectionstatechange = null } catch {}
      try { pc.close() } catch {}
      this.peers.delete(seat)
    }
    const audio = this.audios.get(seat)
    if (audio) {
      try { audio.pause(); audio.srcObject = null } catch {}
      this.audios.delete(seat)
    }
  }

  _teardownAllPeers() {
    for (const seat of [...this.peers.keys()]) this._teardownPeer(seat)
  }

  _applyMuteToTracks() {
    if (!this.localStream) return
    for (const t of this.localStream.getAudioTracks()) {
      // .enabled = false → the track stays attached but transmits silence.
      // Cheap, instant; the peer connection doesn't have to renegotiate.
      t.enabled = !this._muted
    }
  }

  // ─── live "I'm speaking now" detection ─────────────────────────────────
  //
  // Reads the local mic stream via an AnalyserNode, computes time-domain
  // RMS at ~10 Hz, and broadcasts a `voice-speaking` socket event only on
  // transitions (false → true, true → false). A short hysteresis hold
  // keeps the indicator on through the natural pauses inside a sentence
  // instead of flickering on every breath.
  //
  // Threshold value was picked empirically against typical laptop mics
  // with browser AEC + noise-suppression on. Quiet rooms easily clear it
  // when speaking normally; idle noise sits well below.
  _startSpeakingDetection() {
    if (!this.localStream) return
    if (this._speakTimer) return // already running
    try {
      // Bracket-access on the legacy webkit prefix so TS doesn't trip over
      // a property the modern Window type doesn't know about — still safe
      // at runtime on Safari < 14.
      const AC = window.AudioContext || window['webkitAudioContext']
      if (!AC) return
      this._audioCtx     = new AC()
      this._analyserSrc  = this._audioCtx.createMediaStreamSource(this.localStream)
      this._analyser     = this._audioCtx.createAnalyser()
      this._analyser.fftSize               = 256
      this._analyser.smoothingTimeConstant = 0.3
      this._analyserSrc.connect(this._analyser)
      this._speakBuf = new Uint8Array(this._analyser.fftSize)
    } catch (err) {
      console.warn('[voice] AnalyserNode setup failed:', err.message)
      this._teardownAnalyser()
      return
    }

    const THRESHOLD = 0.045       // RMS, normalised; ~quiet speech
    const HOLD_MS   = 350         // stay "speaking" for this long after a quiet sample

    this._lastBroadcastSpeaking = false
    this._lastAboveAt = 0

    this._speakTimer = setInterval(() => {
      if (!this._analyser) return
      this._analyser.getByteTimeDomainData(this._speakBuf)
      // Time-domain RMS centred at 128 (Uint8 PCM).
      let sum = 0
      for (let i = 0; i < this._speakBuf.length; i++) {
        const v = (this._speakBuf[i] - 128) / 128
        sum += v * v
      }
      const rms = Math.sqrt(sum / this._speakBuf.length)
      const now = Date.now()
      // While muted, never report speaking — track.enabled is already off,
      // but the indicator would lie about us transmitting.
      const above = !this._muted && rms > THRESHOLD
      if (above) this._lastAboveAt = now
      const isSpeaking = above || (now - this._lastAboveAt < HOLD_MS)
      if (isSpeaking !== this._lastBroadcastSpeaking) {
        this._lastBroadcastSpeaking = isSpeaking
        try { this.socket.emit('voice-speaking', { speaking: isSpeaking }) } catch {}
        // Local self-indicator: server filters out the self-fanout, so
        // notify React directly here.
        try { this.onLocalSpeakingChange(isSpeaking) } catch {}
      }
    }, 100)
  }

  _stopSpeakingDetection() {
    if (this._speakTimer) { clearInterval(this._speakTimer); this._speakTimer = null }
    // If we were broadcasting "speaking" at the moment of leave, send one
    // last "false" so other clients drop the indicator immediately rather
    // than waiting for a server-side roster update.
    if (this._lastBroadcastSpeaking) {
      try { this.socket.emit('voice-speaking', { speaking: false }) } catch {}
      try { this.onLocalSpeakingChange(false) } catch {}
      this._lastBroadcastSpeaking = false
    }
    this._teardownAnalyser()
  }

  _teardownAnalyser() {
    try { this._analyserSrc?.disconnect() } catch {}
    try { this._analyser?.disconnect() }    catch {}
    if (this._audioCtx) {
      try { this._audioCtx.close() } catch {}
    }
    this._analyserSrc = null
    this._analyser    = null
    this._audioCtx    = null
    this._speakBuf    = null
  }

  // ─── connection-state aggregation + diagnostics ─────────────────────────

  /**
   * Recompute `this._connection` from every peer's current connectionState.
   * Called on every `connectionstatechange` event. Aggregation rules:
   *   - any `failed`            → 'failed'
   *   - any `disconnected`      → 'reconnecting' (ICE may auto-recover)
   *   - all `connected`         → 'connected'
   *   - mix of new/connecting   → 'connecting'
   *   - no peers yet            → 'connecting' (just joined, waiting)
   */
  _refreshAggregateIceState() {
    if (!this._joined) return
    const states = [...this.peers.values()].map((pc) => pc.connectionState)
    let next
    if (states.length === 0) {
      next = 'connecting'
    } else if (states.some((s) => s === 'failed')) {
      next = 'failed'
    } else if (states.some((s) => s === 'disconnected')) {
      next = 'reconnecting'
    } else if (states.every((s) => s === 'connected')) {
      next = 'connected'
    } else {
      next = 'connecting'
    }
    if (next !== this._connection) {
      this._connection = next
      this._emitState()
    }
  }

  /**
   * Diagnostic: log which ICE candidate pair the peer actually selected
   * after `connected`. If `localCandidateType` or `remoteCandidateType` is
   * `relay`, voice is going through TURN. If both are `srflx` (server-
   * reflexive) or `host`, you're going P2P. This is the easiest way to
   * verify TURN credentials work without a packet capture.
   */
  async _logSelectedCandidatePair(pc, seat) {
    try {
      const stats = await pc.getStats()
      let pair, local, remote
      stats.forEach((r) => {
        if (r.type === 'candidate-pair' && r.selected) pair = r
        if (r.type === 'transport' && r.selectedCandidatePairId) {
          const p = stats.get(r.selectedCandidatePairId)
          if (p) pair = p
        }
      })
      if (!pair) return
      local  = stats.get(pair.localCandidateId)
      remote = stats.get(pair.remoteCandidateId)
      console.info(
        `[voice] seat ${seat} candidate-pair:`,
        `${local?.candidateType || '?'} (${local?.protocol || '?'})`,
        '↔',
        `${remote?.candidateType || '?'} (${remote?.protocol || '?'})`,
      )
    } catch { /* getStats unsupported on very old browsers */ }
  }

  // ─── iOS autoplay safety net ────────────────────────────────────────────

  _installGestureRetry() {
    if (this._gestureRetryHandler) return
    const handler = () => { this.resumePlayback() }
    this._gestureRetryHandler = handler
    // Capture-phase so the handler fires before app code calls
    // stopPropagation on something. Passive to avoid blocking scrolls.
    window.addEventListener('pointerdown', handler, { capture: true, passive: true })
    window.addEventListener('touchstart',  handler, { capture: true, passive: true })
    window.addEventListener('keydown',     handler, { capture: true, passive: true })
  }

  _removeGestureRetry() {
    const handler = this._gestureRetryHandler
    if (!handler) return
    window.removeEventListener('pointerdown', handler, { capture: true })
    window.removeEventListener('touchstart',  handler, { capture: true })
    window.removeEventListener('keydown',     handler, { capture: true })
    this._gestureRetryHandler = null
  }

  _emitState() {
    this.onStateChange(this.getState())
  }

  // ─── socket event handlers ──────────────────────────────────────────────

  /**
   * Server tells us the current roster after any join/leave/mute. Used both
   * to discover existing peers when WE just joined, and to garbage-collect
   * dead peers when someone left.
   */
  _onSocketRoster({ participants }) {
    if (!Array.isArray(participants)) return
    const set = new Set(participants)
    // Drop peers that are no longer in voice.
    for (const seat of [...this.peers.keys()]) {
      if (!set.has(seat)) this._teardownPeer(seat)
    }
    // If WE'RE the one who just joined, send offers to everyone already in
    // voice (except ourselves). We can detect "just joined" by the simple
    // fact that we have no peers yet but the roster includes others.
    if (this._joined && this.peers.size === 0) {
      for (const seat of participants) {
        if (seat === this._mySeat) continue
        this._initiatePeer(seat)
      }
    }
  }

  async _onSocketOffer({ fromSeat, payload }) {
    if (!this._joined) return
    let pc = this.peers.get(fromSeat)
    if (!pc) pc = this._createPeer(fromSeat)
    try {
      await pc.setRemoteDescription(payload)
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      this.socket.emit('voice-answer', { targetSeat: fromSeat, payload: pc.localDescription })
    } catch (err) {
      console.warn('[voice] handling offer from seat', fromSeat, 'failed:', err.message)
      this._teardownPeer(fromSeat)
    }
  }

  async _onSocketAnswer({ fromSeat, payload }) {
    const pc = this.peers.get(fromSeat)
    if (!pc) return
    try { await pc.setRemoteDescription(payload) }
    catch (err) {
      console.warn('[voice] handling answer from seat', fromSeat, 'failed:', err.message)
      this._teardownPeer(fromSeat)
    }
  }

  async _onSocketIce({ fromSeat, payload }) {
    const pc = this.peers.get(fromSeat)
    if (!pc) return
    try { await pc.addIceCandidate(payload) }
    catch (err) {
      // ICE candidates can arrive before setRemoteDescription on the
      // answering side. addIceCandidate buffers them once the remote SDP is
      // set, so a transient failure here is non-fatal.
      console.debug('[voice] addIceCandidate failed:', err.message)
    }
  }
}
