/**
 * 🎓 Import MCQ Dataset (test.csv) into VivaMed
 *
 * Imports 6K+ medical MCQ questions from test.csv
 * - Determines correct answers using LLM (since test.csv has -1 for cop)
 * - Supports single and multi-answer questions
 * - Auto-categorizes difficulty based on question complexity
 */

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const csv = require('csv-parse/sync');
const fetch = require('node-fetch');

// Database path
const dbPath = path.join(__dirname, 'data', 'vivamed.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Failed to open database:', err);
    process.exit(1);
  }
  console.log('✅ Connected to main database');
});

db.serialize();

// OpenRouter API config
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || 'sk-or-v1-edce4650b02c7e68b3ccfb9a3e6e4b61c1e3e3e3e3e3e3e3';
const MODEL = 'nvidia/nemotron-3-super-120b-a12b:free';

async function callOpenRouterAPI(prompt) {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 100
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(`API Error: ${data.error?.message || 'Unknown error'}`);
    }

    return data.choices?.[0]?.message?.content || '';
  } catch (error) {
    console.error('❌ API call failed:', error.message);
    return null;
  }
}

// Calculate difficulty based on question complexity
function calculateDifficulty(question) {
  const q = question.toLowerCase();
  const hardKeywords = ['mechanism', 'pathophysiology', 'differential', 'complications', 'etiology', 'syndrome', 'pathogenesis'];
  const mediumKeywords = ['how', 'why', 'effect', 'treatment', 'therapy', 'role', 'function'];

  if (q.length >= 80 && hardKeywords.some(k => q.includes(k))) return 'hard';
  if (hardKeywords.some(k => q.includes(k))) return 'hard';
  if (mediumKeywords.some(k => q.includes(k)) || q.length >= 100) return 'medium';
  return 'easy';
}

async function determineCorrectAnswer(question, options, choiceType) {
  const optionsList = ['A', 'B', 'C', 'D'];
  const optionsText = optionsList
    .map((letter, idx) => `${letter}: ${options[idx] || 'N/A'}`)
    .join('\n');

  const isMulti = choiceType === 'multi';

  const prompt = `You are a medical examiner. Given this question and 4 options, determine which option(s) is/are correct.

QUESTION: ${question}

OPTIONS:
${optionsText}

RESPONSE TYPE: ${isMulti ? 'Multiple answers possible' : 'Single answer only'}

Return ONLY the correct option letter(s) in this format:
- For single answer: "A" or "B" or "C" or "D"
- For multiple answers: "A,C" or "B,D" (comma-separated, no spaces)

Do NOT include any explanation, just the letter(s).`;

  const result = await callOpenRouterAPI(prompt);

  if (!result) {
    console.warn('⚠️ Could not determine correct answer, defaulting to A');
    return 'A';
  }

  // Extract letters from response (A, B, C, D)
  const letters = result.toUpperCase().match(/[A-D]/g) || ['A'];
  return letters.join(',');
}

async function importMCQDataset() {
  try {
    console.log('\n🎓 IMPORTING MCQ DATASET\n');

    // 1. Create mcq_questions table
    await new Promise((resolve, reject) => {
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
        )`,
        (err) => {
          if (err) reject(err);
          else {
            console.log('✅ MCQ table ready');
            resolve();
          }
        }
      );
    });

    // 2. Read CSV file
    const csvPath = path.join(__dirname, 'test.csv');
    if (!fs.existsSync(csvPath)) {
      throw new Error(`CSV not found: ${csvPath}`);
    }

    const fileContent = fs.readFileSync(csvPath, 'utf-8');
    const records = csv.parse(fileContent, {
      columns: true,
      skip_empty_lines: true
    });

    console.log(`📋 Loaded ${records.length} MCQ questions from test.csv\n`);

    let imported = 0;
    let skipped = 0;
    let failed = 0;
    const failedQuestions = [];

    // 3. Process and import each question
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const {
        id,
        question,
        opa,
        opb,
        opc,
        opd,
        choice_type,
        exp,
        subject_name,
        topic_name
      } = record;

      // Validate data
      if (!id || !question || !opa || !opb || !opc || !opd) {
        skipped++;
        continue;
      }

      try {
        // Calculate difficulty
        const difficulty = calculateDifficulty(question);

        // Determine correct answer using LLM
        console.log(`⏳ Processing question ${imported + 1}/${records.length}...`);
        const correctOption = await determineCorrectAnswer(
          question,
          [opa, opb, opc, opd],
          choice_type
        );

        // Insert into database
        await new Promise((resolve, reject) => {
          db.run(
            `INSERT INTO mcq_questions (
              id, question, optionA, optionB, optionC, optionD,
              correctOption, choice_type, subject, topic, difficulty, explanation
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              id,
              question.trim(),
              opa.trim(),
              opb.trim(),
              opc.trim(),
              opd.trim(),
              correctOption,
              choice_type || 'single',
              subject_name || 'Medical',
              topic_name || 'General',
              difficulty,
              exp || ''
            ],
            function(err) {
              if (err) {
                console.error(`⚠️ Failed to insert: ${err.message}`);
                failed++;
                failedQuestions.push(question.substring(0, 60));
                reject(err);
              } else {
                imported++;
                if (imported % 100 === 0) {
                  console.log(`  ✅ Imported: ${imported} | Skipped: ${skipped} | Failed: ${failed}`);
                }
                resolve();
              }
            }
          );
        });

        // Small delay to avoid API rate limiting
        if (imported % 10 === 0) {
          await new Promise(r => setTimeout(r, 500));
        }

      } catch (error) {
        console.error(`❌ Error processing question ${i}: ${error.message}`);
        failed++;
        failedQuestions.push(question.substring(0, 60));
      }
    }

    console.log(`\n✅ IMPORT COMPLETE!\n`);
    console.log(`📊 RESULTS:`);
    console.log(`   ✅ Imported:   ${imported}`);
    console.log(`   ⚠️  Skipped:    ${skipped}`);
    console.log(`   ❌ Failed:     ${failed}\\n`);

    // Get distribution stats
    const stats = await new Promise((resolve) => {
      db.all(
        `SELECT subject, difficulty, COUNT(*) as cnt FROM mcq_questions
         GROUP BY subject, difficulty ORDER BY subject, difficulty`,
        (err, rows) => {
          resolve(rows || []);
        }
      );
    });

    console.log('📈 Question Distribution by Subject & Difficulty:');
    stats.forEach(row => {
      console.log(`   ${row.subject} - ${row.difficulty}: ${row.cnt}`);
    });

    // Single/Multi split
    const typeStats = await new Promise((resolve) => {
      db.all(
        `SELECT choice_type, COUNT(*) as cnt FROM mcq_questions GROUP BY choice_type`,
        (err, rows) => {
          resolve(rows || []);
        }
      );
    });

    console.log('\n❓ Question Type Distribution:');
    typeStats.forEach(row => {
      console.log(`   ${row.choice_type}: ${row.cnt}`);
    });

    const totalCount = await new Promise((resolve) => {
      db.get(
        'SELECT COUNT(*) as count FROM mcq_questions',
        (err, row) => {
          resolve(row?.count || 0);
        }
      );
    });

    console.log(`\n🎉 Total MCQ questions in database: ${totalCount}\n`);

    if (failedQuestions.length > 0) {
      console.log('⚠️  Failed questions (first 10):');
      failedQuestions.slice(0, 10).forEach(q => {
        console.log(`   - ${q}...`);
      });
    }

    db.close();
    process.exit(0);

  } catch (error) {
    console.error('❌ Import Error:', error.message);
    db.close();
    process.exit(1);
  }
}

// Start import
importMCQDataset();
