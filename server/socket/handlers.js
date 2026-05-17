'use strict';

const playerView = (p) => ({ id: p.id, name: p.name, avatar: p.avatar || null, seat: p.seat });
const playersView = (players = []) => players.map(playerView);

function registerHandlers(io, socket, gameManager) {
  const socketId = socket.id;

  function emitError(message) { socket.emit('error', { message }); }

  // ─── create-room ─────────────────────────────────────────────────────────
  socket.on('create-room', ({ playerName, avatar } = {}) => {
    try {
      if (!playerName || typeof playerName !== 'string' || !playerName.trim()) {
        return emitError('playerName is required.');
      }
      const { roomCode, seat } = gameManager.createRoom(socketId, playerName.trim(), avatar || null);
      socket.join(roomCode);
      socket.emit('room-created', { roomCode, seat });
      const room = gameManager.getRoom(roomCode);
      io.to(roomCode).emit('player-joined', {
        players: playersView(room.players),
        roomCode,
      });
    } catch (err) {
      emitError(err.message);
    }
  });

  // ─── join-room ────────────────────────────────────────────────────────────
  socket.on('join-room', async ({ roomCode, playerName, avatar } = {}) => {
    try {
      if (!roomCode || typeof roomCode !== 'string') return emitError('roomCode is required.');
      if (!playerName || typeof playerName !== 'string' || !playerName.trim()) return emitError('playerName is required.');

      const rc = roomCode.toUpperCase();
      // If the room isn't currently in memory (e.g. server restarted while the
      // game was live), look it up in MySQL and rehydrate before joining.
      // This is the rejoin recovery path.
      if (!gameManager.getRoom(rc)) {
        await gameManager.tryLoadFromDB(rc);
      }
      const { seat, reconnected } = gameManager.joinRoom(rc, socketId, playerName.trim(), avatar || null);
      socket.join(rc);

      if (reconnected) {
        socket.emit('room-joined', { roomCode: rc, seat, reconnected: true });
        const room = gameManager.getRoom(rc);
        const state = gameManager.getStateForPlayer(rc, seat);
        if (state) {
          socket.emit('game-state', {
            ...state,
            players: playersView(room.players),
          });
        }
        io.to(rc).emit('player-reconnected', {
          playerName: playerName.trim(),
          players: playersView(room.players),
        });
        return;
      }

      socket.emit('room-joined', { roomCode: rc, seat });
      const room = gameManager.getRoom(rc);
      io.to(rc).emit('player-joined', {
        players: playersView(room.players),
        roomCode: rc,
      });
    } catch (err) {
      emitError(err.message);
    }
  });

  // ─── start-game ──────────────────────────────────────────────────────────
  socket.on('start-game', () => {
    try {
      const mapping = gameManager.getMappingBySocketId(socketId);
      if (!mapping) return emitError('You are not in a room.');
      const { roomCode } = mapping;
      const room = gameManager.getRoom(roomCode);
      if (!room) return emitError('Room not found.');
      if (mapping.seat !== 0) return emitError('Only the room creator can start the game.');
      const gameState = gameManager.startGame(roomCode);
      io.to(roomCode).emit('game-started', {
        round: gameState.round,
        leaderSeat: gameState.leaderSeat,
        players: playersView(room.players),
      });
      _emitHandDealt(io, room, gameState, roomCode);
    } catch (err) {
      emitError(err.message);
    }
  });

  // ─── select-game-type ─────────────────────────────────────────────────────
  socket.on('select-game-type', ({ typeCode } = {}) => {
    try {
      const mapping = gameManager.getMappingBySocketId(socketId);
      if (!mapping) return emitError('You are not in a room.');
      const { roomCode, seat } = mapping;
      const room = gameManager.getRoom(roomCode);
      if (!room || !room.gameState) return emitError('Game not found.');
      if (seat !== room.gameState.leaderSeat) return emitError('Only the leader can select the game type.');
      if (!typeCode) return emitError('typeCode is required.');
      const result = gameManager.handleSelectGameType(roomCode, seat, typeCode);
      if (!result.ok) return emitError(result.error);
      const gs = room.gameState;
      io.to(roomCode).emit('game-type-selected', {
        typeCode,
        leaderSeat: gs.leaderSeat,
        phase: gs.phase,
        usedTypes: { ...gs.usedTypes },
      });
      // Send updated hand to leader. For non-trump types the 2 center cards
      // have already been merged in; for Pluses (trump_selection phase) the
      // merge is deferred until selectTrump(), so the hand here is still 10.
      socket.emit('hand-updated', {
        hand: gs.hands[seat],
        lastCenterCards: gs.lastCenterCards,
      });

      // Round 1: non-leaders had their hands AND the 2 center cards hidden
      // during type_selection. Now reveal everything.
      if (gs.round === 1) {
        const cardCounts = {};
        for (let s = 0; s < 3; s++) cardCounts[s] = gs.hands[s].length;
        for (const player of room.players) {
          if (player.seat !== gs.leaderSeat) {
            io.to(player.id).emit('hand-revealed', {
              hand: gs.hands[player.seat],
              cardCounts,
              centerCards: gs.lastCenterCards || [],
            });
          }
        }
      }
    } catch (err) {
      emitError(err.message);
    }
  });

  // ─── select-trump (for Pluses only) ───────────────────────────────────────
  socket.on('select-trump', ({ suit } = {}) => {
    try {
      const mapping = gameManager.getMappingBySocketId(socketId);
      if (!mapping) return emitError('You are not in a room.');
      const { roomCode, seat } = mapping;
      const room = gameManager.getRoom(roomCode);
      if (!room || !room.gameState) return emitError('Game not found.');
      const result = room.gameState.selectTrump(seat, suit);
      if (!result.ok) return emitError(result.error);
      const gs = room.gameState;
      io.to(roomCode).emit('trump-selected', {
        trumpSuit: gs.trumpSuit,
        phase: gs.phase,
        leaderSeat: gs.leaderSeat,
      });
      // The 2 center cards have just been merged into the leader's hand —
      // send the updated hand + which cards came from center for highlighting.
      socket.emit('hand-updated', {
        hand: gs.hands[seat],
        lastCenterCards: gs.lastCenterCards,
      });
    } catch (err) {
      emitError(err.message);
    }
  });

  // ─── discard-cards ────────────────────────────────────────────────────────
  socket.on('discard-cards', ({ cards } = {}) => {
    try {
      const mapping = gameManager.getMappingBySocketId(socketId);
      if (!mapping) return emitError('You are not in a room.');
      const { roomCode, seat } = mapping;
      const room = gameManager.getRoom(roomCode);
      if (!room || !room.gameState) return emitError('Game not found.');
      if (!Array.isArray(cards) || cards.length !== 2) return emitError('Must provide exactly 2 cards to discard.');
      const result = gameManager.handleDiscardCards(roomCode, seat, cards);
      if (!result.ok) return emitError(result.error);
      const gs = room.gameState;
      socket.emit('hand-updated', { hand: gs.hands[seat] });
      io.to(roomCode).emit('cards-discarded', {
        phase: gs.phase,
        currentTurn: gs.currentTurn,
        leaderSeat: gs.leaderSeat,
      });
    } catch (err) {
      emitError(err.message);
    }
  });

  // ─── play-card ────────────────────────────────────────────────────────────
  socket.on('play-card', ({ card } = {}) => {
    try {
      const mapping = gameManager.getMappingBySocketId(socketId);
      if (!mapping) return emitError('You are not in a room.');
      const { roomCode, seat } = mapping;
      const room = gameManager.getRoom(roomCode);
      if (!room || !room.gameState) return emitError('Game not found.');
      if (!card || !card.rank || !card.suit) return emitError('Invalid card object.');
      const result = gameManager.handlePlayCard(roomCode, seat, card);
      if (!result.ok) return emitError(result.error);
      const gs = room.gameState;

      if (!result.trickComplete) {
        const cardCounts = {};
        for (let s = 0; s < 3; s++) cardCounts[s] = gs.hands[s].length;
        io.to(roomCode).emit('card-played', {
          seat, card,
          currentTrick: gs.currentTrick,
          currentTurn: gs.currentTurn,
          ledSuit: gs.ledSuit,
          cardCounts,
        });
        return;
      }

      const cardCounts = {};
      for (let s = 0; s < 3; s++) cardCounts[s] = gs.hands[s].length;

      if (!result.roundEnds) {
        io.to(roomCode).emit('trick-complete', {
          winnerSeat: result.winnerSeat,
          trick: result.trick,
          roundEnds: false,
          trickNumber: gs.trickNumber,
          nextTurn: gs.currentTurn,
          tricksTaken: { ...gs.tricksTaken },
          cardCounts,
        });
        return;
      }

      // Round complete
      const lastDetail = gs.roundDetails[gs.roundDetails.length - 1];
      if (result.isGameOver) {
        io.to(roomCode).emit('round-complete', {
          winnerSeat: result.winnerSeat,
          trick: result.trick,
          roundEnds: true,
          scores: result.scores,
          cumulativeScores: result.cumulativeScores,
          round: result.round,
          gameType: result.gameType,
          isGameOver: true,
          cardCounts,
          roundDetail: lastDetail,
        });
        let bestScore = null;
        let winnerSeat = null;
        const finalScores = result.cumulativeScores;
        for (let s = 0; s < 3; s++) {
          if (bestScore === null || finalScores[s] > bestScore) {
            bestScore = finalScores[s];
            winnerSeat = s;
          }
        }
        const winnerPlayer = room.players.find((p) => p.seat === winnerSeat);
        io.to(roomCode).emit('game-over', {
          finalScores,
          winner: { seat: winnerSeat, name: winnerPlayer ? winnerPlayer.name : 'Unknown', score: bestScore },
          players: playersView(room.players),
          roundDetails: gs.roundDetails,
        });
        gs.phase = 'game_over';
        room.status = 'finished';
        // The game is done — drop the live snapshot. The history is already
        // captured client-side via POST /api/games into finished_games, so
        // there's nothing to recover from here.
        gameManager.destroyRoom(roomCode);
      } else {
        io.to(roomCode).emit('round-complete', {
          winnerSeat: result.winnerSeat,
          trick: result.trick,
          roundEnds: true,
          scores: result.scores,
          cumulativeScores: result.cumulativeScores,
          round: result.round,
          gameType: result.gameType,
          isGameOver: false,
          cardCounts,
          roundDetail: lastDetail,
        });
      }
    } catch (err) {
      emitError(err.message);
    }
  });

  // ─── next-round ───────────────────────────────────────────────────────────
  socket.on('next-round', () => {
    try {
      const mapping = gameManager.getMappingBySocketId(socketId);
      if (!mapping) return emitError('You are not in a room.');
      const { roomCode } = mapping;
      const room = gameManager.getRoom(roomCode);
      if (!room) return emitError('Room not found.');
      const gameState = gameManager.handleNextRound(roomCode, socketId);
      io.to(roomCode).emit('round-started', {
        round: gameState.round,
        leaderSeat: gameState.leaderSeat,
        phase: gameState.phase,
        usedTypes: { ...gameState.usedTypes },
      });
      _emitHandDealt(io, room, gameState, roomCode);
    } catch (err) {
      emitError(err.message);
    }
  });

  // ─── play-sound ───────────────────────────────────────────────────────────
  // The player who emits this is "playing a sound at" `targetSeat` (which is
  // typically themselves). All players in the room receive the broadcast and
  // play the audio file matching `soundId`. Server only validates the IDs.
  socket.on('play-sound', ({ soundId, targetSeat } = {}) => {
    try {
      const ALLOWED_SOUNDS = new Set([
        // built-in saloon clips
        'yeehaw', 'gunshot', 'whistle',
        // user-added reaction clips (files in client/public/sounds/<id>.mp3)
        'babi', 'giv', 'janmrteloba', 'ojaxi',
        'sheilage', 'shemetxara', 'tsava',
      ]);
      if (!ALLOWED_SOUNDS.has(soundId)) return;
      const mapping = gameManager.getMappingBySocketId(socketId);
      if (!mapping) return;
      io.to(mapping.roomCode).emit('play-sound', {
        soundId,
        bySeat: mapping.seat,
        targetSeat: typeof targetSeat === 'number' ? targetSeat : mapping.seat,
        at: Date.now(),
      });
    } catch (err) { /* no-op */ }
  });

  // ─── chat-message ─────────────────────────────────────────────────────────
  socket.on('chat-message', ({ message } = {}) => {
    try {
      const mapping = gameManager.getMappingBySocketId(socketId);
      if (!mapping) return;
      if (typeof message !== 'string') return;
      const trimmed = message.trim().slice(0, 240);
      if (!trimmed) return;
      const room = gameManager.getRoom(mapping.roomCode);
      if (!room) return;
      const player = room.players.find((p) => p.seat === mapping.seat);
      if (!player) return;
      io.to(mapping.roomCode).emit('chat-message', {
        seat: player.seat,
        name: player.name,
        avatar: player.avatar || null,
        message: trimmed,
        at: Date.now(),
      });
    } catch (err) { /* no-op */ }
  });

  // ─── request-state ────────────────────────────────────────────────────────
  socket.on('request-state', () => {
    try {
      const mapping = gameManager.getMappingBySocketId(socketId);
      if (!mapping) return emitError('You are not in a room.');
      const { roomCode, seat } = mapping;
      const state = gameManager.getStateForPlayer(roomCode, seat);
      if (!state) return emitError('No game state available.');
      socket.emit('game-state', state);
    } catch (err) {
      emitError(err.message);
    }
  });

  // ─── leave-room ───────────────────────────────────────────────────────────
  socket.on('leave-room', () => {
    try {
      const result = gameManager.leaveRoom(socketId);
      if (!result) return;
      const { roomCode, playerName, room } = result;
      socket.leave(roomCode);
      io.to(roomCode).emit('player-left', {
        playerName,
        players: (room.players || []).map((p) => ({ id: p.id, name: p.name, seat: p.seat })),
      });
    } catch (err) { /* no-op */ }
  });

  socket.on('disconnect', () => {
    try {
      const info = gameManager.markDisconnected(socketId);
      if (!info) return;
      const { roomCode, playerName } = info;
      const room = gameManager.getRoom(roomCode);
      if (!room) return;
      // Everyone offline at once (server hot-reload, brief wifi outage, all
      // three tabs closed): keep the room in memory for a grace window so
      // any of them can reconnect transparently. The grace timer is
      // cancelled the moment the first player reattaches.
      if (room.players.every((p) => !p.connected)) {
        gameManager.armRoomGrace(roomCode);
        return;
      }
      io.to(roomCode).emit('player-disconnected', { playerName });
    } catch (err) { /* no-op */ }
  });
}

function _emitHandDealt(io, room, gameState, roomCode) {
  const cardCounts = {};
  for (let s = 0; s < 3; s++) cardCounts[s] = gameState.hands[s].length;
  for (const player of room.players) {
    const isLeader = player.seat === gameState.leaderSeat;
    // Round 1: non-leaders see no cards (and no center) until leader picks game type
    const round1Hidden = gameState.round === 1 && !isLeader;
    const handToSend = round1Hidden ? [] : gameState.hands[player.seat];
    const centerToSend = isLeader ? [] : (round1Hidden ? [] : gameState.centerCards);
    io.to(player.id).emit('hand-dealt', {
      hand: handToSend,
      centerCards: centerToSend,
      leaderSeat: gameState.leaderSeat,
      round: gameState.round,
      cardCounts,
      hidden: round1Hidden,
    });
  }
}

module.exports = registerHandlers;
