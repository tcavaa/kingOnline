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
      const { seat, reconnected, status } = gameManager.joinRoom(rc, socketId, playerName.trim(), avatar || null);
      socket.join(rc);

      if (reconnected) {
        // `status` tells the client which screen to land on — a lobby
        // reconnect should stay on WaitingRoom, an in-game reconnect
        // should rehydrate the table.
        socket.emit('room-joined', { roomCode: rc, seat, reconnected: true, status });
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

      socket.emit('room-joined', { roomCode: rc, seat, status });
      const room = gameManager.getRoom(rc);
      io.to(rc).emit('player-joined', {
        players: playersView(room.players),
        roomCode: rc,
      });
    } catch (err) {
      emitError(err.message);
    }
  });

  // ─── public quick-match room ──────────────────────────────────────────────

  // Lobby clients ask for the current public-table snapshot on connect.
  socket.on('public-room-info', () => {
    try {
      socket.emit('public-room', gameManager.publicRoomView());
    } catch (err) { /* no-op */ }
  });

  // Sit at the homepage public table. The sitter stays on the homepage —
  // no waiting-room redirect — until the 3rd seat fills, at which point the
  // game starts automatically for all three and the public slot resets.
  socket.on('sit-public', ({ playerName, avatar, emoji } = {}) => {
    try {
      if (!playerName || typeof playerName !== 'string' || !playerName.trim()) {
        return emitError('playerName is required.');
      }
      const { roomCode, seat } = gameManager.sitPublic(
        socketId, playerName.trim(), avatar || null, _sanitizeEmoji(emoji)
      );
      socket.join(roomCode);
      socket.emit('public-seated', { roomCode, seat });
      io.emit('public-room', gameManager.publicRoomView());

      const room = gameManager.getRoom(roomCode);
      if (room && room.status === 'waiting' && room.players.length === 3) {
        const gameState = gameManager.startGame(roomCode);
        io.to(roomCode).emit('game-started', {
          round: gameState.round,
          leaderSeat: gameState.leaderSeat,
          players: playersView(room.players),
        });
        _emitHandDealt(io, room, gameState, roomCode);
        // Free the homepage seats for the next trio.
        gameManager.clearPublicRoom(roomCode);
        io.emit('public-room', gameManager.publicRoomView());
      }
    } catch (err) {
      emitError(err.message);
    }
  });

  // Stand up from the public table (only valid while it's still waiting).
  socket.on('stand-public', () => {
    try {
      const mapping = gameManager.getMappingBySocketId(socketId);
      if (!mapping) return;
      const { roomCode } = mapping;
      const room = gameManager.getRoom(roomCode);
      if (!room || !room.isPublic || room.status !== 'waiting') return;
      gameManager.leaveRoom(socketId);
      socket.leave(roomCode);
      if (!gameManager.getRoom(roomCode)) gameManager.clearPublicRoom(roomCode);
      socket.emit('public-unseated');
      io.emit('public-room', gameManager.publicRoomView());
    } catch (err) { /* no-op */ }
  });

  // Pick/clear the reaction emoji shown above the seated profile.
  socket.on('set-public-emoji', ({ emoji } = {}) => {
    try {
      const mapping = gameManager.getMappingBySocketId(socketId);
      if (!mapping) return;
      const room = gameManager.getRoom(mapping.roomCode);
      if (!room || !room.isPublic || room.status !== 'waiting') return;
      const player = room.players.find((p) => p.seat === mapping.seat);
      if (!player) return;
      player.emoji = _sanitizeEmoji(emoji);
      io.emit('public-room', gameManager.publicRoomView());
    } catch (err) { /* no-op */ }
  });

  // Refresh recovery: re-attach ONLY (never fresh-sit) using the room code +
  // name the client stashed when it sat down. If the game has started in the
  // meantime this falls through to the standard in-game reconnect flow.
  socket.on('rejoin-public', ({ roomCode, playerName } = {}) => {
    try {
      if (!roomCode || !playerName || typeof playerName !== 'string') {
        return socket.emit('public-rejoin-failed');
      }
      const rc = String(roomCode).toUpperCase();
      const room = gameManager.getRoom(rc);
      const name = playerName.trim();
      if (!room || !room.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
        return socket.emit('public-rejoin-failed');
      }
      const { seat, status } = gameManager.joinRoom(rc, socketId, name, null);
      socket.join(rc);
      if (status === 'waiting') {
        socket.emit('public-seated', { roomCode: rc, seat });
        io.emit('public-room', gameManager.publicRoomView());
      } else {
        socket.emit('room-joined', { roomCode: rc, seat, reconnected: true, status });
        const state = gameManager.getStateForPlayer(rc, seat);
        if (state) {
          socket.emit('game-state', { ...state, players: playersView(room.players) });
        }
        io.to(rc).emit('player-reconnected', { playerName: name, players: playersView(room.players) });
      }
    } catch (err) {
      socket.emit('public-rejoin-failed');
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

      // Round complete — a pending quit/surrender vote is moot now; drop it
      // so voters' dialogs don't linger into the next round.
      _clearQuitProposal(room);
      const lastDetail = gs.roundDetails[gs.roundDetails.length - 1];
      io.to(roomCode).emit('round-complete', {
        winnerSeat: result.winnerSeat,
        trick: result.trick,
        roundEnds: true,
        scores: result.scores,
        cumulativeScores: result.cumulativeScores,
        round: result.round,
        gameType: result.gameType,
        isGameOver: result.isGameOver,
        cardCounts,
        roundDetail: lastDetail,
      });
      if (result.isGameOver) {
        _finishGame(io, room, roomCode, gameManager);
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
      _clearQuitProposal(room);
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
        'giv', 'janmrteloba',
        'sheilage', 'shemetxara', 'tsava',
        // Georgian reaction clips
        'Dedofali', 'Male!', 'Revia', 'Tazik',
        // latest Georgian reaction clips
        '10-10', 'achexet', 'bedi', 'cxado',
        // one-off addition
        'ketika',
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

  // ─── propose-quit ─────────────────────────────────────────────────────────
  // A player asks to end the current round early (`kind: 'round'`) or to
  // surrender the whole game (`kind: 'game'`). Both other players must accept
  // via `vote-quit` before anything happens; a single decline (or the 30s
  // expiry) kills the proposal and play continues untouched.
  socket.on('propose-quit', ({ kind } = {}) => {
    try {
      if (kind !== 'round' && kind !== 'game') return emitError('Invalid proposal.');
      const mapping = gameManager.getMappingBySocketId(socketId);
      if (!mapping) return emitError('You are not in a room.');
      const { roomCode, seat } = mapping;
      const room = gameManager.getRoom(roomCode);
      if (!room || !room.gameState) return emitError('Game not found.');
      if (room.status !== 'playing') return emitError('Game is not in progress.');
      const gs = room.gameState;
      if (kind === 'round' && !(gs.chosenGameType && (gs.phase === 'discard' || gs.phase === 'playing'))) {
        return emitError('The round cannot be quit right now.');
      }
      if (room.quitProposal) return emitError('Another proposal is already waiting on votes.');

      const player = room.players.find((p) => p.seat === seat);
      const proposal = {
        kind,
        proposerSeat: seat,
        accepted: new Set([seat]),
        timer: setTimeout(() => {
          if (room.quitProposal !== proposal) return;
          room.quitProposal = null;
          io.to(roomCode).emit('quit-rejected', { kind, proposerSeat: seat, reason: 'timeout' });
        }, QUIT_VOTE_MS),
      };
      if (typeof proposal.timer.unref === 'function') proposal.timer.unref();
      room.quitProposal = proposal;

      io.to(roomCode).emit('quit-proposal', {
        kind,
        proposerSeat: seat,
        proposerName: player ? player.name : `Player ${seat}`,
        acceptedSeats: [seat],
      });
    } catch (err) {
      emitError(err.message);
    }
  });

  // ─── vote-quit ────────────────────────────────────────────────────────────
  socket.on('vote-quit', ({ accept } = {}) => {
    try {
      const mapping = gameManager.getMappingBySocketId(socketId);
      if (!mapping) return emitError('You are not in a room.');
      const { roomCode, seat } = mapping;
      const room = gameManager.getRoom(roomCode);
      if (!room || !room.gameState) return emitError('Game not found.');
      const proposal = room.quitProposal;
      if (!proposal) return emitError('No proposal is waiting on votes.');
      if (seat === proposal.proposerSeat) return emitError('You proposed this — the other players must vote.');
      const { kind, proposerSeat } = proposal;
      const proposerName =
        room.players.find((p) => p.seat === proposerSeat)?.name || `Player ${proposerSeat}`;

      if (!accept) {
        _clearQuitProposal(room);
        io.to(roomCode).emit('quit-rejected', { kind, proposerSeat, voterSeat: seat, reason: 'declined' });
        return;
      }

      proposal.accepted.add(seat);
      if (proposal.accepted.size < 3) {
        // One yes in, one to go — rebroadcast so everyone's UI updates.
        io.to(roomCode).emit('quit-proposal', {
          kind,
          proposerSeat,
          proposerName,
          acceptedSeats: [...proposal.accepted].sort((a, b) => a - b),
        });
        return;
      }

      // Unanimous — execute.
      _clearQuitProposal(room);
      const gs = room.gameState;

      if (kind === 'game') {
        _finishGame(io, room, roomCode, gameManager, { surrenderedBySeat: proposerSeat });
        return;
      }

      const result = gameManager.handleQuitRound(roomCode, proposerSeat);
      if (!result.ok) {
        // The round moved on while votes were coming in (e.g. it ended
        // naturally) — tell everyone the proposal fizzled.
        io.to(roomCode).emit('quit-rejected', { kind, proposerSeat, reason: 'timeout' });
        return;
      }
      const cardCounts = {};
      for (let s = 0; s < 3; s++) cardCounts[s] = gs.hands[s].length;
      const lastDetail = gs.roundDetails[gs.roundDetails.length - 1];
      io.to(roomCode).emit('round-complete', {
        winnerSeat: null,
        trick: null,
        roundEnds: true,
        scores: result.scores,
        cumulativeScores: result.cumulativeScores,
        round: result.round,
        gameType: result.gameType,
        isGameOver: result.isGameOver,
        cardCounts,
        roundDetail: lastDetail,
        quitBySeat: proposerSeat,
      });
      if (result.isGameOver) {
        _finishGame(io, room, roomCode, gameManager);
      }
    } catch (err) {
      emitError(err.message);
    }
  });

  // ─── chat-typing ──────────────────────────────────────────────────────────
  // Lightweight presence ping: relayed to everyone else in the room so their
  // chat drawer / table avatars can show a "typing…" indicator. The client
  // throttles emission and expires the indicator on its own timer, so the
  // server just forwards.
  socket.on('chat-typing', () => {
    try {
      const mapping = gameManager.getMappingBySocketId(socketId);
      if (!mapping) return;
      socket.to(mapping.roomCode).emit('chat-typing', { seat: mapping.seat, at: Date.now() });
    } catch (err) { /* no-op */ }
  });

  // ─── voice-message ────────────────────────────────────────────────────────
  // Ephemeral voice clips: the binary payload is relayed as-is to everyone
  // in the sender's room and never stored — only players connected at that
  // moment hear it (a refresh loses history, same as chat bubbles).
  // Size-capped and lightly rate-limited so the pipe can't be flooded.
  let lastVoiceAt = 0;
  socket.on('voice-message', ({ audio, mime, duration } = {}) => {
    try {
      const mapping = gameManager.getMappingBySocketId(socketId);
      if (!mapping) return;
      if (!audio) return;
      const size = audio.byteLength ?? audio.length ?? 0;
      if (!size || size > MAX_VOICE_BYTES) return;
      const now = Date.now();
      if (now - lastVoiceAt < 800) return; // one clip per ~second per socket
      lastVoiceAt = now;
      const room = gameManager.getRoom(mapping.roomCode);
      if (!room) return;
      const player = room.players.find((p) => p.seat === mapping.seat);
      if (!player) return;
      io.to(mapping.roomCode).emit('voice-message', {
        seat: player.seat,
        name: player.name,
        avatar: player.avatar || null,
        audio,
        mime: typeof mime === 'string' ? mime.slice(0, 64) : 'audio/webm',
        duration: Math.min(Math.max(Number(duration) || 0, 0), 30),
        at: now,
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

  // ─── rematch ──────────────────────────────────────────────────────────────
  //
  // Triggered by the "Play Again" button on the game-over screen. The first
  // click creates a fresh room with the clicker as seat 0; every subsequent
  // click from the same finished room is forwarded into that same new room
  // via joinRoom(). All sockets still in the OLD room get a `rematch-status`
  // broadcast so non-joiners can render a "wants to play again" badge above
  // each joined seat's avatar — and so non-clickers see the new room code
  // and can hit Play Again themselves.
  socket.on('request-rematch', ({ playerName, avatar } = {}) => {
    try {
      const oldMapping = gameManager.getMappingBySocketId(socketId);
      if (!oldMapping) return emitError('You are not in a room.');
      const oldRoomCode = oldMapping.roomCode;
      const oldSeat     = oldMapping.seat;
      const oldRoom     = gameManager.getRoom(oldRoomCode);
      if (!oldRoom) return emitError('Room not found.');
      // Fall back to whatever name/avatar the player had on file — saves
      // the client from having to re-pass it through every rematch click.
      const fallbackPlayer = oldRoom.players.find((p) => p.seat === oldSeat);
      const useName   = (typeof playerName === 'string' && playerName.trim()) || fallbackPlayer?.name;
      const useAvatar = avatar || fallbackPlayer?.avatar || null;
      if (!useName) return emitError('Player name unavailable.');

      const result = gameManager.requestRematch(socketId, useName.trim(), useAvatar);
      if (result.error) return emitError(result.error);

      const { newRoomCode, seat, joinedOldSeats } = result;
      // Pull the requester out of the old socket.io room so they don't
      // keep receiving its broadcasts while sitting in the new lobby.
      socket.leave(oldRoomCode);
      socket.join(newRoomCode);

      // Tell the requester their new seat — same shape as `room-joined`
      // so the client uses the existing handler to transition into the
      // waiting room UI without a new code path.
      socket.emit('room-joined', { roomCode: newRoomCode, seat, status: 'waiting' });

      // Send the new lobby's player list to the requester so the waiting
      // room is populated immediately (otherwise the first joiner sits
      // there alone with no UI cue until the next player joins).
      const newRoom = gameManager.getRoom(newRoomCode);
      if (newRoom) {
        io.to(newRoomCode).emit('player-joined', {
          players: playersView(newRoom.players),
          roomCode: newRoomCode,
        });
      }

      // Fan-out to every socket still in the old (finished) room so
      // their game-over UI can render the "wants to play again" badges
      // and surface the rematch room code.
      io.to(oldRoomCode).emit('rematch-status', {
        newRoomCode,
        joinedOldSeats,
      });
    } catch (err) {
      emitError(err.message);
    }
  });

  // ─── request-state ────────────────────────────────────────────────────────
  socket.on('request-state', () => {
    try {
      const mapping = gameManager.getMappingBySocketId(socketId);
      if (!mapping) return emitError('You are not in a room.');
      const { roomCode, seat } = mapping;
      const state = gameManager.getStateForPlayer(roomCode, seat);
      if (!state) return emitError('No game state available.');
      // Include the room roster (with avatars) — GameState.players carries only
      // id/name/seat, so emitting raw `state` would blank every avatar on the
      // client each time the desync watchdog resyncs. Mirror the reconnect path.
      const room = gameManager.getRoom(roomCode);
      socket.emit('game-state', {
        ...state,
        players: room ? playersView(room.players) : state.players,
      });
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
      const { roomCode, playerName, seat } = info;
      const room = gameManager.getRoom(roomCode);
      if (!room) return;

      // Public table still collecting players: hold the seat briefly so a
      // refresh survives, then sweep it so a ghost can't block the table.
      if (room.isPublic && room.status === 'waiting') {
        const t = setTimeout(() => {
          const r = gameManager.getRoom(roomCode);
          if (!r || r.status !== 'waiting') return;
          const player = r.players.find((p) => p.seat === seat);
          if (!player || player.connected) return; // they came back
          r.players = r.players.filter((p) => p !== player);
          if (r.players.length === 0) {
            gameManager.destroyRoom(roomCode);
            gameManager.clearPublicRoom(roomCode);
          }
          io.emit('public-room', gameManager.publicRoomView());
        }, PUBLIC_SEAT_GRACE_MS);
        if (typeof t.unref === 'function') t.unref();
        return;
      }
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

// How long a quit/surrender proposal waits for votes before auto-expiring.
const QUIT_VOTE_MS = 30 * 1000;

// Hard cap on a relayed voice clip (≈15s of Opus fits well under this).
const MAX_VOICE_BYTES = 400 * 1024;

// How long a disconnected player keeps their public-table seat before it's
// swept and offered to the next sitter (long enough to survive a refresh).
const PUBLIC_SEAT_GRACE_MS = 30 * 1000;

// Reaction emojis are client-chosen; the server just caps them to something
// emoji-sized so nothing longer sneaks into the broadcast.
function _sanitizeEmoji(emoji) {
  if (typeof emoji !== 'string') return null;
  const trimmed = emoji.trim();
  if (!trimmed || trimmed.length > 8) return null;
  return trimmed;
}

function _clearQuitProposal(room) {
  if (!room || !room.quitProposal) return;
  if (room.quitProposal.timer) clearTimeout(room.quitProposal.timer);
  room.quitProposal = null;
}

/**
 * Shared game-over path: rank the cumulative scores, broadcast `game-over`,
 * flip the room to finished, and arm the grace timer so the room survives
 * long enough for "Play Again" clicks. `extra` is merged into the payload
 * (e.g. `surrenderedBySeat` when the game ended via a surrender vote).
 * The room is intentionally NOT destroyed here — see the rematch flow.
 */
function _finishGame(io, room, roomCode, gameManager, extra = {}) {
  const gs = room.gameState;
  const finalScores = { ...gs.cumulativeScores };
  let bestScore = null;
  let winnerSeat = null;
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
    ...extra,
  });
  gs.phase = 'game_over';
  room.status = 'finished';
  gameManager.armRoomGrace(roomCode);
  gameManager._persist(roomCode);
}

function _emitHandDealt(io, room, gameState, roomCode) {
  const cardCounts = {};
  for (let s = 0; s < 3; s++) cardCounts[s] = gameState.hands[s].length;
  for (const player of room.players) {
    const isLeader = player.seat === gameState.leaderSeat;
    io.to(player.id).emit('hand-dealt', {
      // Every round (including the 1st): players see their own hand right
      // away, and non-leaders see the 2 prikup cards while the leader is
      // choosing. Only the leader is kept blind to the prikup until it's
      // merged into their hand.
      hand: gameState.hands[player.seat],
      centerCards: isLeader ? [] : gameState.centerCards,
      leaderSeat: gameState.leaderSeat,
      round: gameState.round,
      cardCounts,
    });
  }
}

module.exports = registerHandlers;
