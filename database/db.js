/**
 * Database Manager
 * Supports both SQLite (local development) and PostgreSQL (production/Railway)
 * Uses compatibility layer to handle query conversion automatically
 */

const fs = require('fs').promises;
const { PROGRESS_DB, LIBRARY_DB, DATA_DIR } = require('../config/constants');

let progressDb = null;
let libraryDb = null;
let usePostgres = false;

// Check if we should use PostgreSQL
const usePostgresMode = () => {
  return process.env.DB_HOST && process.env.DB_USER && process.env.DB_PASSWORD;
};

// Initialize PostgreSQL connection
async function initPostgres() {
  const { Pool } = require('pg');

  const progressPool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME_PROGRESS || 'vivamed_progress',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000
  });

  const libraryPool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME_LIBRARY || 'vivamed_library',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000
  });

  try {
    await progressPool.query('SELECT NOW()');
    console.log('✅ PostgreSQL progress database connected');
  } catch (err) {
    console.error('❌ Error connecting to progress database:', err.message);
    throw err;
  }

  try {
    await libraryPool.query('SELECT NOW()');
    console.log('✅ PostgreSQL library database connected');
  } catch (err) {
    console.error('❌ Error connecting to library database:', err.message);
    throw err;
  }

  return { progressPool, libraryPool };
}

// Initialize SQLite connection
async function initSqlite() {
  const sqlite3 = require('sqlite3').verbose();
  const { createProgressTables, createLibraryTables } = require('./schema');

  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    console.log('✅ Data directory ready:', DATA_DIR);
  } catch (e) {
    console.log('📁 Data directory exists or error:', e.message);
  }

  try {
    progressDb = new sqlite3.Database(PROGRESS_DB, (err) => {
      if (err) {
        console.error('❌ Error opening progress.db:', err.message);
      } else {
        console.log(`✅ Progress database connected: ${PROGRESS_DB}`);
      }
    });

    await createProgressTables(progressDb);

    libraryDb = new sqlite3.Database(LIBRARY_DB, (err) => {
      if (err) {
        console.error('❌ Error opening library.db:', err.message);
      } else {
        console.log(`✅ Library database connected: ${LIBRARY_DB}`);
      }
    });

    await createLibraryTables(libraryDb);
    return { progressDb, libraryDb };
  } catch (error) {
    console.error('❌ Database initialization failed:', error.message);
    throw error;
  }
}

/**
 * Convert SQLite query (with ?) to PostgreSQL query (with $1, $2, etc.)
 */
function convertSqlToPostgres(sql) {
  let paramIndex = 1;
  let result = '';

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    if (char === '?') {
      result += `$${paramIndex}`;
      paramIndex++;
    } else {
      result += char;
    }
  }

  return result;
}

const db = {
  /**
   * Initialize both databases (SQLite or PostgreSQL)
   */
  async init() {
    try {
      usePostgres = usePostgresMode();

      if (usePostgres) {
        console.log('🐘 Using PostgreSQL (production mode)');
        const { progressPool, libraryPool } = await initPostgres();
        progressDb = progressPool;
        libraryDb = libraryPool;

        const { createProgressTables, createLibraryTables } = require('./schema');
        await createProgressTables(progressDb);
        await createLibraryTables(libraryDb);
      } else {
        console.log('📦 Using SQLite (local development mode)');
        await initSqlite();
      }
    } catch (error) {
      console.error('❌ Database initialization failed:', error.message);
      throw error;
    }
  },

  /**
   * Get progress database instance
   */
  getProgressDb() {
    if (!progressDb) {
      throw new Error('Progress database not initialized. Call db.init() first.');
    }
    return progressDb;
  },

  /**
   * Get library database instance
   */
  getLibraryDb() {
    if (!libraryDb) {
      throw new Error('Library database not initialized. Call db.init() first.');
    }
    return libraryDb;
  },

  /**
   * Promise wrapper for db.all() - handles both SQLite and PostgreSQL
   */
  all(database, sql, params = [], callback) {
    if (usePostgres) {
      const pgSql = convertSqlToPostgres(sql);
      if (typeof callback === 'function') {
        database.query(pgSql, params)
          .then((result) => callback(null, result.rows || []))
          .catch((err) => {
            console.error('❌ DB all() error:', err.message);
            callback(err);
          });
      } else {
        return new Promise((resolve, reject) => {
          database.query(pgSql, params)
            .then((result) => resolve(result.rows || []))
            .catch((err) => {
              console.error('❌ DB all() error:', err.message);
              reject(err);
            });
        });
      }
    } else {
      return new Promise((resolve, reject) => {
        database.all(sql, params, (err, rows) => {
          if (err) {
            console.error('❌ DB all() error:', err.message);
            if (typeof callback === 'function') callback(err);
            reject(err);
          } else {
            const result = rows || [];
            if (typeof callback === 'function') callback(null, result);
            resolve(result);
          }
        });
      });
    }
  },

  /**
   * Promise wrapper for db.get() - returns single row
   */
  get(database, sql, params = [], callback) {
    if (usePostgres) {
      const pgSql = convertSqlToPostgres(sql);
      if (typeof callback === 'function') {
        database.query(pgSql, params)
          .then((result) => callback(null, result.rows?.[0] || null))
          .catch((err) => {
            console.error('❌ DB get() error:', err.message);
            callback(err);
          });
      } else {
        return new Promise((resolve, reject) => {
          database.query(pgSql, params)
            .then((result) => resolve(result.rows?.[0] || null))
            .catch((err) => {
              console.error('❌ DB get() error:', err.message);
              reject(err);
            });
        });
      }
    } else {
      return new Promise((resolve, reject) => {
        database.get(sql, params, (err, row) => {
          if (err) {
            console.error('❌ DB get() error:', err.message);
            if (typeof callback === 'function') callback(err);
            reject(err);
          } else {
            const result = row || null;
            if (typeof callback === 'function') callback(null, result);
            resolve(result);
          }
        });
      });
    }
  },

  /**
   * Promise wrapper for db.run() - INSERT/UPDATE/DELETE
   */
  run(database, sql, params = [], callback) {
    if (usePostgres) {
      const pgSql = convertSqlToPostgres(sql);
      if (typeof callback === 'function') {
        database.query(pgSql, params)
          .then((result) => {
            callback(null, {
              id: result.rows?.[0]?.id || null,
              changes: result.rowCount || 0
            });
          })
          .catch((err) => {
            console.error('❌ DB run() error:', err.message);
            callback(err);
          });
      } else {
        return new Promise((resolve, reject) => {
          database.query(pgSql, params)
            .then((result) => {
              resolve({
                id: result.rows?.[0]?.id || null,
                changes: result.rowCount || 0
              });
            })
            .catch((err) => {
              console.error('❌ DB run() error:', err.message);
              reject(err);
            });
        });
      }
    } else {
      return new Promise((resolve, reject) => {
        database.run(sql, params, function(err) {
          if (err) {
            console.error('❌ DB run() error:', err.message);
            if (typeof callback === 'function') callback(err);
            reject(err);
          } else {
            const result = { id: this.lastID, changes: this.changes };
            if (typeof callback === 'function') callback(null, result);
            resolve(result);
          }
        });
      });
    }
  }
};

module.exports = db;
