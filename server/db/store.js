'use strict';

const crypto = require('crypto');
const { getPool } = require('./connection');

function hashPin(pin, profileId) {
  const normalised = String(pin || '').trim();
  return crypto
    .createHash('sha256')
    .update(`${profileId}:${normalised}`, 'utf8')
    .digest('hex');
}

function isValidPin(pin) {
  return typeof pin === 'string' && /^\d{4}$/.test(pin);
}

function pool() {
  const p = getPool();
  if (!p) {
    const err = new Error(
      'Database is not configured. Set DB_HOST/DB_USER/DB_NAME (and DB_PASSWORD) in your .env, then run db/schema.sql.'
    );
    err.code = 'DB_NOT_CONFIGURED';
    throw err;
  }
  return p.promise();
}

// ─── profiles ────────────────────────────────────────────────────────────────

async function listProfiles() {
  const [rows] = await pool().query(
    'SELECT id, name, avatar, device_key, pin_hash, created_at, updated_at ' +
    'FROM profiles ORDER BY created_at ASC'
  );
  return rows.map(rowToProfile);
}

async function getProfile(id) {
  const [rows] = await pool().query(
    'SELECT id, name, avatar, device_key, pin_hash, created_at, updated_at FROM profiles WHERE id = ? LIMIT 1',
    [id]
  );
  return rows.length ? rowToProfile(rows[0]) : null;
}

async function upsertProfile({ id, name, avatar, deviceKey, pin }) {
  if (!id) throw new Error('profile.id is required');
  if (!name || !name.trim()) throw new Error('profile.name is required');
  const trimmed = name.trim().slice(0, 64);

  let nextPinHash; // undefined → leave alone, null → clear, string → set
  if (pin === undefined) {
    nextPinHash = undefined;
  } else if (pin === null || pin === '') {
    nextPinHash = null;
  } else {
    if (!isValidPin(pin)) throw new Error('PIN must be exactly 4 digits.');
    nextPinHash = hashPin(pin, id);
  }

  const c = await pool().getConnection();
  try {
    await c.beginTransaction();
    const [existing] = await c.query(
      'SELECT device_key, pin_hash FROM profiles WHERE id = ? FOR UPDATE',
      [id]
    );

    if (existing.length === 0) {
      await c.query(
        'INSERT INTO profiles (id, name, avatar, device_key, pin_hash) VALUES (?, ?, ?, ?, ?)',
        [
          id, trimmed, avatar || null, deviceKey || null,
          nextPinHash === undefined ? null : nextPinHash,
        ]
      );
    } else {
      if (nextPinHash === undefined) {
        await c.query(
          'UPDATE profiles SET name = ?, avatar = ?, device_key = COALESCE(device_key, ?) WHERE id = ?',
          [trimmed, avatar || null, deviceKey || null, id]
        );
      } else {
        await c.query(
          'UPDATE profiles SET name = ?, avatar = ?, device_key = COALESCE(device_key, ?), pin_hash = ? WHERE id = ?',
          [trimmed, avatar || null, deviceKey || null, nextPinHash, id]
        );
      }
    }
    await c.commit();
  } catch (err) {
    await c.rollback();
    throw err;
  } finally {
    c.release();
  }

  return getProfile(id);
}

async function verifyProfilePin(id, pin) {
  if (!id) return { ok: false, reason: 'not_found' };
  const profile = await getProfile(id);
  if (!profile) return { ok: false, reason: 'not_found' };
  if (!profile.pin_hash) return { ok: true, hadPin: false };
  if (!isValidPin(pin)) return { ok: false, reason: 'bad_pin', hadPin: true };
  const expected = profile.pin_hash;
  const actual = hashPin(pin, id);
  // Constant-time comparison to avoid leaking the right prefix via timing.
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(actual,   'hex');
  if (a.length !== b.length) return { ok: false, reason: 'bad_pin', hadPin: true };
  const match = crypto.timingSafeEqual(a, b);
  return match ? { ok: true, hadPin: true } : { ok: false, reason: 'bad_pin', hadPin: true };
}

async function deleteProfile(id /*, deviceKey */) {
  const existing = await getProfile(id);
  if (!existing) return false;
  // Device-ownership check intentionally removed — see upsertProfile().
  await pool().query('DELETE FROM profiles WHERE id = ?', [id]);
  return true;
}

function rowToProfile(row) {
  return {
    id: row.id,
    name: row.name,
    avatar: row.avatar || null,
    device_key: row.device_key || null,
    pin_hash: row.pin_hash || null,
    has_pin: !!row.pin_hash,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

// ─── finished games ──────────────────────────────────────────────────────────

// How many championship games a player may finish per calendar day (server
// time). Enforced at room creation / join / quick-match sit; also exposed via
// the quota endpoint so the lobby can grey the championship options out.
const CHAMPIONSHIP_DAILY_LIMIT = 8;

// `mode` narrows a finished-games query: 'championship' | 'public' | 'all'.
function modeClause(mode) {
  if (mode === 'championship') return ' WHERE is_championship = 1';
  if (mode === 'public')       return ' WHERE is_championship = 0';
  return '';
}

const GAME_COLUMNS =
  'id, played_at, winner_name, winner_seat, winner_score, is_championship, payload';

async function listGames(limit = 50, mode = 'all') {
  // `limit=all` (or any non-numeric truthy string starting with 'a') returns
  // every finished game. Used by the Hall-of-Fame leaderboard so its
  // per-player aggregates and graphs include the full history. All other
  // callers get a bounded query.
  const wantAll = typeof limit === 'string' && limit.toLowerCase().startsWith('a');
  if (wantAll) {
    const [rows] = await pool().query(
      `SELECT ${GAME_COLUMNS}
       FROM finished_games${modeClause(mode)} ORDER BY played_at DESC`
    );
    return rows.map(rowToGame);
  }
  const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 200));
  const [rows] = await pool().query(
    `SELECT ${GAME_COLUMNS}
     FROM finished_games${modeClause(mode)} ORDER BY played_at DESC LIMIT ?`,
    [safeLimit]
  );
  return rows.map(rowToGame);
}

async function getGame(id) {
  const [rows] = await pool().query(
    `SELECT ${GAME_COLUMNS}
     FROM finished_games WHERE id = ? LIMIT 1`,
    [id]
  );
  return rows.length ? rowToGame(rows[0]) : null;
}

async function saveFinishedGame(record) {
  if (!record || !record.winner || !Array.isArray(record.players)) {
    throw new Error('Invalid game record');
  }
  const id = record.id || `g_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const playedAt = record.playedAt
    ? new Date(record.playedAt)
    : new Date();

  // `winners` covers ties: every player who finished on the top score. The
  // legacy `winner` (single) columns stay for backward compatibility — they
  // always hold the first (lowest-seat) winner.
  const winners = Array.isArray(record.winners) && record.winners.length
    ? record.winners.map((w) => ({ seat: w.seat ?? 0, name: w.name, score: w.score ?? 0 }))
    : [{ seat: record.winner.seat ?? 0, name: record.winner.name, score: record.winner.score ?? 0 }];

  // Records that don't carry the flag (older deployed clients) count as
  // championship — that matches how every pre-flag game was treated.
  const isChampionship = record.isChampionship === undefined
    ? 1
    : (record.isChampionship ? 1 : 0);

  const payload = JSON.stringify({
    players: record.players,
    roundDetails: record.roundDetails || [],
    winners,
    isTie: winners.length > 1,
  });

  await pool().query(
    `INSERT IGNORE INTO finished_games
       (id, played_at, winner_name, winner_seat, winner_score, is_championship, payload)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      playedAt,
      record.winner.name,
      record.winner.seat ?? 0,
      record.winner.score ?? 0,
      isChampionship,
      payload,
    ]
  );

  return getGame(id);
}

function rowToGame(row) {
  let payload = {};
  try { payload = JSON.parse(row.payload); } catch { /* keep empty */ }
  const playedAt = row.played_at instanceof Date
    ? row.played_at.toISOString()
    : row.played_at;
  const winner = {
    name: row.winner_name,
    seat: row.winner_seat,
    score: row.winner_score,
  };
  // Pre-tie-support rows have no `winners` in the payload — synthesise a
  // single-entry list from the winner columns so consumers can always rely
  // on `winners` being present.
  const winners = Array.isArray(payload.winners) && payload.winners.length
    ? payload.winners
    : [winner];
  return {
    id: row.id,
    playedAt,
    winner,
    winners,
    isTie: winners.length > 1,
    isChampionship: row.is_championship === undefined ? true : !!row.is_championship,
    players: payload.players || [],
    roundDetails: payload.roundDetails || [],
  };
}

async function getLifetimeStats(name, mode = 'all') {
  if (!name) throw new Error('name is required');
  const [rows] = await pool().query(
    `SELECT winner_name, winner_score, payload
     FROM finished_games${modeClause(mode)}`
  );
  const out = {
    name,
    gamesPlayed: 0, wins: 0, totalScore: 0,
    kingsOfHearts: 0, queens: 0, jacks: 0, hearts: 0,
    totalTricks: 0, roundsLed: 0,
  };
  for (const row of rows) {
    let payload = {};
    try { payload = JSON.parse(row.payload); } catch { continue; }
    const me = (payload.players || []).find((p) => p.name === name);
    if (!me) continue;
    out.gamesPlayed += 1;
    // Tie-aware: a game may have several winners (payload.winners). Fall
    // back to the single winner_name column for rows saved before ties.
    const winnerNames = Array.isArray(payload.winners) && payload.winners.length
      ? payload.winners.map((w) => w.name)
      : [row.winner_name];
    if (winnerNames.includes(name)) out.wins += 1;
    out.totalScore += me.score ?? 0;
    for (const d of payload.roundDetails || []) {
      if (d.leaderSeat === me.seat) out.roundsLed += 1;
      out.totalTricks += d.tricksTaken?.[me.seat] ?? 0;
      if (d.gameType === 'Q') out.queens += d.queensTaken?.[me.seat] ?? 0;
      if (d.gameType === 'J') out.jacks  += d.jacksTaken?.[me.seat]  ?? 0;
      if (d.gameType === 'H') out.hearts += d.heartsTaken?.[me.seat] ?? 0;
      if (d.gameType === 'K' && d.kingOfHeartsTakenBy === me.seat) out.kingsOfHearts += 1;
    }
  }
  return out;
}

async function saveLiveGame(roomCode, snapshot) {
  if (!roomCode || !snapshot) return;
  await pool().query(
    `INSERT INTO live_games (room_code, state_json) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE state_json = VALUES(state_json)`,
    [roomCode, JSON.stringify(snapshot)]
  );
}

async function loadLiveGame(roomCode) {
  const [rows] = await pool().query(
    'SELECT state_json FROM live_games WHERE room_code = ? LIMIT 1',
    [roomCode]
  );
  if (!rows.length) return null;
  try { return JSON.parse(rows[0].state_json); }
  catch { return null; }
}

async function deleteLiveGame(roomCode) {
  await pool().query('DELETE FROM live_games WHERE room_code = ?', [roomCode]);
}

/**
 * Housekeeping for rows that outlived their room. Two classes get swept:
 *   • games that already finished (a `finished_games` row took over, so the
 *     snapshot is dead weight — and rehydrating one would drop a returning
 *     player back onto a game-over screen);
 *   • anything untouched for `maxAgeHours` (a crash mid-game leaves a row
 *     nobody will ever rejoin).
 * Returns the number of rows removed.
 */
async function purgeStaleLiveGames(maxAgeHours = 24) {
  const [rows] = await pool().query(
    'SELECT room_code, state_json, updated_at FROM live_games'
  );
  const cutoff = Date.now() - maxAgeHours * 3600 * 1000;
  const doomed = [];
  for (const r of rows) {
    if (new Date(r.updated_at).getTime() < cutoff) { doomed.push(r.room_code); continue; }
    let snap;
    try { snap = JSON.parse(r.state_json); } catch { doomed.push(r.room_code); continue; }
    if (snap && snap.status === 'finished') doomed.push(r.room_code);
  }
  if (!doomed.length) return 0;
  await pool().query('DELETE FROM live_games WHERE room_code IN (?)', [doomed]);
  return doomed.length;
}

async function listLiveGames() {
  const [rows] = await pool().query(
    'SELECT room_code, state_json FROM live_games ORDER BY updated_at DESC'
  );
  const out = [];
  for (const r of rows) {
    try { out.push({ roomCode: r.room_code, snapshot: JSON.parse(r.state_json) }); }
    catch { /* ignore malformed row */ }
  }
  return out;
}

/**
 * Aggregate every finished game into a per-player leaderboard. Same shape
 * the client computes locally for the Hall of Fame view (wins, games
 * played, total cumulative score, best/worst single-game score), exposed
 * server-side so external API consumers don't have to fetch every game.
 *
 * Returned rows are sorted by wins desc, then total score desc.
 */
async function getPublicLeaderboard(mode = 'all') {
  const games = await listGames(200, mode);
  const tally = new Map();
  for (const g of games) {
    for (const p of g.players || []) {
      const k = p.name;
      const t = tally.get(k) || {
        name: p.name,
        gamesPlayed: 0,
        wins: 0,
        totalScore: 0,
        bestScore: null,
        worstScore: null,
      };
      t.gamesPlayed++;
      // Tie-aware: every player in `winners` gets the win.
      if ((g.winners || []).some((w) => w.name === p.name)) t.wins++;
      t.totalScore += p.score || 0;
      if (t.bestScore  === null || (p.score || 0) > t.bestScore)  t.bestScore  = p.score || 0;
      if (t.worstScore === null || (p.score || 0) < t.worstScore) t.worstScore = p.score || 0;
      tally.set(k, t);
    }
  }
  return Array.from(tally.values())
    .sort((a, b) => (b.wins - a.wins) || (b.totalScore - a.totalScore));
}

// ─── durak live games (in-flight ჩეხური დურაკა rooms) ───────────────────────

async function saveDurakLiveGame(roomCode, snapshot) {
  if (!roomCode || !snapshot) return;
  await pool().query(
    `INSERT INTO durak_live_games (room_code, state_json) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE state_json = VALUES(state_json)`,
    [roomCode, JSON.stringify(snapshot)]
  );
}

async function loadDurakLiveGame(roomCode) {
  const [rows] = await pool().query(
    'SELECT state_json FROM durak_live_games WHERE room_code = ? LIMIT 1',
    [roomCode]
  );
  if (!rows.length) return null;
  try { return JSON.parse(rows[0].state_json); }
  catch { return null; }
}

async function deleteDurakLiveGame(roomCode) {
  await pool().query('DELETE FROM durak_live_games WHERE room_code = ?', [roomCode]);
}

async function listDurakLiveGames() {
  const [rows] = await pool().query(
    'SELECT room_code, state_json FROM durak_live_games ORDER BY updated_at DESC'
  );
  const out = [];
  for (const r of rows) {
    try { out.push({ roomCode: r.room_code, snapshot: JSON.parse(r.state_json) }); }
    catch { /* ignore malformed row */ }
  }
  return out;
}

/**
 * Daily championship quota for one player name (server-local calendar day).
 * A "played" game is a finished championship game the player participated
 * in — surrendered games count too, so abandoning a match doesn't refund
 * the slot.
 */
async function getChampionshipQuota(name) {
  if (!name) throw new Error('name is required');
  const [rows] = await pool().query(
    `SELECT payload FROM finished_games
     WHERE is_championship = 1 AND played_at >= CURDATE()`
  );
  const lower = String(name).trim().toLowerCase();
  let playedToday = 0;
  for (const row of rows) {
    let payload = {};
    try { payload = JSON.parse(row.payload); } catch { continue; }
    const played = (payload.players || []).some(
      (p) => String(p.name || '').toLowerCase() === lower
    );
    if (played) playedToday += 1;
  }
  return {
    name: String(name).trim(),
    limit: CHAMPIONSHIP_DAILY_LIMIT,
    playedToday,
    remaining: Math.max(0, CHAMPIONSHIP_DAILY_LIMIT - playedToday),
  };
}

// ─── sounds ──────────────────────────────────────────────────────────────────
// The reaction-clip catalogue. Built-in clips are files in the front-end
// build (`/sounds/<id>.mp3`); admin uploads keep their bytes in the row.

// Clip payload ceiling. Reaction clips are a couple of seconds of speech —
// 2 MB is already luxurious, and every byte is base64 in a MEDIUMTEXT column
// that gets read whenever the clip is served.
const MAX_SOUND_BYTES = 2 * 1024 * 1024;

const SOUND_MIMES = {
  'audio/mpeg': 'mp3',
  'audio/mp3':  'mp3',
  'audio/ogg':  'ogg',
  'audio/wav':  'wav',
  'audio/x-wav':'wav',
  'audio/webm': 'webm',
  'audio/mp4':  'm4a',
  'audio/aac':  'aac',
};

/** Row → the shape the API hands out. Never includes the audio payload. */
function rowToSound(r) {
  return {
    id: r.id,
    label: r.label,
    glyph: r.glyph || '?',
    color: r.color || '#8e6a1e',
    source: r.source,
    // Built-ins keep pointing at the static file that ships with the build;
    // uploads stream out of MySQL. `v` busts the browser cache when an admin
    // replaces a clip's audio under the same id.
    url: r.source === 'builtin'
      ? `/sounds/${encodeURIComponent(r.id)}.mp3`
      : `/api/sounds/${encodeURIComponent(r.id)}/audio?v=${new Date(r.updated_at).getTime()}`,
    sortOrder: r.sort_order,
    updatedAt: r.updated_at,
  };
}

async function listSounds() {
  const [rows] = await pool().query(
    'SELECT id, label, glyph, color, source, sort_order, updated_at ' +
    'FROM sounds ORDER BY sort_order ASC, id ASC'
  );
  return rows.map(rowToSound);
}

/** Just the ids — what the socket layer needs to validate a `play-sound`. */
async function listSoundIds() {
  const [rows] = await pool().query('SELECT id FROM sounds');
  return rows.map((r) => r.id);
}

/** `{ mime, buffer }` for an uploaded clip, or null. */
async function getSoundAudio(id) {
  const [rows] = await pool().query(
    'SELECT mime, audio_b64 FROM sounds WHERE id = ? AND source = ? LIMIT 1',
    [id, 'uploaded']
  );
  if (!rows.length || !rows[0].audio_b64) return null;
  return {
    mime: rows[0].mime || 'audio/mpeg',
    buffer: Buffer.from(rows[0].audio_b64, 'base64'),
  };
}

/**
 * Turn an uploaded `data:audio/...;base64,...` URL into `{ mime, b64, ext }`.
 * Throws a 4xx-tagged error on anything that isn't plausible audio.
 */
function parseAudioDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') throw badRequest('audio must be a data URL string');
  const m = /^data:([a-z0-9/+.-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl.trim());
  if (!m) throw badRequest('audio must be a base64 data URL');
  const mime = m[1].toLowerCase();
  const ext = SOUND_MIMES[mime];
  if (!ext) throw badRequest(`unsupported audio type: ${mime}`);
  const b64 = m[2];
  const bytes = Math.floor(b64.length * 3 / 4);
  if (bytes === 0) throw badRequest('audio file is empty');
  if (bytes > MAX_SOUND_BYTES) {
    throw badRequest(`audio is too large (max ${Math.round(MAX_SOUND_BYTES / 1024)} KB)`);
  }
  return { mime, b64, ext };
}

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

// Palette the admin form cycles through when no colour is picked. Same
// saloon tones as the hand-authored built-ins.
const SOUND_COLORS = [
  '#b98a2f', '#a5372b', '#4c7a2f', '#31536b', '#6b3fa0', '#5b3d99',
  '#a83a68', '#8e6a1e', '#b0446e', '#2f5d8a', '#2b7a55', '#9c7818',
  '#b04a52', '#9c5a24', '#a97b14', '#22758a', '#5e7a1e',
];

/**
 * Derive a wire id from the clip's name. The name is usually Georgian, which
 * has no ASCII form, so anything that doesn't reduce to a usable slug falls
 * back to a short random token. Uniqueness is settled against the table.
 */
async function _uniqueSoundId(label) {
  const base = String(label || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const seed = base || `snd-${crypto.randomBytes(4).toString('hex')}`;
  const [rows] = await pool().query('SELECT id FROM sounds');
  const taken = new Set(rows.map((r) => r.id));
  if (!taken.has(seed)) return seed;
  for (let n = 2; n < 500; n++) {
    const candidate = `${seed}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${seed}-${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * Add an uploaded clip. `label` and `audio` (a data URL) are required;
 * `glyph` and `color` are derived from the label when not supplied so the
 * admin form can be just "name + file".
 */
async function createSound({ label, audio, glyph, color } = {}) {
  const name = String(label || '').trim();
  if (!name) throw badRequest('name is required');
  if (name.length > 64) throw badRequest('name is too long (max 64 characters)');
  const { mime, b64 } = parseAudioDataUrl(audio);

  const id = await _uniqueSoundId(name);
  // First character of the name reads well on the tiny canvas buttons —
  // that's exactly the convention the hand-authored glyphs followed.
  const finalGlyph = (typeof glyph === 'string' && glyph.trim())
    ? [...glyph.trim()][0]
    : ([...name][0] || '?');
  const finalColor = /^#[0-9a-f]{6}$/i.test(String(color || ''))
    ? color
    : SOUND_COLORS[Math.abs(_hashCode(id)) % SOUND_COLORS.length];

  const [[{ maxOrder }]] = await pool().query(
    'SELECT COALESCE(MAX(sort_order), 0) AS maxOrder FROM sounds'
  );

  await pool().query(
    `INSERT INTO sounds (id, label, glyph, color, source, mime, audio_b64, sort_order)
     VALUES (?, ?, ?, ?, 'uploaded', ?, ?, ?)`,
    [id, name, finalGlyph, finalColor, mime, b64, Number(maxOrder) + 10]
  );
  return getSound(id);
}

function _hashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return h;
}

async function getSound(id) {
  const [rows] = await pool().query(
    'SELECT id, label, glyph, color, source, sort_order, updated_at FROM sounds WHERE id = ? LIMIT 1',
    [id]
  );
  return rows.length ? rowToSound(rows[0]) : null;
}

/**
 * Edit an existing clip. Every field is optional — only what's passed is
 * touched. Replacing `audio` on a built-in promotes it to 'uploaded' (the
 * static file stays on disk, unused).
 */
async function updateSound(id, { label, glyph, color, audio } = {}) {
  const existing = await getSound(id);
  if (!existing) return null;

  const sets = [];
  const args = [];
  if (label !== undefined) {
    const name = String(label || '').trim();
    if (!name) throw badRequest('name cannot be empty');
    if (name.length > 64) throw badRequest('name is too long (max 64 characters)');
    sets.push('label = ?'); args.push(name);
  }
  if (glyph !== undefined) {
    const g = String(glyph || '').trim();
    sets.push('glyph = ?'); args.push(g ? [...g][0] : '?');
  }
  if (color !== undefined) {
    if (!/^#[0-9a-f]{6}$/i.test(String(color || ''))) throw badRequest('color must be a #rrggbb hex string');
    sets.push('color = ?'); args.push(color);
  }
  if (audio !== undefined && audio !== null) {
    const { mime, b64 } = parseAudioDataUrl(audio);
    sets.push('mime = ?', 'audio_b64 = ?', 'source = ?');
    args.push(mime, b64, 'uploaded');
  }
  if (!sets.length) return existing;

  args.push(id);
  await pool().query(`UPDATE sounds SET ${sets.join(', ')} WHERE id = ?`, args);
  return getSound(id);
}

async function deleteSound(id) {
  const [res] = await pool().query('DELETE FROM sounds WHERE id = ?', [id]);
  return res.affectedRows > 0;
}

module.exports = {
  // profiles
  listProfiles, getProfile, upsertProfile, deleteProfile, verifyProfilePin,
  // finished games
  listGames, getGame, saveFinishedGame,
  // stats
  getLifetimeStats, getPublicLeaderboard,
  // championship daily quota
  getChampionshipQuota, CHAMPIONSHIP_DAILY_LIMIT,
  // live games (mid-flight rooms persisted for crash/rejoin recovery)
  saveLiveGame, loadLiveGame, deleteLiveGame, listLiveGames, purgeStaleLiveGames,
  // durak live games
  saveDurakLiveGame, loadDurakLiveGame, deleteDurakLiveGame, listDurakLiveGames,
  // reaction sounds (admin-managed)
  listSounds, listSoundIds, getSound, getSoundAudio, createSound, updateSound, deleteSound,
};
