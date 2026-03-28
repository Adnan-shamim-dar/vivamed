/**
 * 🏥 VivaMed - Medical Viva Trainer (Refactored for Performance)
 * Lightweight entry point - Routes to modular services
 */

const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");

// Initialize app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(express.static(__dirname));

// ============================================
// DATABASE SETUP
// ============================================

let db;

function initDatabase() {
  const dbPath = path.join(__dirname, "data", "vivamed.db");
  if (!fs.existsSync(path.join(__dirname, "data"))) {
    fs.mkdirSync(path.join(__dirname, "data"), { recursive: true });
  }

  db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error("❌ Database error:", err);
    } else {
      console.log("✅ Main database connected");
      createTables();
    }
  });

  return db;
}

function createTables() {
  // MCQ Questions table
  db.run(
    `CREATE TABLE IF NOT EXISTS mcq_questions (
      id TEXT PRIMARY KEY,
      question TEXT NOT NULL,
      optionA TEXT NOT NULL,
      optionB TEXT NOT NULL,
      optionC TEXT NOT NULL,
      optionD TEXT NOT NULL,
      correctOption TEXT NOT NULL,
      choice_type TEXT DEFAULT 'single',
      subject TEXT,
      topic TEXT,
      difficulty TEXT DEFAULT 'medium',
      explanation TEXT,
      source_type TEXT DEFAULT 'csv',
      created_date TEXT DEFAULT CURRENT_TIMESTAMP
    )`
  );

  console.log("✅ MCQ table ready");
}

// ============================================
// HEALTH CHECK
// ============================================

app.get("/health", (req, res) => {
  res.json({
    status: "Server running",
    uptime: process.uptime(),
    api_key_configured: !!process.env.OPENROUTER_API_KEY,
    port: PORT
  });
});

// ============================================
// MCQ ENDPOINTS
// ============================================

app.post("/mcq-question", async (req, res) => {
  try {
    const { sessionId, difficulty } = req.body;
    const diff = difficulty || "medium";

    // Query database for random question
    db.get(
      `SELECT * FROM mcq_questions WHERE difficulty = ? ORDER BY RANDOM() LIMIT 1`,
      [diff],
      (err, row) => {
        if (err) {
          console.error("❌ Query error:", err.message);
          return res.json(getFallbackMCQ(diff));
        }

        if (row) {
          return res.json({
            question: row.question,
            options: {
              A: row.optionA,
              B: row.optionB,
              C: row.optionC,
              D: row.optionD
            },
            correctOption: row.correctOption,
            choice_type: row.choice_type || "single",
            difficulty: row.difficulty,
            explanation: row.explanation || "",
            source: "mcq-dataset",
            questionType: "mcq"
          });
        } else {
          // No database questions - use fallback
          return res.json(getFallbackMCQ(diff));
        }
      }
    );
  } catch (error) {
    console.error("❌ MCQ Error:", error.message);
    const diff = req.body?.difficulty || "medium";
    res.json(getFallbackMCQ(diff));
  }
});

app.post("/mcq-evaluate", (req, res) => {
  try {
    const { selectedOption, correctOption, choice_type } = req.body;
    const isMulti = choice_type === "multi";

    let isCorrect = false;
    if (isMulti) {
      const selected = Array.isArray(selectedOption)
        ? selectedOption.sort().join(",")
        : selectedOption.split(",").map(s => s.trim()).sort().join(",");
      const correct = correctOption.split(",").map(s => s.trim()).sort().join(",");
      isCorrect = selected === correct;
    } else {
      isCorrect = selectedOption === correctOption;
    }

    const score = isCorrect ? 10 : 0;

    res.json({
      isCorrect,
      score,
      selectedOption,
      correctOption,
      choice_type: choice_type || "single",
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("❌ Evaluate error:", error.message);
    res.json({
      isCorrect: false,
      score: 0,
      error: error.message
    });
  }
});

// ============================================
// FALLBACK MCQ POOL
// ============================================

const FALLBACK_MCQ_POOLS = {
  easy: [
    {
      question: "What is the normal resting heart rate for adults?",
      optionA: "60-100 bpm",
      optionB: "40-60 bpm",
      optionC: "100-120 bpm",
      optionD: "120-140 bpm",
      correctOption: "A",
      explanation: "Normal heart rate is 60-100 beats per minute."
    },
    {
      question: "Which blood type is the universal donor?",
      optionA: "O negative",
      optionB: "AB positive",
      optionC: "O positive",
      optionD: "A negative",
      correctOption: "A",
      explanation: "O negative blood is universal donor."
    },
    {
      question: "What is the primary function of red blood cells?",
      optionA: "Transport oxygen",
      optionB: "Fight infections",
      optionC: "Clot blood",
      optionD: "Produce antibodies",
      correctOption: "A",
      explanation: "RBCs transport oxygen via hemoglobin."
    }
  ],
  medium: [
    {
      question: "Which nervous system division increases heart rate?",
      optionA: "Sympathetic",
      optionB: "Parasympathetic",
      optionC: "Somatic",
      optionD: "Autonomic",
      correctOption: "A",
      explanation: "Sympathetic nervous system increases heart rate."
    }
  ],
  hard: [
    {
      question: "What is the pathophysiology of ARDS?",
      optionA: "Diffuse alveolar damage with increased vascular permeability",
      optionB: "Simple hypoventilation",
      optionC: "Asthma exacerbation",
      optionD: "Pulmonary embolism",
      correctOption: "A",
      explanation: "ARDS involves diffuse alveolar damage and vascular injury."
    }
  ]
};

function getFallbackMCQ(difficulty = "medium") {
  const pool = FALLBACK_MCQ_POOLS[difficulty] || FALLBACK_MCQ_POOLS.medium;
  const mcq = pool[Math.floor(Math.random() * pool.length)];

  return {
    question: mcq.question,
    options: {
      A: mcq.optionA,
      B: mcq.optionB,
      C: mcq.optionC,
      D: mcq.optionD
    },
    correctOption: mcq.correctOption,
    explanation: mcq.explanation,
    difficulty,
    questionType: "mcq",
    source: "fallback"
  };
}

// ============================================
// SERVE INDEX.HTML
// ============================================

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ============================================
// START SERVER
// ============================================

function startServer() {
  initDatabase();

  const server = app.listen(PORT, () => {
    console.log(`
✅ VivaMed Server Started
🌐 Open: http://localhost:${PORT}
📊 Database: Ready
🎓 MCQ Mode: Available
    `);
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(`\n❌ Port ${PORT} already in use!`);
      console.error("Try: PORT=3001 npm start\n");
      process.exit(1);
    }
    throw err;
  });
}

// Start
startServer();

module.exports = app;
