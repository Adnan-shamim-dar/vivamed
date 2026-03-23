/**
 * Database Manager
 * Handles initialization and connection pooling for both databases
 * Ready for MongoDB/PostgreSQL swap in the future
 */

const sqlite3 = require('sqlite3').verbose();
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
      progressDb = new sqlite3.Database(PROGRESS_DB, (err) => {
        if (err) {
          console.error('❌ Error opening progress.db:', err.message);
        } else {
          console.log(`✅ Progress database connected: ${PROGRESS_DB}`);
        }
      });

      await createProgressTables(progressDb);

      // Initialize library database
      libraryDb = new sqlite3.Database(LIBRARY_DB, (err) => {
        if (err) {
          console.error('❌ Error opening library.db:', err.message);
        } else {
          console.log(`✅ Library database connected: ${LIBRARY_DB}`);
        }
      });

      await createLibraryTables(libraryDb);
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
   */
  all(database, sql, params = []) {
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
  },

  /**
   * Promise wrapper for db.get() - returns single row
   */
  get(database, sql, params = []) {
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
  },

  /**
   * Promise wrapper for db.run() - INSERT/UPDATE/DELETE
   */
  run(database, sql, params = []) {
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
};

module.exports = db;
