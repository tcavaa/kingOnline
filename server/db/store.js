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

async function listGames(limit = 50) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 200));
  const [rows] = await pool().query(
    `SELECT id, played_at, winner_name, winner_seat, winner_score, payload
     FROM finished_games ORDER BY played_at DESC LIMIT ?`,
    [safeLimit]
  );
  return rows.map(rowToGame);
}

async function getGame(id) {
  const [rows] = await pool().query(
    `SELECT id, played_at, winner_name, winner_seat, winner_score, payload
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

  const payload = JSON.stringify({
    players: record.players,
    roundDetails: record.roundDetails || [],
  });

  await pool().query(
    `INSERT IGNORE INTO finished_games
       (id, played_at, winner_name, winner_seat, winner_score, payload)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      id,
      playedAt,
      record.winner.name,
      record.winner.seat ?? 0,
      record.winner.score ?? 0,
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
  return {
    id: row.id,
    playedAt,
    winner: {
      name: row.winner_name,
      seat: row.winner_seat,
      score: row.winner_score,
    },
    players: payload.players || [],
    roundDetails: payload.roundDetails || [],
  };
}

async function getLifetimeStats(name) {
  if (!name) throw new Error('name is required');
  const [rows] = await pool().query(
    `SELECT winner_name, winner_score, payload
     FROM finished_games`
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
    if (row.winner_name === name) out.wins += 1;
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

module.exports = {
  // profiles
  listProfiles, getProfile, upsertProfile, deleteProfile, verifyProfilePin,
  // finished games
  listGames, getGame, saveFinishedGame,
  // stats
  getLifetimeStats,
  // live games (mid-flight rooms persisted for crash/rejoin recovery)
  saveLiveGame, loadLiveGame, deleteLiveGame, listLiveGames,
};
