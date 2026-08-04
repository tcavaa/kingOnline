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
  saveLiveGame, loadLiveGame, deleteLiveGame, listLiveGames,
  // durak live games
  saveDurakLiveGame, loadDurakLiveGame, deleteDurakLiveGame, listDurakLiveGames,
};
