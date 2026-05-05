'use strict';

const { getPool } = require('./connection');

/**
 * Saves a new game record to the database.
 * Stub: logs the call and does not crash if DB is unavailable.
 *
 * @param {{ roomCode: string, players: Array<{name:string,seat:number,id:string}> }} gameData
 * @returns {Promise<number|null>} Inserted game ID, or null on failure.
 */
async function saveGame(gameData) {
  const pool = getPool();
  if (!pool) {
    console.log('[db] saveGame called (DB not configured):', gameData.roomCode);
    return null;
  }

  try {
    const promisePool = pool.promise();

    // Insert game row
    const [gameResult] = await promisePool.execute(
      'INSERT INTO games (room_code, status) VALUES (?, ?)',
      [gameData.roomCode, 'playing']
    );
    const gameId = gameResult.insertId;

    // Insert player rows
    for (const player of gameData.players) {
      await promisePool.execute(
        'INSERT INTO game_players (game_id, seat, player_name, socket_id) VALUES (?, ?, ?, ?)',
        [gameId, player.seat, player.name, player.id]
      );
    }

    console.log(`[db] Game saved: id=${gameId}, room=${gameData.roomCode}`);
    return gameId;
  } catch (err) {
    console.error('[db] saveGame error:', err.message);
    return null;
  }
}

/**
 * Saves the final result of a game (scores, winner, rounds).
 * Stub: logs the call and does not crash if DB is unavailable.
 *
 * @param {{
 *   gameId: number,
 *   roundScores: Array<{round:number, gameType:string, scores:{0:number,1:number,2:number}}>,
 *   cumulativeScores: {0:number,1:number,2:number},
 *   leaderSeat: number,
 * }} resultData
 * @returns {Promise<void>}
 */
async function saveGameResult(resultData) {
  const pool = getPool();
  if (!pool) {
    console.log('[db] saveGameResult called (DB not configured):', resultData.gameId);
    return;
  }

  try {
    const promisePool = pool.promise();

    for (const roundInfo of resultData.roundScores) {
      // Insert round
      await promisePool.execute(
        'INSERT IGNORE INTO game_rounds (game_id, round_number, game_type, leader_seat) VALUES (?, ?, ?, ?)',
        [resultData.gameId, roundInfo.round, roundInfo.gameType, (roundInfo.round - 1) % 3]
      );

      // Insert per-seat scores
      for (let seat = 0; seat < 3; seat++) {
        await promisePool.execute(
          'INSERT IGNORE INTO round_scores (game_id, round_number, seat, round_score, cumulative_score) VALUES (?, ?, ?, ?, ?)',
          [
            resultData.gameId,
            roundInfo.round,
            seat,
            roundInfo.scores[seat] || 0,
            resultData.cumulativeScores[seat] || 0,
          ]
        );
      }
    }

    // Mark game as finished
    await promisePool.execute(
      'UPDATE games SET status = ?, finished_at = NOW() WHERE id = ?',
      ['finished', resultData.gameId]
    );

    console.log(`[db] Game result saved: id=${resultData.gameId}`);
  } catch (err) {
    console.error('[db] saveGameResult error:', err.message);
  }
}

module.exports = { saveGame, saveGameResult };
