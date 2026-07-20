-- King Card Game Database Schema
-- Run this once to initialize the database, e.g.:
--   mysql -u root -p < db/schema.sql

CREATE DATABASE IF NOT EXISTS king_card_game
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE king_card_game;

-- ─── profiles ────────────────────────────────────────────────────────────────
-- One row per saved player profile (created from the lobby).
CREATE TABLE IF NOT EXISTS profiles (
  id            VARCHAR(64)   NOT NULL PRIMARY KEY,
  name          VARCHAR(64)   NOT NULL,
  avatar        MEDIUMTEXT    NULL,           -- base64 data URL of a thumbnail
  device_key    VARCHAR(128)  NULL,           -- ownership token (the browser that created it)
  pin_hash      VARCHAR(128)  NULL,           -- sha256(pin + id) — never returned to clients
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_profiles_name (name)
) ENGINE=InnoDB;

-- One-shot migration for existing deployments. We can't use
-- `ADD COLUMN IF NOT EXISTS` (only supported on MariaDB 10.0.2+ / MySQL 8.0.29+),
-- so we wrap it in a stored procedure that checks information_schema first.
-- That way re-running `schema.sql` against any database — fresh or already-
-- migrated — is a no-op instead of a 1060 "duplicate column" error.
DROP PROCEDURE IF EXISTS _king_add_pin_hash;
DELIMITER //
CREATE PROCEDURE _king_add_pin_hash()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 'profiles'
       AND COLUMN_NAME  = 'pin_hash'
  ) THEN
    ALTER TABLE profiles
      ADD COLUMN pin_hash VARCHAR(128) NULL AFTER device_key;
  END IF;
END //
DELIMITER ;
CALL _king_add_pin_hash();
DROP PROCEDURE _king_add_pin_hash;

-- ─── finished_games ──────────────────────────────────────────────────────────
-- One row per finished game. The full per-round detail is kept as JSON so the
-- leaderboard view can render the tally trail and round breakdown without
-- joining a half-dozen tables.
CREATE TABLE IF NOT EXISTS finished_games (
  id             VARCHAR(64)   NOT NULL PRIMARY KEY,
  played_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  winner_name    VARCHAR(64)   NOT NULL,
  winner_seat    TINYINT       NOT NULL,
  winner_score   INT           NOT NULL,
  payload        MEDIUMTEXT    NOT NULL,      -- {players: [...], roundDetails: [...]}
  UNIQUE KEY uq_winner_played (winner_name, winner_score, played_at),
  INDEX idx_finished_played_at (played_at)
) ENGINE=InnoDB;

-- Championship flag. Games played in a "championship" room count toward the
-- daily per-player championship quota and are the only games exposed by the
-- public API by default (the score app's seasons are built from them).
-- Existing rows default to 1 — every game recorded before the flag existed
-- was counted by the score app, so they stay "championship" for continuity.
DROP PROCEDURE IF EXISTS _king_add_is_championship;
DELIMITER //
CREATE PROCEDURE _king_add_is_championship()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 'finished_games'
       AND COLUMN_NAME  = 'is_championship'
  ) THEN
    ALTER TABLE finished_games
      ADD COLUMN is_championship TINYINT(1) NOT NULL DEFAULT 1 AFTER winner_score,
      ADD INDEX idx_finished_championship (is_championship, played_at);
  END IF;
END //
DELIMITER ;
CALL _king_add_is_championship();
DROP PROCEDURE _king_add_is_championship;

-- ─── live_games ─────────────────────────────────────────────────────────────
-- Snapshot of every in-flight room. Updated after every state-changing
-- action (join, play, discard, next round, etc.) so a server restart or a
-- player re-joining with the same room code can resume mid-game.
-- Row is removed when the game ends (a finished_games row takes over) or
-- when the last player leaves the room.
CREATE TABLE IF NOT EXISTS live_games (
  room_code   VARCHAR(6)    NOT NULL PRIMARY KEY,
  state_json  MEDIUMTEXT    NOT NULL,
  updated_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_live_updated (updated_at)
) ENGINE=InnoDB;
