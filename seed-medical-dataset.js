/**
 * 🔬 Import Medical Q&A Dataset into VivaMed Library
 *
 * Imports 60K+ medical questions from Kaggle dataset into the library_questions table
 * with automatic deduplication and progress tracking
 */

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const csv = require('csv-parse/sync');

const libraryDbPath = path.join(__dirname, 'data', 'library.db');

// Open database in serialized mode
const libraryDb = new sqlite3.Database(libraryDbPath, (err) => {
  if (err) {
    console.error('❌ Failed to open library database:', err);
    process.exit(1);
  }
  console.log('✅ Connected to library database');
});

// Enable serialize mode to handle concurrent operations
libraryDb.serialize();

async function importMedicalDataset() {
  try {
    console.log('\n🔬 IMPORTING MEDICAL DATASET\n');

    // 1. Create library_questions table
    await new Promise((resolve, reject) => {
      libraryDb.run(
        `CREATE TABLE IF NOT EXISTS library_questions (
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
          rating REAL DEFAULT 0.0,
          questionType TEXT DEFAULT 'long-form',
          mcqOptions TEXT,
          correctOption TEXT
        )`,
        (err) => {
          if (err) {
            console.error('❌ Failed to create table:', err.message);
            reject(err);
          } else {
            console.log('✅ Table ready');
            resolve();
          }
        }
      );
    });

    // 2. Read CSV file
    const csvFilePath = path.join(__dirname, 'train.csv');
    if (!fs.existsSync(csvFilePath)) {
      throw new Error(`CSV file not found: ${csvFilePath}`);
    }

    const fileContent = fs.readFileSync(csvFilePath, 'utf-8');
    const records = csv.parse(fileContent, {
      columns: true,
      skip_empty_lines: true
    });

    console.log(`📋 Loaded ${records.length} rows from train.csv\n`);

    let imported = 0;
    let skipped = 0;
    let duplicates = 0;

    // Helper: Calculate difficulty based on question keywords
    function calculateDifficulty(question) {
      const q = question.toLowerCase();
      const hardKeywords = ['mechanism', 'pathophysiology', 'differential', 'complications', 'etiology', 'pathogenesis', 'syndrome', 'research', 'clinical trial', 'analysis', 'complex', 'advanced', 'rare'];
      const mediumKeywords = ['how', 'why', 'effect', 'treatment', 'therapy', 'role', 'function', 'cause', 'risk', 'prevention'];

      // Hard: 40+ chars AND has hard keyword
      if (q.length >= 80 && hardKeywords.some(k => q.includes(k))) return 'hard';
      // Hard: explicit hard keywords (research, clinical trial, pathophysiology, mechanism, etc)
      if (hardKeywords.some(k => q.includes(k))) return 'hard';
      // Medium: medium keywords OR 60+ chars
      if (mediumKeywords.some(k => q.includes(k)) || q.length >= 100) return 'medium';
      // Easy: everything else
      return 'easy';
    }

    // 3. Process records and insert
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const { qtype, Question, Answer } = record;

      if (!Question || !Answer) {
        skipped++;
        continue;
      }

      const question = Question.trim();
      const answer = Answer.trim();
      const difficulty = calculateDifficulty(question);  // Use keyword-based difficulty
      const subject = qtype || 'Medical';

      // Check if exists
      const exists = await new Promise((resolve) => {
        libraryDb.get(
          'SELECT id FROM library_questions WHERE question = ? LIMIT 1',
          [question],
          (err, row) => {
            resolve(!!row);
          }
        );
      });

      if (exists) {
        duplicates++;
        continue;
      }

      // Insert
      await new Promise((resolve, reject) => {
        libraryDb.run(
          `INSERT INTO library_questions (subject, question, perfect_answer, difficulty, source_type, created_date)
           VALUES (?, ?, ?, ?, ?, datetime('now'))`,
          [subject, question, answer, difficulty, 'kaggle-dataset'],
          function(err) {
            if (err) {
              console.error(`⚠️  Failed to insert: ${err.message.substring(0, 60)}`);
              reject(err);
            } else {
              imported++;
              if (imported % 1000 === 0) {
                console.log(`  ⏳ Imported: ${imported} | Duplicates: ${duplicates} | Skipped: ${skipped}`);
              }
              resolve();
            }
          }
        );
      });
    }

    console.log(`\n✅ IMPORT COMPLETE!\n`);
    console.log(`📊 RESULTS:`);
    console.log(`   ✅ Imported:   ${imported}`);
    console.log(`   ⚠️  Duplicates: ${duplicates}`);
    console.log(`   ❌ Skipped:    ${skipped}`);
    console.log(`   📈 Total:      ${imported + duplicates + skipped}\n`);

    // Get final count
    const finalCount = await new Promise((resolve) => {
      libraryDb.get(
        'SELECT COUNT(*) as count FROM library_questions',
        (err, row) => {
          resolve(row?.count || 0);
        }
      );
    });

    console.log(`🎉 Total questions in library: ${finalCount}\n`);
    libraryDb.close();
    process.exit(0);

  } catch (error) {
    console.error('❌ Import Error:', error.message);
    libraryDb.close();
    process.exit(1);
  }
}

// Start import
importMedicalDataset();
