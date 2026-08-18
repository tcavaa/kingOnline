'use strict';

require('dotenv').config();

const express = require('express');
const http    = require('http');
const path    = require('path');
const fs      = require('fs');
const crypto  = require('crypto');
const { Server } = require('socket.io');
const cors    = require('cors');

const GameManager      = require('./game/GameManager');
const registerHandlers = require('./socket/handlers');
const DurakManager     = require('./durak/DurakManager');
const registerDurakHandlers = require('./durak/handlers');
const store            = require('./db/store');

const PORT = Number(process.env.PORT) || 3001;

// CORS_ORIGIN can be a single origin or a comma-separated list. In dev we
// default to "*" so vite + a phone on the same network both work.
const RAW_CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const CORS_ORIGINS = RAW_CORS_ORIGIN === '*'
  ? '*'
  : RAW_CORS_ORIGIN.split(',').map(s => s.trim()).filter(Boolean);

// ─── avatar validation ──────────────────────────────────────────────────────
const MAX_AVATAR_BYTES = 200 * 1024;        // ≤200 KB after base64 → ~150 KB JPEG
const AVATAR_DATA_URL  = /^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/;
const MAGIC = {
  jpeg: ['ffd8ff'],
  png:  ['89504e470d0a1a0a'],
  webp: ['52494646'],         // 'RIFF' (followed by '...WEBP'); we only sniff the leading bytes
};

function validateAvatar(input) {
  if (input == null) return null; // explicit "no avatar"
  if (typeof input !== 'string') throw httpError(400, 'avatar must be a data URL string');
  const m = AVATAR_DATA_URL.exec(input);
  if (!m) throw httpError(400, 'avatar must be a data URL of an image (jpeg/png/webp)');
  let mime = m[1].toLowerCase(); if (mime === 'jpg') mime = 'jpeg';
  const b64  = m[2];
  const len  = Math.floor(b64.length * 3 / 4);
  if (len > MAX_AVATAR_BYTES) throw httpError(413, 'avatar is too large (max 200 KB)');
  // Magic-byte sniff to make sure the data really is what the mime claims.
  const buf = Buffer.from(b64, 'base64');
  const head = buf.subarray(0, 8).toString('hex');
  const ok = (MAGIC[mime] || []).some(sig => head.startsWith(sig));
  if (!ok) throw httpError(400, 'avatar bytes do not match its declared image type');
  return input;
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// ─── Express ────────────────────────────────────────────────────────────────
const app = express();
// `X-Device-Key` is a custom header sent by the client on every API request,
// which forces the browser into a CORS preflight (OPTIONS). If the server
// doesn't echo it back in Access-Control-Allow-Headers, the preflight fails
// and the actual GET/PUT/DELETE never runs. That's why a new device couldn't
// see existing profiles before this fix — the listProfiles() call was being
// silently rejected at preflight.
app.use(cors({
  origin: CORS_ORIGINS,
  credentials: false,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-Device-Key', 'X-Admin-Pass'],
  maxAge: 600,
}));
// Profile avatars are base64 data URLs of downscaled JPEGs (~30-40 KB each),
// so the default 100KB body limit is too small. 1MB gives generous headroom
// while still rejecting absurd uploads at the parser layer.
//
// Admin sound uploads are the one exception: a reaction clip is base64 audio,
// which blows past 1MB easily. The limit has to be picked HERE — this parser
// runs on every request and consumes the body, so a roomier `express.json()`
// mounted further down on the route would never get to see it. The ceiling is
// deliberately well above the store's 2MB audio cap (base64 inflates by a
// third) so an over-cap clip fails validation with a readable message rather
// than being truncated at the parser.
const jsonDefault = express.json({ limit: '1mb' });
const jsonUpload  = express.json({ limit: '6mb' });
app.use((req, res, next) => (
  req.path.startsWith('/api/admin/sounds') ? jsonUpload(req, res, next)
                                           : jsonDefault(req, res, next)
));

// Pull the device key from a header set by the client. Treat the absence of
// a header as "no claim", in which case the server still applies its
// stored-key check on update/delete.
app.use((req, _res, next) => {
  const k = req.get('x-device-key');
  req.deviceKey = (typeof k === 'string' && k.length > 0 && k.length <= 128) ? k : null;
  next();
});

// ─── Health ─────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Strip server-only fields that should never go on the wire (pin_hash is
// hashed but it's still a brute-force target on a 4-digit input — never expose
// it; device_key identifies the owning browser and isn't useful to any other
// client either).
function publicProfile(p) {
  if (!p) return p;
  const { device_key: _dk, pin_hash: _ph, ...safe } = p;
  return safe;
}

// ─── Profiles ───────────────────────────────────────────────────────────────
app.get('/api/profiles', async (_req, res) => {
  try {
    const profiles = await store.listProfiles();
    res.json(profiles.map(publicProfile));
  } catch (err) { sendErr(res, err); }
});

app.get('/api/profiles/:id', async (req, res) => {
  try {
    const p = await store.getProfile(req.params.id);
    if (!p) return res.status(404).json({ error: 'Profile not found' });
    res.json(publicProfile(p));
  } catch (err) { sendErr(res, err); }
});

app.put('/api/profiles/:id', async (req, res) => {
  try {
    const { name, avatar, pin } = req.body || {};
    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    const cleanAvatar = validateAvatar(avatar);
    // Pass pin straight through — the store decides whether to keep, set, or
    // clear it (undefined = keep, '' = clear, '1234' = set).
    const saved = await store.upsertProfile({
      id: req.params.id,
      name,
      avatar: cleanAvatar,
      deviceKey: req.deviceKey,
      pin,
    });
    res.json(publicProfile(saved));
  } catch (err) { sendErr(res, err); }
});

app.delete('/api/profiles/:id', async (req, res) => {
  try {
    const ok = await store.deleteProfile(req.params.id, req.deviceKey);
    if (!ok) return res.status(404).json({ error: 'Profile not found' });
    res.json({ ok: true });
  } catch (err) { sendErr(res, err); }
});

// PIN verification — used by the lobby when the user picks a profile to play
// with. Returns 200 / { ok: true } on success, 401 on a bad PIN, 404 if the
// profile doesn't exist. We don't bother rate-limiting yet (4-digit PIN +
// shared lobby is mostly a "stop your roommate" guard, not a security
// boundary), but a wrapper here is the right place to add it later.
app.post('/api/profiles/:id/verify-pin', async (req, res) => {
  try {
    const { pin } = req.body || {};
    const result = await store.verifyProfilePin(req.params.id, pin);
    if (result.ok) return res.json({ ok: true, hadPin: !!result.hadPin });
    if (result.reason === 'not_found') {
      return res.status(404).json({ ok: false, error: 'Profile not found' });
    }
    return res.status(401).json({ ok: false, error: 'Wrong PIN' });
  } catch (err) { sendErr(res, err); }
});

// Normalise a `?mode=` query into 'championship' | 'public' | 'all'.
// Internal endpoints default to 'all' (King Online's own leaderboard shows
// everything); the public API defaults to 'championship' (see below).
function parseMode(value, fallback) {
  return value === 'championship' || value === 'public' || value === 'all'
    ? value
    : fallback;
}

// ─── Leaderboard (read-only + append) ───────────────────────────────────────
app.get('/api/games', async (req, res) => {
  try { res.json(await store.listGames(req.query.limit, parseMode(req.query.mode, 'all'))); }
  catch (err) { sendErr(res, err); }
});

app.get('/api/games/:id', async (req, res) => {
  try {
    const g = await store.getGame(req.params.id);
    if (!g) return res.status(404).json({ error: 'Game not found' });
    res.json(g);
  } catch (err) { sendErr(res, err); }
});

app.post('/api/games', async (req, res) => {
  try {
    const saved = await store.saveFinishedGame(req.body || {});
    res.status(201).json(saved);
  } catch (err) { sendErr(res, err); }
});

// ─── Public, read-only API ──────────────────────────────────────────────────
// Mounted under /api/public/*. Designed for third-party sites / scripts /
// dashboards to consume finished-game data. Differences from the internal
// /api/* endpoints:
//   • Always allows any origin (Access-Control-Allow-Origin: *).
//   • No custom headers (no X-Device-Key etc.) → no CORS preflight.
//   • Read-only — only GET endpoints exposed here.
//   • Stripped down payload: removes base64 avatars so the response stays
//     small enough to be useful (avatars can be 30–40 KB each × 3 players ×
//     50 games = ~6 MB otherwise).
//   • CHAMPIONSHIP-ONLY BY DEFAULT: external consumers (the score app's
//     seasons/analytics) must only count championship games, so `mode`
//     defaults to 'championship' here. Pass `?mode=public` or `?mode=all`
//     to opt into casual games.
//
// Endpoints:
//   GET /api/public/games[?limit=N&mode=championship|public|all]
//   GET /api/public/games/:id            full record for one game
//   GET /api/public/stats/:name          lifetime counters for a player
//   GET /api/public/leaderboard          aggregate per-player win/score table
//   GET /api/public/quota/:name          today's championship quota for a player
{
  const publicRouter = express.Router();
  publicRouter.use(cors({
    origin: '*',
    methods: ['GET', 'OPTIONS'],
    maxAge: 600,
  }));

  // Strip the base64 avatar data URL — the average finished-game payload
  // shrinks ~100× without it, and external consumers usually don't need
  // photos. Pass `?include=avatar` to opt back in.
  const stripAvatars = (game) => ({
    ...game,
    players: (game.players || []).map(({ avatar, ...rest }) => rest),
  });

  publicRouter.get('/games', async (req, res) => {
    try {
      const games = await store.listGames(req.query.limit, parseMode(req.query.mode, 'championship'));
      const keepAvatars = String(req.query.include || '').includes('avatar');
      res.json(keepAvatars ? games : games.map(stripAvatars));
    } catch (err) { sendErr(res, err); }
  });

  publicRouter.get('/games/:id', async (req, res) => {
    try {
      const game = await store.getGame(req.params.id);
      if (!game) return res.status(404).json({ error: 'Game not found' });
      const keepAvatars = String(req.query.include || '').includes('avatar');
      res.json(keepAvatars ? game : stripAvatars(game));
    } catch (err) { sendErr(res, err); }
  });

  publicRouter.get('/stats/:name', async (req, res) => {
    try { res.json(await store.getLifetimeStats(req.params.name, parseMode(req.query.mode, 'championship'))); }
    catch (err) { sendErr(res, err); }
  });

  publicRouter.get('/leaderboard', async (req, res) => {
    try { res.json(await store.getPublicLeaderboard(parseMode(req.query.mode, 'championship'))); }
    catch (err) { sendErr(res, err); }
  });

  publicRouter.get('/quota/:name', async (req, res) => {
    try { res.json(await store.getChampionshipQuota(req.params.name)); }
    catch (err) { sendErr(res, err); }
  });

  app.use('/api/public', publicRouter);
}

// ─── Lifetime stats per player name ─────────────────────────────────────────
app.get('/api/stats/:name', async (req, res) => {
  try {
    const stats = await store.getLifetimeStats(req.params.name, parseMode(req.query.mode, 'all'));
    res.json(stats);
  } catch (err) { sendErr(res, err); }
});

// ─── Championship daily quota ───────────────────────────────────────────────
// The lobby asks for this to grey out championship options once the player
// has finished their 2 championship games of the day.
app.get('/api/quota/:name', async (req, res) => {
  try { res.json(await store.getChampionshipQuota(req.params.name)); }
  catch (err) { sendErr(res, err); }
});
// NOTE: a `DELETE /api/games` mass-clear endpoint used to live here. It was
// removed deliberately — there's no auth model for who is allowed to wipe the
// shared leaderboard, so exposing it on the open internet would be griefer
// bait. If you need to clear records in production, do it through MySQL.

// ─── Reaction sounds ────────────────────────────────────────────────────────
// Public reads (every client fetches the catalogue on boot) + a passcode-
// guarded admin surface at /api/admin/sounds. The catalogue used to be three
// hardcoded lists — one in the client constants, one in GameContext, one in
// the socket handler — so adding a clip meant a code change and a redeploy.

// The /admin passcode. Overridable via env for anyone who wants it to be
// less guessable; this is a "keep the other players out of the sound board"
// latch, not an authentication system, and it's the only thing standing
// between the internet and the upload form.
const ADMIN_PASSCODE = String(process.env.ADMIN_PASSCODE || '2282');

function checkAdminPass(value) {
  const given = Buffer.from(String(value ?? ''));
  const want  = Buffer.from(ADMIN_PASSCODE);
  // timingSafeEqual throws on a length mismatch, so compare lengths first
  // (the length of the passcode isn't the secret).
  return given.length === want.length && crypto.timingSafeEqual(given, want);
}

function requireAdmin(req, res, next) {
  if (checkAdminPass(req.get('x-admin-pass'))) return next();
  res.status(401).json({ error: 'Wrong passcode' });
}

// Public: the catalogue every client renders its sound buttons from.
app.get('/api/sounds', async (_req, res) => {
  try { res.json(await store.listSounds()); }
  catch (err) { sendErr(res, err); }
});

// Public: the bytes of an uploaded clip. Built-ins are static files and
// never reach this route.
app.get('/api/sounds/:id/audio', async (req, res) => {
  try {
    const clip = await store.getSoundAudio(req.params.id);
    if (!clip) return res.status(404).json({ error: 'Sound not found' });
    res.setHeader('Content-Type', clip.mime);
    res.setHeader('Content-Length', clip.buffer.length);
    // The `?v=` in the manifest URL changes whenever the row is updated, so
    // the bytes behind any given URL really are immutable.
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(clip.buffer);
  } catch (err) { sendErr(res, err); }
});

// Passcode check for the login screen. Nothing is handed back but a yes/no;
// the client re-sends the passcode as a header on every subsequent call.
app.post('/api/admin/login', (req, res) => {
  if (!checkAdminPass((req.body || {}).passcode)) {
    return res.status(401).json({ ok: false, error: 'Wrong passcode' });
  }
  res.json({ ok: true });
});

app.get('/api/admin/sounds', requireAdmin, async (_req, res) => {
  try { res.json(await store.listSounds()); }
  catch (err) { sendErr(res, err); }
});

app.post('/api/admin/sounds', requireAdmin, async (req, res) => {
  try { res.status(201).json(await store.createSound(req.body || {})); }
  catch (err) { sendErr(res, err); }
});

app.put('/api/admin/sounds/:id', requireAdmin, async (req, res) => {
  try {
    const saved = await store.updateSound(req.params.id, req.body || {});
    if (!saved) return res.status(404).json({ error: 'Sound not found' });
    res.json(saved);
  } catch (err) { sendErr(res, err); }
});

app.delete('/api/admin/sounds/:id', requireAdmin, async (req, res) => {
  try {
    const ok = await store.deleteSound(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Sound not found' });
    res.json({ ok: true });
  } catch (err) { sendErr(res, err); }
});

function sendErr(res, err) {
  const status = err.status
    || (err.code === 'FORBIDDEN'           ? 403
    :   err.code === 'DB_NOT_CONFIGURED'   ? 503
    :   500);
  if (status >= 500) console.error('[api]', err.message);
  res.status(status).json({ error: err.message });
}

// Body-parser failures (oversized upload, malformed JSON) are thrown before
// any route runs, and express's default handler answers with an HTML error
// page — which the client's fetch wrapper then surfaces as a wall of markup.
// Turn them into the same JSON shape every other error uses.
app.use((err, _req, res, next) => {
  if (res.headersSent) return next(err);
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Upload is too large.' });
  }
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Malformed JSON body.' });
  }
  return next(err);
});

// ─── Static front-end (single-process deployment) ──────────────────────────
// Serve the React build from the same Node process so one upload + one open
// port is all you need. Two layouts are supported:
//   1. server/public/index.html     (drop dist/* into server/public/)
//   2. ../dist/index.html           (server/ and dist/ side-by-side)
// Whichever one has an index.html wins; if neither exists, only the API runs.
const STATIC_DIR = [
  path.join(__dirname, 'public'),
  path.join(__dirname, '..', 'dist'),
].find((d) => {
  try { return fs.existsSync(path.join(d, 'index.html')); }
  catch { return false; }
});

if (STATIC_DIR) {
  console.log(`[server] Serving static files from ${STATIC_DIR}`);
  app.use(express.static(STATIC_DIR, {
    index: false,
    maxAge: '1h',
    setHeaders(res, filePath) {
      // Don't long-cache the entry HTML — its <script> filenames change every
      // build but the URL stays the same.
      if (filePath.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  }));
  // SPA fallback: any GET that wasn't handled above and isn't an API/socket
  // path returns the entry HTML so client-side routing works.
  app.get(/^(?!\/(api|health|socket\.io)\b).*/, (req, res, next) => {
    if (req.method !== 'GET') return next();
    res.sendFile(path.join(STATIC_DIR, 'index.html'));
  });
} else {
  console.log('[server] No static front-end found (looked for ./public and ../dist) — running API only.');
}

// ─── HTTP + socket.io ───────────────────────────────────────────────────────
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: CORS_ORIGINS, methods: ['GET', 'POST'] },
});

const gameManager = new GameManager();
// ჩეხური დურაკა lives in its own in-memory manager with `durak:*`-prefixed
// events — fully isolated from the King game (no DB, no shared state).
const durakManager = new DurakManager();

io.on('connection', (socket) => {
  registerHandlers(io, socket, gameManager);
  registerDurakHandlers(io, socket, durakManager);
});

// Restore in-flight rooms from MySQL on boot so a deploy/restart doesn't kill
// active games. Failures here are logged but non-fatal — DB might just not
// be configured yet (the API endpoints will return 503 in that case anyway).
gameManager.hydrateAll().catch((err) => {
  console.warn('[server] hydrateAll failed:', err.message);
});
durakManager.hydrateAll().catch((err) => {
  console.warn('[server] durak hydrateAll failed:', err.message);
});

server.listen(PORT, () => {
  console.log(`[server] King Card Game server listening on port ${PORT}`);
  console.log(`[server] CORS origin(s): ${RAW_CORS_ORIGIN}`);
});

module.exports = { app, server, io };
