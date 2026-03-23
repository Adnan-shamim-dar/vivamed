#!/usr/bin/env node

/**
 * Seed MCQ Library with 300 Pre-Generated Questions
 * Usage: npm run seed-library
 *
 * Generates:
 * - 100 questions for Practice Mode
 * - 100 questions for Exam Mode
 * - 100 questions for MCQ Mode
 *
 * Each set has ~33 easy, 33 medium, 34 hard questions
 */

require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const AI_MODEL = process.env.AI_MODEL || 'gpt-oss-120b';

if (!OPENROUTER_API_KEY) {
  console.error('❌ OPENROUTER_API_KEY not set in .env');
  process.exit(1);
}

// Database connection
const db = new sqlite3.Database('./data/library.db', (err) => {
  if (err) {
    console.error('❌ Database error:', err);
    process.exit(1);
  }
  console.log('✅ Connected to library database');
});

// Delay helper
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Call OpenRouter API
async function callOpenRouterAPI(prompt, configKey = 'mcqGeneration') {
  const config = {
    model: AI_MODEL,
    temperature: 0.8,
    maxTokens: 400
  };

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
    })
  });

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
}

// Generate single MCQ question
async function generateMCQQuestion(difficulty, modeContext) {
  const difficultyGuidance = {
    easy: 'Focus on basic concepts, straightforward options with obvious distractors.',
    medium: 'Create questions requiring moderate reasoning with plausible distractors.',
    hard: 'Create complex scenarios with similar-looking options that require deep reasoning.'
  };

  const prompt = `You are a medical examiner creating multiple-choice questions for ${modeContext} mode.

DIFFICULTY: ${difficulty.toUpperCase()}
${difficultyGuidance[difficulty]}

Generate ONE high-quality medical MCQ question with exactly 4 options (A, B, C, D).

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

  let lastError;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const content = await callOpenRouterAPI(prompt);
      const mcqData = JSON.parse(content);

      // Validate structure
      if (!mcqData.question || !mcqData.options || !mcqData.correctOption || !mcqData.explanation) {
        throw new Error('Invalid MCQ structure');
      }

      return mcqData;
    } catch (e) {
      lastError = e;
      if (attempt < 2) {
        await delay(1000 * attempt);
      }
    }
  }

  throw lastError;
}

// Insert question into database
async function insertQuestion(question, options, correctOption, explanation, difficulty, sourceMode) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT OR IGNORE INTO library_questions
       (subject, question, perfect_answer, difficulty, tags, source_type, questionType, mcqOptions, correctOption)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sourceMode.charAt(0).toUpperCase() + sourceMode.slice(1), // subject based on mode
        question,
        explanation,
        difficulty,
        JSON.stringify(['medical', 'viva', sourceMode]),
        'mcq-preloaded',
        'mcq',
        JSON.stringify(options),
        correctOption
      ],
      function(err) {
        if (err) {
          // UNIQUE constraint means duplicate - not a real error
          if (err.message.includes('UNIQUE')) {
            resolve({ inserted: false, duplicate: true });
          } else {
            reject(err);
          }
        } else {
          resolve({ inserted: true, duplicate: false });
        }
      }
    );
  });
}

// Main seeding function
async function seedLibrary() {
  console.log(`\n🚀 Starting MCQ Library Seeding with AI Model: ${AI_MODEL}`);
  console.log(`📅 Timestamp: ${new Date().toISOString()}\n`);

  const modes = [
    { name: 'practice', label: 'Practice Mode', emoji: '🎓' },
    { name: 'exam', label: 'Exam Mode', emoji: '📝' },
    { name: 'mcq', label: 'MCQ Mode', emoji: '📋' }
  ];

  const difficulties = ['easy', 'medium', 'hard'];
  const questionsPerMode = 100;
  const questionsPerDifficulty = Math.floor(questionsPerMode / 3);

  let totalInserted = 0;
  let totalDuplicates = 0;
  let totalFailed = 0;

  // Generate questions for each mode
  for (const mode of modes) {
    console.log(`\n${mode.emoji} ${mode.label}`);
    console.log('─'.repeat(50));

    let modeInserted = 0;
    let modeDuplicates = 0;
    let modeFailed = 0;

    // Distribute questions across difficulties
    for (const difficulty of difficulties) {
      const count = difficulty === 'hard' ? questionsPerDifficulty + 1 : questionsPerDifficulty;
      console.log(`  ${difficulty.toUpperCase()}: Generating ${count} questions...`);

      for (let i = 0; i < count; i++) {
        try {
          const mcq = await generateMCQQuestion(difficulty, mode.label);
          const result = await insertQuestion(
            mcq.question,
            mcq.options,
            mcq.correctOption,
            mcq.explanation,
            difficulty,
            mode.name
          );

          if (result.inserted) {
            modeInserted++;
            totalInserted++;
            process.stdout.write('.');
          } else if (result.duplicate) {
            modeDuplicates++;
            totalDuplicates++;
            process.stdout.write('d');
          }

          // Rate limiting: small delay between requests
          if (i % 5 === 0) {
            await delay(500);
          }
        } catch (error) {
          modeFailed++;
          totalFailed++;
          process.stdout.write('✗');
          console.error(`\n    ❌ Error: ${error.message}`);
        }
      }

      console.log(' ✓');
    }

    console.log(`  Summary: ${modeInserted} inserted, ${modeDuplicates} duplicates, ${modeFailed} failed`);
  }

  // Final statistics
  console.log('\n' + '═'.repeat(50));
  console.log(`📊 SEEDING COMPLETE\n`);
  console.log(`✅ Total Inserted: ${totalInserted}`);
  console.log(`⚠️  Duplicates Skipped: ${totalDuplicates}`);
  console.log(`❌ Failed: ${totalFailed}`);
  console.log(`📚 Total in Library: ${totalInserted + totalDuplicates}`);

  // Verify by difficulty
  return new Promise((resolve) => {
    db.all(
      `SELECT difficulty, COUNT(*) as count FROM library_questions WHERE questionType='mcq' GROUP BY difficulty ORDER BY difficulty`,
      (err, rows) => {
        if (err) {
          console.error('❌ Verification failed:', err);
        } else {
          console.log('\n📈 Distribution by Difficulty:');
          rows.forEach(row => {
            console.log(`  ${row.difficulty.padEnd(8)}: ${row.count} questions`);
          });
        }

        db.close();
        resolve();
      }
    );
  });
}

// Run seeding
seedLibrary().catch(err => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});
