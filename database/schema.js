/**
 * Database Schema Definitions
 * Extracted from original server.js - EXACT SAME STRUCTURE
 * All CREATE TABLE statements in one place
 */

/**
 * Initialize progress database tables
 */
async function createProgressTables(db) {
  const tables = [
    // Core sessions table
    `CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sessionId TEXT UNIQUE,
      mode TEXT,
      startTime TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      fileId TEXT,
      lastChunkIndex INTEGER DEFAULT 0,
      correctAnswers INTEGER DEFAULT 0,
      wrongAnswers INTEGER DEFAULT 0,
      totalAttempts INTEGER DEFAULT 0
    )`,

    // Question attempts table
    `CREATE TABLE IF NOT EXISTS attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      FOREIGN KEY(sessionId) REFERENCES sessions(sessionId)
    )`,

    // Uploaded PDF files metadata
    `CREATE TABLE IF NOT EXISTS uploaded_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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

    // MCQ performance tracking (Duolingo-style learning engine)
    `CREATE TABLE IF NOT EXISTS mcq_performance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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

    // Topic performance tracking (Adaptive learning system)
    `CREATE TABLE IF NOT EXISTS topic_performance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sessionId TEXT NOT NULL,
      topic TEXT NOT NULL,
      subtopic TEXT,
      total_attempts INTEGER DEFAULT 0,
      correct_attempts INTEGER DEFAULT 0,
      accuracy REAL DEFAULT 0,
      last_attempted TEXT,
      UNIQUE(sessionId, topic, subtopic),
      FOREIGN KEY(sessionId) REFERENCES sessions(sessionId)
    )`
  ];

  for (const sql of tables) {
    await runAsync(db, sql);
  }

  // Add ALTER TABLE columns (handle if they already exist)
  const alterStatements = [
    `ALTER TABLE sessions ADD COLUMN fileId TEXT`,
    `ALTER TABLE sessions ADD COLUMN lastChunkIndex INTEGER DEFAULT 0`,
    `ALTER TABLE sessions ADD COLUMN correctAnswers INTEGER DEFAULT 0`,
    `ALTER TABLE sessions ADD COLUMN wrongAnswers INTEGER DEFAULT 0`,
    `ALTER TABLE sessions ADD COLUMN totalAttempts INTEGER DEFAULT 0`,
    `ALTER TABLE attempts ADD COLUMN chunkIndex INTEGER`,
    `ALTER TABLE attempts ADD COLUMN pdfBased INTEGER DEFAULT 0`,
    `ALTER TABLE attempts ADD COLUMN difficulty TEXT`,
    `ALTER TABLE attempts ADD COLUMN selectedOption TEXT`,
    `ALTER TABLE attempts ADD COLUMN correctOption TEXT`,
    `ALTER TABLE attempts ADD COLUMN isMCQ INTEGER DEFAULT 0`,
    `ALTER TABLE attempts ADD COLUMN questionType TEXT`,
    `ALTER TABLE mcq_performance ADD COLUMN topic TEXT`,
    `ALTER TABLE mcq_performance ADD COLUMN subtopic TEXT`
  ];

  for (const sql of alterStatements) {
    await runAsync(db, sql, true); // true = suppress errors for duplicate columns
  }
}

/**
 * Initialize library database tables
 */
async function createLibraryTables(db) {
  const tables = [
    // Library questions storage
    `CREATE TABLE IF NOT EXISTS library_questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_date TEXT DEFAULT CURRENT_TIMESTAMP,
      total_questions INTEGER DEFAULT 0,
      total_subjects TEXT,
      last_updated TEXT,
      ai_availability_status TEXT DEFAULT 'available'
    )`
  ];

  for (const sql of tables) {
    await runAsync(db, sql);
  }

  // Initialize metadata if empty
  await runAsync(db, `
    INSERT OR IGNORE INTO library_metadata (id, total_questions, last_updated)
    VALUES (1, 0, CURRENT_TIMESTAMP)
  `);

  // Add MCQ-specific columns (handle if they already exist)
  const alterStatements = [
    `ALTER TABLE library_questions ADD COLUMN questionType TEXT DEFAULT 'long-form'`,
    `ALTER TABLE library_questions ADD COLUMN mcqOptions TEXT`,
    `ALTER TABLE library_questions ADD COLUMN correctOption TEXT`
  ];

  for (const sql of alterStatements) {
    await runAsync(db, sql, true); // true = suppress errors
  }
}

/**
 * Helper: Run async wrapper for db.run with error handling
 */
function runAsync(db, sql, suppressErrors = false) {
  return new Promise((resolve) => {
    db.run(sql, (err) => {
      if (err) {
        if (!suppressErrors && !err.message.includes('duplicate column') && !err.message.includes('already exists')) {
          console.error('❌ Schema error:', err.message);
        }
      }
      resolve();
    });
  });
}

module.exports = {
  createProgressTables,
  createLibraryTables
};
