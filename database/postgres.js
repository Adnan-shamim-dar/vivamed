/**
 * PostgreSQL Database Manager
 * Replaces sqlite3/sql.js with a PostgreSQL connection pool via pg-promise.
 *
 * Design goals:
 *  1. Drop-in replacement for the old sqlite3 / DbWrapper callback API.
 *  2. All column names are stored lowercase in PostgreSQL (idiomatic).
 *  3. Returned row objects have their keys converted back to camelCase so
 *     existing server.js property accesses (e.g. row.sessionId) keep working.
 */

const pgp = require('pg-promise')();

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is not set!');
  console.error('   Make sure the PostgreSQL service is linked in Railway.');
}

// ── Connection pool ──────────────────────────────────────────────────────────

const pool = pgp({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

// ── camelCase ↔ lowercase helpers ────────────────────────────────────────────

/**
 * Map of lowercase column names → camelCase names used in server.js.
 * Only entries that differ from their lowercase form are needed.
 */
const COLUMN_CAMEL_MAP = {
  sessionid: 'sessionId',
  starttime: 'startTime',
  createdat: 'createdAt',
  fileid: 'fileId',
  lastchunkindex: 'lastChunkIndex',
  correctanswers: 'correctAnswers',
  wronganswers: 'wrongAnswers',
  totalattempts: 'totalAttempts',
  recentquestions: 'recentQuestions',
  questionindex: 'questionIndex',
  pdfbased: 'pdfBased',
  selectedoption: 'selectedOption',
  correctoption: 'correctOption',
  ismcq: 'isMCQ',
  questiontype: 'questionType',
  originalfilename: 'originalFilename',
  filepath: 'filePath',
  filesize: 'fileSize',
  uploadtime: 'uploadTime',
  extractedtext: 'extractedText',
  totalchunks: 'totalChunks',
  uploadmode: 'uploadMode',
  chunkindex: 'chunkIndex',
  chunktext: 'chunkText',
  keyconcepts: 'keyConcepts',
  chunktype: 'chunkType',
  wordcount: 'wordCount',
  difficultyemoji: 'difficultyEmoji',
  pdffilename: 'pdfFilename',
  generatedat: 'generatedAt',
  optionsjson: 'optionsJSON',
  useranswer: 'userAnswer',
  iscorrect: 'isCorrect',
  reviewcount: 'reviewCount',
  lastreviewed: 'lastReviewedAt',
  lastreviewedat: 'lastReviewedAt',
  markedforremoval: 'markedForRemoval',
  perfect_answer: 'perfect_answer',   // already snake_case, keep as-is
  source_type: 'source_type',
  source_pdf: 'source_pdf',
  created_date: 'created_date',
  usage_count: 'usage_count',
  mcqoptions: 'mcqOptions',
  optiona: 'optionA',
  optionb: 'optionB',
  optionc: 'optionC',
  optiond: 'optionD',
  choice_type: 'choice_type',
  total_attempts: 'total_attempts',
  correct_attempts: 'correct_attempts',
  last_attempted: 'last_attempted',
  total_attempted: 'total_attempted',
  accuracy_percent: 'accuracy_percent',
  topics_performance: 'topics_performance',
  last_session_id: 'last_session_id',
  last_updated: 'last_updated',
  created_at: 'created_at',
  store_date: 'store_date',
  total_subjects: 'total_subjects',
  ai_availability_status: 'ai_availability_status',
  source_type: 'source_type',
  graduatedcount: 'graduatedCount'
};

/**
 * Convert a single row's keys from PostgreSQL lowercase to camelCase.
 */
function toCamelCase(row) {
  if (!row || typeof row !== 'object') return row;
  const result = {};
  for (const [key, value] of Object.entries(row)) {
    const camel = COLUMN_CAMEL_MAP[key] || key;
    result[camel] = value;
  }
  return result;
}

/**
 * Convert an array of rows.
 */
function rowsToCamelCase(rows) {
  if (!rows) return [];
  return rows.map(toCamelCase);
}

// ── SQL conversion helpers ───────────────────────────────────────────────────

/**
 * Convert SQLite ? placeholders to PostgreSQL $1, $2, ... style.
 */
function convertPlaceholders(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

/**
 * Convert SQLite-specific SQL syntax to PostgreSQL syntax.
 */
function convertSql(sql) {
  return sql
    .replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY')
    .replace(/DEFAULT CURRENT_TIMESTAMP/gi, 'DEFAULT NOW()')
    .replace(/\bCURRENT_TIMESTAMP\b/g, 'NOW()')
    .replace(/INSERT OR IGNORE INTO/gi, 'INSERT INTO')
    .replace(/INSERT OR REPLACE INTO/gi, 'INSERT INTO');
}

/**
 * Append ON CONFLICT DO NOTHING to INSERT statements that were originally
 * INSERT OR IGNORE, unless they already have an ON CONFLICT clause.
 */
function wrapInsertIgnore(originalSql, convertedSql) {
  const wasInsertIgnore = /INSERT OR IGNORE INTO/i.test(originalSql);
  if (wasInsertIgnore && !/ON CONFLICT/i.test(convertedSql)) {
    return convertedSql + ' ON CONFLICT DO NOTHING';
  }
  return convertedSql;
}

/**
 * Full SQL conversion pipeline.
 */
function prepareSql(sql) {
  let converted = convertSql(sql);
  converted = wrapInsertIgnore(sql, converted);
  converted = convertPlaceholders(converted);
  return converted;
}

/**
 * Normalise params array.
 */
function normaliseParams(params) {
  if (!params || (Array.isArray(params) && params.length === 0)) return [];
  return params;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * db.run(sql, params?, callback?) — INSERT / UPDATE / DELETE
 * Callback: callback(err, { id, changes })
 *
 * Note: In server.js some run() callbacks use `function(err)` and access
 * `this.lastID` / `this.changes` (sqlite3 style). We pass { id, changes }
 * as the second argument instead; callers that ignore it are unaffected.
 */
function run(sql, params, callback) {
  if (typeof params === 'function') {
    callback = params;
    params = [];
  }

  const pgSql = prepareSql(sql);
  const pgParams = normaliseParams(params);

  pool.result(pgSql, pgParams)
    .then((result) => {
      const lastID = result.rows && result.rows[0] ? (result.rows[0].id || null) : null;
      const changes = result.rowCount || 0;
      if (callback) callback.call({ lastID, changes }, null, { id: lastID, changes });
    })
    .catch((err) => {
      console.error('❌ DB run() error:', err.message);
      console.error('   SQL:', pgSql);
      if (callback) callback(err);
    });
}

/**
 * db.get(sql, params?, callback?) — SELECT single row
 * Callback: callback(err, row)
 */
function get(sql, params, callback) {
  if (typeof params === 'function') {
    callback = params;
    params = [];
  }

  const pgSql = prepareSql(sql);
  const pgParams = normaliseParams(params);

  pool.oneOrNone(pgSql, pgParams)
    .then((row) => {
      if (callback) callback(null, row ? toCamelCase(row) : null);
    })
    .catch((err) => {
      console.error('❌ DB get() error:', err.message);
      console.error('   SQL:', pgSql);
      if (callback) callback(err);
    });
}

/**
 * db.all(sql, params?, callback?) — SELECT multiple rows
 * Callback: callback(err, rows)
 */
function all(sql, params, callback) {
  if (typeof params === 'function') {
    callback = params;
    params = [];
  }

  const pgSql = prepareSql(sql);
  const pgParams = normaliseParams(params);

  pool.manyOrNone(pgSql, pgParams)
    .then((rows) => {
      if (callback) callback(null, rowsToCamelCase(rows));
    })
    .catch((err) => {
      console.error('❌ DB all() error:', err.message);
      console.error('   SQL:', pgSql);
      if (callback) callback(err);
    });
}

/**
 * Promise-based variants for async/await code.
 */
function runAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    run(sql, params, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

function getAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function allAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

/**
 * serialize(callback) — no-op for sqlite3 API compatibility.
 */
function serialize(callback) {
  if (callback) callback();
}

// ── Table initialisation ─────────────────────────────────────────────────────

/**
 * Create all tables in PostgreSQL.
 * Column names are lowercase (PostgreSQL idiomatic). The toCamelCase()
 * function above maps them back to camelCase when rows are returned.
 */
async function init() {
  console.log('🔌 Connecting to PostgreSQL...');

  try {
    const conn = await pool.connect();
    conn.done(); // Release the connection back to the pool
    console.log('✅ PostgreSQL connected');
  } catch (err) {
    console.error('❌ PostgreSQL connection failed:', err.message);
    throw err;
  }

  const tables = [
    // ── Progress / main tables ──────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS sessions (
      id SERIAL PRIMARY KEY,
      sessionid TEXT UNIQUE,
      mode TEXT,
      starttime TEXT,
      createdat TEXT DEFAULT NOW(),
      fileid TEXT,
      lastchunkindex INTEGER DEFAULT 0,
      correctanswers INTEGER DEFAULT 0,
      wronganswers INTEGER DEFAULT 0,
      totalattempts INTEGER DEFAULT 0,
      username TEXT,
      recentquestions TEXT DEFAULT '[]'
    )`,

    `CREATE TABLE IF NOT EXISTS attempts (
      id SERIAL PRIMARY KEY,
      sessionid TEXT,
      questionindex INTEGER,
      question TEXT,
      answer TEXT,
      score INTEGER,
      source TEXT,
      timestamp TEXT DEFAULT NOW(),
      chunkindex INTEGER,
      pdfbased INTEGER DEFAULT 0,
      difficulty TEXT,
      selectedoption TEXT,
      correctoption TEXT,
      ismcq INTEGER DEFAULT 0,
      questiontype TEXT,
      username TEXT,
      topic TEXT
    )`,

    `CREATE TABLE IF NOT EXISTS uploaded_files (
      id SERIAL PRIMARY KEY,
      fileid TEXT UNIQUE,
      originalfilename TEXT,
      filepath TEXT,
      filesize INTEGER,
      uploadtime TEXT DEFAULT NOW(),
      extractedtext TEXT,
      totalchunks INTEGER,
      status TEXT DEFAULT 'processing',
      subject TEXT,
      uploadmode TEXT,
      questiontype TEXT
    )`,

    `CREATE TABLE IF NOT EXISTS pdf_chunks (
      id SERIAL PRIMARY KEY,
      fileid TEXT,
      chunkindex INTEGER,
      chunktext TEXT,
      keyconcepts TEXT,
      chunktype TEXT,
      wordcount INTEGER
    )`,

    `CREATE TABLE IF NOT EXISTS cached_questions (
      id SERIAL PRIMARY KEY,
      fileid TEXT,
      question TEXT,
      difficulty TEXT,
      difficultyemoji TEXT,
      chunkindex INTEGER,
      totalchunks INTEGER,
      chunktype TEXT,
      pdffilename TEXT,
      pdfbased INTEGER DEFAULT 1,
      source TEXT DEFAULT 'pdf-ai',
      generatedat TIMESTAMP DEFAULT NOW()
    )`,

    `CREATE TABLE IF NOT EXISTS mcq_performance (
      id SERIAL PRIMARY KEY,
      sessionid TEXT NOT NULL,
      question TEXT NOT NULL,
      optionsjson TEXT NOT NULL,
      correctoption TEXT NOT NULL,
      useranswer TEXT NOT NULL,
      iscorrect BOOLEAN NOT NULL,
      timestamp TEXT DEFAULT NOW(),
      reviewcount INTEGER DEFAULT 0,
      lastreviewedat TEXT,
      difficulty TEXT DEFAULT 'medium',
      markedforremoval BOOLEAN DEFAULT FALSE,
      topic TEXT,
      subtopic TEXT
    )`,

    `CREATE TABLE IF NOT EXISTS topic_performance (
      id SERIAL PRIMARY KEY,
      sessionid TEXT NOT NULL,
      topic TEXT NOT NULL,
      subtopic TEXT,
      total_attempts INTEGER DEFAULT 0,
      correct_attempts INTEGER DEFAULT 0,
      accuracy REAL DEFAULT 0,
      last_attempted TEXT,
      UNIQUE(sessionid, topic, subtopic)
    )`,

    `CREATE TABLE IF NOT EXISTS user_stats (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      total_attempted INTEGER DEFAULT 0,
      correct INTEGER DEFAULT 0,
      wrong INTEGER DEFAULT 0,
      accuracy_percent REAL DEFAULT 0,
      topics_performance TEXT DEFAULT '{}',
      last_session_id TEXT,
      last_updated TEXT DEFAULT NOW(),
      created_at TEXT DEFAULT NOW()
    )`,

    // ── Library tables ──────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS library_questions (
      id SERIAL PRIMARY KEY,
      subject TEXT,
      question TEXT UNIQUE,
      perfect_answer TEXT,
      difficulty TEXT,
      tags TEXT,
      source_type TEXT DEFAULT 'pdf-ai',
      source_pdf TEXT,
      created_date TEXT DEFAULT NOW(),
      usage_count INTEGER DEFAULT 0,
      rating REAL DEFAULT 0.0,
      questiontype TEXT DEFAULT 'long-form',
      mcqoptions TEXT,
      correctoption TEXT
    )`,

    `CREATE TABLE IF NOT EXISTS library_metadata (
      id SERIAL PRIMARY KEY,
      store_date TEXT DEFAULT NOW(),
      total_questions INTEGER DEFAULT 0,
      total_subjects TEXT,
      last_updated TEXT,
      ai_availability_status TEXT DEFAULT 'available'
    )`,

    `CREATE TABLE IF NOT EXISTS mcq_questions (
      id TEXT PRIMARY KEY,
      question TEXT NOT NULL,
      optiona TEXT NOT NULL,
      optionb TEXT NOT NULL,
      optionc TEXT NOT NULL,
      optiond TEXT NOT NULL,
      correctoption TEXT NOT NULL,
      choice_type TEXT DEFAULT 'single',
      subject TEXT,
      topic TEXT,
      difficulty TEXT DEFAULT 'medium',
      explanation TEXT,
      source_type TEXT DEFAULT 'csv',
      created_date TEXT DEFAULT NOW()
    )`
  ];

  for (const sql of tables) {
    try {
      await pool.none(sql);
    } catch (err) {
      if (!err.message.includes('already exists')) {
        console.error('❌ Table creation error:', err.message);
      }
    }
  }

  // Seed library_metadata row if empty
  try {
    await pool.none(
      `INSERT INTO library_metadata (id, total_questions, last_updated)
       VALUES (1, 0, NOW())
       ON CONFLICT (id) DO NOTHING`
    );
  } catch (err) {
    // Ignore
  }

  console.log('✅ PostgreSQL tables ready');
}

// ── Module export ────────────────────────────────────────────────────────────

const db = {
  run,
  get,
  all,
  serialize,
  runAsync,
  getAsync,
  allAsync,
  init,
  pool
};

module.exports = db;
