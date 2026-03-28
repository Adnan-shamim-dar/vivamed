/**
 * Database Manager
 * Supports both SQLite (local development) and PostgreSQL (production/Railway)
 * Auto-detects based on DB_HOST environment variable
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

  // Create separate pools for progress and library databases
  const progressPool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME_PROGRESS || 'vivamed_progress'
  });

  const libraryPool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME_LIBRARY || 'vivamed_library'
  });

  // Test connections
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

  try {
    // Ensure data directory exists
    await fs.mkdir(DATA_DIR, { recursive: true });
    console.log('✅ Data directory ready:', DATA_DIR);
  } catch (e) {
    console.log('📁 Data directory exists or error:', e.message);
  }

  try {
    // Initialize progress database
    progressDb = new sqlite3.Database(PROGRESS_DB, (err) => {
      if (err) {
        console.error('❌ Error opening progress.db:', err.message);
      } else {
        console.log(`✅ Progress database connected: ${PROGRESS_DB}`);
      }
    });

    // Initialize library database
    libraryDb = new sqlite3.Database(LIBRARY_DB, (err) => {
      if (err) {
        console.error('❌ Error opening library.db:', err.message);
      } else {
        console.log(`✅ Library database connected: ${LIBRARY_DB}`);
      }
    });

    return { progressDb, libraryDb };
  } catch (error) {
    console.error('❌ Database initialization failed:', error.message);
    throw error;
  }
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

        // Import and run PostgreSQL schema creation
        const { createProgressTables, createLibraryTables } = require('./schema');
        await createProgressTables(progressDb);
        await createLibraryTables(libraryDb);
      } else {
        console.log('📦 Using SQLite (local development mode)');
        const { progressDb: pDb, libraryDb: lDb } = await initSqlite();
        progressDb = pDb;
        libraryDb = lDb;

        // Import and run SQLite schema creation
        const { createProgressTables, createLibraryTables } = require('./schema');
        await createProgressTables(progressDb);
        await createLibraryTables(libraryDb);
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
   * Promise wrapper for db.all() - returns array of rows
   * Works with both SQLite and PostgreSQL
   */
  async all(database, sql, params = []) {
    try {
      if (usePostgres) {
        // PostgreSQL: convert ? placeholders to $1, $2, etc.
        const pgSql = convertSqlToPostgres(sql);
        const result = await database.query(pgSql, params);
        return result.rows;
      } else {
        // SQLite: use callback style
        return new Promise((resolve, reject) => {
          database.all(sql, params, (err, rows) => {
            if (err) {
              console.error('❌ DB all() error:', err.message);
              reject(err);
            } else {
              resolve(rows || []);
            }
          });
        });
      }
    } catch (error) {
      console.error('❌ DB all() error:', error.message);
      throw error;
    }
  },

  /**
   * Promise wrapper for db.get() - returns single row
   * Works with both SQLite and PostgreSQL
   */
  async get(database, sql, params = []) {
    try {
      if (usePostgres) {
        // PostgreSQL: convert ? placeholders to $1, $2, etc.
        const pgSql = convertSqlToPostgres(sql);
        const result = await database.query(pgSql, params);
        return result.rows[0] || null;
      } else {
        // SQLite: use callback style
        return new Promise((resolve, reject) => {
          database.get(sql, params, (err, row) => {
            if (err) {
              console.error('❌ DB get() error:', err.message);
              reject(err);
            } else {
              resolve(row || null);
            }
          });
        });
      }
    } catch (error) {
      console.error('❌ DB get() error:', error.message);
      throw error;
    }
  },

  /**
   * Promise wrapper for db.run() - INSERT/UPDATE/DELETE
   * Works with both SQLite and PostgreSQL
   */
  async run(database, sql, params = []) {
    try {
      if (usePostgres) {
        // PostgreSQL: convert ? placeholders to $1, $2, etc.
        const pgSql = convertSqlToPostgres(sql);
        const result = await database.query(pgSql, params);
        return {
          id: result.rows[0]?.id || null,
          changes: result.rowCount || 0
        };
      } else {
        // SQLite: use callback style with this binding for lastID
        return new Promise((resolve, reject) => {
          database.run(sql, params, function(err) {
            if (err) {
              console.error('❌ DB run() error:', err.message);
              reject(err);
            } else {
              resolve({
                id: this.lastID,
                changes: this.changes
              });
            }
          });
        });
      }
    } catch (error) {
      console.error('❌ DB run() error:', error.message);
      throw error;
    }
  }
};

/**
 * Convert SQLite SQL to PostgreSQL SQL
 * Converts ? placeholders to $1, $2, etc.
 * IMPORTANT: Only converts ? in SQL strings, not JavaScript ternary operators
 */
function convertSqlToPostgres(sql) {
  if (!sql) return sql;

  let paramIndex = 1;
  let result = '';
  let inString = false;
  let stringChar = null;

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    const prevChar = i > 0 ? sql[i - 1] : null;
    const nextChar = i < sql.length - 1 ? sql[i + 1] : null;

    // Track string boundaries (don't replace ? inside strings)
    if ((char === '"' || char === "'") && prevChar !== '\\') {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
      }
    }

    // Replace ? with $N only when not in a string
    if (char === '?' && !inString) {
      result += `$${paramIndex}`;
      paramIndex++;
    } else {
      result += char;
    }
  }

  return result;
}

module.exports = db;
