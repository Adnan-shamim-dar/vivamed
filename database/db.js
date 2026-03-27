/**
 * Database Manager
 * Handles initialization and connection pooling for both databases
 * Ready for MongoDB/PostgreSQL swap in the future
 */

const Database = require('better-sqlite3');
const fs = require('fs').promises;
const { PROGRESS_DB, LIBRARY_DB, DATA_DIR } = require('../config/constants');
const { createProgressTables, createLibraryTables } = require('./schema');

let progressDb = null;
let libraryDb = null;

const db = {
  /**
   * Initialize both databases
   */
  async init() {
    try {
      // Ensure data directory exists
      await fs.mkdir(DATA_DIR, { recursive: true });
      console.log('✅ Data directory ready:', DATA_DIR);
    } catch (e) {
      console.log('📁 Data directory exists or error:', e.message);
    }

    try {
      // Initialize progress database
      progressDb = new Database(PROGRESS_DB);
      progressDb.pragma('journal_mode = WAL');
      console.log(`✅ Progress database connected: ${PROGRESS_DB}`);

      createProgressTables(progressDb);

      // Initialize library database
      libraryDb = new Database(LIBRARY_DB);
      libraryDb.pragma('journal_mode = WAL');
      console.log(`✅ Library database connected: ${LIBRARY_DB}`);

      createLibraryTables(libraryDb);
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
   * Returns all matching rows (synchronous better-sqlite3, wrapped in a resolved Promise
   * for API compatibility with existing callers that use await).
   */
  all(database, sql, params = []) {
    try {
      const rows = database.prepare(sql).all(params);
      return Promise.resolve(rows || []);
    } catch (err) {
      console.error('❌ DB all() error:', err.message);
      return Promise.reject(err);
    }
  },

  /**
   * Returns a single row (synchronous better-sqlite3, wrapped in a resolved Promise).
   */
  get(database, sql, params = []) {
    try {
      const row = database.prepare(sql).get(params);
      return Promise.resolve(row || null);
    } catch (err) {
      console.error('❌ DB get() error:', err.message);
      return Promise.reject(err);
    }
  },

  /**
   * Executes an INSERT/UPDATE/DELETE (synchronous better-sqlite3, wrapped in a resolved Promise).
   */
  run(database, sql, params = []) {
    try {
      const result = database.prepare(sql).run(params);
      return Promise.resolve({
        id: result.lastInsertRowid,
        changes: result.changes
      });
    } catch (err) {
      console.error('❌ DB run() error:', err.message);
      return Promise.reject(err);
    }
  }
};

module.exports = db;
