/**
 * 🎓 Import MCQ Dataset (test.csv) into VivaMed
 *
 * Imports 6K+ medical MCQ questions from test.csv
 * Uses simple heuristics + random selection for correct answers
 * (since test.csv doesn't have reliable answer keys)
 */

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const csv = require('csv-parse/sync');

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

// Estimate correct answer from options (heuristic)
function estimateCorrectAnswer(optionA, optionB, optionC, optionD) {
  const options = [optionA, optionB, optionC, optionD];
  const letters = ['A', 'B', 'C', 'D'];

  // Heuristic 1: Longer answers are often correct in medical MCQs
  const lengths = options.map((o, i) => ({ letter: letters[i], length: o?.length || 0 }));
  lengths.sort((a, b) => b.length - a.length);

  // Return the longest option (educated guess), or random if similar
  if (lengths[0].length > lengths[1].length * 1.5) {
    return lengths[0].letter;
  }

  // Fallback: pick random option
  return letters[Math.floor(Math.random() * 4)];
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

        // Estimate correct answer (heuristic-based)
        const correctOption = estimateCorrectAnswer(opa, opb, opc, opd);

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
                reject(err);
              } else {
                imported++;
                if (imported % 500 === 0) {
                  console.log(`  ✅ Imported: ${imported} | Skipped: ${skipped} | Failed: ${failed}`);
                }
                resolve();
              }
            }
          );
        });

      } catch (error) {
        console.error(`❌ Error processing question ${i}: ${error.message}`);
        failed++;
      }
    }

    console.log(`\n✅ IMPORT COMPLETE!\n`);
    console.log(`📊 RESULTS:`);
    console.log(`   ✅ Imported:   ${imported}`);
    console.log(`   ⚠️  Skipped:    ${skipped}`);
    console.log(`   ❌ Failed:     ${failed}\n`);

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
    console.log('⚠️  NOTE: Correct answers are estimated (question length heuristic)');
    console.log('   When users answer, the system learns from their responses.\n');

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
