/**
 * PostgreSQL Database Schema Definitions
 * Converted from SQLite with:
 * - Column names: lowercase
 * - Placeholders: $1, $2, $3...
 * - AUTOINCREMENT → SERIAL
 * - INSERT OR IGNORE → INSERT...ON CONFLICT DO NOTHING
 */

/**
 * Initialize progress database tables
 */
async function createProgressTables(pool) {
  const tables = [
    // Core sessions table
    `CREATE TABLE IF NOT EXISTS sessions (
      id SERIAL PRIMARY KEY,
      sessionid TEXT UNIQUE,
      mode TEXT,
      starttime TEXT,
      createdat TEXT DEFAULT CURRENT_TIMESTAMP,
      fileid TEXT,
      lastchunkindex INTEGER DEFAULT 0,
      correctanswers INTEGER DEFAULT 0,
      wronganswers INTEGER DEFAULT 0,
      totalattempts INTEGER DEFAULT 0,
      username TEXT,
      recentquestions TEXT DEFAULT '[]'
    )`,

    // Question attempts table
    `CREATE TABLE IF NOT EXISTS attempts (
      id SERIAL PRIMARY KEY,
      sessionid TEXT,
      questionindex INTEGER,
      question TEXT,
      answer TEXT,
      score INTEGER,
      source TEXT,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
      chunkindex INTEGER,
      pdfbased INTEGER DEFAULT 0,
      difficulty TEXT,
      selectedoption TEXT,
      correctoption TEXT,
      ismcq INTEGER DEFAULT 0,
      questiontype TEXT,
      username TEXT,
      topic TEXT,
      FOREIGN KEY(sessionid) REFERENCES sessions(sessionid)
    )`,

    // Uploaded PDF files metadata
    `CREATE TABLE IF NOT EXISTS uploaded_files (
      id SERIAL PRIMARY KEY,
      fileid TEXT UNIQUE,
      originalfilename TEXT,
      filepath TEXT,
      filesize INTEGER,
      uploadtime TEXT DEFAULT CURRENT_TIMESTAMP,
      extractedtext TEXT,
      totalchunks INTEGER,
      status TEXT DEFAULT 'processing',
      subject TEXT,
      uploadmode TEXT,
      questiontype TEXT
    )`,

    // Intelligent PDF chunks
    `CREATE TABLE IF NOT EXISTS pdf_chunks (
      id SERIAL PRIMARY KEY,
      fileid TEXT,
      chunkindex INTEGER,
      chunktext TEXT,
      keyconcepts TEXT,
      chunktype TEXT,
      wordcount INTEGER,
      FOREIGN KEY(fileid) REFERENCES uploaded_files(fileid)
    )`,

    // Cached pre-generated questions
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
      generatedat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(fileid) REFERENCES uploaded_files(fileid)
    )`,

    // MCQ performance tracking (Duolingo-style learning engine)
    `CREATE TABLE IF NOT EXISTS mcq_performance (
      id SERIAL PRIMARY KEY,
      sessionid TEXT NOT NULL,
      question TEXT NOT NULL,
      optionsjson TEXT NOT NULL,
      correctoption TEXT NOT NULL,
      useranswer TEXT NOT NULL,
      iscorrect BOOLEAN NOT NULL,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
      reviewcount INTEGER DEFAULT 0,
      lastreviewedat TEXT,
      difficulty TEXT DEFAULT 'medium',
      markedforremoval BOOLEAN DEFAULT 0,
      topic TEXT,
      subtopic TEXT,
      FOREIGN KEY(sessionid) REFERENCES sessions(sessionid)
    )`,

    // Topic performance tracking (Adaptive learning system)
    `CREATE TABLE IF NOT EXISTS topic_performance (
      id SERIAL PRIMARY KEY,
      sessionid TEXT NOT NULL,
      topic TEXT NOT NULL,
      subtopic TEXT,
      total_attempts INTEGER DEFAULT 0,
      correct_attempts INTEGER DEFAULT 0,
      accuracy REAL DEFAULT 0,
      last_attempted TEXT,
      UNIQUE(sessionid, topic, subtopic),
      FOREIGN KEY(sessionid) REFERENCES sessions(sessionid)
    )`,

    // User statistics - Aggregated cross-session tracking
    `CREATE TABLE IF NOT EXISTS user_stats (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      total_attempted INTEGER DEFAULT 0,
      correct INTEGER DEFAULT 0,
      wrong INTEGER DEFAULT 0,
      accuracy_percent REAL DEFAULT 0,
      topics_performance TEXT DEFAULT '{}',
      last_session_id TEXT,
      last_updated TEXT DEFAULT CURRENT_TIMESTAMP,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,

    // MCQ questions from dataset
    `CREATE TABLE IF NOT EXISTS mcq_questions (
      id SERIAL PRIMARY KEY,
      question TEXT UNIQUE,
      options TEXT NOT NULL,
      correctoptions TEXT NOT NULL,
      difficulty TEXT DEFAULT 'medium',
      subject TEXT DEFAULT 'General',
      createdat TEXT DEFAULT CURRENT_TIMESTAMP
    )`
  ];

  for (const sql of tables) {
    try {
      await pool.query(sql);
    } catch (error) {
      if (!error.message.includes('already exists')) {
        console.error('❌ Schema error:', error.message);
      }
    }
  }
}

/**
 * Initialize library database tables
 */
async function createLibraryTables(pool) {
  const tables = [
    // Library questions storage
    `CREATE TABLE IF NOT EXISTS library_questions (
      id SERIAL PRIMARY KEY,
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
      questiontype TEXT DEFAULT 'long-form',
      mcqoptions TEXT,
      correctoption TEXT
    )`,

    // Library metadata and statistics
    `CREATE TABLE IF NOT EXISTS library_metadata (
      id SERIAL PRIMARY KEY,
      store_date TEXT DEFAULT CURRENT_TIMESTAMP,
      total_questions INTEGER DEFAULT 0,
      total_subjects TEXT,
      last_updated TEXT,
      ai_availability_status TEXT DEFAULT 'available'
    )`
  ];

  for (const sql of tables) {
    try {
      await pool.query(sql);
    } catch (error) {
      if (!error.message.includes('already exists')) {
        console.error('❌ Schema error:', error.message);
      }
    }
  }

  // Initialize metadata if empty
  try {
    await pool.query(
      `INSERT INTO library_metadata (id, total_questions, last_updated)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (id) DO NOTHING`,
      [1, 0]
    );
  } catch (error) {
    if (!error.message.includes('duplicate')) {
      console.error('❌ Metadata insertion error:', error.message);
    }
  }
}

module.exports = {
  createProgressTables,
  createLibraryTables
};
