// The "I'm mid-durak-game" marker, in its own module so App.jsx can check it
// during the initial render without importing DurakContext (which would drag
// the whole lazily-split durak chunk — socket.io client and all — into the
// main bundle).

const SESSION_KEY = 'king.durak.session'

// A durak session is meant to survive a refresh, not a week. Without an
// expiry the marker sat in localStorage forever and every later visit to the
// homepage bounced straight into a long-dead table.
const SESSION_MAX_AGE_MS = 30 * 60 * 1000

export function readDurakSession() {
  let saved
  try { saved = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null') }
  catch { return null }
  if (!saved?.roomCode || !saved?.name) return null
  // No timestamp = written before the expiry existed; too old to trust.
  if (!saved.savedAt || Date.now() - saved.savedAt > SESSION_MAX_AGE_MS) {
    writeDurakSession(null)
    return null
  }
  return saved
}

export function writeDurakSession(session) {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify({ ...session, savedAt: Date.now() }))
    else localStorage.removeItem(SESSION_KEY)
  } catch { /* ignore */ }
}
