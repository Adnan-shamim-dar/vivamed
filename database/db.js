/**
 * PostgreSQL Database Manager
 * Replaces sqlite3 with PostgreSQL using pg driver
 * Maintains callback-style API for compatibility with existing code
 */

const { Pool } = require('pg');

// Connection pools for progress and library databases
let progressPool = null;
let libraryPool = null;

// Database initialization
const db = {
  /**
   * Initialize PostgreSQL connection pools
   * Reads from environment variables:
   * - DB_USER: PostgreSQL user (default: postgres)
   * - DB_PASSWORD: PostgreSQL password (default: '')
   * - DB_HOST: PostgreSQL host (default: localhost)
   * - DB_PORT: PostgreSQL port (default: 5432)
   * - DB_NAME_PROGRESS: Progress database name (default: vivamed_progress)
   * - DB_NAME_LIBRARY: Library database name (default: vivamed_library)
   */
  async init() {
    try {
      const dbUser = process.env.DB_USER || 'postgres';
      const dbPassword = process.env.DB_PASSWORD || '';
      const dbHost = process.env.DB_HOST || 'localhost';
      const dbPort = process.env.DB_PORT || 5432;
      const dbProgressName = process.env.DB_NAME_PROGRESS || 'vivamed_progress';
      const dbLibraryName = process.env.DB_NAME_LIBRARY || 'vivamed_library';

      // Progress database pool
      progressPool = new Pool({
        user: dbUser,
        password: dbPassword,
        host: dbHost,
        port: dbPort,
        database: dbProgressName,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000
      });

      progressPool.on('error', (err) => {
        console.error('❌ Unexpected error on progress pool:', err);
      });

      // Test progress connection
      const progressClient = await progressPool.connect();
      progressClient.release();
      console.log(`✅ Progress database connected: ${dbProgressName}`);

      // Library database pool
      libraryPool = new Pool({
        user: dbUser,
        password: dbPassword,
        host: dbHost,
        port: dbPort,
        database: dbLibraryName,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000
      });

      libraryPool.on('error', (err) => {
        console.error('❌ Unexpected error on library pool:', err);
      });

      // Test library connection
      const libraryClient = await libraryPool.connect();
      libraryClient.release();
      console.log(`✅ Library database connected: ${dbLibraryName}`);

      return true;
    } catch (error) {
      console.error('❌ Database initialization failed:', error.message);
      throw error;
    }
  },

  /**
   * Get progress database pool
   */
  getProgressDb() {
    if (!progressPool) {
      throw new Error('Progress database not initialized. Call db.init() first.');
    }
    return progressPool;
  },

  /**
   * Get library database pool
   */
  getLibraryDb() {
    if (!libraryPool) {
      throw new Error('Library database not initialized. Call db.init() first.');
    }
    return libraryPool;
  },

  /**
   * Promise wrapper for pool.query() - returns array of rows
   * Compatible with sqlite3 db.all() callback style
   */
  all(pool, sql, params = [], callback) {
    if (typeof callback === 'function') {
      // Callback style (for backward compatibility)
      pool.query(sql, params)
        .then((result) => {
          callback(null, result.rows || []);
        })
        .catch((err) => {
          console.error('❌ DB all() error:', err.message);
          callback(err);
        });
    } else {
      // Promise style (if called without callback)
      return new Promise((resolve, reject) => {
        pool.query(sql, params)
          .then((result) => {
            resolve(result.rows || []);
          })
          .catch((err) => {
            console.error('❌ DB all() error:', err.message);
            reject(err);
          });
      });
    }
  },

  /**
   * Promise wrapper for pool.query() - returns single row
   * Compatible with sqlite3 db.get() callback style
   */
  get(pool, sql, params = [], callback) {
    if (typeof callback === 'function') {
      // Callback style (for backward compatibility)
      pool.query(sql, params)
        .then((result) => {
          callback(null, result.rows?.[0] || null);
        })
        .catch((err) => {
          console.error('❌ DB get() error:', err.message);
          callback(err);
        });
    } else {
      // Promise style (if called without callback)
      return new Promise((resolve, reject) => {
        pool.query(sql, params)
          .then((result) => {
            resolve(result.rows?.[0] || null);
          })
          .catch((err) => {
            console.error('❌ DB get() error:', err.message);
            reject(err);
          });
      });
    }
  },

  /**
   * Promise wrapper for pool.query() - INSERT/UPDATE/DELETE
   * Compatible with sqlite3 db.run() callback style
   * Returns { id: lastInsertId, changes: rowCount } for compatibility
   */
  run(pool, sql, params = [], callback) {
    if (typeof callback === 'function') {
      // Callback style (for backward compatibility)
      pool.query(sql, params)
        .then((result) => {
          // Try to extract lastID from RETURNING clause or result
          let lastID = null;
          if (result.rows && result.rows.length > 0 && result.rows[0].id) {
            lastID = result.rows[0].id;
          }
          callback(null, {
            id: lastID,
            changes: result.rowCount || 0
          });
        })
        .catch((err) => {
          console.error('❌ DB run() error:', err.message);
          callback(err);
        });
    } else {
      // Promise style (if called without callback)
      return new Promise((resolve, reject) => {
        pool.query(sql, params)
          .then((result) => {
            let lastID = null;
            if (result.rows && result.rows.length > 0 && result.rows[0].id) {
              lastID = result.rows[0].id;
            }
            resolve({
              id: lastID,
              changes: result.rowCount || 0
            });
          })
          .catch((err) => {
            console.error('❌ DB run() error:', err.message);
            reject(err);
          });
      });
    }
  }
};

module.exports = db;
