'use strict';

const GameState = require('./GameState');
const store     = require('../db/store');

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// How long an entirely-empty (all players disconnected) room is kept alive
// in memory before being garbage-collected. The persisted `live_games` row
// also covers crash recovery, but holding the room in memory means a quick
// network blip (mobile wifi switching cells, server hot-reload, etc.) never
// drops the table state — the rejoining player just reattaches to the same
// in-memory room. The MySQL snapshot is the long-term backup; the timer is
// the short-term one.
const ROOM_GRACE_MS = 90 * 1000;

class GameManager {
  constructor() {
    this.rooms = new Map();
    this.socketRoomMap = new Map();
    // roomCode -> Timeout: pending "delete if still empty" job.
    this.roomGraceTimers = new Map();
  }

  // ── persistence ───────────────────────────────────────────────────────────

  /**
   * Serialise a room to a plain JSON-friendly object that can be restored
   * later by `_roomFromSnapshot`. socket ids are preserved but considered
   * advisory — they're stale the moment the server restarts.
   */
  _roomSnapshot(room) {
    return {
      code: room.code,
      creatorSeat: room.creatorSeat,
      status: room.status,
      players: room.players.map((p) => ({
        id: p.id, name: p.name, avatar: p.avatar || null,
        seat: p.seat, connected: !!p.connected,
      })),
      gameState: room.gameState ? room.gameState.serialize() : null,
    };
  }

  _roomFromSnapshot(snap) {
    if (!snap || !Array.isArray(snap.players)) return null;
    const room = {
      code: snap.code,
      creatorSeat: snap.creatorSeat ?? 0,
      status: snap.status || 'waiting',
      players: snap.players.map((p) => ({
        id: p.id || null, name: p.name, avatar: p.avatar || null,
        seat: p.seat,
        // After a server restart no live socket exists, so everyone starts
        // disconnected until they re-join with the same room code + name.
        connected: false,
      })),
      gameState: snap.gameState ? GameState.fromSnapshot(snap.gameState) : null,
    };
    return room;
  }

  /**
   * Fire-and-forget snapshot to MySQL. Awaits internally but errors are only
   * logged — the in-memory state has already been updated and broadcast,
   * losing one snapshot is recoverable.
   */
  _persist(roomCode) {
    const room = this.rooms.get(roomCode);
    if (!room) {
      // Room was just deleted — drop the persisted row too.
      store.deleteLiveGame(roomCode).catch((err) => {
        console.warn(`[GameManager] _persist delete ${roomCode} failed: ${err.message}`);
      });
      return;
    }
    const snapshot = this._roomSnapshot(room);
    store.saveLiveGame(roomCode, snapshot).catch((err) => {
      console.warn(`[GameManager] _persist save ${roomCode} failed: ${err.message}`);
    });
  }

  /**
   * Look the room up in memory; if it's not there, try MySQL. Designed to be
   * called from a join-room handler before falling back to "Room not found".
   */
  async tryLoadFromDB(roomCode) {
    if (this.rooms.has(roomCode)) return this.rooms.get(roomCode);
    let snap;
    try { snap = await store.loadLiveGame(roomCode); }
    catch (err) {
      console.warn(`[GameManager] tryLoadFromDB ${roomCode} failed: ${err.message}`);
      return null;
    }
    if (!snap) return null;
    const room = this._roomFromSnapshot(snap);
    if (!room) return null;
    this.rooms.set(roomCode, room);
    console.log(`[GameManager] Hydrated room ${roomCode} from DB (status=${room.status})`);
    return room;
  }

  /**
   * Called once at server boot. Reloads every persisted live room from MySQL
   * so a deploy/restart doesn't kill in-flight games.
   */
  async hydrateAll() {
    let entries;
    try { entries = await store.listLiveGames(); }
    catch (err) {
      console.warn(`[GameManager] hydrateAll failed: ${err.message}`);
      return 0;
    }
    let loaded = 0;
    for (const { roomCode, snapshot } of entries) {
      if (this.rooms.has(roomCode)) continue;
      const room = this._roomFromSnapshot(snapshot);
      if (!room) continue;
      this.rooms.set(roomCode, room);
      loaded += 1;
    }
    if (loaded > 0) console.log(`[GameManager] Hydrated ${loaded} live room(s) from DB.`);
    return loaded;
  }

  // ── room lifecycle ────────────────────────────────────────────────────────

  _generateUniqueCode() {
    let code;
    do { code = generateCode(); } while (this.rooms.has(code));
    return code;
  }

  createRoom(socketId, playerName, avatar = null) {
    const roomCode = this._generateUniqueCode();
    const player = { id: socketId, name: playerName, avatar, seat: 0, connected: true };
    this.rooms.set(roomCode, {
      code: roomCode,
      players: [player],
      creatorSeat: 0,
      gameState: null,
      status: 'waiting',
    });
    this.socketRoomMap.set(socketId, { roomCode, seat: 0 });
    this._persist(roomCode);
    return { roomCode, seat: 0 };
  }

  joinRoom(roomCode, socketId, playerName, avatar = null) {
    const room = this.rooms.get(roomCode);
    if (!room) throw new Error(`Room ${roomCode} not found.`);

    // Reconnection by name when the game has already started.
    if (room.status === 'playing' || room.status === 'finished') {
      const existingPlayer = room.players.find(
        (p) => p.name.toLowerCase() === playerName.toLowerCase()
      );
      if (!existingPlayer) {
        throw new Error('Game has already started. Use the same name to reconnect.');
      }
      this.socketRoomMap.delete(existingPlayer.id);
      existingPlayer.id = socketId;
      existingPlayer.connected = true;
      if (avatar && !existingPlayer.avatar) existingPlayer.avatar = avatar;
      this.socketRoomMap.set(socketId, { roomCode, seat: existingPlayer.seat });
      if (room.gameState) {
        const gsPlayer = room.gameState.players.find((p) => p.seat === existingPlayer.seat);
        if (gsPlayer) gsPlayer.id = socketId;
      }
      // Someone is back — abort any pending "delete empty room" job.
      this.cancelRoomGrace(roomCode);
      console.log(`[GameManager] ${playerName} reconnected to room ${roomCode} as seat ${existingPlayer.seat}`);
      this._persist(roomCode);
      return { seat: existingPlayer.seat, reconnected: true };
    }

    if (room.players.length >= 3) throw new Error('Room is full.');

    const seat = room.players.length;
    const player = { id: socketId, name: playerName, avatar, seat, connected: true };
    room.players.push(player);
    this.socketRoomMap.set(socketId, { roomCode, seat });
    console.log(`[GameManager] ${playerName} joined room ${roomCode} as seat ${seat}`);
    this._persist(roomCode);
    return { seat };
  }

  leaveRoom(socketId) {
    const mapping = this.socketRoomMap.get(socketId);
    if (!mapping) return null;
    const { roomCode } = mapping;
    const room = this.rooms.get(roomCode);
    if (!room) { this.socketRoomMap.delete(socketId); return null; }
    const playerIdx = room.players.findIndex((p) => p.id === socketId);
    if (playerIdx === -1) { this.socketRoomMap.delete(socketId); return null; }
    const playerName = room.players[playerIdx].name;
    room.players.splice(playerIdx, 1);
    this.socketRoomMap.delete(socketId);
    if (room.players.length === 0) {
      this.rooms.delete(roomCode);
      console.log(`[GameManager] Room ${roomCode} deleted (empty).`);
      // _persist with no room → deletes the live_games row.
    }
    console.log(`[GameManager] ${playerName} left room ${roomCode}`);
    this._persist(roomCode);
    return { roomCode, playerName, room };
  }

  /**
   * Drop the room entirely (e.g. game ended, finished_games row already
   * stored, no reason to keep the live snapshot around).
   */
  destroyRoom(roomCode) {
    this.rooms.delete(roomCode);
    store.deleteLiveGame(roomCode).catch(() => {});
  }

  getRoom(roomCode) { return this.rooms.get(roomCode); }

  getRoomBySocketId(socketId) {
    const mapping = this.socketRoomMap.get(socketId);
    if (!mapping) return undefined;
    return this.rooms.get(mapping.roomCode);
  }

  getMappingBySocketId(socketId) { return this.socketRoomMap.get(socketId); }

  startGame(roomCode) {
    const room = this.rooms.get(roomCode);
    if (!room) throw new Error(`Room ${roomCode} not found.`);
    if (room.players.length !== 3) throw new Error('Need exactly 3 players to start.');
    if (room.status !== 'waiting') throw new Error('Game already started.');
    room.gameState = new GameState(room.players.map((p) => ({ id: p.id, name: p.name, seat: p.seat })));
    room.status = 'playing';
    console.log(`[GameManager] Game started in room ${roomCode}`);
    this._persist(roomCode);
    return room.gameState;
  }

  handleSelectGameType(roomCode, seat, typeCode) {
    const room = this.rooms.get(roomCode);
    if (!room || !room.gameState) return { ok: false, error: 'Game not found.' };
    const result = room.gameState.selectGameType(seat, typeCode);
    if (result.ok) this._persist(roomCode);
    return result;
  }

  handleDiscardCards(roomCode, seat, cards) {
    const room = this.rooms.get(roomCode);
    if (!room || !room.gameState) return { ok: false, error: 'Game not found.' };
    const result = room.gameState.discardCards(seat, cards);
    if (result.ok) this._persist(roomCode);
    return result;
  }

  handlePlayCard(roomCode, seat, card) {
    const room = this.rooms.get(roomCode);
    if (!room || !room.gameState) {
      return {
        ok: false, error: 'Game not found.',
        trickComplete: false, trick: null, winnerSeat: null, roundEnds: false,
        scores: null, cumulativeScores: null, round: 0, isGameOver: false, gameType: null,
      };
    }
    const result = room.gameState.playCard(seat, card);
    if (result.ok) this._persist(roomCode);
    return result;
  }

  handleNextRound(roomCode, socketId) {
    const room = this.rooms.get(roomCode);
    if (!room) throw new Error('Room not found.');
    if (!room.gameState) throw new Error('Game not started.');
    const mapping = this.socketRoomMap.get(socketId);
    if (!mapping || mapping.seat !== 0) throw new Error('Only the room creator can advance the round.');
    const result = room.gameState.startNextRound();
    if (!result.ok) throw new Error(result.error);
    this._persist(roomCode);
    return room.gameState;
  }

  getStateForPlayer(roomCode, seat) {
    const room = this.rooms.get(roomCode);
    if (!room || !room.gameState) return null;
    return room.gameState.getStateForPlayer(seat);
  }

  markDisconnected(socketId) {
    const mapping = this.socketRoomMap.get(socketId);
    if (!mapping) return null;
    const room = this.rooms.get(mapping.roomCode);
    if (!room) return null;
    const player = room.players.find((p) => p.id === socketId);
    if (!player) return null;
    player.connected = false;
    // The socket id is dead; drop its mapping so it can't accidentally be
    // resolved later (and so the map doesn't slowly leak across long
    // sessions). The player's row in `room.players` keeps `seat`/`name`,
    // which is all we need to re-attach a future socket via `joinRoom`'s
    // reconnection branch.
    this.socketRoomMap.delete(socketId);
    console.log(`[GameManager] Player ${player.name} (seat ${player.seat}) disconnected from room ${mapping.roomCode}`);
    this._persist(mapping.roomCode);
    return { roomCode: mapping.roomCode, seat: player.seat, playerName: player.name };
  }

  // ── Grace timers ──────────────────────────────────────────────────────────
  // When every player in a room has disconnected, we used to delete the
  // room immediately. That meant a 1-second wifi blip affecting all 3
  // players (or a server hot-reload) tore the live game down and nobody
  // could rejoin without clicking through the lobby again. These helpers
  // arm/cancel a delayed delete so a quick reconnection just re-attaches
  // to the same in-memory room.

  /**
   * Schedule a delete of `roomCode` after ROOM_GRACE_MS *unless* someone
   * reconnects in the meantime. Idempotent — re-arming resets the clock.
   */
  armRoomGrace(roomCode) {
    this.cancelRoomGrace(roomCode);
    const t = setTimeout(() => {
      this.roomGraceTimers.delete(roomCode);
      const room = this.rooms.get(roomCode);
      if (!room) return; // already gone
      // Only delete if the room is still empty — someone may have reconnected
      // and we'd be racing with `cancelRoomGrace`.
      if (room.players.every((p) => !p.connected)) {
        console.log(`[GameManager] Room ${roomCode} grace expired — deleting in-memory copy.`);
        this.rooms.delete(roomCode);
        // Persisted live_games row stays so a future join can rehydrate it.
      }
    }, ROOM_GRACE_MS);
    // Don't keep the Node event loop alive just for grace timers — if the
    // process is otherwise idle and ready to exit, the timer shouldn't
    // block shutdown.
    if (typeof t.unref === 'function') t.unref();
    this.roomGraceTimers.set(roomCode, t);
  }

  cancelRoomGrace(roomCode) {
    const t = this.roomGraceTimers.get(roomCode);
    if (!t) return;
    clearTimeout(t);
    this.roomGraceTimers.delete(roomCode);
  }

  reconnectPlayer(newSocketId, roomCode, seat) {
    const room = this.rooms.get(roomCode);
    if (!room) return null;
    const player = room.players.find((p) => p.seat === seat);
    if (!player) return null;
    this.socketRoomMap.delete(player.id);
    player.id = newSocketId;
    player.connected = true;
    this.socketRoomMap.set(newSocketId, { roomCode, seat });
    if (room.gameState) {
      const gsPlayer = room.gameState.players.find((p) => p.seat === seat);
      if (gsPlayer) gsPlayer.id = newSocketId;
    }
    console.log(`[GameManager] Player ${player.name} (seat ${seat}) reconnected to room ${roomCode}`);
    this._persist(roomCode);
    return room.gameState ? room.gameState.getStateForPlayer(seat) : null;
  }
}

module.exports = GameManager;
