/**
 * Database Schema Definitions
 * Supports both SQLite (local development) and PostgreSQL (production/Railway)
 */

/**
 * Detect database type (SQLite vs PostgreSQL)
 */
function isPostgres(db) {
  // PostgreSQL client (from pg pool) has query method
  return typeof db.query === 'function' && !db.run;
}

/**
 * Initialize progress database tables
 */
async function createProgressTables(db) {
  const isPostgresDB = isPostgres(db);

  // Define tables with variations for SQLite vs PostgreSQL
  const tables = [
    // Core sessions table
    `CREATE TABLE IF NOT EXISTS sessions (
      ${isPostgresDB ? 'id SERIAL PRIMARY KEY,' : 'id INTEGER PRIMARY KEY AUTOINCREMENT,'}
      sessionId TEXT UNIQUE,
      mode TEXT,
      startTime TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      fileId TEXT,
      lastChunkIndex INTEGER DEFAULT 0,
      correctAnswers INTEGER DEFAULT 0,
      wrongAnswers INTEGER DEFAULT 0,
      totalAttempts INTEGER DEFAULT 0,
      username TEXT,
      recentQuestions TEXT DEFAULT '[]'
    )`,

    // Question attempts table
    `CREATE TABLE IF NOT EXISTS attempts (
      ${isPostgresDB ? 'id SERIAL PRIMARY KEY,' : 'id INTEGER PRIMARY KEY AUTOINCREMENT,'}
      sessionId TEXT,
      questionIndex INTEGER,
      question TEXT,
      answer TEXT,
      score INTEGER,
      source TEXT,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
      chunkIndex INTEGER,
      pdfBased INTEGER DEFAULT 0,
      difficulty TEXT,
      selectedOption TEXT,
      correctOption TEXT,
      isMCQ INTEGER DEFAULT 0,
      questionType TEXT,
      username TEXT,
      topic TEXT,
      FOREIGN KEY(sessionId) REFERENCES sessions(sessionId)
    )`,

    // Uploaded PDF files metadata
    `CREATE TABLE IF NOT EXISTS uploaded_files (
      ${isPostgresDB ? 'id SERIAL PRIMARY KEY,' : 'id INTEGER PRIMARY KEY AUTOINCREMENT,'}
      fileId TEXT UNIQUE,
      originalFilename TEXT,
      filePath TEXT,
      fileSize INTEGER,
      uploadTime TEXT DEFAULT CURRENT_TIMESTAMP,
      extractedText TEXT,
      totalChunks INTEGER,
      status TEXT DEFAULT 'processing',
      subject TEXT,
      uploadMode TEXT,
      questionType TEXT
    )`,

    // Intelligent PDF chunks
    `CREATE TABLE IF NOT EXISTS pdf_chunks (
      ${isPostgresDB ? 'id SERIAL PRIMARY KEY,' : 'id INTEGER PRIMARY KEY AUTOINCREMENT,'}
      fileId TEXT,
      chunkIndex INTEGER,
      chunkText TEXT,
      keyConcepts TEXT,
      chunkType TEXT,
      wordCount INTEGER,
      FOREIGN KEY(fileId) REFERENCES uploaded_files(fileId)
    )`,

    // Cached pre-generated questions
    `CREATE TABLE IF NOT EXISTS cached_questions (
      ${isPostgresDB ? 'id SERIAL PRIMARY KEY,' : 'id INTEGER PRIMARY KEY AUTOINCREMENT,'}
      fileId TEXT,
      question TEXT,
      difficulty TEXT,
      difficultyEmoji TEXT,
      chunkIndex INTEGER,
      totalChunks INTEGER,
      chunkType TEXT,
      pdfFilename TEXT,
      pdfBased INTEGER DEFAULT 1,
      source TEXT DEFAULT 'pdf-ai',
      generatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(fileId) REFERENCES uploaded_files(fileId)
    )`,

    // MCQ performance tracking
    `CREATE TABLE IF NOT EXISTS mcq_performance (
      ${isPostgresDB ? 'id SERIAL PRIMARY KEY,' : 'id INTEGER PRIMARY KEY AUTOINCREMENT,'}
      sessionId TEXT NOT NULL,
      question TEXT NOT NULL,
      optionsJSON TEXT NOT NULL,
      correctOption TEXT NOT NULL,
      userAnswer TEXT NOT NULL,
      isCorrect BOOLEAN NOT NULL,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
      reviewCount INTEGER DEFAULT 0,
      lastReviewedAt TEXT,
      difficulty TEXT DEFAULT 'medium',
      markedForRemoval BOOLEAN DEFAULT 0,
      topic TEXT,
      subtopic TEXT,
      FOREIGN KEY(sessionId) REFERENCES sessions(sessionId)
    )`,

    // Topic performance tracking
    `CREATE TABLE IF NOT EXISTS topic_performance (
      ${isPostgresDB ? 'id SERIAL PRIMARY KEY,' : 'id INTEGER PRIMARY KEY AUTOINCREMENT,'}
      sessionId TEXT NOT NULL,
      topic TEXT NOT NULL,
      subtopic TEXT,
      total_attempts INTEGER DEFAULT 0,
      correct_attempts INTEGER DEFAULT 0,
      accuracy REAL DEFAULT 0,
      last_attempted TEXT,
      UNIQUE(sessionId, topic, subtopic),
      FOREIGN KEY(sessionId) REFERENCES sessions(sessionId)
    )`,

    // User statistics
    `CREATE TABLE IF NOT EXISTS user_stats (
      ${isPostgresDB ? 'id SERIAL PRIMARY KEY,' : 'id INTEGER PRIMARY KEY AUTOINCREMENT,'}
      username TEXT UNIQUE NOT NULL,
      total_attempted INTEGER DEFAULT 0,
      correct INTEGER DEFAULT 0,
      wrong INTEGER DEFAULT 0,
      accuracy_percent REAL DEFAULT 0,
      topics_performance TEXT DEFAULT '{}',
      last_session_id TEXT,
      last_updated TEXT DEFAULT CURRENT_TIMESTAMP,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`
  ];

  for (const sql of tables) {
    await runAsync(db, sql, isPostgresDB);
  }

  // Add MCQ questions table if needed
  const mcqTableSql = `CREATE TABLE IF NOT EXISTS mcq_questions (
    ${isPostgresDB ? 'id SERIAL PRIMARY KEY,' : 'id INTEGER PRIMARY KEY AUTOINCREMENT,'}
    question TEXT NOT NULL UNIQUE,
    options TEXT NOT NULL,
    correctAnswer TEXT NOT NULL,
    difficulty TEXT,
    subject TEXT,
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP
  )`;
  await runAsync(db, mcqTableSql, isPostgresDB);
}

/**
 * Initialize library database tables
 */
async function createLibraryTables(db) {
  const isPostgresDB = isPostgres(db);

  const tables = [
    // Library questions storage
    `CREATE TABLE IF NOT EXISTS library_questions (
      ${isPostgresDB ? 'id SERIAL PRIMARY KEY,' : 'id INTEGER PRIMARY KEY AUTOINCREMENT,'}
      subject TEXT,
      question TEXT UNIQUE,
      perfect_answer TEXT,
      difficulty TEXT,
      tags TEXT,
      source_type TEXT DEFAULT 'pdf-ai',
      source_pdf TEXT,
      created_date TEXT DEFAULT CURRENT_TIMESTAMP,
      usage_count INTEGER DEFAULT 0,
      rating REAL DEFAULT 0.0,
      questionType TEXT DEFAULT 'long-form',
      mcqOptions TEXT,
      correctOption TEXT
    )`,

    // Library metadata and statistics
    `CREATE TABLE IF NOT EXISTS library_metadata (
      ${isPostgresDB ? 'id SERIAL PRIMARY KEY,' : 'id INTEGER PRIMARY KEY AUTOINCREMENT,'}
      store_date TEXT DEFAULT CURRENT_TIMESTAMP,
      total_questions INTEGER DEFAULT 0,
      total_subjects TEXT,
      last_updated TEXT,
      ai_availability_status TEXT DEFAULT 'available'
    )`
  ];

  for (const sql of tables) {
    await runAsync(db, sql, isPostgresDB);
  }

  // Initialize metadata if empty
  const initMetadata = isPostgresDB
    ? `INSERT INTO library_metadata (id, total_questions, last_updated)
       VALUES (1, 0, CURRENT_TIMESTAMP)
       ON CONFLICT (id) DO NOTHING`
    : `INSERT OR IGNORE INTO library_metadata (id, total_questions, last_updated)
       VALUES (1, 0, CURRENT_TIMESTAMP)`;

  await runAsync(db, initMetadata, isPostgresDB, true);
}

/**
 * Helper: Run async wrapper with support for both SQLite and PostgreSQL
 */
async function runAsync(db, sql, isPostgresDB = false, suppressErrors = false) {
  try {
    if (isPostgresDB) {
      // PostgreSQL: use promise-based query
      await db.query(sql);
    } else {
      // SQLite: use callback-based run
      return new Promise((resolve) => {
        db.run(sql, (err) => {
          if (err) {
            if (!suppressErrors &&
                !err.message.includes('duplicate column') &&
                !err.message.includes('already exists') &&
                !err.message.includes('UNIQUE constraint failed') &&
                !err.message.includes('duplicate key')) {
              console.error('❌ Schema error:', err.message);
            }
          }
          resolve();
        });
      });
    }
  } catch (error) {
    if (!suppressErrors &&
        !error.message.includes('duplicate column') &&
        !error.message.includes('already exists') &&
        !error.message.includes('UNIQUE constraint failed') &&
        !error.message.includes('duplicate key')) {
      console.error('❌ Schema error:', error.message);
    }
  }
}

module.exports = {
  createProgressTables,
  createLibraryTables
};
