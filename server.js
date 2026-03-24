require('dotenv').config()
console.log('🔥 SERVER.JS LOADED - VERSION 3')
const express = require("express")
const sqlite3 = require('sqlite3').verbose()
const multer = require('multer')
const pdfParse = require('pdf-parse')
const fs = require('fs').promises
const fsSync = require('fs')
const path = require('path')
const app = express()

app.use(express.json())

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

const DEFAULT_MODEL = 'gpt-oss-120b';
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
    const content = data.choices?.[0]?.message?.content;
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

const db = new sqlite3.Database('./data/progress.db', (err) => {
  if (err) console.error('❌ Database error:', err);
  else console.log('✅ Database connected');
});

// Create tables if they don't exist
db.serialize(() => {
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

  // New table for uploaded PDF files
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

  // New table for PDF chunks (intelligent content segments)
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

  // New table for cached pre-generated questions (for background generation)
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

  // NEW: Table for MCQ performance tracking (Duolingo-style learning engine)
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

  // Add columns to sessions table (if they don't exist)
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

  // NEW: Statistics columns for MCQ learning engine
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

  // Add columns to attempts table (if they don't exist)
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

  // Add subject column to uploaded_files (for library organization)
  db.run(`ALTER TABLE uploaded_files ADD COLUMN subject TEXT DEFAULT 'General'`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('Error adding subject to uploaded_files:', err.message);
    }
  });

  // ========== NEW: MCQ MODE COLUMNS ==========
  // Add MCQ columns to attempts table
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

  // Add mode-specific upload tracking to uploaded_files table
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

  console.log('📊 Database tables ready (including PDF support and MCQ support)');
});

// ========================================
// LIBRARY DATABASE SETUP (Local Question Library)
// ========================================
const libraryDb = new sqlite3.Database('./data/library.db', (err) => {
  if (err) console.error('❌ Library database error:', err);
  else console.log('✅ Library database connected');
});

// Create library tables if they don't exist
libraryDb.serialize(() => {
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

  // Add MCQ-specific columns to library_questions
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

  // Initialize metadata if empty
  libraryDb.run(`
    INSERT OR IGNORE INTO library_metadata (id, total_questions, last_updated)
    VALUES (1, 0, CURRENT_TIMESTAMP)
  `);

  console.log('📚 Library database tables ready');
});


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

    const prompt = `You are a senior medical educator. Provide a PERFECT, CONCISE, exam-ready answer to this medical viva question.

QUESTION: ${question}

Requirements:
- Be comprehensive but focused (2-4 sentences)
- Include key mechanisms and clinical relevance
- Use proper medical terminology
- Be suitable for a high-scoring exam response

ANSWER:`;

    const perfectAnswer = await callOpenRouterAPI(prompt, CONFIG_KEYS.PERFECT_ANSWER);

    console.log('✅ [PERFECT ANSWER] Generated successfully:', perfectAnswer.substring(0, 80) + '...');
    return perfectAnswer;

  } catch (error) {
    console.error('❌ [PERFECT ANSWER] Generation Failed:', error.message);
    throw error;
  }
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
    }
  ]
};

async function generateGenericAIMCQQuestion(difficulty = 'medium') {
  const MAX_RETRIES = 2;
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

      return {
        question: mcqData.question,
        options: mcqData.options,
        correctOption: mcqData.correctOption,
        explanation: mcqData.explanation,
        difficulty: difficulty,
        questionType: 'mcq',
        pdfBased: false,
        source: 'ai'
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
  console.warn('⚠️ All API retries failed, using fallback MCQ');
  return getFallbackMCQ(difficulty);
}

// Fallback MCQs for when API fails (uses pre-allocated module-level pools)
function getFallbackMCQ(difficulty = 'medium') {
  // Fast O(1) lookup instead of if-else chain
  const mcqPool = FALLBACK_MCQ_POOLS[difficulty] || FALLBACK_MCQ_POOLS.medium;
  const randomMCQ = mcqPool[Math.floor(Math.random() * mcqPool.length)];

  return {
    ...randomMCQ,
    difficulty: difficulty,
    questionType: 'mcq',
    pdfBased: false,
    source: 'fallback'
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
        source: 'pdf-ai'
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
    if (file.mimetype === 'application/pdf') {
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

// POST: Evaluate answer
app.post("/evaluate", async (req, res) => {
  const { question, answer } = req.body;

  if (!answer || !answer.trim()) {
    return res.json({
      score: 0,
      feedback: "No answer provided",
      isAIPowered: false
    });
  }

  try {
    // UPDATED: Use AI-powered evaluation instead of local
    const evaluation = await evaluateAnswerWithAI(question, answer);
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

    console.log(`📋 MCQ Question Endpoint - sessionId=${sessionId}, fileId=${fileId}, difficulty=${diff}`);

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
        pdfBased: false
      });
    }

    // NEW QUESTION GENERATION (existing logic continues)
    if (!OPENROUTER_API_KEY) {
      console.warn('⚠️ No API key - returning fallback MCQ');
      const fallback = getFallbackMCQ(diff);
      return res.json({ ...fallback, isRevision: false, reviewCount: 0 });
    }

    let mcqQuestion;

    try {
      // Determine if this is PDF-based or generic MCQ
      if (fileId) {
        // PDF-based MCQ
        console.log('📄 PDF-based MCQ mode');
        mcqQuestion = await generatePDFBasedMCQQuestion(sessionId, fileId, diff);
      } else {
        // Generic MCQ
        console.log('🤖 Generic MCQ mode');
        mcqQuestion = await generateGenericAIMCQQuestion(diff);
      }

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

// POST: Evaluate MCQ answer
app.post("/mcq-evaluate", async (req, res) => {
  try {
    const { sessionId, selectedOption, correctOption, difficulty } = req.body;

    console.log(`📋 MCQ Evaluate - selected=${selectedOption}, correct=${correctOption}, difficulty=${difficulty}`);

    // Simple evaluation logic
    const isCorrect = selectedOption === correctOption;
    const score = isCorrect ? 10 : 0;

    // Save to database
    if (sessionId) {
      db.run(
        `INSERT INTO attempts (sessionId, questionIndex, question, answer, score, selectedOption, correctOption, isMCQ, questionType, timestamp)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [sessionId, 0, 'MCQ', selectedOption, score, selectedOption, correctOption, 1, 'mcq', new Date().toISOString()],
        (err) => {
          if (err) {
            console.error('❌ Error saving MCQ attempt:', err.message);
          } else {
            console.log(`✅ MCQ attempt saved (score: ${score})`);
          }
        }
      );
    }

    res.json({
      isCorrect,
      score,
      selectedOption,
      correctOption,
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
      question,
      optionsJSON,
      correctOption,
      userAnswer,
      difficulty,
      isRevision,
      reviewCount
    } = req.body;

    const isCorrect = userAnswer === correctOption ? 1 : 0;
    const score = isCorrect ? 10 : 0;

    console.log(`📊 MCQ Evaluate (Learning): correct=${isCorrect}, revision=${isRevision}, count=${reviewCount}`);

    // Save to mcq_performance table (learning history)
    db.run(
      `INSERT INTO mcq_performance (
        sessionId, question, optionsJSON, correctOption, userAnswer,
        isCorrect, difficulty, reviewCount, lastReviewedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sessionId, question, optionsJSON, correctOption, userAnswer,
        isCorrect, difficulty, reviewCount || 0,
        new Date().toISOString()
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
app.post("/progress/save", (req, res) => {
  const { sessionId, questionIndex, question, answer, score, source, chunkIndex, pdfBased, difficulty } = req.body;

  db.run(
    `INSERT INTO attempts (sessionId, questionIndex, question, answer, score, source, chunkIndex, pdfBased, difficulty)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [sessionId, questionIndex, question, answer, score, source, chunkIndex || null, pdfBased ? 1 : 0, difficulty || 'generic'],
    (err) => {
      if (err) {
        console.error('❌ Failed to save attempt:', err);
        return res.json({ success: false, error: err.message });
      }
      res.json({ success: true, message: 'Progress saved' });
    }
  );
});

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

// Serve static files
app.use(express.static(__dirname))

// Start server
const PORT = process.env.PORT || 9997;
app.listen(PORT, () => {
  console.log("\n🏥 Medical Viva Trainer");
  console.log("📝 Questions available:", questionBank.length);
  console.log(`✅ AI-Integrated Server running on http://localhost:${PORT}\n`);
});
