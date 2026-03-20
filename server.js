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
// DATABASE SETUP
// ========================================
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

  console.log('📊 Database tables ready (including PDF support)');
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

// ========================================
// AI INTEGRATION
// ========================================

async function generateGenericAIQuestion() {
  if (!OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY not set");
  }

  try {
    console.log('🤖 Calling OpenRouter API for AI question...');
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-oss-120b',
        messages: [
          {
            role: 'user',
            content: 'Generate ONE medical viva exam question. Return ONLY the question as a single sentence.'
          }
        ],
        temperature: 0.8,
        max_tokens: 150
      })
    });

    console.log(`📡 OpenRouter API Response Status: ${response.status}`);

    if (!response.ok) {
      const err = await response.text();
      console.error(`❌ OpenRouter API Error ${response.status}:`, err.substring(0, 200));
      throw new Error(`API error ${response.status}`);
    }

    const data = await response.json();
    console.log('📦 API Response Structure:', JSON.stringify(data).substring(0, 300));

    if (!data.choices || !data.choices[0] || !data.choices[0].message || !data.choices[0].message.content) {
      console.error('❌ Invalid API response - missing content:', JSON.stringify(data).substring(0, 500));
      throw new Error('Invalid response format - no content in message');
    }

    const question = data.choices[0].message.content.trim();
    if (!question) {
      throw new Error('Empty question received from API');
    }

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
  if (!OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY not set");
  }

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

    // Call OpenRouter API
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-oss-120b',
        messages: [
          {
            role: 'user',
            content: enhancedPrompt
          }
        ],
        temperature: 0.8,
        max_tokens: 200
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error(`❌ OpenRouter API Error ${response.status}:`, err.substring(0, 200));
      throw new Error(`API error ${response.status}`);
    }

    const data = await response.json();

    if (!data.choices || !data.choices[0] || !data.choices[0].message || !data.choices[0].message.content) {
      throw new Error('Invalid response format - no content in message');
    }

    const question = data.choices[0].message.content.trim();

    if (!question) {
      throw new Error('Empty question received from API');
    }

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

// Generate multiple questions (12-20) with different difficulty levels from PDF chunks
async function generateMultiplePDFQuestions(sessionId, fileId, numberOfQuestions = 18) {
  if (!OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY not set");
  }

  try {
    console.log(`\n🎯 Generating ${numberOfQuestions} questions with 3 difficulty levels from PDF...`);

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
          const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: 'gpt-oss-120b',
              messages: [{ role: 'user', content: enhancedPrompt }],
              temperature: 0.8,
              max_tokens: 200
            })
          });

          if (!response.ok) {
            throw new Error(`API error ${response.status}`);
          }

          const data = await response.json();
          if (!data.choices || !data.choices[0] || !data.choices[0].message || !data.choices[0].message.content) {
            throw new Error('Invalid API response - no content in message');
          }

          const question = data.choices[0].message.content.trim();

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
    return allGeneratedQuestions;
  } catch (error) {
    console.error('❌ Multiple Question Generation Failed:', error.message);
    throw error;
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

// POST: Upload PDF endpoint
app.post('/pdf/upload', upload.single('pdfFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const result = await processPDF(req.file.path, req.file.originalname);

    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
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

// POST: Generate multiple questions with difficulty levels from PDF
app.post('/pdf/generate-questions', async (req, res) => {
  try {
    const { sessionId, fileId, numberOfQuestions = 18 } = req.body;

    if (!sessionId || !fileId) {
      return res.status(400).json({
        success: false,
        error: 'sessionId and fileId required'
      });
    }

    console.log(`\n📋 Request: Generate ${numberOfQuestions} questions from ${fileId}`);

    const questions = await generateMultiplePDFQuestions(sessionId, fileId, numberOfQuestions);

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


// ========================================
// ROUTES
// ========================================

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

// POST: Evaluate answer
app.post("/evaluate", (req, res) => {
  const { question, answer } = req.body;

  if (!answer || !answer.trim()) {
    return res.json({
      score: 0,
      feedback: "No answer provided"
    });
  }

  try {
    const evaluation = evaluateAnswer(question, answer);
    const response = {
      score: evaluation.score || 0,
      feedback: evaluation.feedback || "Unable to evaluate"
    };
    console.log('[EVALUATE RESPONSE]', response);
    res.json(response);
  } catch (error) {
    console.error('❌ Evaluation failed:', error.message);
    res.status(500).json({
      score: 0,
      feedback: "Error evaluating answer"
    });
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

// Serve static files
app.use(express.static(__dirname))

// Start server
const PORT = 8888;
app.listen(PORT, () => {
  console.log("\n🏥 Medical Viva Trainer");
  console.log("📝 Questions available:", questionBank.length);
  console.log(`✅ AI-Integrated Server running on http://localhost:${PORT}\n`);
});
