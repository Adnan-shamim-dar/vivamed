const fs = require('fs');
const initSqlJs = require('sql.js');

let sqlJs = null;
const databases = {}; // Store multiple database instances

async function initDb(dbName = 'progress', filePath = null) {
  if (!sqlJs) {
    sqlJs = await initSqlJs();
  }

  if (filePath === null) {
    filePath = `./data/${dbName}.db`;
  }

  // Try to load existing database
  try {
    let db;
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath);
      db = new sqlJs.Database(data);
    } else {
      db = new sqlJs.Database();
    }
    databases[dbName] = { instance: db, filePath };
    return db;
  } catch (err) {
    const db = new sqlJs.Database();
    databases[dbName] = { instance: db, filePath };
    return db;
  }
}

function saveDb(dbName = 'progress') {
  try {
    const dbInfo = databases[dbName];
    if (!dbInfo) {
      console.error(`Database ${dbName} not initialized`);
      return;
    }

    const dir = require('path').dirname(dbInfo.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const data = dbInfo.instance.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbInfo.filePath, buffer);
  } catch (err) {
    console.error('Error saving database:', err);
  }
}

class DbWrapper {
  constructor(dbName = 'progress') {
    this.dbName = dbName;
  }

  get db() {
    return databases[this.dbName]?.instance;
  }

  run(sql, params = [], callback) {
    try {
      if (!this.db) {
        throw new Error(`Database ${this.dbName} not initialized`);
      }
      this.db.run(sql, params);
      saveDb(this.dbName);
      if (callback) callback(null);
    } catch (err) {
      if (callback) callback(err);
    }
  }

  get(sql, params = [], callback) {
    try {
      if (!this.db) {
        throw new Error(`Database ${this.dbName} not initialized`);
      }
      const stmt = this.db.prepare(sql);
      stmt.bind(params);
      const result = stmt.step() ? stmt.getAsObject() : null;
      stmt.free();
      if (callback) callback(null, result);
      return result;
    } catch (err) {
      if (callback) callback(err);
    }
  }

  all(sql, params = [], callback) {
    try {
      if (!this.db) {
        throw new Error(`Database ${this.dbName} not initialized`);
      }
      const stmt = this.db.prepare(sql);
      stmt.bind(params);
      const results = [];
      while (stmt.step()) {
        results.push(stmt.getAsObject());
      }
      stmt.free();
      if (callback) callback(null, results);
      return results;
    } catch (err) {
      if (callback) callback(err);
    }
  }

  serialize(callback) {
    if (callback) callback();
  }
}

module.exports = {
  initDb,
  saveDb,
  DbWrapper
};
