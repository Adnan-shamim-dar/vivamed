const fs = require('fs');
const initSqlJs = require('sql.js');

let db = null;
let sqlJs = null;

async function initDb() {
  sqlJs = await initSqlJs();

  // Try to load existing database
  try {
    if (fs.existsSync('./data/progress.db')) {
      const data = fs.readFileSync('./data/progress.db');
      db = new sqlJs.Database(data);
    } else {
      db = new sqlJs.Database();
    }
  } catch (err) {
    db = new sqlJs.Database();
  }
}

function saveDb() {
  try {
    if (!fs.existsSync('./data')) {
      fs.mkdirSync('./data', { recursive: true });
    }
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync('./data/progress.db', buffer);
  } catch (err) {
    console.error('Error saving database:', err);
  }
}

class DbWrapper {
  run(sql, params = [], callback) {
    try {
      db.run(sql, params);
      saveDb();
      if (callback) callback(null);
    } catch (err) {
      if (callback) callback(err);
    }
  }

  get(sql, params = [], callback) {
    try {
      const stmt = db.prepare(sql);
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
      const stmt = db.prepare(sql);
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
