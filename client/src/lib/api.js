// Tiny REST client that talks to the Node/Express server.
//
// API base URL precedence:
//   1. VITE_API_URL  (build-time env, e.g. https://api.kingcards.com)
//   2. Same hostname as the page on :3001 (handy for LAN testing on a phone)
//   3. http://localhost:3001 (dev fallback)
//
// Every mutating request carries a stable per-browser device key so the
// server can scope profile edits/deletes to the device that created them.

const ENV_URL = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL) || ''

function defaultBase() {
  if (typeof window === 'undefined') return 'http://localhost:3001'
  const host = window.location.hostname
  // Local dev: vite is on :5173, the Node API is on :3001 — point at it.
  if (!host || host === 'localhost' || host === '127.0.0.1') {
    return 'http://localhost:3001'
  }
  // Deployed: the Node server serves the same origin via express.static + the
  // /api routes, so an empty base ("") makes fetch use the page's origin and
  // socket.io upgrade to wss:// on the same host. No port hardcoding.
  return ''
}

export const API_BASE = (ENV_URL || defaultBase()).replace(/\/+$/, '')

const DEVICE_KEY_STORAGE = 'king.device.key.v1'

export function getDeviceKey() {
  let k = ''
  try { k = localStorage.getItem(DEVICE_KEY_STORAGE) || '' } catch { /* private mode */ }
  if (!k) {
    k = `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 18)}`
    try { localStorage.setItem(DEVICE_KEY_STORAGE, k) } catch { /* ignore */ }
  }
  return k
}

async function request(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase()
  const isWrite = method !== 'GET' && method !== 'HEAD'

  // Only send custom headers on writes. A GET with `Content-Type:
  // application/json` and a custom `X-Device-Key` triggers a CORS preflight
  // in every browser; if the host swallows the OPTIONS request (some cPanel
  // / LiteSpeed setups do), the GET is silently blocked and the lobby ends
  // up showing zero profiles. Plain GET with no extra headers is a "simple"
  // CORS request and skips preflight entirely.
  const headers = {
    ...(isWrite ? {
      'Content-Type': 'application/json',
      'X-Device-Key': getDeviceKey(),
    } : {}),
    ...(options.headers || {}),
  }
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers })
  if (!res.ok) {
    let body = ''
    try { body = await res.text() } catch { /* ignore */ }
    const msg = body ? safeMessage(body) : res.statusText
    throw new Error(`HTTP ${res.status}: ${msg}`)
  }
  if (res.status === 204) return null
  return res.json()
}

function safeMessage(body) {
  try { const j = JSON.parse(body); return j.error || body } catch { return body }
}

export const api = {
  // profiles
  listProfiles:  ()           => request('/api/profiles'),
  getProfile:    (id)         => request(`/api/profiles/${encodeURIComponent(id)}`),
  saveProfile:   (id, body)   => request(`/api/profiles/${encodeURIComponent(id)}`, {
    method: 'PUT', body: JSON.stringify(body),
  }),
  deleteProfile: (id)         => request(`/api/profiles/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  }),
  // PIN check — returns { ok: true, hadPin } on success.  On a wrong PIN the
  // server replies 401 → request() throws an Error whose .message contains
  // "HTTP 401". We surface that as { ok: false } so callers can render a
  // toast without try/catching.
  verifyProfilePin: async (id, pin) => {
    try {
      const out = await request(`/api/profiles/${encodeURIComponent(id)}/verify-pin`, {
        method: 'POST', body: JSON.stringify({ pin }),
      })
      return { ok: !!out?.ok, hadPin: !!out?.hadPin }
    } catch (err) {
      const msg = err?.message || ''
      if (msg.includes('HTTP 401')) return { ok: false, hadPin: true, reason: 'bad_pin' }
      if (msg.includes('HTTP 404')) return { ok: false, hadPin: false, reason: 'not_found' }
      throw err
    }
  },

  // games (read + append; bulk delete intentionally not supported)
  listGames: (limit = 50)     => request(`/api/games?limit=${limit}`),
  getGame:   (id)             => request(`/api/games/${encodeURIComponent(id)}`),
  saveGame:  (record)         => request('/api/games', {
    method: 'POST', body: JSON.stringify(record),
  }),

  // stats — per-player lifetime counters computed server-side from every
  // stored game's roundDetails JSON.
  getLifetimeStats: (name) => request(`/api/stats/${encodeURIComponent(name)}`),

  // championship daily quota — { name, limit, playedToday, remaining }.
  getChampionshipQuota: (name) => request(`/api/quota/${encodeURIComponent(name)}`),
}
