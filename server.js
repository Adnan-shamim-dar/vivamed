require('dotenv').config()
console.log('🔥 SERVER.JS LOADED - VERSION 3')
const express = require("express")
const sqlite3 = require('sqlite3').verbose()
const app = express()

app.use(express.json())

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY

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

  console.log('📊 Database tables ready');
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

async function generateAIQuestion() {
  if (!OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY not set");
  }

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

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  return data.choices[0].message.content.trim();
}


// ========================================
// ROUTES
// ========================================

// GET: Random practice question
app.get("/question", async (req, res) => {
  try {
    const aiQuestion = await generateAIQuestion();
    res.json({
      question: aiQuestion,
      source: 'ai',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error:', error.message);
    res.status(500).json({
      error: error.message
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
  const { sessionId, questionIndex, question, answer, score, source } = req.body;

  db.run(
    `INSERT INTO attempts (sessionId, questionIndex, question, answer, score, source)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [sessionId, questionIndex, question, answer, score, source],
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
  const { sessionId, mode } = req.body;
  const startTime = new Date().toISOString();

  db.run(
    `INSERT OR IGNORE INTO sessions (sessionId, mode, startTime) VALUES (?, ?, ?)`,
    [sessionId, mode, startTime],
    (err) => {
      if (err) {
        console.error('❌ Failed to create session:', err);
        return res.json({ success: false });
      }
      res.json({ success: true, sessionId, startTime });
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
const PORT = 5001;
app.listen(PORT, () => {
  console.log("\n🏥 Medical Viva Trainer");
  console.log("📝 Questions available:", questionBank.length);
  console.log(`✅ AI-Integrated Server running on http://localhost:${PORT}\n`);
});
