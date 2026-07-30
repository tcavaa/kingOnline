'use strict';

// Socket wiring for ჩეხური დურაკა. Every event is namespaced `durak:*` so
// nothing can collide with the King game's events; the module owns its own
// manager and never touches King state.

// Hard cap on a relayed voice clip (≈15s of Opus fits well under this).
const MAX_VOICE_BYTES = 400 * 1024;

function registerDurakHandlers(io, socket, durak) {
  const socketId = socket.id;
  let lastVoiceAt = 0;

  const fail = (message) => socket.emit('durak:error', { message });

  // Public-table snapshot for every connected client (durak lobby shows it).
  const emitPublic = () => io.emit('durak:public-room', durak.publicRoomView());

  // Send the personalised game state to every seated (connected) player,
  // plus the room roster. Called after anything changes.
  function broadcast(room) {
    if (!room) return;
    const view = durak.roomView(room);
    const events = room.game ? room.game.drainEvents() : [];
    for (const player of room.players) {
      if (!player.id || !player.connected) continue;
      io.to(player.id).emit('durak:state', {
        room: view,
        game: room.game ? room.game.stateFor(player.seat) : null,
        events,
      });
    }
    // Keep room.status in sync with the match phase for join gating.
    if (room.game && room.game.phase === 'match_end') room.status = 'match_end';
  }

  socket.on('durak:create', ({ playerName, avatar, targetScore } = {}) => {
    try {
      if (!playerName || typeof playerName !== 'string' || !playerName.trim()) {
        return fail('playerName is required.');
      }
      const { room, seat } = durak.createRoom(
        socketId, playerName.trim(), avatar || null, targetScore
      );
      socket.emit('durak:joined', { roomCode: room.code, seat });
      broadcast(room);
    } catch (err) { fail(err.message); }
  });

  socket.on('durak:join', ({ roomCode, playerName, avatar } = {}) => {
    try {
      if (!roomCode || typeof roomCode !== 'string') return fail('roomCode is required.');
      if (!playerName || typeof playerName !== 'string' || !playerName.trim()) {
        return fail('playerName is required.');
      }
      const result = durak.joinRoom(
        roomCode.trim().toUpperCase(), socketId, playerName.trim(), avatar || null
      );
      if (result.error) return fail(result.error);
      socket.emit('durak:joined', {
        roomCode: result.room.code, seat: result.seat, reconnected: !!result.reconnected,
      });
      broadcast(result.room);
    } catch (err) { fail(err.message); }
  });

  socket.on('durak:start', () => {
    try {
      const mapping = durak.getMapping(socketId);
      if (!mapping) return fail('შენ ოთახში არ ხარ.');
      const result = durak.startMatch(mapping.roomCode, socketId);
      if (result.error) return fail(result.error);
      broadcast(result.room);
      emitPublic(); // a started public table frees the lobby slot
    } catch (err) { fail(err.message); }
  });

  // ── public quick-match table ──────────────────────────────────────────────
  socket.on('durak:public-info', () => {
    try { socket.emit('durak:public-room', durak.publicRoomView()); }
    catch (err) { /* no-op */ }
  });

  socket.on('durak:sit-public', ({ playerName, avatar } = {}) => {
    try {
      if (!playerName || typeof playerName !== 'string' || !playerName.trim()) {
        return fail('playerName is required.');
      }
      const result = durak.sitPublic(socketId, playerName.trim(), avatar || null);
      if (result.error) return fail(result.error);
      socket.emit('durak:joined', {
        roomCode: result.room.code, seat: result.seat, reconnected: !!result.reconnected,
      });
      broadcast(result.room);
      emitPublic();
    } catch (err) { fail(err.message); }
  });

  // First sitter (room creator) adjusts the losing score while waiting.
  socket.on('durak:set-target', ({ targetScore } = {}) => {
    try {
      const result = durak.setTargetScore(socketId, targetScore);
      if (result.error) return fail(result.error);
      broadcast(result.room);
      if (result.room.isPublic) emitPublic();
    } catch (err) { fail(err.message); }
  });

  function withGame(fn) {
    const mapping = durak.getMapping(socketId);
    if (!mapping) return fail('შენ ოთახში არ ხარ.');
    const room = durak.getRoom(mapping.roomCode);
    if (!room || !room.game) return fail('თამაში ვერ მოიძებნა.');
    const result = fn(room.game, mapping.seat, room);
    if (result && result.error) return fail(result.error);
    if (result && result.ok === false) return fail(result.error || 'დაუშვებელი სვლა.');
    broadcast(room);
  }

  socket.on('durak:play', ({ card, requestSuit } = {}) => {
    try {
      if (!card || !card.rank || !card.suit) return fail('Invalid card.');
      withGame((game, seat) => game.playCard(seat, card, requestSuit || null));
    } catch (err) { fail(err.message); }
  });

  socket.on('durak:draw', () => {
    try { withGame((game, seat) => game.drawCard(seat)); }
    catch (err) { fail(err.message); }
  });

  socket.on('durak:penalty', () => {
    try { withGame((game, seat) => game.takePenalty(seat)); }
    catch (err) { fail(err.message); }
  });

  socket.on('durak:pass', () => {
    try { withGame((game, seat) => game.pass(seat)); }
    catch (err) { fail(err.message); }
  });

  socket.on('durak:karta', () => {
    try { withGame((game, seat) => game.sayKarta(seat)); }
    catch (err) { fail(err.message); }
  });

  socket.on('durak:choose-suit', ({ suit } = {}) => {
    try { withGame((game, seat) => game.chooseSuit(seat, suit)); }
    catch (err) { fail(err.message); }
  });

  socket.on('durak:next-hand', () => {
    try {
      const mapping = durak.getMapping(socketId);
      if (!mapping) return fail('შენ ოთახში არ ხარ.');
      const result = durak.nextHand(mapping.roomCode, socketId);
      if (result.error) return fail(result.error);
      broadcast(result.room);
    } catch (err) { fail(err.message); }
  });

  socket.on('durak:rematch', () => {
    try {
      const mapping = durak.getMapping(socketId);
      if (!mapping) return fail('შენ ოთახში არ ხარ.');
      const result = durak.rematch(mapping.roomCode, socketId);
      if (result.error) return fail(result.error);
      broadcast(result.room);
    } catch (err) { fail(err.message); }
  });

  socket.on('durak:state', () => {
    try {
      const mapping = durak.getMapping(socketId);
      if (!mapping) return;
      broadcast(durak.getRoom(mapping.roomCode));
    } catch (err) { /* no-op */ }
  });

  // Room chat — relayed to everyone seated (spectators included), never stored.
  socket.on('durak:chat', ({ message } = {}) => {
    try {
      const mapping = durak.getMapping(socketId);
      if (!mapping) return;
      if (typeof message !== 'string') return;
      const trimmed = message.trim().slice(0, 240);
      if (!trimmed) return;
      const room = durak.getRoom(mapping.roomCode);
      if (!room) return;
      const player = room.players.find((p) => p.seat === mapping.seat);
      if (!player) return;
      const payload = {
        seat: player.seat, name: player.name, avatar: player.avatar || null,
        message: trimmed, at: Date.now(),
      };
      for (const p of room.players) {
        if (p.id && p.connected) io.to(p.id).emit('durak:chat', payload);
      }
    } catch (err) { /* no-op */ }
  });

  // Ephemeral voice clips — relayed as-is, never stored (same rules as the
  // King table: size-capped + lightly rate-limited).
  socket.on('durak:voice', ({ audio, mime, duration } = {}) => {
    try {
      const mapping = durak.getMapping(socketId);
      if (!mapping) return;
      if (!audio) return;
      const size = audio.byteLength ?? audio.length ?? 0;
      if (!size || size > MAX_VOICE_BYTES) return;
      const now = Date.now();
      if (now - lastVoiceAt < 800) return;
      lastVoiceAt = now;
      const room = durak.getRoom(mapping.roomCode);
      if (!room) return;
      const player = room.players.find((p) => p.seat === mapping.seat);
      if (!player) return;
      const payload = {
        seat: player.seat, name: player.name, avatar: player.avatar || null,
        audio,
        mime: typeof mime === 'string' ? mime.slice(0, 64) : 'audio/webm',
        duration: Math.min(Math.max(Number(duration) || 0, 0), 30),
        at: now,
      };
      for (const p of room.players) {
        if (p.id && p.connected) io.to(p.id).emit('durak:voice', payload);
      }
    } catch (err) { /* no-op */ }
  });

  // "Typing…" presence ping, forwarded to everyone else in the room.
  socket.on('durak:typing', () => {
    try {
      const mapping = durak.getMapping(socketId);
      if (!mapping) return;
      const room = durak.getRoom(mapping.roomCode);
      if (!room) return;
      for (const p of room.players) {
        if (p.id && p.connected && p.id !== socketId) {
          io.to(p.id).emit('durak:typing', { seat: mapping.seat, at: Date.now() });
        }
      }
    } catch (err) { /* no-op */ }
  });

  // Creator aborts the match — everyone lands back in the waiting room.
  socket.on('durak:end-match', () => {
    try {
      const mapping = durak.getMapping(socketId);
      if (!mapping) return fail('შენ ოთახში არ ხარ.');
      const result = durak.endMatch(mapping.roomCode, socketId);
      if (result.error) return fail(result.error);
      for (const p of result.room.players) {
        if (p.id && p.connected) {
          io.to(p.id).emit('durak:toast', { message: 'თამადამ დაასრულა თამაში.' });
        }
      }
      broadcast(result.room);
    } catch (err) { fail(err.message); }
  });

  socket.on('durak:leave', () => {
    try {
      const result = durak.leaveRoom(socketId);
      socket.emit('durak:left');
      if (result && result.room) broadcast(result.room);
      emitPublic();
    } catch (err) { /* no-op */ }
  });

  socket.on('disconnect', () => {
    try {
      const result = durak.markDisconnected(socketId);
      if (result && result.room) {
        broadcast(result.room);
        if (result.room.isPublic) emitPublic();
      }
    } catch (err) { /* no-op */ }
  });
}

module.exports = registerDurakHandlers;
