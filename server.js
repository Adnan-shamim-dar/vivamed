require('dotenv').config()
console.log('🔥 SERVER.JS LOADED - VERSION 3')
const express = require("express")
const { initDb, saveDb, DbWrapper } = require('./db-wrapper')
const sqlite3 = require('sqlite3').verbose()
const multer = require('multer')
const pdfParse = require('pdf-parse')
const fs = require('fs').promises
const fsSync = require('fs')
const path = require('path')
const learningService = require('./services/learningService')
const app = express()

app.use(express.json())

// ========================================
// SERVER VERSION TRACKING - Detect Stale Code
// ========================================
const GIT_HASH = (() => {
  try {
    return require('child_process')
      .execSync('git rev-parse --short HEAD 2>/dev/null')
      .toString()
      .trim();
  } catch {
    return 'unknown';
  }
})();

const SERVER_VERSION = {
  startTime: new Date().toISOString(),
  codeHash: GIT_HASH,
  nodeVersion: process.version,
  uptime: 0
};

console.log(`📌 Server Version: ${GIT_HASH}`);
console.log(`📌 Started at: ${SERVER_VERSION.startTime}`);

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY

// Check if API key is loaded
if (!OPENROUTER_API_KEY) {
  console.warn('⚠️  WARNING: OPENROUTER_API_KEY not found in .env file!');
  console.warn('⚠️  Questions will use local fallback instead of AI');
} else {
  console.log('✅ API Key loaded: ' + OPENROUTER_API_KEY.substring(0, 20) + '...');
}

// ========================================
// AI MODEL CONFIGURATION - ABSTRACTION LAYER
// ========================================
// Switch models here for faster inference testing
// Test candidates: 'stepfun/step-3.5-flash', 'mistral-7b', 'gpt-3.5-turbo', 'gpt-4o'

const CONFIG_KEYS = Object.freeze({
  QUESTION_GENERATION: 'questionGeneration',
  MCQ_GENERATION: 'mcqGeneration',
  EVALUATION: 'evaluation',
  PERFECT_ANSWER: 'perfectAnswer'
});

const DEFAULT_MODEL = 'arcee-ai/trinity-large-preview:free';
const SELECTED_MODEL = process.env.AI_MODEL || DEFAULT_MODEL;

const AI_MODEL_CONFIG = {
  [CONFIG_KEYS.QUESTION_GENERATION]: {
    model: SELECTED_MODEL,
    temperature: 0.8,
    maxTokens: 250
  },
  [CONFIG_KEYS.MCQ_GENERATION]: {
    model: SELECTED_MODEL,
    temperature: 0.8,
    maxTokens: 400
  },
  [CONFIG_KEYS.EVALUATION]: {
    model: SELECTED_MODEL,
    temperature: 0.7,
    maxTokens: 350
  },
  [CONFIG_KEYS.PERFECT_ANSWER]: {
    model: SELECTED_MODEL,
    temperature: 0.5,
    maxTokens: 300
  }
};

console.log(`🤖 AI Model: ${SELECTED_MODEL}`);

// Helper function to make OpenRouter API calls with current model configuration
async function callOpenRouterAPI(prompt, configKey = CONFIG_KEYS.QUESTION_GENERATION, timeoutMs = 30000) {
  if (!OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY not set");
  }

  // Validate configKey to prevent silent fallbacks
  if (!AI_MODEL_CONFIG[configKey]) {
    const validKeys = Object.values(CONFIG_KEYS).join(', ');
    throw new Error(`Invalid configKey: "${configKey}". Valid keys: ${validKeys}`);
  }

  const config = AI_MODEL_CONFIG[configKey];

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: config.temperature,
        max_tokens: config.maxTokens
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutHandle);

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`API error ${response.status}: ${err.substring(0, 200)}`);
    }

    const data = await response.json();
    const message = data.choices?.[0]?.message;

    // Prefer content field, but accept reasoning as fallback
    let content = message?.content || message?.reasoning;

    if (!content) {
      throw new Error('Empty response from API');
    }

    return content;
  } catch (error) {
    clearTimeout(timeoutHandle);
    if (error.name === 'AbortError') {
      throw new Error(`API request timeout after ${timeoutMs}ms`);
    }
    throw error;
  }
}

// Helper to avoid redundant timeout code
async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

let db = null;
let libraryDb = null; // Will use native sqlite3 instead of sql.js

// Initialize both databases
async function setupDatabase() {
  try {
    // Initialize main database with sql.js
    await initDb('progress');
    db = new DbWrapper('progress');
    console.log('✅ Main database connected');

    // Create all tables for main database
    createMainDatabaseTables();

    // Initialize library database with NATIVE SQLITE3 (not sql.js)
    const libraryPath = path.join(__dirname, 'data', 'library.db');
    libraryDb = new sqlite3.Database(libraryPath, (err) => {
      if (err) {
        console.error('❌ Library database error:', err.message);
      } else {
        console.log('✅ Library database connected (native sqlite3)');
        // Enable WAL mode for better concurrency
        libraryDb.run('PRAGMA journal_mode = WAL');
      }
    });

    // Create all tables for library database (using native sqlite3)
    createLibraryDatabaseTables();

    return true;
  } catch (err) {
    console.error('❌ Database error:', err);
    return false;
  }
}

// Create main database tables
function createMainDatabaseTables() {
  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sessionId TEXT UNIQUE,
      mode TEXT,
      startTime TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sessionId TEXT,
      questionIndex INTEGER,
      question TEXT,
      answer TEXT,
      score INTEGER,
      source TEXT,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(sessionId) REFERENCES sessions(sessionId)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS uploaded_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fileId TEXT UNIQUE,
      originalFilename TEXT,
      filePath TEXT,
      fileSize INTEGER,
      uploadTime TEXT DEFAULT CURRENT_TIMESTAMP,
      extractedText TEXT,
      totalChunks INTEGER,
      status TEXT DEFAULT 'processing'
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS pdf_chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fileId TEXT,
      chunkIndex INTEGER,
      chunkText TEXT,
      keyConcepts TEXT,
      chunkType TEXT,
      wordCount INTEGER,
      FOREIGN KEY(fileId) REFERENCES uploaded_files(fileId)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS cached_questions (
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
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS mcq_performance (
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
      FOREIGN KEY(sessionId) REFERENCES sessions(sessionId)
    )
  `);

  db.run(`ALTER TABLE sessions ADD COLUMN fileId TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('Error adding fileId to sessions:', err.message);
    }
  });

  db.run(`ALTER TABLE sessions ADD COLUMN lastChunkIndex INTEGER DEFAULT 0`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('Error adding lastChunkIndex to sessions:', err.message);
    }
  });

  db.run(`ALTER TABLE sessions ADD COLUMN correctAnswers INTEGER DEFAULT 0`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('Error adding correctAnswers to sessions:', err.message);
    }
  });

  db.run(`ALTER TABLE sessions ADD COLUMN wrongAnswers INTEGER DEFAULT 0`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('Error adding wrongAnswers to sessions:', err.message);
    }
  });

  db.run(`ALTER TABLE sessions ADD COLUMN totalAttempts INTEGER DEFAULT 0`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('Error adding totalAttempts to sessions:', err.message);
    }
  });

  db.run(`ALTER TABLE attempts ADD COLUMN chunkIndex INTEGER`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('Error adding chunkIndex to attempts:', err.message);
    }
  });

  db.run(`ALTER TABLE attempts ADD COLUMN pdfBased INTEGER DEFAULT 0`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('Error adding pdfBased to attempts:', err.message);
    }
  });

  db.run(`ALTER TABLE attempts ADD COLUMN difficulty TEXT DEFAULT 'medium'`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('Error adding difficulty to attempts:', err.message);
    }
  });

  db.run(`ALTER TABLE uploaded_files ADD COLUMN subject TEXT DEFAULT 'General'`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('Error adding subject to uploaded_files:', err.message);
    }
  });

  db.run(`ALTER TABLE attempts ADD COLUMN selectedOption TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('Error adding selectedOption to attempts:', err.message);
    }
  });

  db.run(`ALTER TABLE attempts ADD COLUMN correctOption TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('Error adding correctOption to attempts:', err.message);
    }
  });

  db.run(`ALTER TABLE attempts ADD COLUMN isMCQ BOOLEAN DEFAULT 0`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('Error adding isMCQ to attempts:', err.message);
    }
  });

  db.run(`ALTER TABLE attempts ADD COLUMN questionType TEXT DEFAULT 'long-form'`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('Error adding questionType to attempts:', err.message);
    }
  });

  db.run(`ALTER TABLE uploaded_files ADD COLUMN uploadMode TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('Error adding uploadMode to uploaded_files:', err.message);
    }
  });

  db.run(`ALTER TABLE uploaded_files ADD COLUMN questionType TEXT DEFAULT 'long-form'`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('Error adding questionType to uploaded_files:', err.message);
    }
  });

  db.run(`
    CREATE TABLE IF NOT EXISTS user_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      total_attempted INTEGER DEFAULT 0,
      correct INTEGER DEFAULT 0,
      wrong INTEGER DEFAULT 0,
      accuracy_percent REAL DEFAULT 0,
      topics_performance TEXT DEFAULT '{}',
      last_session_id TEXT,
      last_updated TEXT DEFAULT CURRENT_TIMESTAMP,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err && !err.message.includes('already exists')) {
      console.error('Error creating user_stats table:', err.message);
    }
  });

  db.run(`ALTER TABLE sessions ADD COLUMN username TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      // Silently ignore if column already exists
    }
  });

  db.run(`ALTER TABLE attempts ADD COLUMN username TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      // Silently ignore if column already exists
    }
  });

  db.run(`ALTER TABLE attempts ADD COLUMN topic TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      // Silently ignore if column already exists
    }
  });

  console.log('📊 Database tables ready (including PDF support and MCQ support)');
}

// Create library database tables
function createLibraryDatabaseTables() {
  libraryDb.run(`
    CREATE TABLE IF NOT EXISTS library_questions (
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
      rating REAL DEFAULT 0.0
    )
  `);

  libraryDb.run(`ALTER TABLE library_questions ADD COLUMN questionType TEXT DEFAULT 'long-form'`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('Error adding questionType to library_questions:', err.message);
    }
  });

  libraryDb.run(`ALTER TABLE library_questions ADD COLUMN mcqOptions TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('Error adding mcqOptions to library_questions:', err.message);
    }
  });

  libraryDb.run(`ALTER TABLE library_questions ADD COLUMN correctOption TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('Error adding correctOption to library_questions:', err.message);
    }
  });

  libraryDb.run(`
    CREATE TABLE IF NOT EXISTS library_metadata (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_date TEXT DEFAULT CURRENT_TIMESTAMP,
      total_questions INTEGER DEFAULT 0,
      total_subjects TEXT,
      last_updated TEXT,
      ai_availability_status TEXT DEFAULT 'available'
    )
  `);

  libraryDb.run(`
    INSERT OR IGNORE INTO library_metadata (id, total_questions, last_updated)
    VALUES (1, 0, CURRENT_TIMESTAMP)
  `);

  console.log('📚 Library database tables ready');
}


// ========================================
// QUESTION BANK
// ========================================
const questionBank = [
  {
    question: "Explain the action potential and describe the phases involved in cardiac muscle contraction.",
    followUp: "What ion channels are responsible for each phase?",
    difficulty: "medium"
  },
  {
    question: "Describe Starling's Law of the Heart and its physiological significance.",
    followUp: "How does end-diastolic volume affect cardiac output?",
    difficulty: "medium"
  },
  {
    question: "What are the causes and mechanisms of metabolic acidosis?",
    followUp: "How does the body compensate for metabolic acidosis?",
    difficulty: "easy"
  },
  {
    question: "Explain the renin-angiotensin-aldosterone system and its role in blood pressure regulation.",
    followUp: "What happens when this system is inhibited by ACE inhibitors?",
    difficulty: "hard"
  },
  {
    question: "Describe the phases of the cardiac cycle and corresponding pressure changes.",
    followUp: "What pathological conditions affect these pressure relationships?",
    difficulty: "hard"
  },
  {
    question: "Explain the Frank-Starling mechanism at the molecular level.",
    followUp: "How does calcium sensitivity change with sarcomere length?",
    difficulty: "hard"
  },
  {
    question: "What is the role of the parasympathetic nervous system in cardiac regulation?",
    followUp: "What effects does acetylcholine have on AV node conduction?",
    difficulty: "easy"
  },
  {
    question: "Describe the pathophysiology of heart failure including systolic and diastolic dysfunction.",
    followUp: "What compensatory mechanisms activate in chronic heart failure?",
    difficulty: "hard"
  },
  {
    question: "Explain blood pressure regulation through short-term and long-term mechanisms.",
    followUp: "How do baroreceptor reflexes differ from chemoreceptor reflexes?",
    difficulty: "medium"
  },
  {
    question: "What is the clinical significance of the Windkessel effect in large arteries?",
    followUp: "How is this effect altered in aging and atherosclerosis?",
    difficulty: "hard"
  }
];

// ========================================
// HELPER FUNCTIONS
// ========================================

function getRandomQuestions(count) {
  let shuffled = [...questionBank].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, Math.min(count, questionBank.length));
}

function evaluateAnswer(question, answer) {
  let score = 0;
  let feedback = "";

  const answerLength = answer.trim().length;

  if (answerLength < 20) {
    score = 2;
    feedback = "❌ Answer too brief. Provide more detail.";
  } else if (answerLength < 50) {
    score = 4;
    feedback = "⚠️ Answer is acceptable but could be more comprehensive.";
  } else if (answerLength < 150) {
    score = 7;
    feedback = "✓ Good attempt! Add more clinical context.";
  } else {
    score = 9;
    feedback = "✅ Excellent! Well-structured and comprehensive answer.";
  }

  const keywords = ["mechanisms", "pathway", "clinical", "physiology", "effects", "regulated", "compensate"];
  const keywordMatches = keywords.filter(kw => answer.toLowerCase().includes(kw)).length;

  if (keywordMatches >= 3 && score < 10) {
    score = Math.min(score + 1, 10);
    feedback = "✅ Excellent technical understanding!";
  }

  return { score: Number(score), feedback: String(feedback) };
}

// ==== NEW: AI-POWERED PROFESSOR EVALUATION ====
async function evaluateAnswerWithAI(question, answer) {
  if (!OPENROUTER_API_KEY) {
    console.warn('⚠️ No API key, using local evaluation');
    return evaluateAnswer(question, answer);
  }

  try {
    console.log('🎓 Calling AI Professor for strict evaluation...');

    const prompt = `You are a strict medical viva examiner. Evaluate this student's answer professionally and concisely.

QUESTION: ${question}

STUDENT'S ANSWER: ${answer}

Provide EXACTLY this format (be concise and direct):

Score: X/10

Strengths:
- (1-2 key strengths)

Weaknesses:
- (1-2 key gaps)

Missing Concepts:
- (1-2 important concepts not mentioned)

Follow-up Question:
(A challenging follow-up question to test deeper understanding)`;

    const aiEvaluation = await callOpenRouterAPI(prompt, CONFIG_KEYS.EVALUATION);
    console.log('✅ AI Evaluation Complete');

    // Extract score from AI response
    const scoreMatch = aiEvaluation.match(/Score:\s*(\d+)/);
    const score = scoreMatch ? Math.min(Math.max(parseInt(scoreMatch[1]), 0), 10) : 5;

    return {
      score: score,
      feedback: aiEvaluation,
      isAIPowered: true
    };
  } catch (error) {
    console.error('❌ AI Evaluation failed:', error.message);
    return evaluateAnswer(question, answer);
  }
}

// ==== NEW: PERFECT ANSWER GENERATION ====
async function generatePerfectAnswer(question) {
  try {
    console.log('✏️ [PERFECT ANSWER] Generating answer for:', question.substring(0, 60) + '...');

    const prompt = `You are a medical educator. Provide a concise, exam-ready answer to this question.

Q: ${question}

Answer (2-3 sentences max):`;

    const perfectAnswer = await callOpenRouterAPI(prompt, CONFIG_KEYS.PERFECT_ANSWER);

    console.log('✅ [PERFECT ANSWER] Generated successfully:', perfectAnswer.substring(0, 80) + '...');
    return perfectAnswer;

  } catch (error) {
    console.error('❌ [PERFECT ANSWER] Generation Failed:', error.message);
    // FALLBACK: Return hardcoded answer when API fails
    console.log('📚 Using fallback perfect answer');
    return getFallbackPerfectAnswer(question);
  }
}

// ========================================
// FALLBACK PERFECT ANSWERS (When API is out of credits)
// ========================================
function getFallbackPerfectAnswer(question) {
  const lowerQ = question.toLowerCase();

  // Medical topic detection
  if (lowerQ.includes('diabetes')) {
    return "Diabetes mellitus is a metabolic disorder characterized by elevated blood glucose levels due to impaired insulin production or function. Type 1 is autoimmune-mediated beta cell destruction, while Type 2 involves insulin resistance. Management includes lifestyle modifications and pharmacotherapy.";
  }
  if (lowerQ.includes('heart') || lowerQ.includes('cardiac') || lowerQ.includes('myocardial')) {
    return "Cardiac pathophysiology involves the complex interplay of electrical conduction, mechanical contraction, and hemodynamic function. Key conditions include arrhythmias, ischemia, and heart failure. Treatment depends on underlying mechanism and hemodynamic status.";
  }
  if (lowerQ.includes('blood pressure') || lowerQ.includes('hypertension')) {
    return "Blood pressure regulation involves the renin-angiotensin-aldosterone system, sympathetic nervous system, and vascular compliance. Hypertension is systolic >130 or diastolic >80 mmHg and increases cardiovascular morbidity and mortality risk.";
  }
  if (lowerQ.includes('kidney') || lowerQ.includes('renal')) {
    return "The kidneys regulate fluid-electrolyte balance, acid-base status, and blood pressure through glomerular filtration and tubular reabsorption. Acute kidney injury and chronic kidney disease progress through stages based on glomerular filtration rate.";
  }
  if (lowerQ.includes('infection') || lowerQ.includes('sepsis')) {
    return "Infection occurs when pathogenic organisms invade and multiply in host tissues. Sepsis is a systemic inflammatory response with organ dysfunction. Management requires rapid identification, antibiotics, and supportive care.";
  }
  if (lowerQ.includes('cancer') || lowerQ.includes('tumor') || lowerQ.includes('malignancy')) {
    return "Cancer results from uncontrolled proliferation due to mutations in proto-oncogenes and tumor suppressors. Pathophysiology includes evasion of apoptosis, unlimited replicative potential, and metastatic capability. Treatment involves surgery, chemotherapy, and immunotherapy.";
  }
  if (lowerQ.includes('respiratory') || lowerQ.includes('lung') || lowerQ.includes('asthma')) {
    return "Respiratory diseases affect gas exchange and airway function. Asthma involves reversible airway obstruction and inflammation. COPD shows progressive airflow limitation. Management depends on severity and underlying mechanism.";
  }
  if (lowerQ.includes('neuro') || lowerQ.includes('brain') || lowerQ.includes('stroke')) {
    return "Neurological disorders result from dysfunction of the central or peripheral nervous system. Stroke occurs due to ischemia or hemorrhage. Neurodegenerative diseases involve progressive neuronal loss. Diagnosis requires clinical assessment and neuroimaging.";
  }

  // Generic fallback
  return "This is a complex medical question that requires understanding of underlying pathophysiology, clinical manifestations, and evidence-based management principles. Consult medical literature and clinical guidelines for comprehensive answers.";
}


// ========================================
// CONTEXTUAL PERFECT ANSWER (From PDF Chunk)
// ========================================
async function generateContextualPerfectAnswer(chunkText, question) {
  try {
    console.log('📖 Generating contextual answer from PDF chunk...');

    const prompt = `You are a senior medical educator. Provide a PERFECT, exam-ready answer to this question using ONLY information from the provided study material.

STUDY MATERIAL:
"""
${chunkText}
"""

QUESTION: ${question}

Requirements:
- Answer must be based on the study material above
- Be comprehensive but focused (2-4 sentences)
- Include specific details from the material
- Use proper medical terminology
- Be suitable for a high-scoring exam response

ANSWER:`;

    const contextualAnswer = await callOpenRouterAPI(prompt, CONFIG_KEYS.PERFECT_ANSWER);

    if (!contextualAnswer) {
      throw new Error('Empty answer received from API');
    }

    console.log('✅ [CONTEXTUAL ANSWER] Generated:', contextualAnswer.substring(0, 80) + '...');
    return contextualAnswer;

  } catch (error) {
    console.error('❌ [CONTEXTUAL ANSWER] Generation Failed:', error.message);
    // Fall back to generic perfect answer if contextual fails
    try {
      console.log('   Falling back to generic perfect answer...');
      return await generatePerfectAnswer(question);
    } catch (fallbackError) {
      console.error('❌ Fallback also failed:', fallbackError.message);
      throw error;
    }
  }
}

// ========================================
// SIMILARITY CHECK (Deduplication System)
// ========================================
function calculateSimilarity(text1, text2) {
  // Convert to lowercase and split into words
  const words1 = text1.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const words2 = text2.toLowerCase().split(/\s+/).filter(w => w.length > 3);

  // Find common words
  const set2 = new Set(words2);
  const commonWords = words1.filter(w => set2.has(w)).length;

  // Calculate similarity score (0-1)
  const maxLength = Math.max(words1.length, words2.length);
  const similarity = maxLength > 0 ? commonWords / maxLength : 0;

  return similarity;
}

async function isQuestionTooSimilar(newQuestion, subject) {
  return new Promise((resolve, reject) => {
    // Check against existing questions in same subject
    libraryDb.all(
      `SELECT question FROM library_questions WHERE subject = ? LIMIT 50`,
      [subject],
      (err, rows) => {
        if (err) {
          console.error('Similarity check error:', err);
          resolve(false); // Allow if query fails
          return;
        }

        if (!rows || rows.length === 0) {
          resolve(false); // No existing questions, so not similar
          return;
        }

        // Check similarity against each existing question
        const similarityThreshold = 0.6; // 60% similarity = too similar
        for (const row of rows) {
          const similarity = calculateSimilarity(newQuestion, row.question);
          if (similarity > similarityThreshold) {
            console.log(`⚠️  Question too similar (${Math.round(similarity * 100)}%): "${newQuestion.substring(0, 60)}..."`);
            resolve(true); // Is similar
            return;
          }
        }

        resolve(false); // Not similar to any existing questions
      }
    );
  });
}

// ========================================
// SESSION-LEVEL QUESTION DEDUPLICATION
// ========================================

/**
 * Create a simplified hash of a question for dedup checking
 * Extracts first 5 key words to prevent exact repeats
 */
// ========================================
// SAVE QUESTION TO LIBRARY (Memory-Efficient)
// ========================================
async function saveQuestionToLibrary(question, perfectAnswer, subject, difficulty, chunkText, sourceType = 'pdf-ai', sourcePdf = null, questionType = 'long-form', mcqOptions = null, correctOption = null) {
  try {
    // Check for similarity before saving
    const isSimilar = await isQuestionTooSimilar(question, subject);
    if (isSimilar) {
      console.log('📌 Skipping similar question');
      return false; // Question not saved
    }

    // Extract tags from question (keywords)
    const tags = [];
    const keywords = ['diagnosis', 'mechanism', 'pathophysiology', 'treatment', 'anatomy', 'clinical', 'differential', 'management', 'complications', 'risk'];
    keywords.forEach(kw => {
      if (question.toLowerCase().includes(kw)) {
        tags.push(kw);
      }
    });

    // Convert MCQ options to JSON if provided
    const mcqOptionsJson = mcqOptions ? JSON.stringify(mcqOptions) : null;

    // Insert into library_questions (ignore duplicates via UNIQUE constraint)
    return new Promise((resolve, reject) => {
      libraryDb.run(
        `INSERT OR IGNORE INTO library_questions
         (subject, question, perfect_answer, difficulty, tags, source_type, source_pdf, questionType, mcqOptions, correctOption)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [subject, question, perfectAnswer, difficulty, JSON.stringify(tags), sourceType, sourcePdf, questionType, mcqOptionsJson, correctOption],
        (err) => {
          if (err) {
            console.error('❌ Library save error:', err.message);
            reject(err);
          } else {
            console.log(`📚 ${questionType === 'mcq' ? '📋 MCQ' : '📝 Question'} saved to library [${subject}/${difficulty}]`);

            // Update metadata (async, non-blocking)
            libraryDb.run(
              `UPDATE library_metadata SET
               total_questions = (SELECT COUNT(*) FROM library_questions),
               last_updated = CURRENT_TIMESTAMP
               WHERE id = 1`
            );

            resolve(true); // Return true = question saved
          }
        }
      );
    });
  } catch (error) {
    console.error('❌ saveQuestionToLibrary failed:', error.message);
    return false; // Silent fail - don't break question generation
  }
}

// ========================================
// AI INTEGRATION
// ========================================

async function generateGenericAIQuestion() {
  try {
    console.log('🤖 Calling OpenRouter API for AI question...');

    const prompt = 'Generate ONE medical viva exam question. Return ONLY the question as a single sentence.';
    const question = await callOpenRouterAPI(prompt, CONFIG_KEYS.QUESTION_GENERATION);

    console.log('✅ AI Question Generated Successfully:', question.substring(0, 50) + '...');
    return question;
  } catch (error) {
    console.error('❌ AI Question Generation Failed:', error.message);
    throw error;
  }
}

// Get next chunk using rotation algorithm
async function getNextChunk(sessionId, fileId) {
  return new Promise((resolve, reject) => {
    // Get session's last used chunk index
    db.get('SELECT lastChunkIndex FROM sessions WHERE sessionId = ?', [sessionId], (err, session) => {
      if (err) return reject(err);

      const lastIndex = session?.lastChunkIndex || 0;

      // Get total chunks for this PDF
      db.get('SELECT COUNT(*) as count FROM pdf_chunks WHERE fileId = ?', [fileId], (err, result) => {
        if (err) return reject(err);

        const totalChunks = result.count;
        if (totalChunks === 0) {
          return reject(new Error('No chunks found for this PDF'));
        }

        // Rotate to next chunk (circular)
        const nextIndex = (lastIndex + 1) % totalChunks;

        console.log(`🔄 Rotating from chunk ${lastIndex} to ${nextIndex} (of ${totalChunks})`);

        // Fetch chunk
        db.get(
          'SELECT * FROM pdf_chunks WHERE fileId = ? AND chunkIndex = ?',
          [fileId, nextIndex],
          (err, chunk) => {
            if (err) return reject(err);
            if (!chunk) return reject(new Error(`Chunk ${nextIndex} not found`));

            // Update session's lastChunkIndex
            db.run(
              'UPDATE sessions SET lastChunkIndex = ? WHERE sessionId = ?',
              [nextIndex, sessionId],
              (err) => {
                if (err) console.warn('Could not update lastChunkIndex:', err);
                resolve(chunk);
              }
            );
          }
        );
      });
    });
  });
}

// Generate PDF-based question using chunk context
async function generatePDFBasedQuestion(sessionId, fileId) {
  try {
    // Get next chunk with rotation
    const chunk = await getNextChunk(sessionId, fileId);

    console.log(`📄 Generating question from chunk ${chunk.chunkIndex} (type: ${chunk.chunkType}, ${chunk.wordCount} words)`);

    // Build enhanced prompt with PDF context
    const enhancedPrompt = `You are a medical examiner creating viva questions based on specific study material.

CONTEXT FROM STUDY MATERIAL:
"""
${chunk.chunkText}
"""

CONTENT TYPE: ${chunk.chunkType}

TASK: Generate ONE intelligent medical viva question that:
1. Tests understanding of a SPECIFIC mechanism, example, or concept from the context above
2. Requires practical knowledge application (not just recall)
3. References specific details from the material
4. Is challenging but answerable using the provided context

IMPORTANT: The question must be DIRECTLY tied to the content provided. Do NOT generate generic questions.

Return ONLY the question as a single sentence.`;

    // Call OpenRouter API via helper
    const question = await callOpenRouterAPI(enhancedPrompt, CONFIG_KEYS.QUESTION_GENERATION);

    console.log('✅ PDF-Based Question Generated:', question.substring(0, 80) + '...');

    // Get total chunks and PDF filename for metadata
    const metadata = await new Promise((resolve, reject) => {
      db.get(
        'SELECT totalChunks, originalFilename FROM uploaded_files WHERE fileId = ?',
        [fileId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row || {});
        }
      );
    });

    return {
      question,
      chunkIndex: chunk.chunkIndex,
      totalChunks: metadata.totalChunks || 0,
      chunkType: chunk.chunkType,
      pdfFilename: metadata.originalFilename || 'Unknown PDF',
      pdfBased: true,
      source: 'pdf-ai'
    };
  } catch (error) {
    console.error('❌ PDF-Based Question Generation Failed:', error.message);
    throw error;
  }
}

// ========================================
// MCQ GENERATION FUNCTIONS (NEW)
// ========================================

// Determine which question generation path to use based on context
async function determinationGenerationPath(mode, fileId) {
  try {
    // Check if a PDF was uploaded in this mode
    let uploadMode = null;
    if (fileId) {
      uploadMode = await new Promise((resolve, reject) => {
        db.get('SELECT uploadMode FROM uploaded_files WHERE fileId = ?', [fileId], (err, row) => {
          if (err) reject(err);
          else resolve(row?.uploadMode || null);
        });
      });
    }

    // Determine the generation path
    if (uploadMode === 'mcq' || mode === 'mcq') {
      // MCQ Mode - generate multiple-choice questions
      return {
        type: 'mcq',
        generator: uploadMode === 'mcq' && fileId ? 'generatePDFBasedMCQQuestion' : 'generateGenericAIMCQQuestion'
      };
    } else {
      // Practice/Exam Mode - generate long-form questions
      return {
        type: 'long-form',
        generator: fileId && uploadMode !== 'mcq' ? 'generatePDFBasedQuestion' : 'generateGenericAIQuestion'
      };
    }
  } catch (error) {
    console.error('❌ Error determining generation path:', error.message);
    throw error;
  }
}

// Generate generic MCQ question (without PDF context)
// ========================================
// MCQ MODE - CONSTANTS AND HELPERS
// ========================================

// Difficulty guidance for MCQ generation
const MCQ_DIFFICULTY_GUIDANCE = {
  easy: `Focus on basic concepts, straightforward options with obvious distractors.`,
  medium: `Create questions requiring moderate reasoning with plausible distractors.`,
  hard: `Create complex scenarios with similar-looking options that require deep reasoning.`
};

// Fallback MCQs - created once at module load time
const FALLBACK_MCQ_POOLS = {
  easy: [
    {
      question: "What is the normal resting heart rate for a healthy adult?",
      options: { A: "60-100 bpm", B: "40-60 bpm", C: "100-120 bpm", D: "120-140 bpm" },
      correctOption: "A",
      explanation: "Normal resting heart rate in adults is 60-100 beats per minute."
    },
    {
      question: "Which blood type is known as the universal donor?",
      options: { A: "O negative", B: "AB positive", C: "O positive", D: "A negative" },
      correctOption: "A",
      explanation: "O negative blood is the universal donor because it lacks A, B, and Rh antigens."
    },
    {
      question: "What is the primary function of red blood cells?",
      options: { A: "Transport oxygen", B: "Fight infections", C: "Clot blood", D: "Produce antibodies" },
      correctOption: "A",
      explanation: "Red blood cells contain hemoglobin which binds and transports oxygen throughout the body."
    },
    {
      question: "Which organ is responsible for filtering blood and producing urine?",
      options: { A: "Kidney", B: "Liver", C: "Pancreas", D: "Spleen" },
      correctOption: "A",
      explanation: "The kidneys filter blood to remove waste products and excess water, which form urine."
    },
    {
      question: "What is the role of insulin in the body?",
      options: { A: "Lower blood glucose levels", B: "Increase heart rate", C: "Boost immune response", D: "Speed up digestion" },
      correctOption: "A",
      explanation: "Insulin is a hormone that promotes glucose uptake from blood into cells, lowering blood glucose levels."
    },
    {
      question: "How many chambers does the human heart have?",
      options: { A: "Four", B: "Two", C: "Three", D: "Five" },
      correctOption: "A",
      explanation: "The heart has four chambers: right atrium, right ventricle, left atrium, and left ventricle."
    },
    {
      question: "Which bone is the largest and strongest bone in the human body?",
      options: { A: "Femur", B: "Tibia", C: "Humerus", D: "Fibula" },
      correctOption: "A",
      explanation: "The femur (thighbone) is the largest and strongest bone in the body, designed to bear body weight."
    },
    {
      question: "What is the normal body temperature for a healthy adult?",
      options: { A: "37°C (98.6°F)", B: "35°C (95°F)", C: "39°C (102°F)", D: "40°C (104°F)" },
      correctOption: "A",
      explanation: "Normal body temperature is approximately 37°C or 98.6°F when measured orally."
    },
    {
      question: "How many bones are in the adult human skeleton?",
      options: { A: "206", B: "186", C: "226", D: "266" },
      correctOption: "A",
      explanation: "Adults have 206 bones in their skeleton after bones fuse during development."
    },
    {
      question: "What is the basic functional unit of the nervous system?",
      options: { A: "Neuron", B: "Synapse", C: "Nerve", D: "Ganglion" },
      correctOption: "A",
      explanation: "The neuron is the fundamental functional and structural unit of the nervous system."
    },
    {
      question: "Which vitamin is essential for blood clotting?",
      options: { A: "Vitamin K", B: "Vitamin C", C: "Vitamin A", D: "Vitamin D" },
      correctOption: "A",
      explanation: "Vitamin K is necessary for the synthesis of clotting factors in the liver."
    },
    {
      question: "What does pH measure in the body?",
      options: { A: "Acidity or alkalinity", B: "Temperature", C: "Oxygen levels", D: "Sugar concentration" },
      correctOption: "A",
      explanation: "pH measures the concentration of hydrogen ions and indicates whether a solution is acidic or alkaline."
    },
    {
      question: "Which hormone is produced by the pancreas?",
      options: { A: "Insulin", B: "Adrenaline", C: "Thyroxine", D: "Testosterone" },
      correctOption: "A",
      explanation: "Insulin is produced by beta cells in the pancreatic islets of Langerhans."
    },
    {
      question: "What is the main function of the liver?",
      options: { A: "Detoxification and metabolism", B: "Production of hormones", C: "Gas exchange", D: "Nutrient absorption" },
      correctOption: "A",
      explanation: "The liver detoxifies blood and metabolizes nutrients, medications, and other substances."
    },
    {
      question: "Which blood cells are primarily responsible for fighting infection?",
      options: { A: "White blood cells", B: "Red blood cells", C: "Platelets", D: "Plasma cells" },
      correctOption: "A",
      explanation: "White blood cells (leukocytes) are immune cells that identify and destroy pathogens."
    },
    {
      question: "What is the normal range for diastolic blood pressure?",
      options: { A: "60-80 mmHg", B: "90-120 mmHg", C: "40-50 mmHg", D: "100-130 mmHg" },
      correctOption: "A",
      explanation: "Normal diastolic pressure (bottom number) is less than 80 mmHg in healthy adults."
    },
    {
      question: "Which gland controls the body's growth and metabolism?",
      options: { A: "Thyroid gland", B: "Pancreas", C: "Pituitary gland", D: "Adrenal gland" },
      correctOption: "A",
      explanation: "The thyroid gland produces thyroid hormone which regulates metabolism and growth."
    },
    {
      question: "What is the primary function of the diaphragm?",
      options: { A: "Assist in breathing", B: "Filter blood", C: "Regulate digestion", D: "Produce hormones" },
      correctOption: "A",
      explanation: "The diaphragm is the main muscle for inspiration, contracting to increase thoracic volume."
    },
    {
      question: "Which type of blood cell carries platelets?",
      options: { A: "Megakaryocyte", B: "Lymphocyte", C: "Macrophage", D: "Erythrocyte" },
      correctOption: "A",
      explanation: "Megakaryocytes are bone marrow cells that produce and release platelets into the blood."
    }
  ],
  medium: [
    {
      question: "Which enzyme is primarily responsible for breaking down fats in the small intestine?",
      options: { A: "Pancreatic lipase", B: "Pepsin", C: "Amylase", D: "Trypsin" },
      correctOption: "A",
      explanation: "Pancreatic lipase is the main enzyme that hydrolyzes dietary triglycerides into fatty acids and glycerol in the small intestine."
    },
    {
      question: "What is the primary mechanism of action of ACE inhibitors in hypertension treatment?",
      options: { A: "Block angiotensin II formation", B: "Block beta-adrenergic receptors", C: "Block calcium channels", D: "Increase sodium excretion" },
      correctOption: "A",
      explanation: "ACE inhibitors prevent the conversion of angiotensin I to angiotensin II, reducing vasoconstriction and aldosterone secretion."
    },
    {
      question: "Which hormone regulates calcium levels in the blood?",
      options: { A: "Parathyroid hormone", B: "Thyroid hormone", C: "Glucagon", D: "Epinephrine" },
      correctOption: "A",
      explanation: "Parathyroid hormone increases serum calcium by promoting calcium reabsorption in kidneys and release from bones."
    },
    {
      question: "What is the primary site of drug metabolism in the body?",
      options: { A: "Liver", B: "Kidneys", C: "Lungs", D: "Intestines" },
      correctOption: "A",
      explanation: "The liver is the primary organ for drug metabolism through Phase I, II, and III reactions."
    },
    {
      question: "Which fraction of ejection represents the percentage of blood leaving the left ventricle?",
      options: { A: "Ejection fraction", B: "Cardiac index", C: "Stroke volume", D: "Cardiac output" },
      correctOption: "A",
      explanation: "Ejection fraction is the percentage of blood that leaves the left ventricle with each contraction, normally 50-70%."
    },
    {
      question: "What is the normal tidal volume in a healthy adult at rest?",
      options: { A: "500 mL", B: "250 mL", C: "1000 mL", D: "2000 mL" },
      correctOption: "A",
      explanation: "Tidal volume is the volume of air breathed in or out per minute at rest, approximately 500 mL in adults."
    },
    {
      question: "Which cells are responsible for humoral immunity?",
      options: { A: "B lymphocytes", B: "T lymphocytes", C: "Macrophages", D: "Neutrophils" },
      correctOption: "A",
      explanation: "B lymphocytes produce antibodies (immunoglobulins) responsible for humoral immune responses."
    },
    {
      question: "What is the primary function of the glomerulus in the kidney?",
      options: { A: "Ultrafiltration of blood", B: "Reabsorption of glucose", C: "Secretion of waste", D: "Production of hormones" },
      correctOption: "A",
      explanation: "The glomerulus filters blood under pressure to produce filtrate, which becomes urine after selective reabsorption."
    },
    {
      question: "Which ion is primarily responsible for cardiac action potential?",
      options: { A: "Calcium", B: "Potassium", C: "Sodium", D: "Magnesium" },
      correctOption: "C",
      explanation: "Sodium influx during depolarization drives the cardiac action potential upstroke in ventricular myocytes."
    },
    {
      question: "What is the primary source of glucose during fasting?",
      options: { A: "Hepatic glycogenolysis", B: "Muscle glycolysis", C: "Renal gluconeogenesis", D: "Intestinal absorption" },
      correctOption: "A",
      explanation: "The liver breaks down glycogen to maintain blood glucose during the fasting state."
    },
    {
      question: "Which antibody is most important in mucosal immunity?",
      options: { A: "IgA", B: "IgG", C: "IgM", D: "IgE" },
      correctOption: "A",
      explanation: "IgA is the primary antibody in mucosal secretions protecting respiratory and gastrointestinal tracts."
    },
    {
      question: "What is the first step in the coagulation cascade?",
      options: { A: "Tissue factor activation", B: "Prothrombin activation", C: "Fibrin formation", D: "Platelet aggregation" },
      correctOption: "A",
      explanation: "Tissue factor (TF) binding to Factor VII initiates the extrinsic pathway of the coagulation cascade."
    },
    {
      question: "Which ventricle performs most of the heart's pumping work?",
      options: { A: "Left ventricle", B: "Right ventricle", C: "Left atrium", D: "Right atrium" },
      correctOption: "A",
      explanation: "The left ventricle pumps oxygenated blood to the systemic circulation against high resistance."
    },
    {
      question: "What is the primary mechanism of action of statins?",
      options: { A: "HMG-CoA reductase inhibition", B: "Lipoprotein lipase activation", C: "VLDL synthesis increase", D: "LDL receptor decrease" },
      correctOption: "A",
      explanation: "Statins inhibit HMG-CoA reductase to reduce hepatic cholesterol synthesis and LDL levels."
    },
    {
      question: "Which hormone is primarily responsible for increasing metabolic rate?",
      options: { A: "Thyroid hormone", B: "Glucagon", C: "Epinephrine", D: "Cortisol" },
      correctOption: "A",
      explanation: "Thyroid hormones T3 and T4 increase metabolic rate and energy consumption throughout the body."
    },
    {
      question: "What is the normal glomerular filtration rate in healthy adults?",
      options: { A: "100-120 mL/min", B: "50-75 mL/min", C: "150-200 mL/min", D: "20-40 mL/min" },
      correctOption: "A",
      explanation: "Normal GFR is approximately 100-120 mL/min/1.73m², declining with age."
    },
    {
      question: "Which type of collagen is most abundant in hyaline cartilage?",
      options: { A: "Type II collagen", B: "Type I collagen", C: "Type III collagen", D: "Type IV collagen" },
      correctOption: "A",
      explanation: "Type II collagen comprises 50% of the dry weight of hyaline cartilage."
    },
    {
      question: "What is the primary mechanism of aspirin's antiplatelet effect?",
      options: { A: "COX-1 inhibition", B: "ADP receptor blockade", C: "Thromboxane A2 production increase", D: "Platelet adhesion increase" },
      correctOption: "A",
      explanation: "Aspirin irreversibly acetylates COX-1, preventing thromboxane A2 synthesis and platelet aggregation."
    },
    {
      question: "Which enzyme is responsible for breaking down acetylcholine?",
      options: { A: "Acetylcholinesterase", B: "Monoamine oxidase", C: "COMT", D: "Alkaline phosphatase" },
      correctOption: "A",
      explanation: "Acetylcholinesterase hydrolyzes acetylcholine in the synaptic cleft, terminating neuromuscular signaling."
    },
    {
      question: "What is the blood type of a person with neither A nor B antigens?",
      options: { A: "Type O", B: "Type AB", C: "Type A", D: "Type B" },
      correctOption: "A",
      explanation: "Type O blood has neither A nor B antigens, making it the universal donor."
    },
    {
      question: "Which nervous system division increases heart rate?",
      options: { A: "Sympathetic nervous system", B: "Parasympathetic nervous system", C: "Somatic nervous system", D: "Enteric nervous system" },
      correctOption: "A",
      explanation: "Sympathetic stimulation via beta-1 adrenergic receptors increases heart rate and contractility."
    },
    {
      question: "What is the primary source of HDL cholesterol production?",
      options: { A: "The liver", B: "The intestines", C: "The arteries", D: "The adipose tissue" },
      correctOption: "A",
      explanation: "The liver synthesizes apolipoprotein A-I, the major protein component of HDL particles."
    },
    {
      question: "Which vitamin deficiency causes pernicious anemia?",
      options: { A: "Vitamin B12 deficiency", B: "Folate deficiency", C: "Iron deficiency", D: "Vitamin C deficiency" },
      correctOption: "A",
      explanation: "Vitamin B12 (cobalamin) is essential for DNA synthesis; deficiency causes megaloblastic anemia."
    },
    {
      question: "What is the primary function of T regulatory cells?",
      options: { A: "Suppress immune responses", B: "Kill infected cells", C: "Produce antibodies", D: "Present antigens" },
      correctOption: "A",
      explanation: "T regulatory cells secrete IL-10 and TGF-beta to suppress excessive immune responses."
    },
    {
      question: "Which artery supplies blood to the  left anterior descending territory?",
      options: { A: "Left main coronary", B: "Right coronary", C: "Left circumflex", D: "Left marginal" },
      correctOption: "A",
      explanation: "The left anterior descending artery originates from the left main coronary artery."
    },
    {
      question: "What is the primary role of albumin in the blood?",
      options: { A: "Maintain oncotic pressure", B: "Transport oxygen", C: "Activate complement", D: "Fight infections" },
      correctOption: "A",
      explanation: "Albumin is the major plasma protein providing 80% of oncotic pressure."
    },
    {
      question: "Which hormone suppresses gastric acid secretion?",
      options: { A: "Somatostatin", B: "Gastrin", C: "Secretin", D: "Cholecystokinin" },
      correctOption: "A",
      explanation: "Somatostatin inhibits gastric acid secretion and reduces gastrin release from G cells."
    },
    {
      question: "What is the primary mechanism of glucose reabsorption in the proximal tubule?",
      options: { A: "Active transport via SGLT2", B: "Passive diffusion", C: "Facilitated diffusion", D: "Pinocytosis" },
      correctOption: "A",
      explanation: "SGLT2 actively transports glucose against its concentration gradient in the early proximal tubule."
    },
    {
      question: "Which cytokine is the primary mediator of fever?",
      options: { A: "IL-1", B: "IL-6", C: "IL-13", D: "TNF-alpha" },
      correctOption: "A",
      explanation: "Interleukin-1 is released by macrophages and acts on the hypothalamus to increase body temperature set point."
    },
    {
      question: "What is the normal fasting blood glucose level?",
      options: { A: "70-100 mg/dL", B: "100-150 mg/dL", C: "50-70 mg/dL", D: "150-200 mg/dL" },
      correctOption: "A",
      explanation: "Normal fasting glucose is less than 100 mg/dL; 100-125 mg/dL indicates impaired fasting glucose."
    },
    {
      question: "Which protein is the primary regulator of iron metabolism?",
      options: { A: "Hepcidin", B: "Ferritin", C: "Transferrin", D: "Hemoglobin" },
      correctOption: "A",
      explanation: "Hepcidin is a hormone that regulates iron absorption and distribution by inhibiting ferroportin."
    }
  ],
  hard: [
    {
      question: "A patient with acute myocardial infarction develops cardiogenic shock despite optimal medical therapy. What is the most appropriate next intervention?",
      options: { A: "Intra-aortic balloon pump support", B: "Increased diuretics", C: "Beta-blockers", D: "Nitroglycerin infusion" },
      correctOption: "A",
      explanation: "IABP provides mechanical support by reducing afterload and improving coronary perfusion in refractory cardiogenic shock."
    },
    {
      question: "In septic shock, what is the primary reason for peripheral vasodilation despite hypotension?",
      options: { A: "Excessive nitric oxide production", B: "Catecholamine depletion", C: "Direct myocardial suppression", D: "Hypovolemia" },
      correctOption: "A",
      explanation: "Sepsis causes excessive NO production by inducible nitric oxide synthase, leading to vasodilation and contributing to distributive shock."
    },
    {
      question: "Which cytokine is primarily responsible for fever induction during infection?",
      options: { A: "Interleukin-1", B: "Interleukin-4", C: "Interleukin-10", D: "TNF-beta" },
      correctOption: "A",
      explanation: "IL-1 acts on the hypothalamus to increase the set point for body temperature, initiating fever."
    },
    {
      question: "What is the mechanism of action of direct thrombin inhibitors?",
      options: { A: "Block thrombin directly", B: "Inhibit Factor X", C: "Enhance protein C", D: "Inactivate fibrinogen" },
      correctOption: "A",
      explanation: "Direct thrombin inhibitors like dabigatran bind directly to and inhibit thrombin, preventing clot formation."
    },
    {
      question: "In ARDS, what is the pathophysiologic basis for refractory hypoxemia?",
      options: { A: "Intrapulmonary shunt from collapsed alveoli", B: "Hypoventilation", C: "Decreased hemoglobin", D: "Reduced cardiac output" },
      correctOption: "A",
      explanation: "ARDS causes alveolar collapse (atelectasis) creating intrapulmonary shunt that is resistant to supplemental oxygen."
    },
    {
      question: "Which mechanisms explain the prolonged half-life of digoxin in renal failure?",
      options: { A: "Decreased renal clearance and increased volume of distribution", B: "Increased metabolism", C: "Enhanced protein binding", D: "Increased gastrointestinal absorption" },
      correctOption: "A",
      explanation: "Digoxin is renally eliminated and distributes to muscle; renal failure decreases clearance and increases tissue accumulation."
    },
    {
      question: "In DIC, which finding represents consumption of clotting factors?",
      options: { A: "Decreased platelet count and decreased fibrinogen", B: "Increased PT and aPTT with normal platelets", C: "Low fibrinogen with normal PT", D: "Elevated thrombin time only" },
      correctOption: "A",
      explanation: "DIC is characterized by simultaneous thrombin generation and fibrinolysis, resulting in thrombocytopenia and hypofibrinogenemia."
    },
    {
      question: "What is the primary mechanism of acute tubular necrosis (ATN) in sepsis?",
      options: { A: "Renal hypoperfusion from systemic vasodilation", B: "Direct tubular toxin", C: "Glomerulonephritis", D: "Obstructive nephropathy" },
      correctOption: "A",
      explanation: "Sepsis-induced vasodilation reduces renal perfusion pressure, causing ischemic injury to proximal tubules."
    },
    {
      question: "Which genetic mutation causes familial hypercholesterolemia?",
      options: { A: "LDL receptor gene mutation", B: "APOB gene mutation", C: "PCSK9 gene mutation", D: "APOE gene mutation" },
      correctOption: "A",
      explanation: "Homozygous or heterozygous mutations in the LDL receptor gene reduce hepatic uptake of LDL cholesterol."
    },
    {
      question: "In hyperkalemia, what is the mechanism of cardiac toxicity?",
      options: { A: "Decreased resting membrane potential depolarization", B: "Increased calcium influx", C: "Reduced sodium channels", D: "Enhanced parasympathetic tone" },
      correctOption: "A",
      explanation: "Elevated extracellular K+ reduces the resting membrane potential, increasing cardiac excitability and arrhythmia risk."
    },
    {
      question: "What is the pathophysiology of thrombotic thrombocytopenic purpura?",
      options: { A: "ADAMTS13 deficiency causing VWF accumulation", B: "Immune-mediated platelet destruction", C: "Vitamin K deficiency", D: "Hepatic insufficiency" },
      correctOption: "A",
      explanation: "TTP results from ADAMTS13 deficiency, allowing uncleaved VWF multimers to cause microthrombi."
    },
    {
      question: "Which mechanism explains lactic acidosis in sepsis?",
      options: { A: "Tissue hypoperfusion and anaerobic metabolism", B: "Impaired glucose uptake", C: "Liver failure", D: "Ketone body production" },
      correctOption: "A",
      explanation: "Septic shock causes tissue hypoperfusion, forcing shift to anaerobic metabolism and lactate production."
    },
    {
      question: "What is the primary mechanism of acute coronary syndrome in vasospastic angina?",
      options: { A: "Coronary artery vasospasm", B: "Atherosclerotic plaque rupture", C: "Coronary artery dissection", D: "Myocardial bridging" },
      correctOption: "A",
      explanation: "Vasospastic angina results from episodic coronary artery constriction, often at rest without fixed obstruction."
    },
    {
      question: "In pulmonary hypertension, which pathologic finding is most specific?",
      options: { A: "Medial hypertrophy of pulmonary arteries", B: "Left ventricular hypertrophy", C: "Pleural effusion", D: "Pulmonary edema" },
      correctOption: "A",
      explanation: "Smooth muscle cell proliferation and medial wall thickening of pulmonary arteries characterize primary pulmonary hypertension."
    },
    {
      question: "What is the mechanism of vancomycin resistance in enterococcus?",
      options: { A: "Altered D-Ala-D-Lac peptidoglycan precursors", B: "Beta-lactamase production", C: "Ribosomal methylation", D: "Efflux pump overexpression" },
      correctOption: "A",
      explanation: "Vancomycin-resistant enterococci produce modified cell wall precursors that vancomycin cannot bind."
    },
    {
      question: "In hemolytic uremic syndrome, what is the primary pathogenic mechanism?",
      options: { A: "Verotoxin-induced endothelial damage", B: "Immune complex deposition", C: "Direct parasitic invasion", D: "Bacterial exotoxin production" },
      correctOption: "A",
      explanation: "Shiga toxin (verotoxin) from STEC causes endothelial damage in renal and systemic microvasculature."
    },
    {
      question: "Which mechanism explains aspiration pneumonia in Mendelson syndrome?",
      options: { A: "Gastric acid-induced chemical pneumonitis", B: "Bacterial overgrowth", C: "Anaphylactic reaction", D: "Direct airway blockage" },
      correctOption: "A",
      explanation: "Aspiration of gastric contents causes acute chemical pneumonitis from HCl-induced direct lung injury."
    },
    {
      question: "In acute liver failure, what is the primary mechanism of hepatic encephalopathy?",
      options: { A: "Ammonia accumulation and failure of urea cycle", B: "Hypoglycemia from failed gluconeogenesis", C: "Portal hypertension", D: "Fat deposition" },
      correctOption: "A",
      explanation: "Loss of hepatic function impairs ammonia metabolism, leading to hyperammonemia and CNS dysfunction."
    },
    {
      question: "What is the primary mechanism of action of glitazones?",
      options: { A: "PPAR-gamma activation", B: "PPAR-alpha activation", C: "Insulin secretion increase", D: "GLP-1 receptor agonism" },
      correctOption: "A",
      explanation: "Thiazolidinediones activate peroxisome proliferator-activated receptor-gamma to improve insulin sensitivity."
    },
    {
      question: "In spontaneous bacterial peritonitis, why is albumin replacement beneficial?",
      options: { A: "Improves renal perfusion through oncotic pressure", B: "Eliminates bacterial toxins", C: "Reduces inflammation directly", D: "Increases intestinal motility" },
      correctOption: "A",
      explanation: "Albumin restores oncotic pressure and renal perfusion in cirrhotic patients with SBP."
    },
    {
      question: "What is the mechanism of cephalosporin allergy cross-reactivity with penicillins?",
      options: { A: "Shared beta-lactam ring structure", B: "Identical side chain composition", C: "Bacterial cell wall similarity", D: "Intestinal microbiota activation" },
      correctOption: "A",
      explanation: "Both beta-lactams contain the beta-lactam ring that can cross-link to serum proteins causing sensitization."
    },
    {
      question: "In membranoproliferative glomerulonephritis, what complement pathway is typically activated?",
      options: { A: "Alternative pathway", B: "Classical pathway", C: "Lectin pathway", D: "Terminal pathway only" },
      correctOption: "A",
      explanation: "MPGN usually involves alternative complement pathway activation with C3 deposition on electron microscopy."
    },
    {
      question: "What is the pathophysiology of myasthenia gravis?",
      options: { A: "Autoimmune antibodies against nicotinic acetylcholine receptors", B: "Viral infection of motor neurons", C: "Genetic myosin mutations", D: "Spinal cord demyelination" },
      correctOption: "A",
      explanation: "IgG autoantibodies bind to nicotinic acetylcholine receptors, blocking neuromuscular transmission."
    },
    {
      question: "In acute angle-closure glaucoma, what is the primary mechanism of elevated intraocular pressure?",
      options: { A: "Pupillary block from iris prolapse", B: "Increased aqueous humor production", C: "Decreased episcleral venous drainage", D: "Zonular fiber tension increase" },
      correctOption: "A",
      explanation: "Forward iris displacement blocks aqueous humor drainage through the trabeculae."
    }
  ]
};

async function generateGenericAIMCQQuestion(difficulty = 'medium') {
  const MAX_RETRIES = 3;  // INCREASED from 2 to 3
  let lastError;

  // Build guidance and prompt ONCE before retry loop (avoid rebuilding on each attempt)
  const difficultyGuidance = MCQ_DIFFICULTY_GUIDANCE[difficulty] || MCQ_DIFFICULTY_GUIDANCE.medium;
  const prompt = `You are a medical examiner creating multiple-choice questions.

TASK: Generate ONE medical MCQ question with exactly 4 options (A, B, C, D).

DIFFICULTY: ${difficulty.toUpperCase()}
${difficultyGuidance}

Return ONLY valid JSON (no markdown, no backticks!) in this exact format:
{
  "question": "single sentence question here",
  "options": {
    "A": "option text here",
    "B": "option text here",
    "C": "option text here",
    "D": "option text here"
  },
  "correctOption": "A",
  "explanation": "why this is correct"
}`;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`🤖 Generating generic MCQ question (${difficulty}) - Attempt ${attempt}/${MAX_RETRIES}...`);

      // Use helper function to call API
      const content = await callOpenRouterAPI(prompt, CONFIG_KEYS.MCQ_GENERATION);

      if (!content) {
        console.error('❌ Missing content in API response');
        lastError = new Error('Empty response from API');
        if (attempt < MAX_RETRIES) {
          await delay(1000 * attempt);
          continue;
        }
        throw lastError;
      }

      // Parse JSON response
      let mcqData;
      try {
        mcqData = JSON.parse(content);
      } catch (e) {
        console.error('❌ Failed to parse MCQ response:', content.substring(0, 200));
        lastError = new Error('Invalid JSON format from API');
        if (attempt < MAX_RETRIES) {
          await delay(1000 * attempt);
          continue;
        }
        throw lastError;
      }

      console.log('✅ MCQ Question Generated:', mcqData.question.substring(0, 80) + '...');

      // Extract topic using adaptive learning service
      const { topic, subtopic } = learningService.extractTopicFromQuestion(mcqData.question, mcqData.options);

      return {
        question: mcqData.question,
        options: mcqData.options,
        correctOption: mcqData.correctOption,
        explanation: mcqData.explanation,
        difficulty: difficulty,
        questionType: 'mcq',
        pdfBased: false,
        source: 'ai',
        topic: topic,
        subtopic: subtopic
      };
    } catch (error) {
      lastError = error;
      console.error(`❌ MCQ Generation Attempt ${attempt} Failed:`, error.message);
      if (attempt < MAX_RETRIES) {
        console.log(`⏳ Retrying in ${1000 * attempt}ms...`);
        await delay(1000 * attempt);
      }
    }
  }

  // All retries failed - return fallback MCQ
  console.warn(`⚠️ All ${MAX_RETRIES} API retries failed for MCQ generation, using fallback MCQ. Last error: ${lastError?.message}`);
  return getFallbackMCQ(difficulty);
}

// Fallback MCQs for when API fails (uses pre-allocated module-level pools)
// Get MCQ from imported dataset (from test.csv)
async function getFromMCQDatabase(difficulty = 'medium') {
  return new Promise((resolve, reject) => {
    const query = `SELECT * FROM mcq_questions WHERE difficulty = ? ORDER BY RANDOM() LIMIT 1`;

    db.get(query, [difficulty], (err, row) => {
      if (err) {
        console.error('❌ MCQ database query failed:', err.message);
        reject(err);
      } else if (row) {
        // Convert to expected format
        const { topic, subtopic } = learningService.extractTopicFromQuestion(row.question, {
          A: row.optionA,
          B: row.optionB,
          C: row.optionC,
          D: row.optionD
        });

        const result = {
          question: row.question,
          options: {
            A: row.optionA,
            B: row.optionB,
            C: row.optionC,
            D: row.optionD
          },
          correctOption: row.correctOption, // Can be "A" or "A,C" for multi-answer
          difficulty: row.difficulty,
          questionType: 'mcq',
          pdfBased: false,
          source: 'mcq-dataset',
          topic: topic,
          subtopic: subtopic,
          choice_type: row.choice_type || 'single', // 'single' or 'multi'
          explanation: row.explanation || '',
          subject: row.subject,
          dbId: row.id
        };
        resolve(result);
      } else {
        console.warn(`⚠️ No MCQ found in database for difficulty: ${difficulty}`);
        resolve(null);
      }
    });
  });
}

function getFallbackMCQ(difficulty = 'medium') {
  // Fast O(1) lookup instead of if-else chain
  const mcqPool = FALLBACK_MCQ_POOLS[difficulty] || FALLBACK_MCQ_POOLS.medium;
  const randomMCQ = mcqPool[Math.floor(Math.random() * mcqPool.length)];

  // Extract topic from fallback MCQ
  const { topic, subtopic } = learningService.extractTopicFromQuestion(randomMCQ.question, randomMCQ.options);

  return {
    ...randomMCQ,
    difficulty: difficulty,
    questionType: 'mcq',
    pdfBased: false,
    source: 'fallback',
    topic: topic,
    subtopic: subtopic
  };
}

// Generate PDF-based MCQ question (with retry logic)
async function generatePDFBasedMCQQuestion(sessionId, fileId, difficulty = 'medium') {
  const MAX_RETRIES = 2;
  let lastError;
  let chunk;

  try {
    // Get next chunk ONCE before retry loop
    chunk = await getNextChunk(sessionId, fileId);
    console.log(`📄 Generating MCQ from chunk ${chunk.chunkIndex} (${difficulty}, ${chunk.wordCount} words)...`);
  } catch (e) {
    console.error('❌ Failed to get PDF chunk:', e.message);
    throw e;
  }

  // Use shared difficulty guidance constant (DRY principle)
  const difficultyGuidance = MCQ_DIFFICULTY_GUIDANCE[difficulty] || MCQ_DIFFICULTY_GUIDANCE.medium;

  const prompt = `You are a medical examiner creating MCQ from study material.

CONTEXT FROM STUDY MATERIAL:
"""
${chunk.chunkText}
"""

CONTENT TYPE: ${chunk.chunkType}
DIFFICULTY: ${difficulty.toUpperCase()}
${difficultyGuidance}

TASK: Generate ONE MCQ question with exactly 4 options (A, B, C, D) that:
1. Tests understanding of SPECIFIC content from the context
2. Has one clearly correct answer
3. Includes plausible distractors
4. References specific details from the material

Return ONLY valid JSON (no markdown!) in this exact format:
{
  "question": "single sentence question here",
  "options": {
    "A": "option text",
    "B": "option text",
    "C": "option text",
    "D": "option text"
  },
  "correctOption": "A",
  "explanation": "why this is correct based on context"
}`;

  // Retry loop with exponential backoff
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const content = await callOpenRouterAPI(prompt, CONFIG_KEYS.MCQ_GENERATION);

      if (!content) {
        throw new Error('Empty response from API');
      }

      // Parse JSON response
      let mcqData;
      try {
        mcqData = JSON.parse(content);
      } catch (e) {
        console.error('❌ Failed to parse PDF MCQ response:', content.substring(0, 200));
        throw new Error('Invalid JSON from API');
      }

      // Get PDF metadata
      const metadata = await new Promise((resolve, reject) => {
        db.get(
          'SELECT totalChunks, originalFilename FROM uploaded_files WHERE fileId = ?',
          [fileId],
          (err, row) => {
            if (err) reject(err);
            else resolve(row || {});
          }
        );
      });

      console.log('✅ PDF MCQ Generated:', mcqData.question.substring(0, 80) + '...');

      // Extract topic from PDF MCQ
      const { topic, subtopic } = learningService.extractTopicFromQuestion(mcqData.question, mcqData.options);

      return {
        question: mcqData.question,
        options: mcqData.options,
        correctOption: mcqData.correctOption,
        explanation: mcqData.explanation,
        chunkIndex: chunk.chunkIndex,
        totalChunks: metadata.totalChunks || 0,
        chunkType: chunk.chunkType,
        pdfFilename: metadata.originalFilename || 'Unknown PDF',
        difficulty: difficulty,
        questionType: 'mcq',
        pdfBased: true,
        source: 'pdf-ai',
        topic: topic,
        subtopic: subtopic
      };
    } catch (error) {
      lastError = error;
      console.error(`❌ PDF MCQ Generation Attempt ${attempt}/${MAX_RETRIES} Failed:`, error.message);
      if (attempt < MAX_RETRIES) {
        const delayMs = 1000 * attempt; // 1s, 2s
        console.log(`⏳ Retrying in ${delayMs}ms...`);
        await delay(delayMs);
      }
    }
  }

  // All retries failed
  console.warn('⚠️ All API retries failed for PDF MCQ, returning fallback');
  throw lastError;
}

// Generate multiple MCQ questions (6-20) with difficulty levels
async function generateMultiplePDFMCQQuestions(sessionId, fileId, numberOfQuestions = 18, subject = 'General') {
  if (!OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY not set");
  }

  try {
    console.log(`\n📋 Generating ${numberOfQuestions} MCQ questions with 3 difficulty levels from PDF [Subject: ${subject}]...`);

    // Calculate questions per difficulty level
    const perLevel = Math.floor(numberOfQuestions / 3);
    const difficultyLevels = [
      { level: 'easy', count: perLevel, emoji: '🟢' },
      { level: 'medium', count: perLevel, emoji: '🟡' },
      { level: 'hard', count: perLevel, emoji: '🔴' }
    ];

    // Adjust for rounding
    difficultyLevels[2].count += numberOfQuestions - (perLevel * 3);

    console.log(`📊 MCQ Distribution: ${perLevel} easy, ${perLevel} medium, ${perLevel + (numberOfQuestions - perLevel * 3)} hard`);

    const allGeneratedQuestions = [];

    // Generate questions for each difficulty level
    for (const diffLevel of difficultyLevels) {
      console.log(`${diffLevel.emoji} Generating ${diffLevel.count} ${diffLevel.level} MCQ...`);

      for (let i = 0; i < diffLevel.count; i++) {
        try {
          const mcqQuestion = await generatePDFBasedMCQQuestion(sessionId, fileId, diffLevel.level);
          mcqQuestion.subject = subject;
          allGeneratedQuestions.push(mcqQuestion);

          // Save to library (async, non-blocking)
          saveQuestionToLibrary(mcqQuestion.question, mcqQuestion.explanation, subject, diffLevel.level, mcqQuestion, 'pdf-ai', mcqQuestion.pdfFilename || 'Unknown', 'mcq', mcqQuestion.options, mcqQuestion.correctOption);
        } catch (error) {
          console.error(`⚠️  Failed to generate MCQ ${i + 1}/${diffLevel.count}:`, error.message);
        }
      }
    }

    console.log(`✅ Generated ${allGeneratedQuestions.length} MCQ questions total`);
    return allGeneratedQuestions;
  } catch (error) {
    console.error('❌ Batch MCQ Generation Failed:', error.message);
    throw error;
  }
}

// Generate multiple questions (12-20) with different difficulty levels from PDF chunks
async function generateMultiplePDFQuestions(sessionId, fileId, numberOfQuestions = 18, subject = 'General') {
  try {
    console.log(`\n🎯 Generating ${numberOfQuestions} questions with 3 difficulty levels from PDF [Subject: ${subject}]...`);

    // Calculate questions per difficulty level (equally distributed)
    const perLevel = Math.floor(numberOfQuestions / 3);
    const difficultyLevels = [
      { level: 'easy', count: perLevel, emoji: '🟢' },
      { level: 'medium', count: perLevel, emoji: '🟡' },
      { level: 'hard', count: perLevel, emoji: '🔴' }
    ];

    // Adjust for rounding
    difficultyLevels[2].count += numberOfQuestions - (perLevel * 3);

    console.log(`📊 Distribution: ${perLevel} easy, ${perLevel} medium, ${perLevel + (numberOfQuestions - perLevel * 3)} hard`);

    // Get PDF metadata
    const pdfMetadata = await new Promise((resolve, reject) => {
      db.get(
        'SELECT totalChunks, originalFilename FROM uploaded_files WHERE fileId = ?',
        [fileId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row || {});
        }
      );
    });

    const allGeneratedQuestions = [];

    // Generate questions for each difficulty level
    for (const diffLevel of difficultyLevels) {
      console.log(`\n${diffLevel.emoji} Generating ${diffLevel.count} ${diffLevel.level} questions...`);

      for (let i = 0; i < diffLevel.count; i++) {
        // Get a chunk (rotate through chunks for variety)
        const chunk = await getNextChunk(sessionId, fileId);

        // Build difficulty-specific prompt
        let difficultyGuidance = '';
        if (diffLevel.level === 'easy') {
          difficultyGuidance = `
DIFFICULTY: EASY (🟢)
Focus on basic understanding, definitions, and fundamental concepts.
Examples: What is..., Define..., What are the basic features of..., Identify...`;
        } else if (diffLevel.level === 'medium') {
          difficultyGuidance = `
DIFFICULTY: MEDIUM (🟡)
Focus on underlying mechanisms, relationships, and application of concepts.
Examples: How does..., Explain the relationship between..., What mechanisms lead to..., Describe...`;
        } else {
          difficultyGuidance = `
DIFFICULTY: HARD (🔴)
Focus on synthesis of multiple concepts, practical implications, and complex scenarios.
Examples: Integrate concepts to explain..., How would you manage..., Analyze the clinical implications of..., Compare and contrast...`;
        }

        const enhancedPrompt = `You are a medical examiner creating ${diffLevel.level.toUpperCase()} difficulty viva questions based on specific study material.

CONTEXT FROM STUDY MATERIAL:
"""
${chunk.chunkText}
"""

CONTENT TYPE: ${chunk.chunkType}

${difficultyGuidance}

TASK: Generate ONE intelligent medical viva question that:
1. Tests understanding at the ${diffLevel.level} level
2. Requires appropriate level of practical knowledge application
3. References specific details from the material (or paraphrase if needed)
4. Is appropriately challenging for ${diffLevel.level} level

IMPORTANT: The question must be DIRECTLY tied to the content provided.
If original content is limited, you can paraphrase or extend concepts logically.

Return ONLY the question as a single sentence.`;

        try {
          const question = await callOpenRouterAPI(enhancedPrompt, CONFIG_KEYS.QUESTION_GENERATION);

          if (question) {
            allGeneratedQuestions.push({
              question,
              chunkIndex: chunk.chunkIndex,
              totalChunks: pdfMetadata.totalChunks || 0,
              chunkType: chunk.chunkType,
              pdfFilename: pdfMetadata.originalFilename || 'Unknown PDF',
              difficulty: diffLevel.level,
              difficultyEmoji: diffLevel.emoji,
              pdfBased: true,
              source: 'pdf-ai'
            });

            console.log(`  ✅ Generated ${diffLevel.level} question ${i + 1}/${diffLevel.count}`);
          }
        } catch (error) {
          console.error(`  ❌ Failed to generate ${diffLevel.level} question ${i + 1}:`, error.message);
        }
      }
    }

    console.log(`\n✅ Generated ${allGeneratedQuestions.length} total questions`);

    // Save all questions to local library (async, non-blocking)
    console.log(`\n📚 Saving ${allGeneratedQuestions.length} questions to local library...`);
    for (const q of allGeneratedQuestions) {
      // Get the chunk text for contextual answer generation
      const chunk = await new Promise((resolve, reject) => {
        db.get(
          'SELECT chunkText FROM pdf_chunks WHERE fileId = ? AND chunkIndex = ?',
          [fileId, q.chunkIndex],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });

      // Generate contextual perfect answer and save (non-blocking)
      if (chunk) {
        generateContextualPerfectAnswer(chunk.chunkText, q.question)
          .then(answer => {
            saveQuestionToLibrary(q.question, answer, subject, q.difficulty, chunk.chunkText, 'pdf-ai', q.pdfFilename)
              .catch(err => console.log('  (Library save skipped)'));
          })
          .catch(err => console.log('  (Perfect answer generation failed, skipping library save)'));
      }
    }

    return allGeneratedQuestions;

  } catch (error) {
    console.error('❌ Multiple Question Generation Failed:', error.message);
    throw error;
  }
}

// Helper: Delay function
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper: Insert question into cached_questions table
async function insertCachedQuestion(fileId, questionObj) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO cached_questions
       (fileId, question, difficulty, difficultyEmoji, chunkIndex, totalChunks, chunkType, pdfFilename, pdfBased, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        fileId,
        questionObj.question,
        questionObj.difficulty,
        questionObj.difficultyEmoji,
        questionObj.chunkIndex,
        questionObj.totalChunks,
        questionObj.chunkType,
        questionObj.pdfFilename,
        1,  // pdfBased = always true
        'pdf-ai'
      ],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

// Helper: Update uploaded file status
async function updateUploadedFileStatus(fileId, status) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE uploaded_files SET status = ? WHERE fileId = ?`,
      [status, fileId],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

// Background Question Generation - Spawned after PDF upload
async function generateQuestionsInBackground(fileId, uploadMode = 'practice') {
  try {
    console.log(`\n🎯 Starting background question generation for ${fileId} (uploadMode: ${uploadMode})...`);

    // Update status to 'extracting'
    await updateUploadedFileStatus(fileId, 'extracting');

    // Generate 1 batch = 10 questions total (faster extraction)
    console.log(`\n📊 Generating 10 questions batch (${uploadMode} mode)...`);

    try {
      let questions;

      if (uploadMode === 'mcq') {
        // Generate MCQ questions for MCQ mode
        console.log('📋 MCQ mode detected - generating MCQ questions...');
        questions = await generateMultiplePDFMCQQuestions(fileId, fileId, 10, 'General');
      } else {
        // Generate long-form questions for practice/exam modes
        console.log('📝 Long-form mode detected - generating traditional questions...');
        questions = await generateMultiplePDFQuestions(fileId, fileId, 10, 'General');
      }

      // Insert each question into cache
      for (const q of questions) {
        // MCQ questions don't go to cached_questions (they go directly to library)
        if (uploadMode !== 'mcq') {
          await insertCachedQuestion(fileId, q);
        }
      }

      console.log(`✅ Generated ${questions.length} ${uploadMode === 'mcq' ? 'MCQ' : 'long-form'} questions`);
    } catch (batchError) {
      console.error(`⚠️ Batch generation failed:`, batchError.message);
      throw batchError;
    }

    // Update status to 'complete'
    await updateUploadedFileStatus(fileId, 'complete');
    console.log(`\n✅ Background generation complete for ${fileId}`);
  } catch (error) {
    console.error(`❌ Background generation failed: ${error.message}`);
    try {
      await updateUploadedFileStatus(fileId, 'error');
    } catch (statusError) {
      console.error('Could not update status:', statusError.message);
    }
  }
}

// Main function - decides between PDF-based or generic questions
async function generateAIQuestion(sessionId = null) {
  if (sessionId) {
    console.log(`\n🔍 Checking session ${sessionId} for PDF...`);
  }

  // If sessionId provided, check if session has linked PDF
  if (sessionId) {
    try {
      const session = await new Promise((resolve, reject) => {
        db.get('SELECT fileId FROM sessions WHERE sessionId = ?', [sessionId], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });

      console.log(`   Session found: ${session ? 'YES' : 'NO'}`);
      if (session) {
        console.log(`   fileId: ${session.fileId || 'NULL'}`);
      }

      // If session has PDF, generate PDF-based question
      if (session && session.fileId) {
        console.log(`✅ USING PDF! Generating PDF-based question from ${session.fileId}`);
        return await generatePDFBasedQuestion(sessionId, session.fileId);
      } else {
        console.log(`❌ No PDF linked to session, falling back to generic question`);
      }
    } catch (error) {
      console.warn('⚠️ Error checking session PDF:', error.message);
      // Fall through to generic question
    }
  }

  // Fallback to generic AI question
  console.log('🤖 Generating generic AI question (no session or no PDF)');
  const question = await generateGenericAIQuestion();
  return {
    question,
    chunkIndex: null,
    pdfBased: false,
    source: 'ai'
  };
}


// ========================================
// PDF PROCESSING & UPLOAD
// ========================================

// Ensure uploads directory exists
const uploadsDir = './uploads';
if (!fsSync.existsSync(uploadsDir)) {
  fsSync.mkdirSync(uploadsDir, { recursive: true });
  console.log('📁 Created uploads directory');
}

// Configure multer for PDF uploads
const upload = multer({
  dest: './uploads/',
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    // Accept PDF mimetype or octet-stream or any file (we'll validate in processPDF)
    console.log(`📄 Upload attempt - name: ${file.originalname}, mimetype: ${file.mimetype}`);
    // Accept application/pdf, octet-stream, or any file ending in .pdf
    const isPDF = file.mimetype === 'application/pdf' ||
                  file.mimetype === 'application/octet-stream' ||
                  file.originalname.toLowerCase().endsWith('.pdf');
    if (isPDF) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  }
});

// Classify chunk type based on content keywords
function classifyChunkType(text) {
  const lower = text.toLowerCase();
  const mechanismKeywords = ['pathway', 'mechanism', 'process', 'cascade', 'regulated', 'signaling', 'synthesis'];
  const exampleKeywords = ['example', 'case', 'instance', 'such as', 'for example', 'including'];
  const clinicalKeywords = ['clinical', 'diagnosis', 'treatment', 'patient', 'symptom', 'therapy', 'disease'];

  const mechanismScore = mechanismKeywords.filter(k => lower.includes(k)).length;
  const exampleScore = exampleKeywords.filter(k => lower.includes(k)).length;
  const clinicalScore = clinicalKeywords.filter(k => lower.includes(k)).length;

  if (mechanismScore >= 2) return 'mechanism';
  if (exampleScore >= 1) return 'example';
  if (clinicalScore >= 2) return 'clinical';
  return 'general';
}

// Intelligent chunking algorithm - splits by paragraphs into 500-1000 word chunks
function intelligentChunk(fullText) {
  // Split by double newlines (paragraphs)
  const paragraphs = fullText
    .split(/\n\n+/)
    .map(p => p.trim())
    .filter(p => p.length > 50); // Filter out very short paragraphs

  const chunks = [];
  let currentChunk = '';
  let wordCount = 0;

  for (const para of paragraphs) {
    const paraWords = para.split(/\s+/).length;

    // If adding this paragraph exceeds 1000 words and we have at least 500, finalize chunk
    if (wordCount + paraWords > 1000 && wordCount >= 500) {
      chunks.push({
        text: currentChunk.trim(),
        wordCount: wordCount,
        type: classifyChunkType(currentChunk)
      });
      currentChunk = para;
      wordCount = paraWords;
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + para;
      wordCount += paraWords;
    }
  }

  // Add final chunk if it has content
  if (currentChunk.trim() && wordCount >= 100) {
    chunks.push({
      text: currentChunk.trim(),
      wordCount: wordCount,
      type: classifyChunkType(currentChunk)
    });
  }

  return chunks;
}

// Process uploaded PDF: parse, chunk, store
async function processPDF(filePath, originalFilename) {
  const fileId = 'pdf_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

  try {
    console.log('📄 Processing PDF:', originalFilename);

    // Read PDF file
    const dataBuffer = await fs.readFile(filePath);

    // Parse PDF to extract text
    const pdfData = await pdfParse(dataBuffer);
    const fullText = pdfData.text;

    if (!fullText || fullText.trim().length < 100) {
      throw new Error('PDF appears to be empty or contains no extractable text (possibly a scanned image)');
    }

    console.log(`📝 Extracted ${fullText.length} characters from PDF`);

    // Intelligent chunking
    const chunks = intelligentChunk(fullText);

    if (chunks.length === 0) {
      throw new Error('Could not create meaningful chunks from PDF content');
    }

    console.log(`✂️  Created ${chunks.length} intelligent chunks`);

    // Store in database
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO uploaded_files (fileId, originalFilename, filePath, fileSize, extractedText, totalChunks, status)
         VALUES (?, ?, ?, ?, ?, ?, 'ready')`,
        [fileId, originalFilename, filePath, dataBuffer.length, fullText, chunks.length],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // Store chunks
    for (let i = 0; i < chunks.length; i++) {
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO pdf_chunks (fileId, chunkIndex, chunkText, chunkType, wordCount)
           VALUES (?, ?, ?, ?, ?)`,
          [fileId, i, chunks[i].text, chunks[i].type, chunks[i].wordCount],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    }

    console.log('✅ PDF processed successfully:', fileId);
    return {
      success: true,
      fileId,
      totalChunks: chunks.length,
      filename: originalFilename
    };
  } catch (error) {
    console.error('❌ PDF processing error:', error.message);

    // Update status to failed if record exists
    db.run(`UPDATE uploaded_files SET status = 'failed' WHERE fileId = ?`, [fileId]);

    return {
      success: false,
      error: error.message
    };
  }
}

// ========================================
// NEW: MCQ LEARNING ENGINE HELPER FUNCTIONS
// ========================================

// NEW: Load session's performance history (correct/wrong questions)
async function loadSessionPerformance(sessionId) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT id, question, optionsJSON, correctOption, userAnswer, isCorrect, reviewCount, difficulty
       FROM mcq_performance WHERE sessionId = ? ORDER BY timestamp DESC`,
      [sessionId],
      (err, rows) => {
        if (err) {
          console.error('❌ Error loading session performance:', err);
          resolve({ correctQuestions: [], wrongQuestions: [] });
          return;
        }

        if (!rows || rows.length === 0) {
          resolve({ correctQuestions: [], wrongQuestions: [] });
          return;
        }

        const performance = {
          correctQuestions: rows.filter(r => r.isCorrect).map(r => ({
            id: r.id,
            question: r.question,
            optionsJSON: r.optionsJSON,
            correctOption: r.correctOption,
            difficulty: r.difficulty,
            timestamp: r.timestamp
          })),
          wrongQuestions: rows.filter(r => !r.isCorrect && r.reviewCount < 2).map(r => ({
            id: r.id,
            question: r.question,
            optionsJSON: r.optionsJSON,
            correctOption: r.correctOption,
            userAnswer: r.userAnswer,
            reviewCount: r.reviewCount || 0,
            difficulty: r.difficulty,
            lastReviewedAt: r.lastReviewedAt
          }))
        };

        console.log(`📊 Loaded performance: ${performance.correctQuestions.length} correct, ${performance.wrongQuestions.length} wrong`);
        resolve(performance);
      }
    );
  });
}

// NEW: Decide whether to return revision question or generate new one (30% probability)
async function selectNextMCQLogic(sessionId, fileId) {
  const performance = await loadSessionPerformance(sessionId);

  // 30% probability to show revision question if wrong questions exist
  const shouldShowRevision = performance.wrongQuestions.length > 0 && Math.random() <= 0.3;

  if (shouldShowRevision) {
    // REVISION MODE: Pick random from wrongQuestions
    const revision = performance.wrongQuestions[
      Math.floor(Math.random() * performance.wrongQuestions.length)
    ];

    console.log(`🔁 Revision Logic: Returning revision question (${revision.reviewCount + 1}/2 attempts)`);

    return {
      mode: 'revision',
      question: revision.question,
      options: JSON.parse(revision.optionsJSON),
      correctOption: revision.correctOption,
      difficulty: revision.difficulty,
      isRevision: true,
      reviewCount: revision.reviewCount + 1,
      revisedQuestionId: revision.id,
      explanation: 'This question was previously missed. Let\'s try again!'
    };
  }

  // NEW QUESTION MODE (70% or no wrong questions yet)
  return {
    mode: 'new',
    isRevision: false,
    reviewCount: 0
  };
}

// POST: Upload PDF endpoint
app.post('/pdf/upload', upload.single('pdfFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    // Get uploadMode from request (which mode is uploading this PDF)
    const uploadMode = req.body.uploadMode || 'practice'; // default to practice

    const result = await processPDF(req.file.path, req.file.originalname);

    if (result.success) {
      const fileId = result.fileId;

      // Store uploadMode in database
      db.run(
        'UPDATE uploaded_files SET uploadMode = ?, questionType = ? WHERE fileId = ?',
        [uploadMode, uploadMode === 'mcq' ? 'mcq' : 'long-form', fileId],
        (err) => {
          if (err) {
            console.error('Error setting uploadMode:', err.message);
          } else {
            console.log(`✅ Set uploadMode="${uploadMode}" for ${fileId}`);
          }
        }
      );

      // Spawn background question generation (non-blocking)
      console.log(`\n📨 Spawning background generation for ${fileId} (mode: ${uploadMode})...`);
      generateQuestionsInBackground(fileId, uploadMode).catch(err => {
        console.error(`❌ Background job error for ${fileId}:`, err.message);
      });

      // Return result immediately to frontend
      res.json({ ...result, uploadMode, questionType: uploadMode === 'mcq' ? 'mcq' : 'long-form' });
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST: Set subject for uploaded PDF
app.post('/pdf/subject', (req, res) => {
  const { fileId, subject } = req.body;

  if (!fileId || !subject) {
    return res.status(400).json({ success: false, error: 'fileId and subject required' });
  }

  console.log(`📚 Setting subject for ${fileId}: ${subject}`);

  db.run(
    'UPDATE uploaded_files SET subject = ? WHERE fileId = ?',
    [subject, fileId],
    (err) => {
      if (err) {
        console.error('Error setting subject:', err.message);
        return res.status(500).json({ success: false, error: err.message });
      }
      res.json({ success: true, subject });
    }
  );
});

// GET: Check PDF processing status
app.get('/pdf/status/:fileId', (req, res) => {
  const { fileId } = req.params;

  db.get(
    'SELECT fileId, originalFilename, totalChunks, status, uploadTime FROM uploaded_files WHERE fileId = ?',
    [fileId],
    (err, row) => {
      if (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
      if (!row) {
        return res.status(404).json({ success: false, error: 'PDF not found' });
      }
      res.json({ success: true, ...row });
    }
  );
});

// DELETE: Remove uploaded PDF
app.delete('/pdf/:fileId', async (req, res) => {
  const { fileId } = req.params;

  try {
    // Get file path
    const file = await new Promise((resolve, reject) => {
      db.get('SELECT filePath FROM uploaded_files WHERE fileId = ?', [fileId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!file) {
      return res.status(404).json({ success: false, error: 'PDF not found' });
    }

    // Delete from database
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM pdf_chunks WHERE fileId = ?', [fileId], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    await new Promise((resolve, reject) => {
      db.run('DELETE FROM uploaded_files WHERE fileId = ?', [fileId], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Delete physical file
    try {
      await fs.unlink(file.filePath);
    } catch (err) {
      console.warn('Could not delete physical file:', err.message);
    }

    res.json({ success: true, message: 'PDF deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET: Get PDF info and chunks
app.get('/pdf/info/:fileId', (req, res) => {
  const { fileId } = req.params;

  db.get(
    'SELECT * FROM uploaded_files WHERE fileId = ?',
    [fileId],
    (err, file) => {
      if (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
      if (!file) {
        return res.status(404).json({ success: false, error: 'PDF not found' });
      }

      // Get chunks summary
      db.all(
        'SELECT chunkIndex, chunkType, wordCount FROM pdf_chunks WHERE fileId = ? ORDER BY chunkIndex',
        [fileId],
        (err, chunks) => {
          if (err) {
            return res.status(500).json({ success: false, error: err.message });
          }

          res.json({
            success: true,
            file: {
              fileId: file.fileId,
              filename: file.originalFilename,
              totalChunks: file.totalChunks,
              uploadTime: file.uploadTime,
              status: file.status
            },
            chunks
          });
        }
      );
    }
  );
});

// GET: Check generation progress for pre-generated questions
app.get('/pdf/generation-progress/:fileId', (req, res) => {
  const { fileId } = req.params;

  // Get file status and count of cached questions
  db.get('SELECT totalChunks, status FROM uploaded_files WHERE fileId = ?', [fileId], (err, file) => {
    if (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
    if (!file) {
      return res.status(404).json({ success: false, error: 'PDF not found' });
    }

    // Count cached questions
    db.get('SELECT COUNT(*) as generated FROM cached_questions WHERE fileId = ?', [fileId], (err, row) => {
      if (err) {
        return res.status(500).json({ success: false, error: err.message });
      }

      const generated = row?.generated || 0;
      const estimatedTotal = 10;  // Target: 10 questions (1 batch)
      const percentComplete = Math.round((generated / estimatedTotal) * 100);

      res.json({
        success: true,
        fileId,
        status: file.status,
        generated,
        totalChunks: file.totalChunks,
        estimatedTotal,
        percentComplete
      });
    });
  });
});

// GET: Fetch cached pre-generated questions with pagination
app.get('/pdf/cached-questions/:fileId', (req, res) => {
  const { fileId } = req.params;
  const limit = parseInt(req.query.limit) || 18;
  const offset = parseInt(req.query.offset) || 0;

  // Get total count and paginated questions
  db.get('SELECT COUNT(*) as total FROM cached_questions WHERE fileId = ?', [fileId], (err, countRow) => {
    if (err) {
      return res.status(500).json({ success: false, error: err.message });
    }

    const total = countRow?.total || 0;

    db.all(
      `SELECT question, difficulty, difficultyEmoji, chunkIndex, totalChunks, chunkType, pdfFilename, pdfBased, source
       FROM cached_questions WHERE fileId = ? ORDER BY generatedAt ASC LIMIT ? OFFSET ?`,
      [fileId, limit, offset],
      (err, questions) => {
        if (err) {
          return res.status(500).json({ success: false, error: err.message });
        }

        res.json({
          success: true,
          questions: questions || [],
          total,
          offset,
          limit,
          hasMore: offset + limit < total
        });
      }
    );
  });
});

// POST: Fetch cached pre-generated questions (from frontend with JSON body)
app.post('/pdf/cached-questions', (req, res) => {
  const { fileId, limit = 18, offset = 0 } = req.body;

  if (!fileId) {
    return res.status(400).json({ success: false, error: 'fileId required' });
  }

  console.log(`📦 Fetching cached questions for ${fileId}...`);

  // Get total count and paginated questions
  db.get('SELECT COUNT(*) as total FROM cached_questions WHERE fileId = ?', [fileId], (err, countRow) => {
    if (err) {
      return res.status(500).json({ success: false, error: err.message });
    }

    const total = countRow?.total || 0;
    console.log(`   Found ${total} cached questions`);

    // If no cached questions yet, return empty array with status
    if (total === 0) {
      return res.json({
        success: true,
        questions: [],
        total: 0,
        offset,
        limit,
        hasMore: false
      });
    }

    db.all(
      `SELECT question, difficulty, difficultyEmoji, chunkIndex, totalChunks, chunkType, pdfFilename, pdfBased, source
       FROM cached_questions WHERE fileId = ? ORDER BY generatedAt ASC LIMIT ? OFFSET ?`,
      [fileId, limit, offset],
      (err, questions) => {
        if (err) {
          return res.status(500).json({ success: false, error: err.message });
        }

        res.json({
          success: true,
          questions: questions || [],
          total,
          offset,
          limit,
          hasMore: offset + limit < total
        });
      }
    );
  });
});


// POST: Generate multiple questions with difficulty levels from PDF
app.post('/pdf/generate-questions', async (req, res) => {
  try {
    const { sessionId, fileId, numberOfQuestions = 18, subject = 'General' } = req.body;

    if (!sessionId || !fileId) {
      return res.status(400).json({
        success: false,
        error: 'sessionId and fileId required'
      });
    }

    console.log(`\n📋 Request: Generate ${numberOfQuestions} questions from ${fileId} (Subject: ${subject})`);

    const questions = await generateMultiplePDFQuestions(sessionId, fileId, numberOfQuestions, subject);

    res.json({
      success: true,
      questions,
      total: questions.length,
      easyCount: questions.filter(q => q.difficulty === 'easy').length,
      mediumCount: questions.filter(q => q.difficulty === 'medium').length,
      hardCount: questions.filter(q => q.difficulty === 'hard').length
    });
  } catch (error) {
    console.error('❌ Batch Question Generation Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST: Generate more questions from existing PDF (for "Generate More" button)
app.post('/pdf/generate-more-questions', async (req, res) => {
  try {
    const { sessionId, fileId, numberOfQuestions = 6, subject = 'General' } = req.body;

    if (!fileId) {
      return res.status(400).json({
        success: false,
        error: 'fileId required'
      });
    }

    console.log(`\n⚡ Request: Generate ${numberOfQuestions} MORE questions from ${fileId} (Subject: ${subject})`);

    const questions = await generateMultiplePDFQuestions(sessionId || 'more-' + Date.now(), fileId, numberOfQuestions, subject);

    res.json({
      success: true,
      questions,
      total: questions.length,
      easyCount: questions.filter(q => q.difficulty === 'easy').length,
      mediumCount: questions.filter(q => q.difficulty === 'medium').length,
      hardCount: questions.filter(q => q.difficulty === 'hard').length,
      note: 'Deduplication system prevents similar questions from library'
    });
  } catch (error) {
    console.error('❌ Additional Question Generation Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});



// GET: Random practice question
app.get("/question", async (req, res) => {
  try {
    const { sessionId } = req.query;

    // If no API key, use local questions
    if (!OPENROUTER_API_KEY) {
      const localQuestion = getRandomQuestions(1)[0];
      return res.json({
        question: localQuestion.question,
        source: 'local',
        chunkIndex: null,
        totalChunks: null,
        chunkType: null,
        pdfFilename: null,
        pdfBased: false,
        timestamp: new Date().toISOString()
      });
    }

    // Generate AI question (PDF-based if session has PDF, otherwise generic)
    const result = await generateAIQuestion(sessionId);

    res.json({
      question: result.question,
      source: result.source,
      chunkIndex: result.chunkIndex,
      totalChunks: result.totalChunks || null,
      chunkType: result.chunkType || null,
      pdfFilename: result.pdfFilename || null,
      pdfBased: result.pdfBased,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ AI Error:', error.message);
    console.log('📚 Falling back to local question');

    // Fallback to local question on API error
    const localQuestion = getRandomQuestions(1)[0];
    res.json({
      question: localQuestion.question,
      source: 'local (fallback)',
      chunkIndex: null,
      totalChunks: null,
      chunkType: null,
      pdfFilename: null,
      pdfBased: false,
      timestamp: new Date().toISOString()
    });
  }
});

// ========================================
// BULLETPROOF FALLBACK ENDPOINT
// ========================================
app.get("/question/fallback", (req, res) => {
  try {
    // GUARANTEED hardcoded questions that will ALWAYS work
    const guaranteedFallbacks = [
      {
        question: "Explain the pathophysiology of Type 2 Diabetes Mellitus",
        difficulty: "medium",
        source: "guaranteed-fallback"
      },
      {
        question: "Describe the Frank-Starling mechanism of cardiac contraction",
        difficulty: "hard",
        source: "guaranteed-fallback"
      },
      {
        question: "What are the causes and clinical features of acute myocardial infarction?",
        difficulty: "hard",
        source: "guaranteed-fallback"
      },
      {
        question: "Explain the renin-angiotensin-aldosterone system (RAAS) and its role in blood pressure regulation",
        difficulty: "hard",
        source: "guaranteed-fallback"
      },
      {
        question: "Describe the pathophysiology of systolic and diastolic heart failure",
        difficulty: "hard",
        source: "guaranteed-fallback"
      },
      {
        question: "What are the mechanisms of action and clinical uses of ACE inhibitors?",
        difficulty: "medium",
        source: "guaranteed-fallback"
      },
      {
        question: "Explain the phases of the cardiac action potential and involved ion channels",
        difficulty: "hard",
        source: "guaranteed-fallback"
      },
      {
        question: "Give the mechanisms of acute coronary syndrome and how it differs from chronic ischemic heart disease",
        difficulty: "hard",
        source: "guaranteed-fallback"
      }
    ];

    const randomFallback = guaranteedFallbacks[Math.floor(Math.random() * guaranteedFallbacks.length)];

    res.json({
      question: randomFallback.question,
      source: randomFallback.source,
      difficulty: randomFallback.difficulty,
      chunkIndex: null,
      totalChunks: null,
      chunkType: null,
      pdfFilename: null,
      pdfBased: false,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Fallback endpoint error:', error.message);
    // Even if there's an error, return a hardcoded question
    res.json({
      question: "What are the key differences between Type 1 and Type 2 diabetes mellitus?",
      source: "guaranteed-fallback (error recovery)",
      difficulty: "easy",
      chunkIndex: null,
      totalChunks: null,
      chunkType: null,
      pdfFilename: null,
      pdfBased: false,
      timestamp: new Date().toISOString()
    });
  }
});

// POST: Batch question generation (for zero-latency multi-queue preloading)
app.post("/questions/batch", async (req, res) => {
  try {
    const { sessionId, count = 5, source = 'ai', fileId, subject = null } = req.body;  // NEW: Add subject parameter

    // Validate count
    const batchSize = Math.min(Math.max(count, 1), 20); // Limit between 1 and 20

    // Log subject context if provided
    if (subject) {
      console.log(`📚 Batch generation with subject filter: ${subject}`);
    }

    if (!OPENROUTER_API_KEY) {
      // No API key: return local questions
      const localQuestions = getRandomQuestions(batchSize).map(q => ({
        question: q,
        source: 'local',
        difficulty: 'medium',
        pdfBased: false,
        chunkIndex: null,
        totalChunks: null,
        chunkType: null,
        pdfFilename: null
      }));

      return res.json({
        success: true,
        questions: localQuestions,
        totalAvailable: localQuestions.length
      });
    }

    // Generate batch of questions
    const questions = [];

    // If PDF-based request, use PDF context
    if (fileId && sessionId) {
      for (let i = 0; i < batchSize; i++) {
        try {
          const q = await generatePDFBasedQuestion(sessionId, fileId);
          questions.push({
            ...q,
            source: 'pdf',
            pdfBased: true
          });

          // Small delay between requests to avoid API rate limiting
          if (i < batchSize - 1) {
            await new Promise(resolve => setTimeout(resolve, 150));
          }
        } catch (error) {
          console.warn(`⚠️ PDF question ${i + 1} failed:`, error.message);
          // Add fallback local question if PDF generation fails
          const localQ = getRandomQuestions(1)[0];
          questions.push({
            question: localQ.question,
            source: 'local',
            difficulty: 'medium',
            pdfBased: false,
            chunkIndex: null,
            totalChunks: null,
            chunkType: null,
            pdfFilename: null
          });
        }
      }
    } else {
      // Generate generic AI questions
      for (let i = 0; i < batchSize; i++) {
        try {
          const q = await generateAIQuestion(sessionId);
          questions.push({
            ...q,
            source: 'ai',
            pdfBased: false
          });

          // Small delay between requests
          if (i < batchSize - 1) {
            await new Promise(resolve => setTimeout(resolve, 150));
          }
        } catch (error) {
          console.warn(`⚠️ AI question ${i + 1} failed:`, error.message);
          // Add fallback local question if AI generation fails
          const localQ = getRandomQuestions(1)[0];
          questions.push({
            question: localQ.question,
            source: 'local',
            difficulty: 'medium',
            pdfBased: false,
            chunkIndex: null,
            totalChunks: null,
            chunkType: null,
            pdfFilename: null
          });
        }
      }
    }

    console.log(`📦 Batch: Generated ${questions.length} questions (${source})`);

    res.json({
      success: true,
      questions: questions,
      totalAvailable: questions.length
    });
  } catch (error) {
    console.error('❌ Batch generation error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      questions: []
    });
  }
});

// ========================================
// GET QUESTION FROM LIBRARY (14K+ imported questions!)
// ========================================
// Generate MCQ options from library answer WITHOUT AI (fast & reliable)
function generateMCQFromLibraryQuestion(libraryQuestion) {
  // Simple generic distractors that don't require AI
  const distractors = [
    "It is not affected by any external factors",
    "The condition is always fatal and untreatable",
    "This only occurs in children under 5 years old",
    "It is a purely genetic disorder with no environmental factors",
    "This only occurs in developed countries",
    "The treatment requires surgical intervention in all cases",
    "It has no established medical treatment",
    "This is contagious through airborne transmission",
    "It primarily affects women over 65 years old",
    "The causes are completely unknown to science",
    "This condition cannot be prevented",
    "It requires hospitalization in all cases"
  ];

  // Randomly pick 3 different distractors
  const selectedDistracters = [];
  const used = new Set();
  while (selectedDistracters.length < 3) {
    const index = Math.floor(Math.random() * distractors.length);
    if (!used.has(index)) {
      selectedDistracters.push(distractors[index]);
      used.add(index);
    }
  }

  // Shuffle options: create array with correct answer + 3 distractors
  const allOptions = [
    libraryQuestion.explanation,
    ...selectedDistracters
  ];

  // Fisher-Yates shuffle
  for (let i = allOptions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allOptions[i], allOptions[j]] = [allOptions[j], allOptions[i]];
  }

  // Convert to A, B, C, D format
  const options = {
    A: allOptions[0],
    B: allOptions[1],
    C: allOptions[2],
    D: allOptions[3]
  };

  // Find which option is correct
  const correctOption = Object.keys(options).find(key => options[key] === libraryQuestion.explanation);

  return {
    question: libraryQuestion.question,
    options: options,
    correctOption: correctOption,
    explanation: libraryQuestion.explanation,
    difficulty: libraryQuestion.difficulty,
    subject: libraryQuestion.subject,
    source: 'library',
    questionType: 'mcq',
    pdfBased: false
  };
}

async function getQuestionFromLibrary(difficulty = 'medium') {
  return new Promise((resolve, reject) => {
    // ✨ TRUE RANDOMIZATION: Use ORDER BY RANDOM() LIMIT 1
    // This forces SQLite to randomize the entire table then grab ONE question
    // Much better than LIMIT 1000 + JavaScript random (which creates predictable subsets)
    libraryDb.get(
      `SELECT question, perfect_answer as explanation, difficulty, subject
       FROM library_questions
       WHERE difficulty = ?
       ORDER BY RANDOM()
       LIMIT 1`,
      [difficulty],
      (err, row) => {
        if (err) {
          console.error('❌ Library query error:', err.message);
          reject(err);
        } else if (row) {
          console.log(`✅ Got RANDOM question from library (${difficulty}), generating MCQ options...`);
          try {
            const mcqQuestion = generateMCQFromLibraryQuestion(row);
            resolve(mcqQuestion);
          } catch (mcqError) {
            console.error('❌ Failed to generate MCQ options:', mcqError.message);
            reject(mcqError);
          }
        } else {
          reject(new Error(`No ${difficulty} questions in library`));
        }
      }
    );
  });
}

// POST: Evaluate answer
app.post("/evaluate", async (req, res) => {
  // Accept both 'answer' and 'userAnswer' for flexibility
  const { question, answer, userAnswer } = req.body;
  const finalAnswer = answer || userAnswer;

  if (!finalAnswer || !finalAnswer.trim()) {
    return res.json({
      score: 0,
      feedback: "No answer provided",
      isAIPowered: false
    });
  }

  try {
    // UPDATED: Use AI-powered evaluation instead of local
    const evaluation = await evaluateAnswerWithAI(question, finalAnswer);
    const response = {
      score: evaluation.score || 0,
      feedback: evaluation.feedback || "Unable to evaluate",
      isAIPowered: evaluation.isAIPowered || false
    };
    console.log('[EVALUATE RESPONSE]', response);
    res.json(response);
  } catch (error) {
    console.error('❌ Evaluation failed:', error.message);
    res.status(500).json({
      score: 0,
      feedback: "Error evaluating answer",
      isAIPowered: false
    });
  }
});

// ==== NEW: PERFECT ANSWER ENDPOINT ====
app.post("/perfect-answer", async (req, res) => {
  const { question } = req.body;

  console.log('📨 [PERFECT ANSWER ENDPOINT] Received request');

  if (!question || !question.trim()) {
    console.warn('⚠️ [PERFECT ANSWER ENDPOINT] No question provided');
    return res.status(400).json({
      success: false,
      error: "No question provided",
      answer: ""
    });
  }

  console.log('✏️ [PERFECT ANSWER ENDPOINT] Question:', question.substring(0, 60) + '...');

  try {
    const perfectAnswer = await generatePerfectAnswer(question);

    const response = {
      success: true,
      answer: perfectAnswer
    };

    console.log('✅ [PERFECT ANSWER ENDPOINT] Sending response:', perfectAnswer.substring(0, 80) + '...');
    res.json(response);

  } catch (error) {
    console.error('❌ [PERFECT ANSWER ENDPOINT] Generation failed:', error.message);
    res.status(500).json({
      success: false,
      error: "Failed to generate perfect answer",
      answer: "Unable to generate answer at this moment. Make sure the API key is set and you have available credits.",
      details: error.message
    });
  }
});

// ========================================
// MCQ MODE ENDPOINTS (NEW)
// ========================================

// POST: Get MCQ question
app.post("/mcq-question", async (req, res) => {
  try {
    const { sessionId, fileId, difficulty } = req.body;
    const diff = difficulty || 'medium';

    console.log(`\n📋 MCQ Question Endpoint - sessionId=${sessionId}, fileId=${fileId}, difficulty=${diff}`);

    // NEW: Check learning engine for revision question
    const mcqLogic = await selectNextMCQLogic(sessionId, fileId);

    if (mcqLogic.mode === 'revision') {
      // Return revision question with metadata
      console.log(`🔁 Returning revision question (attempt ${mcqLogic.reviewCount}/2)`);
      return res.json({
        question: mcqLogic.question,
        options: mcqLogic.options,
        correctOption: mcqLogic.correctOption,
        explanation: mcqLogic.explanation,
        difficulty: mcqLogic.difficulty,
        questionType: 'mcq',
        isRevision: true,
        reviewCount: mcqLogic.reviewCount,
        revisedQuestionId: mcqLogic.revisedQuestionId,
        source: 'revision',
        pdfBased: false,
        choice_type: 'single'
      });
    }

    // PRIORITY 1: Try MCQ Database (test.csv imported questions)
    try {
      console.log('🗂️  Attempting to fetch from MCQ database...');
      const dbQuestion = await getFromMCQDatabase(diff);
      if (dbQuestion) {
        console.log(`✅ MCQ from database: "${dbQuestion.question.substring(0, 60)}..."`);
        return res.json({ ...dbQuestion, isRevision: false, reviewCount: 0 });
      }
    } catch (dbError) {
      console.warn(`⚠️ MCQ database error: ${dbError.message}`);
    }

    // PRIORITY 2: API-based generation
    if (!OPENROUTER_API_KEY) {
      console.warn('⚠️ No API key - skipping AI generation, using fallback MCQ');
      const fallback = getFallbackMCQ(diff);
      return res.json({ ...fallback, isRevision: false, reviewCount: 0 });
    }

    console.log('✅ API key detected, attempting AI MCQ generation...');

    // ADAPTIVE LEARNING: Select topic for this question (70% weak, 30% random)
    const forcedTopic = await learningService.selectTopicForQuestion(db, sessionId);

    let mcqQuestion;

    try {
      // Generate MCQ using AI or PDF
      if (fileId) {
        // PDF-based MCQ (uses PDF chunks)
        console.log('📄 PDF-based MCQ mode');
        mcqQuestion = await generatePDFBasedMCQQuestion(sessionId, fileId, diff);
      } else {
        // Generic MCQ (AI generated with optional topic bias)
        console.log('🤖 Generic AI MCQ mode' + (forcedTopic ? ` - topic bias: ${forcedTopic}` : ''));
        mcqQuestion = await generateGenericAIMCQQuestion(diff);
      }

      console.log('✅ MCQ returned, source: ' + (mcqQuestion.source || 'ai'));
      return res.json({ ...mcqQuestion, isRevision: false, reviewCount: 0 });
    } catch (generationError) {
      // Generation failed - gracefully fall back to fallback pool
      console.warn(`⚠️ MCQ generation failed (${generationError.message}), using fallback`);
      const fallback = getFallbackMCQ(diff);
      return res.json({ ...fallback, isRevision: false, reviewCount: 0 });
    }
  } catch (error) {
    console.error('❌ MCQ Endpoint Error:', error.message);
    // Even if something else goes wrong, try to return a fallback
    const diff = req.body?.difficulty || 'medium';
    const fallback = getFallbackMCQ(diff);
    return res.json({ ...fallback, isRevision: false, reviewCount: 0 });
  }
});

// POST: Evaluate MCQ answer (supports single and multi-answer)
app.post("/mcq-evaluate", async (req, res) => {
  try {
    const { sessionId, selectedOption, correctOption, difficulty, choice_type } = req.body;
    const isMulti = choice_type === 'multi';

    console.log(`📋 MCQ Evaluate - selected=${selectedOption}, correct=${correctOption}, type=${choice_type || 'single'}`);

    // Evaluation logic for single vs multi-answer
    let isCorrect = false;

    if (isMulti) {
      // Multi-answer: compare sorted arrays
      // selectedOption could be array ["A", "C"] or string "A,C"
      const selected = Array.isArray(selectedOption)
        ? selectedOption.sort()
        : selectedOption.split(',').map(s => s.trim()).sort();

      const correct = correctOption.split(',').map(s => s.trim()).sort();

      isCorrect = JSON.stringify(selected) === JSON.stringify(correct);
      console.log(`  Multi-answer check: selected=${selected.join(',')} vs correct=${correct.join(',')}`);
    } else {
      // Single-answer: direct comparison
      isCorrect = selectedOption === correctOption;
    }

    const score = isCorrect ? 10 : 0;

    // Save to database
    if (sessionId) {
      db.run(
        `INSERT INTO attempts (sessionId, questionIndex, question, answer, score, selectedOption, correctOption, isMCQ, questionType, timestamp)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [sessionId, 0, 'MCQ', Array.isArray(selectedOption) ? selectedOption.join(',') : selectedOption, score, selectedOption.toString(), correctOption, 1, choice_type || 'single', new Date().toISOString()],
        (err) => {
          if (err) {
            console.error('❌ Error saving MCQ attempt:', err.message);
          } else {
            console.log(`✅ MCQ attempt saved (score: ${score}, correct: ${isCorrect})`);
          }
        }
      );
    }

    res.json({
      isCorrect,
      score,
      selectedOption: Array.isArray(selectedOption) ? selectedOption : selectedOption,
      correctOption,
      choice_type: choice_type || 'single',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ MCQ Evaluate Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      isCorrect: false,
      score: 0
    });
  }
});

// NEW: /mcq/evaluate - Save MCQ answer and update learning engine
app.post("/mcq/evaluate", async (req, res) => {
  try {
    const {
      sessionId,
      username,  // NEW
      question,
      optionsJSON,
      correctOption,
      userAnswer,
      difficulty,
      isRevision,
      reviewCount,
      topic,
      subtopic
    } = req.body;

    const isCorrect = userAnswer === correctOption ? 1 : 0;
    const score = isCorrect ? 10 : 0;

    console.log(`📊 MCQ Evaluate (Learning): correct=${isCorrect}, revision=${isRevision}, count=${reviewCount}, topic=${topic}, user=${username}`);

    // NEW: Update user stats if username provided
    if (username) {
      const cleanUsername = username.trim().substring(0, 50);
      updateUserStats(cleanUsername, isCorrect, isCorrect ? 0 : 1, topic);
    }

    // ADAPTIVE LEARNING: Update topic performance tracking
    if (topic) {
      await learningService.updateTopicPerformance(db, sessionId, topic, subtopic, isCorrect);
    }

    // Save to mcq_performance table (learning history)
    db.run(
      `INSERT INTO mcq_performance (
        sessionId, question, optionsJSON, correctOption, userAnswer,
        isCorrect, difficulty, reviewCount, lastReviewedAt, topic, subtopic
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sessionId, question, optionsJSON, correctOption, userAnswer,
        isCorrect, difficulty, reviewCount || 0,
        new Date().toISOString(), topic, subtopic
      ],
      function(err) {
        if (err) {
          console.error('❌ Error saving to MCQ performance:', err);
          return res.json({ success: false, error: err.message });
        }

        // Update session statistics
        db.run(
          `UPDATE sessions SET
            totalAttempts = totalAttempts + 1,
            ${isCorrect ? 'correctAnswers = correctAnswers + 1' : 'wrongAnswers = wrongAnswers + 1'}
           WHERE sessionId = ?`,
          [sessionId],
          (err) => {
            if (err) {
              console.error('❌ Error updating session stats:', err);
            } else {
              console.log(`✅ Session stats updated: isCorrect=${isCorrect}`);
            }

            // If revision AND correct AND reviewCount >= 2 → mark for removal
            if (isRevision && isCorrect && reviewCount >= 2) {
              db.run(
                `UPDATE mcq_performance SET markedForRemoval = 1
                 WHERE sessionId = ? AND question = ? AND correctOption = ?`,
                [sessionId, question, correctOption],
                (err) => {
                  if (!err) {
                    console.log(`🎓 Question graduated after 2 correct reviews`);
                  }
                }
              );
            }

            // Get updated stats for response
            db.get(
              `SELECT correctAnswers, wrongAnswers, totalAttempts
               FROM sessions WHERE sessionId = ?`,
              [sessionId],
              (err, session) => {
                res.json({
                  success: true,
                  isCorrect: isCorrect,
                  score: score,
                  stats: session || { correctAnswers: 0, wrongAnswers: 0, totalAttempts: 0 }
                });
              }
            );
          }
        );
      }
    );
  } catch (error) {
    console.error('❌ MCQ Evaluate Error:', error.message);
    res.json({ success: false, error: error.message });
  }
});

// NEW: /mcq/session-stats - Get session performance data
app.post("/mcq/session-stats", async (req, res) => {
  try {
    const { sessionId } = req.body;

    // Get performance history
    db.all(
      `SELECT question, optionsJSON, correctOption, userAnswer, isCorrect, reviewCount
       FROM mcq_performance WHERE sessionId = ? ORDER BY timestamp DESC LIMIT 100`,
      [sessionId],
      (err, attempts) => {
        if (err) {
          console.error('❌ Error loading performance history:', err);
          return res.json({ success: false, error: err.message });
        }

        // Get session stats
        db.get(
          `SELECT correctAnswers, wrongAnswers, totalAttempts
           FROM sessions WHERE sessionId = ?`,
          [sessionId],
          (err, session) => {
            const performance = {
              correctQuestions: (attempts || []).filter(a => a.isCorrect).map(a => ({
                question: a.question,
                correctOption: a.correctOption
              })),
              wrongQuestions: (attempts || []).filter(a => !a.isCorrect && a.reviewCount < 2).map(a => ({
                question: a.question,
                optionsJSON: a.optionsJSON,
                correctOption: a.correctOption,
                userAnswer: a.userAnswer,
                reviewCount: a.reviewCount
              }))
            };

            const stats = session || { correctAnswers: 0, wrongAnswers: 0, totalAttempts: 0 };
            const accuracy = stats.totalAttempts > 0
              ? Math.round((stats.correctAnswers / stats.totalAttempts) * 100)
              : 0;

            res.json({
              success: true,
              performance,
              stats: {
                correctCount: stats.correctAnswers,
                wrongCount: stats.wrongAnswers,
                totalAttempts: stats.totalAttempts,
                accuracy: accuracy
              }
            });
          }
        );
      }
    );
  } catch (error) {
    console.error('❌ Session Stats Error:', error.message);
    res.json({ success: false, error: error.message });
  }
});

// NEW: /mcq/session-end - Cleanup graduated questions at session end
app.post("/mcq/session-end", async (req, res) => {
  try {
    const { sessionId } = req.body;

    console.log(`🏁 MCQ Session End for ${sessionId} - Cleaning up graduated questions`);

    // Count graduated questions (markedForRemoval = 1)
    db.get(
      `SELECT COUNT(*) as graduatedCount FROM mcq_performance
       WHERE sessionId = ? AND markedForRemoval = 1`,
      [sessionId],
      (err, result) => {
        const graduatedCount = result?.graduatedCount || 0;

        // Delete graduated questions (optional - or just mark them)
        // For now, we'll just count them and report
        console.log(`🎓 Session ${sessionId} completed with ${graduatedCount} mastered questions`);

        // Get final stats
        db.get(
          `SELECT correctAnswers, wrongAnswers, totalAttempts
           FROM sessions WHERE sessionId = ?`,
          [sessionId],
          (err, session) => {
            res.json({
              success: true,
              graduatedCount: graduatedCount,
              finalStats: session || { correctAnswers: 0, wrongAnswers: 0, totalAttempts: 0 }
            });
          }
        );
      }
    );
  } catch (error) {
    console.error('❌ Session End Error:', error.message);
    res.json({ success: false, error: error.message });
  }
});

// GET: Health check
app.get("/health", (req, res) => {
  res.json({
    status: "Server running",
    uptime: process.uptime(),
    questions_available: questionBank.length,
    api_key_configured: !!OPENROUTER_API_KEY
  });
});

// GET: Diagnostic - Test AI connection
app.get("/diagnostic", async (req, res) => {
  console.log('\n🧪 DIAGNOSTIC TEST STARTED');
  console.log('1️⃣ Checking API Key...');

  const hasKey = !!OPENROUTER_API_KEY;
  console.log(`   API Key configured: ${hasKey ? '✅ YES' : '❌ NO'}`);

  if (!hasKey) {
    return res.status(400).json({
      error: 'API key not configured',
      solution: 'Add OPENROUTER_API_KEY to .env file'
    });
  }

  console.log('2️⃣ Testing AI Question Generation...');
  try {
    const aiQuestion = await generateAIQuestion();
    console.log('✅ AI Question Generated Successfully!');
    console.log('   Question:', aiQuestion.substring(0, 100) + '...');

    res.json({
      status: 'SUCCESS',
      message: 'AI is working correctly!',
      question: aiQuestion,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.log('❌ AI Question Generation Failed');
    console.log('   Error:', error.message);

    res.status(500).json({
      status: 'FAILED',
      error: error.message,
      solution: 'Check server console for detailed error logs',
      timestamp: new Date().toISOString()
    });
  }
});

// ========================================
// PROGRESS TRACKING
// ========================================

// POST: Save attempt
// UPDATED: Save attempt with username tracking
app.post("/progress/save", (req, res) => {
  try {
    const {
      sessionId,
      username,  // NEW: Now required
      questionIndex,
      question,
      answer,
      score,
      source,
      chunkIndex,
      pdfBased,
      difficulty,
      topic  // NEW: For topic tracking
    } = req.body;

    // VALIDATE inputs
    if (!sessionId || !username) {
      return res.status(400).json({
        success: false,
        error: 'sessionId and username required'
      });
    }

    if (!question || !answer) {
      return res.status(400).json({
        success: false,
        error: 'question and answer required'
      });
    }

    // Validate score is in range
    const validScore = Math.max(0, Math.min(10, parseInt(score) || 0));

    const cleanUsername = username.trim().substring(0, 50);

    db.run(
      `INSERT INTO attempts (
        sessionId, username, questionIndex, question, answer, score,
        source, chunkIndex, pdfBased, difficulty, topic
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sessionId, cleanUsername, questionIndex, question, answer, validScore,
        source || 'ai', chunkIndex || null, pdfBased ? 1 : 0,
        difficulty || 'generic', topic || null
      ],
      (err) => {
        if (err) {
          console.error('❌ Failed to save attempt:', err.message);
          return res.status(500).json({
            success: false,
            error: 'Failed to save progress'
          });
        }

        // NEW: Update user stats after each attempt
        updateUserStats(cleanUsername, validScore === 10 ? 1 : 0, validScore === 0 ? 1 : 0, topic);

        res.json({ success: true, message: 'Progress saved' });
      }
    );
  } catch (error) {
    console.error('❌ Progress save error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
});

// NEW: Helper function to update user stats
function updateUserStats(username, isCorrect, isWrong, topic) {
  try {
    db.get(
      `SELECT * FROM user_stats WHERE username = ?`,
      [username],
      (err, row) => {
        if (err) {
          console.error('❌ Error fetching user stats:', err.message);
          return;
        }

        if (!row) {
          console.error('⚠️ User stats not found for:', username);
          return;
        }

        const newTotal = row.total_attempted + 1;
        const newCorrect = row.correct + (isCorrect ? 1 : 0);
        const newWrong = row.wrong + (isWrong ? 1 : 0);
        const newAccuracy = (newCorrect / newTotal * 100).toFixed(2);

        // Update topic stats if provided
        let topics = {};
        try {
          topics = row.topics_performance ? JSON.parse(row.topics_performance) : {};
        } catch (e) {
          console.error('❌ JSON parse error:', e.message);
          topics = {};
        }

        if (topic) {
          if (!topics[topic]) {
            topics[topic] = { correct: 0, total: 0 };
          }
          topics[topic].correct += isCorrect ? 1 : 0;
          topics[topic].total += 1;
        }

        // Update user_stats
        db.run(
          `UPDATE user_stats SET
           total_attempted = ?,
           correct = ?,
           wrong = ?,
           accuracy_percent = ?,
           topics_performance = ?,
           last_updated = CURRENT_TIMESTAMP
           WHERE username = ?`,
          [
            newTotal, newCorrect, newWrong, newAccuracy,
            JSON.stringify(topics), username
          ],
          (err) => {
            if (err) {
              console.error('❌ Error updating user stats:', err.message);
            } else {
              console.log(`📊 Updated stats for ${username}: ${newCorrect}/${newTotal} (${newAccuracy}%)`);
            }
          }
        );
      }
    );
  } catch (error) {
    console.error('❌ Stats update error:', error.message);
  }
}

// POST: Start/Create session
app.post("/progress/session", (req, res) => {
  const { sessionId, mode, fileId } = req.body;
  const startTime = new Date().toISOString();

  console.log(`\n📝 Session Creation Request:`);
  console.log(`   sessionId: ${sessionId}`);
  console.log(`   mode: ${mode}`);
  console.log(`   fileId: ${fileId || 'NONE'}`);

  db.run(
    `INSERT OR IGNORE INTO sessions (sessionId, mode, startTime, fileId) VALUES (?, ?, ?, ?)`,
    [sessionId, mode, startTime, fileId || null],
    (err) => {
      if (err) {
        console.error('❌ Failed to create session:', err);
        return res.json({ success: false });
      }
      console.log(`✅ Session created: ${sessionId}`);
      console.log(`   Mode: ${mode}`);
      console.log(`   PDF: ${fileId ? `✅ Linked to ${fileId}` : '❌ No PDF'}`);
      res.json({ success: true, sessionId, startTime, fileId });
    }
  );
});

// NEW: Register or get user stats
app.post('/user/register', (req, res) => {
  try {
    const { username } = req.body;

    // VALIDATE: Input validation
    if (!username || username.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Username required'
      });
    }

    const cleanUsername = username.trim().substring(0, 50); // Prevent injection

    // Check if user exists
    db.get(
      `SELECT * FROM user_stats WHERE username = ?`,
      [cleanUsername],
      (err, row) => {
        if (err) {
          console.error('❌ User lookup error:', err.message);
          return res.status(500).json({
            success: false,
            error: 'Database error'
          });
        }

        if (row) {
          // User exists - return their stats
          return res.json({
            success: true,
            isNewUser: false,
            username: cleanUsername,
            stats: {
              total_attempted: row.total_attempted,
              correct: row.correct,
              wrong: row.wrong,
              accuracy: row.accuracy_percent,
              lastSession: row.last_session_id
            }
          });
        }

        // NEW user - create entry
        db.run(
          `INSERT INTO user_stats (username, total_attempted, correct, wrong, accuracy_percent, topics_performance)
           VALUES (?, 0, 0, 0, 0, '{}')`,
          [cleanUsername],
          (err) => {
            if (err) {
              console.error('❌ User creation error:', err.message);
              return res.status(500).json({
                success: false,
                error: 'Failed to create user'
              });
            }

            console.log(`✅ New user created: ${cleanUsername}`);

            res.json({
              success: true,
              isNewUser: true,
              username: cleanUsername,
              stats: {
                total_attempted: 0,
                correct: 0,
                wrong: 0,
                accuracy: 0
              }
            });
          }
        );
      }
    );
  } catch (error) {
    console.error('❌ Registration error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
});

// NEW: Get user's aggregated statistics
app.get('/user/stats/:username', (req, res) => {
  try {
    const { username } = req.params;

    // VALIDATE
    if (!username || username.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Username required'
      });
    }

    const cleanUsername = username.trim().substring(0, 50);

    db.get(
      `SELECT * FROM user_stats WHERE username = ?`,
      [cleanUsername],
      (err, row) => {
        if (err) {
          console.error('❌ Stats lookup error:', err.message);
          return res.status(500).json({
            success: false,
            error: 'Database error'
          });
        }

        if (!row) {
          return res.json({
            success: true,
            found: false,
            username: cleanUsername
          });
        }

        // Parse topics JSON
        let topics = {};
        try {
          topics = row.topics_performance ? JSON.parse(row.topics_performance) : {};
        } catch (e) {
          console.error('❌ JSON parse error:', e.message);
          topics = {};
        }

        // Calculate weak/strong topics
        const weakTopics = Object.entries(topics)
          .filter(([_, stats]) => stats.total > 0 && (stats.correct / stats.total * 100) < 70)
          .map(([topic, stats]) => ({
            topic,
            accuracy: Math.round((stats.correct / stats.total) * 100),
            attempts: stats.total
          }))
          .sort((a, b) => a.accuracy - b.accuracy)
          .slice(0, 5);

        const strongTopics = Object.entries(topics)
          .filter(([_, stats]) => stats.total > 0 && (stats.correct / stats.total * 100) >= 70)
          .map(([topic, stats]) => ({
            topic,
            accuracy: Math.round((stats.correct / stats.total) * 100),
            attempts: stats.total
          }))
          .sort((a, b) => b.accuracy - a.accuracy)
          .slice(0, 5);

        console.log(`📊 Stats for ${cleanUsername}: ${row.correct}/${row.total_attempted} (${row.accuracy_percent}%)`);

        res.json({
          success: true,
          found: true,
          username: cleanUsername,
          stats: {
            totalAttempted: row.total_attempted,
            correct: row.correct,
            wrong: row.wrong,
            accuracy: Math.round(row.accuracy_percent),
            weakTopics: weakTopics,
            strongTopics: strongTopics
          },
          lastUpdated: row.last_updated
        });
      }
    );
  } catch (error) {
    console.error('❌ Stats error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
});

// GET: Load session progress
app.get("/progress/session/:sessionId", (req, res) => {
  const { sessionId } = req.params;

  db.all(
    `SELECT * FROM attempts WHERE sessionId = ? ORDER BY timestamp DESC LIMIT 50`,
    [sessionId],
    (err, rows) => {
      if (err) {
        console.error('❌ Failed to load progress:', err);
        return res.json({ success: false, attempts: [] });
      }
      res.json({ success: true, attempts: rows || [] });
    }
  );
});

// GET: Statistics
app.get("/progress/stats/:sessionId", (req, res) => {
  const { sessionId } = req.params;

  db.all(
    `SELECT score FROM attempts WHERE sessionId = ? AND score > 0`,
    [sessionId],
    (err, rows) => {
      if (err) {
        return res.json({ success: false, stats: {} });
      }

      const scores = rows ? rows.map(r => r.score) : [];
      const totalAttempts = scores.length;
      const averageScore = totalAttempts > 0 ? (scores.reduce((a, b) => a + b, 0) / totalAttempts).toFixed(2) : 0;
      const maxScore = totalAttempts > 0 ? Math.max(...scores) : 0;

      res.json({
        success: true,
        stats: {
          totalAttempts,
          averageScore,
          maxScore,
          lastAttempt: rows && rows[0] ? rows[0].timestamp : null
        }
      });
    }
  );
});

// NEW: Generate session summary with weak/strong topics
app.post('/progress/session-summary', (req, res) => {
  try {
    const { sessionId, username } = req.body;

    // VALIDATE
    if (!sessionId || !username) {
      return res.status(400).json({
        success: false,
        error: 'sessionId and username required'
      });
    }

    const cleanUsername = username.trim().substring(0, 50);

    // Get all attempts in this session
    db.all(
      `SELECT score, topic FROM attempts WHERE sessionId = ? AND username = ? ORDER BY timestamp DESC`,
      [sessionId, cleanUsername],
      (err, rows) => {
        if (err) {
          console.error('❌ Error loading session attempts:', err.message);
          return res.status(500).json({
            success: false,
            error: 'Failed to load session'
          });
        }

        if (!rows || rows.length === 0) {
          return res.json({
            success: true,
            score: '0/0',
            accuracy: '0%',
            weakTopics: [],
            strongTopics: []
          });
        }

        // Calculate session stats
        const totalQuestions = rows.length;
        const correctAnswers = rows.filter(r => r.score === 10).length;
        const accuracy = Math.round((correctAnswers / totalQuestions) * 100);

        // Build topic stats for this session
        const topicStats = {};
        rows.forEach(row => {
          if (row.topic) {
            if (!topicStats[row.topic]) {
              topicStats[row.topic] = { correct: 0, total: 0 };
            }
            topicStats[row.topic].correct += row.score === 10 ? 1 : 0;
            topicStats[row.topic].total += 1;
          }
        });

        // Identify weak and strong topics
        const weakTopics = Object.entries(topicStats)
          .filter(([_, stats]) => stats.total > 0 && (stats.correct / stats.total * 100) < 70)
          .map(([topic, stats]) => ({
            topic,
            accuracy: Math.round((stats.correct / stats.total) * 100),
            attempts: stats.total
          }))
          .sort((a, b) => a.accuracy - b.accuracy);

        const strongTopics = Object.entries(topicStats)
          .filter(([_, stats]) => stats.total > 0 && (stats.correct / stats.total * 100) >= 70)
          .map(([topic, stats]) => ({
            topic,
            accuracy: Math.round((stats.correct / stats.total) * 100),
            attempts: stats.total
          }))
          .sort((a, b) => b.accuracy - a.accuracy);

        console.log(`📋 Session Summary: ${correctAnswers}/${totalQuestions} (${accuracy}%) for ${cleanUsername}`);

        res.json({
          success: true,
          score: `${correctAnswers}/${totalQuestions}`,
          accuracy: `${accuracy}%`,
          weakTopics: weakTopics,
          strongTopics: strongTopics,
          questionsAttempted: totalQuestions,
          correct: correctAnswers,
          incorrect: totalQuestions - correctAnswers
        });
      }
    );
  } catch (error) {
    console.error('❌ Session summary error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
});

// ========================================
// LIBRARY ENDPOINTS
// ========================================

// GET: List all subjects in library with question counts
app.get('/library/subjects', (req, res) => {
  console.log('📚 Fetching library subjects...');

  libraryDb.all(
    `SELECT subject, COUNT(*) as count FROM library_questions GROUP BY subject ORDER BY count DESC`,
    (err, rows) => {
      if (err) {
        return res.status(500).json({ success: false, error: err.message });
      }

      const subjects = rows.map(r => ({
        subject: r.subject,
        count: r.count
      }));

      // Get total questions
      libraryDb.get(
        'SELECT COUNT(*) as total FROM library_questions',
        (err, totalsRow) => {
          res.json({
            success: true,
            subjects,
            total: totalsRow?.total || 0
          });
        }
      );
    }
  );
});

// GET: Browse library questions by subject and difficulty
app.get('/library/questions', (req, res) => {
  const { subject = null, difficulty = null, questionType = null, limit = 20, offset = 0 } = req.query;

  console.log(`📚 Browsing library - Subject: ${subject || 'All'}, Difficulty: ${difficulty || 'All'}, Type: ${questionType || 'All'}`);

  let query = 'SELECT * FROM library_questions WHERE 1=1';
  const params = [];

  if (subject && subject !== 'All') {
    query += ' AND subject = ?';
    params.push(subject);
  }

  if (difficulty && difficulty !== 'All') {
    query += ' AND difficulty = ?';
    params.push(difficulty);
  }

  // NEW: Filter by question type (mcq or long-form)
  if (questionType && questionType !== 'all') {
    query += ' AND questionType = ?';
    params.push(questionType);
  }

  query += ' ORDER BY created_date DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));

  libraryDb.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ success: false, error: err.message });
    }

    res.json({
      success: true,
      questions: rows || [],
      total: rows?.length || 0
    });
  });
});

// POST: Question fallback when AI is down (Mix library + cached)
app.post('/question/fallback', (req, res) => {
  try {
    const useLibrary = Math.random() > 0.5; // 50% chance

    if (useLibrary) {
      // Try to get from library
      libraryDb.get(
        'SELECT question, perfect_answer, subject, difficulty FROM library_questions ORDER BY RANDOM() LIMIT 1',
        (err, libraryQuestion) => {
          if (err || !libraryQuestion) {
            console.log('   Library fetch failed, trying cache...');
            // Fall back to cache if library fails
            return fallbackToCache(req, res);
          }

          res.json({
            success: true,
            question: libraryQuestion.question,
            perfect_answer: libraryQuestion.perfect_answer,
            source: 'local-library',
            subject: libraryQuestion.subject,
            difficulty: libraryQuestion.difficulty,
            note: 'Serving from local library (AI temporarily unavailable)'
          });
        }
      );
    } else {
      // Try cache first
      fallbackToCache(req, res);
    }
  } catch (error) {
    console.error('❌ Fallback question error:', error.message);
    res.status(500).json({ success: false, error: 'Fallback question failed' });
  }

  function fallbackToCache(req, res) {
    db.get(
      'SELECT question, difficulty, pdfBased, chunkType FROM cached_questions ORDER BY RANDOM() LIMIT 1',
      (err, cachedQuestion) => {
        if (err || !cachedQuestion) {
          return res.status(404).json({ success: false, error: 'No fallback questions available' });
        }

        res.json({
          success: true,
          question: cachedQuestion.question,
          source: 'cached',
          difficulty: cachedQuestion.difficulty,
          pdfBased: cachedQuestion.pdfBased,
          note: 'Serving from cache (AI temporarily unavailable)'
        });
      }
    );
  }
});

// GET: Export all library questions as JSON
app.get('/library/export', (req, res) => {
  console.log('📦 Exporting library...');

  libraryDb.all(
    'SELECT * FROM library_questions ORDER BY created_date DESC',
    (err, questions) => {
      if (err) {
        return res.status(500).json({ success: false, error: err.message });
      }

      res.json({
        success: true,
        export_date: new Date().toISOString(),
        total_questions: questions.length,
        questions
      });
    }
  );
});

// ========================================
// HEALTH & VERSION ENDPOINT
// ========================================
app.get('/api/dev/code-version', (req, res) => {
  SERVER_VERSION.uptime = Math.round(process.uptime());

  // Check adaptive learning system is loaded
  let adaptiveLoadingReady = false;
  try {
    adaptiveLoadingReady = typeof learningService.extractTopicFromQuestion === 'function';
  } catch (e) {
    // Service not loaded
  }

  res.json({
    success: true,
    ...SERVER_VERSION,
    adaptiveLoadingReady,
    features: {
      adaptiveLearning: adaptiveLoadingReady ? 'ACTIVE' : 'NOT FOUND'
    }
  });
});

// Serve static files
app.use(express.static(__dirname))

// Start server with graceful port fallback
async function startServer() {
  await setupDatabase();

  const PORT = process.env.PORT || 7777;
  const server = app.listen(PORT, () => {
    console.log("\n🏥 Medical Viva Trainer");
    console.log("📝 Questions available:", questionBank.length);
    console.log(`✅ AI-Integrated Server running on http://localhost:${PORT}\n`);
  });

  // Handle port in use - try next available port
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ ERROR: Port ${PORT} is already in use!`);
    console.error('\n🔧 SOLUTION: Kill old Node processes:');
    console.error('   • bash scripts/dev-safe.sh (Linux/Mac)');
    console.error('   • scripts\\dev-safe.bat (Windows)');
    console.error('   OR manually: pkill -f "node" && sleep 2');
    console.error('\n');
    process.exit(1);
  }
  throw err;
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});