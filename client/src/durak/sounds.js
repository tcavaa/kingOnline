// Durak sound effects. Elements are created (and preloaded) up front but
// NEVER played until a real game event asks for it — by then the user has
// clicked around the app, so autoplay policy is satisfied. (An earlier
// muted "priming play" here caused every clip to blast once on the first
// tap in the lobby — don't reintroduce it.)

const FILES = {
  karta: '/sounds/karta.mp3',    // uploaded კარტა shout — everyone hears it
  deal:  '/sounds/shuffle.mp3',  // reused from the King table deal
}

let els = null

function ensureEls() {
  if (els) return
  els = {}
  for (const [id, src] of Object.entries(FILES)) {
    const a = new Audio(src)
    a.preload = 'auto'
    els[id] = a
  }
}

/** Preload the clips (no playback). Safe to call any time. */
export function unlockDurakSounds() {
  ensureEls()
}

export function playDurakSound(id) {
  ensureEls()
  const a = els[id]
  if (!a) return
  try {
    a.pause()
    a.currentTime = 0
    a.play().catch(() => { /* blocked before first user gesture — fine */ })
  } catch { /* ignore */ }
}
