'use strict';

const mysql = require('mysql2');

let pool = null;

/**
 * Returns the MySQL connection pool, creating it lazily on first call.
 * If DB env vars are missing or connection fails, returns null and logs a warning.
 * @returns {import('mysql2').Pool | null}
 */
function getPool() {
  if (pool) return pool;

  const { DB_HOST, DB_USER, DB_PASSWORD, DB_NAME } = process.env;

  if (!DB_HOST || !DB_USER || !DB_NAME) {
    console.warn('[db] Database environment variables not configured. DB features disabled.');
    return null;
  }

  try {
    pool = mysql.createPool({
      host: DB_HOST,
      user: DB_USER,
      password: DB_PASSWORD || '',
      database: DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });

    console.log('[db] MySQL connection pool created.');
  } catch (err) {
    console.error('[db] Failed to create MySQL pool:', err.message);
    pool = null;
  }

  return pool;
}

module.exports = { getPool };
