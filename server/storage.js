'use strict';

const { Pool } = require('pg');

let pool = null;
let storageReady = false;

async function initStorage() {
  if (storageReady) return true;

  if (!process.env.DATABASE_URL) {
    console.log('[STORAGE] DATABASE_URL no configurada: usando memoria durante esta ejecución.');
    return false;
  }

  const sslDisabled = String(process.env.DATABASE_SSL || '').toLowerCase() === 'false';

  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: sslDisabled ? undefined : { rejectUnauthorized: false },
    max: Number(process.env.DATABASE_POOL_MAX || 5),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
  });

  pool.on('error', (error) => {
    console.error('[STORAGE POOL]', error?.message || error);
  });

  await pool.query(
    'CREATE TABLE IF NOT EXISTS neoncore_players (' +
      'save_key VARCHAR(96) PRIMARY KEY,' +
      'data JSONB NOT NULL,' +
      'updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()' +
    ')'
  );

  await pool.query(
    'CREATE INDEX IF NOT EXISTS neoncore_players_updated_idx ' +
    'ON neoncore_players (updated_at)'
  );

  storageReady = true;
  console.log('[STORAGE] PostgreSQL conectado: persistencia permanente activa.');
  return true;
}

async function loadPlayerData(saveKey) {
  if (!storageReady || !pool || !saveKey) return null;

  try {
    const result = await pool.query(
      'SELECT data FROM neoncore_players WHERE save_key = $1',
      [saveKey]
    );
    return result.rows[0]?.data || null;
  } catch (error) {
    console.error('[STORAGE LOAD QUERY]', error?.message || error);
    return null;
  }
}

async function loadPlayerDataByName(name) {
  if (!storageReady || !pool) return null;

  const cleanName = String(name || '').trim().slice(0, 20);
  if (!cleanName) return null;

  try {
    const result = await pool.query(
      'SELECT data FROM neoncore_players ' +
        'WHERE lower(trim(data->>\'name\')) = lower(trim($1)) ' +
        'ORDER BY updated_at DESC LIMIT 2',
      [cleanName]
    );

    if (result.rows.length !== 1) {
      if (result.rows.length > 1) {
        console.warn('[STORAGE MIGRATION] Nombre ambiguo; no se migrará:', cleanName);
      }
      return null;
    }

    return result.rows[0]?.data || null;
  } catch (error) {
    console.error('[STORAGE NAME LOAD QUERY]', error?.message || error);
    return null;
  }
}

async function savePlayerData(saveKey, data) {
  if (!storageReady || !pool || !saveKey) return false;

  try {
    await pool.query(
    'INSERT INTO neoncore_players (save_key, data, updated_at) ' +
      'VALUES ($1, $2::jsonb, NOW()) ' +
      'ON CONFLICT (save_key) ' +
      'DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()',
    [saveKey, JSON.stringify(data)]
    );
    return true;
  } catch (error) {
    console.error('[STORAGE SAVE QUERY]', error?.message || error);
    return false;
  }
}

async function closeStorage() {
  if (pool) {
    await pool.end();
    pool = null;
  }

  storageReady = false;
}

module.exports = {
  initStorage,
  loadPlayerData,
  loadPlayerDataByName,
  savePlayerData,
  closeStorage,
  get enabled() {
    return storageReady;
  }
};
