'use strict';

const DurakGame = require('./DurakGame');
const store = require('../db/store');
const {
  MIN_PLAYERS, MAX_PLAYERS,
  DEFAULT_TARGET_SCORE, MIN_TARGET_SCORE, MAX_TARGET_SCORE,
} = require('./constants');

// Durak rooms are deliberately in-memory only — no MySQL, no leaderboard.
// A room survives socket blips through name-based reattach and is swept
// after everyone has been offline for EMPTY_ROOM_TTL_MS.
const EMPTY_ROOM_TTL_MS = 30 * 60 * 1000;

function generateCode(taken) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = 'D';
    for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  } while (taken.has(code));
  return code;
}

class DurakManager {
  constructor() {
    this.rooms = new Map();      // code -> room
    this.socketMap = new Map();  // socketId -> { roomCode, seat }
    this.gcTimers = new Map();   // code -> Timeout
    // The one public quick-match table currently collecting players (like
    // the King homepage tables). First sitter creates it and owns the
    // target score; cleared when its match starts or the room dies.
    this.publicRoomCode = null;
  }

  _clampTarget(targetScore) {
    let target = Number(targetScore);
    if (!Number.isFinite(target)) target = DEFAULT_TARGET_SCORE;
    return Math.round(Math.min(MAX_TARGET_SCORE, Math.max(MIN_TARGET_SCORE, target)));
  }

  // ── persistence (same crash-recovery story as the King rooms) ─────────────

  _roomSnapshot(room) {
    return {
      code: room.code,
      targetScore: room.targetScore,
      creatorSeat: room.creatorSeat,
      isPublic: !!room.isPublic,
      status: room.status,
      players: room.players.map((p) => ({
        name: p.name, avatar: p.avatar || null, seat: p.seat,
      })),
      game: room.game ? room.game.serialize() : null,
    };
  }

  _roomFromSnapshot(snap) {
    if (!snap || !Array.isArray(snap.players)) return null;
    return {
      code: snap.code,
      targetScore: this._clampTarget(snap.targetScore),
      creatorSeat: snap.creatorSeat ?? 0,
      isPublic: !!snap.isPublic,
      status: snap.status || 'waiting',
      players: snap.players.map((p) => ({
        // No live socket after a restart — everyone reattaches by name.
        id: null, name: p.name, avatar: p.avatar || null, seat: p.seat, connected: false,
      })),
      game: snap.game ? DurakGame.fromSnapshot(snap.game) : null,
    };
  }

  /** Fire-and-forget snapshot to MySQL (losing one snapshot is recoverable). */
  persistRoom(code) {
    const room = this.rooms.get(code);
    if (!room) {
      store.deleteDurakLiveGame(code).catch(() => {});
      return;
    }
    store.saveDurakLiveGame(code, this._roomSnapshot(room)).catch((err) => {
      console.warn(`[durak] persist ${code} failed: ${err.message}`);
    });
  }

  /** Rejoin recovery: pull a room MySQL still remembers back into memory. */
  async tryLoadFromDB(code) {
    if (this.rooms.has(code)) return this.rooms.get(code);
    let snap;
    try { snap = await store.loadDurakLiveGame(code); }
    catch (err) {
      console.warn(`[durak] tryLoadFromDB ${code} failed: ${err.message}`);
      return null;
    }
    if (!snap) return null;
    const room = this._roomFromSnapshot(snap);
    if (!room) return null;
    this.rooms.set(code, room);
    if (room.isPublic && room.status === 'waiting' && !this.publicRoomCode) {
      this.publicRoomCode = code;
    }
    console.log(`[durak] Hydrated room ${code} from DB (status=${room.status})`);
    return room;
  }

  /** Boot-time restore so a deploy/restart doesn't kill in-flight matches. */
  async hydrateAll() {
    let entries;
    try { entries = await store.listDurakLiveGames(); }
    catch (err) {
      console.warn(`[durak] hydrateAll failed: ${err.message}`);
      return 0;
    }
    let loaded = 0;
    for (const { roomCode, snapshot } of entries) {
      if (this.rooms.has(roomCode)) continue;
      const room = this._roomFromSnapshot(snapshot);
      if (!room) continue;
      this.rooms.set(roomCode, room);
      if (room.isPublic && room.status === 'waiting' && !this.publicRoomCode) {
        this.publicRoomCode = roomCode;
      }
      this.maybeArmGc(roomCode);
      loaded += 1;
    }
    if (loaded > 0) console.log(`[durak] Hydrated ${loaded} live room(s) from DB.`);
    return loaded;
  }

  createRoom(socketId, playerName, avatar, targetScore, isPublic = false) {
    const code = generateCode(this.rooms);
    const room = {
      code,
      targetScore: this._clampTarget(targetScore),
      creatorSeat: 0,
      isPublic,
      status: 'waiting', // 'waiting' | 'playing' | 'match_end' (mirrors game phase)
      players: [{
        id: socketId, name: playerName, avatar: avatar || null,
        seat: 0, connected: true,
      }],
      game: null,
    };
    this.rooms.set(code, room);
    this.socketMap.set(socketId, { roomCode: code, seat: 0 });
    return { room, seat: 0 };
  }

  /** Sit at the public table (creates it on first sit; name-reattach safe). */
  sitPublic(socketId, playerName, avatar) {
    let room = this.publicRoomCode ? this.rooms.get(this.publicRoomCode) : null;
    if (!room || room.status !== 'waiting') {
      this.publicRoomCode = null;
      room = null;
    }
    if (!room) {
      const created = this.createRoom(socketId, playerName, avatar, DEFAULT_TARGET_SCORE, true);
      this.publicRoomCode = created.room.code;
      return created;
    }
    const joined = this.joinRoom(room.code, socketId, playerName, avatar);
    if (joined.error) return joined;
    return joined;
  }

  /** The room's first player (creator) can adjust the losing score while
   *  the table is still collecting players. */
  setTargetScore(socketId, targetScore) {
    const mapping = this.socketMap.get(socketId);
    if (!mapping) return { error: 'შენ ოთახში არ ხარ.' };
    const room = this.rooms.get(mapping.roomCode);
    if (!room) return { error: 'ოთახი ვერ მოიძებნა.' };
    if (mapping.seat !== room.creatorSeat) return { error: 'ქულის შეცვლა მხოლოდ პირველ მჯდომს შეუძლია.' };
    if (room.status !== 'waiting') return { error: 'თამაში უკვე დაწყებულია.' };
    room.targetScore = this._clampTarget(targetScore);
    return { room };
  }

  /** Lobby view of the public table (empty when none is collecting). */
  publicRoomView() {
    const room = this.publicRoomCode ? this.rooms.get(this.publicRoomCode) : null;
    if (!room || room.status !== 'waiting') {
      return { roomCode: null, targetScore: null, players: [] };
    }
    return {
      roomCode: room.code,
      targetScore: room.targetScore,
      creatorSeat: room.creatorSeat,
      players: room.players.map((p) => ({
        seat: p.seat, name: p.name, avatar: p.avatar || null, connected: !!p.connected,
      })),
    };
  }

  clearPublicPointer(code) {
    if (this.publicRoomCode === code) this.publicRoomCode = null;
  }

  joinRoom(code, socketId, playerName, avatar) {
    const room = this.rooms.get(code);
    if (!room) return { error: 'ოთახი ვერ მოიძებნა.' };

    // Reconnect by name (any phase) — same approach as the King rooms.
    const existing = room.players.find(
      (p) => p.name.toLowerCase() === playerName.toLowerCase()
    );
    if (existing) {
      if (existing.id && existing.id !== socketId) this.socketMap.delete(existing.id);
      existing.id = socketId;
      existing.connected = true;
      if (avatar && !existing.avatar) existing.avatar = avatar;
      this.socketMap.set(socketId, { roomCode: code, seat: existing.seat });
      this.cancelGc(code);
      return { room, seat: existing.seat, reconnected: true };
    }

    if (room.status !== 'waiting') return { error: 'თამაში უკვე დაწყებულია.' };
    if (room.players.length >= MAX_PLAYERS) return { error: 'ოთახი სავსეა (მაქს. 6).' };

    const takenSeats = new Set(room.players.map((p) => p.seat));
    let seat = 0;
    while (takenSeats.has(seat)) seat++;
    room.players.push({ id: socketId, name: playerName, avatar: avatar || null, seat, connected: true });
    this.socketMap.set(socketId, { roomCode: code, seat });
    this.cancelGc(code);
    return { room, seat };
  }

  startMatch(code, socketId) {
    const room = this.rooms.get(code);
    if (!room) return { error: 'ოთახი ვერ მოიძებნა.' };
    const mapping = this.socketMap.get(socketId);
    if (!mapping || mapping.roomCode !== code) return { error: 'შენ ამ ოთახში არ ხარ.' };
    if (mapping.seat !== room.creatorSeat) return { error: 'თამაშს მხოლოდ ოთახის შემქმნელი იწყებს.' };
    if (room.status !== 'waiting') return { error: 'თამაში უკვე დაწყებულია.' };
    if (room.players.length < MIN_PLAYERS) return { error: 'საჭიროა მინიმუმ 2 მოთამაშე.' };

    room.game = new DurakGame(
      room.players.map((p) => ({ seat: p.seat, name: p.name })),
      room.targetScore
    );
    const result = room.game.startHand(room.creatorSeat);
    if (!result.ok) return { error: result.error };
    room.status = 'playing';
    // A public table that starts playing frees the lobby slot for the next group.
    this.clearPublicPointer(code);
    return { room };
  }

  /** Next hand after a hand ends — the hand winner (or the creator as a
   *  fallback) deals; any active player may press the button. */
  nextHand(code, socketId) {
    const room = this.rooms.get(code);
    if (!room || !room.game) return { error: 'ოთახი ვერ მოიძებნა.' };
    const mapping = this.socketMap.get(socketId);
    if (!mapping || mapping.roomCode !== code) return { error: 'შენ ამ ოთახში არ ხარ.' };
    if (room.game.eliminated[mapping.seat]) return { error: 'შენ უკვე გამოხვედი — უყურე თამაშს.' };
    const result = room.game.nextHand();
    if (!result.ok) return { error: result.error };
    return { room };
  }

  /** Fresh match in the same room (scores wiped) after a match ends. */
  rematch(code, socketId) {
    const room = this.rooms.get(code);
    if (!room || !room.game) return { error: 'ოთახი ვერ მოიძებნა.' };
    if (room.game.phase !== 'match_end') return { error: 'მატჩი ჯერ არ დასრულებულა.' };
    const mapping = this.socketMap.get(socketId);
    if (!mapping || mapping.roomCode !== code) return { error: 'შენ ამ ოთახში არ ხარ.' };
    room.game.resetMatch();
    const result = room.game.startHand(room.game.matchWinner ?? room.creatorSeat);
    if (!result.ok) return { error: result.error };
    room.status = 'playing';
    return { room };
  }

  /** Creator aborts the match — room drops back to the waiting lobby
   *  (roster kept, scores discarded). */
  endMatch(code, socketId) {
    const room = this.rooms.get(code);
    if (!room) return { error: 'ოთახი ვერ მოიძებნა.' };
    const mapping = this.socketMap.get(socketId);
    if (!mapping || mapping.roomCode !== code) return { error: 'შენ ამ ოთახში არ ხარ.' };
    if (mapping.seat !== room.creatorSeat) return { error: 'თამაშის დასრულება მხოლოდ თამადას შეუძლია.' };
    if (!room.game) return { error: 'თამაში არ მიმდინარეობს.' };
    room.game = null;
    room.status = 'waiting';
    return { room };
  }

  leaveRoom(socketId) {
    const mapping = this.socketMap.get(socketId);
    if (!mapping) return null;
    const room = this.rooms.get(mapping.roomCode);
    this.socketMap.delete(socketId);
    if (!room) return null;

    if (room.status === 'waiting') {
      // In the lobby a leave really removes the seat.
      room.players = room.players.filter((p) => p.id !== socketId);
      if (room.players.length === 0) {
        this.rooms.delete(room.code);
        this.clearPublicPointer(room.code);
        return { room: null, roomCode: mapping.roomCode };
      }
      // Creator left — hand the room to the lowest remaining seat.
      if (!room.players.some((p) => p.seat === room.creatorSeat)) {
        room.creatorSeat = Math.min(...room.players.map((p) => p.seat));
      }
    } else {
      // Mid-match: keep the seat, mark offline (name-reattach can resume).
      const player = room.players.find((p) => p.id === socketId);
      if (player) { player.connected = false; player.id = null; }
    }
    this.maybeArmGc(room.code);
    return { room, roomCode: mapping.roomCode };
  }

  markDisconnected(socketId) {
    const mapping = this.socketMap.get(socketId);
    if (!mapping) return null;
    const room = this.rooms.get(mapping.roomCode);
    this.socketMap.delete(socketId);
    if (!room) return null;
    const player = room.players.find((p) => p.id === socketId);
    if (player) { player.connected = false; player.id = null; }
    this.maybeArmGc(room.code);
    return { room };
  }

  maybeArmGc(code) {
    const room = this.rooms.get(code);
    if (!room) return;
    if (room.players.some((p) => p.connected)) return;
    this.cancelGc(code);
    const t = setTimeout(() => {
      const r = this.rooms.get(code);
      if (r && !r.players.some((p) => p.connected)) {
        this.rooms.delete(code);
        this.clearPublicPointer(code);
        store.deleteDurakLiveGame(code).catch(() => {});
      }
      this.gcTimers.delete(code);
    }, EMPTY_ROOM_TTL_MS);
    if (typeof t.unref === 'function') t.unref();
    this.gcTimers.set(code, t);
  }

  cancelGc(code) {
    const t = this.gcTimers.get(code);
    if (t) { clearTimeout(t); this.gcTimers.delete(code); }
  }

  getRoom(code) { return this.rooms.get(code); }
  getMapping(socketId) { return this.socketMap.get(socketId); }

  roomView(room) {
    return {
      roomCode: room.code,
      targetScore: room.targetScore,
      creatorSeat: room.creatorSeat,
      isPublic: !!room.isPublic,
      status: room.status,
      players: room.players.map((p) => ({
        seat: p.seat, name: p.name, avatar: p.avatar || null, connected: !!p.connected,
      })),
    };
  }
}

module.exports = DurakManager;
