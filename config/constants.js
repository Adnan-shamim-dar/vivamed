/**
 * Central configuration file for all constants
 * Allows easy customization without code changes
 */

module.exports = {
  // Server
  PORT: process.env.PORT || 9997,

  // Directories
  UPLOAD_DIR: './uploads',
  DATA_DIR: './data',

  // Database paths
  PROGRESS_DB: './data/progress.db',
  LIBRARY_DB: './data/library.db',

  // AI API
  AI_TIMEOUT_MS: 30000,
  AI_RETRY_ATTEMPTS: 3,
  AI_RETRY_BACKOFF_MS: 500,
  MAX_UPLOAD_SIZE: 10 * 1024 * 1024, // 10MB

  // MCQ settings (Duolingo-style)
  MCQ_REVISION_PERCENTAGE: 0.30, // 30% revision questions
  MCQ_NEW_PERCENTAGE: 0.70,      // 70% new questions
  MCQ_REVISION_LIMIT: 2,         // Max times to review same question

  // Question generation settings
  BATCH_QUESTION_COUNT: 18,
  EASY_PERCENTAGE: 0.33,
  MEDIUM_PERCENTAGE: 0.34,
  HARD_PERCENTAGE: 0.33,

  // PDF settings
  PDF_CHUNK_MIN_WORDS: 500,
  PDF_CHUNK_MAX_WORDS: 1000,

  // Library/Cache settings
  SIMILARITY_THRESHOLD: 0.7,
  MAX_FALLBACK_ATTEMPTS: 3
};
