const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const libraryPath = path.join(__dirname, 'data', 'library.db');

console.log('Checking library database at:', libraryPath);
console.log('File size:', fs.statSync(libraryPath).size, 'bytes\n');

const db = new sqlite3.Database(libraryPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
    process.exit(1);
  }

  // Get count of questions by difficulty
  db.all(`
    SELECT
      difficulty,
      COUNT(*) as count
    FROM library_questions
    GROUP BY difficulty
    ORDER BY difficulty
  `, (err, rows) => {
    if (err) {
      console.error('Error querying database:', err.message);
      process.exit(1);
    }

    console.log('Questions by difficulty:');
    let total = 0;
    rows.forEach(row => {
      console.log(`  ${row.difficulty}: ${row.count} questions`);
      total += row.count;
    });
    console.log(`  TOTAL: ${total} questions\n`);

    // Get a sample question for each difficulty
    db.all(`
      SELECT DISTINCT difficulty FROM library_questions
      ORDER BY difficulty
    `, (err, difficulties) => {
      if (err) {
        console.error('Error:', err.message);
        process.exit(1);
      }

      let processed = 0;
      difficulties.forEach(diff => {
        db.get(`
          SELECT question, difficulty, subject
          FROM library_questions
          WHERE difficulty = ?
          LIMIT 1
        `, [diff.difficulty], (err, row) => {
          processed++;
          if (row) {
            console.log(`Sample ${diff.difficulty} question:`);
            console.log(`  Question: ${row.question.substring(0, 100)}...`);
            console.log(`  Subject: ${row.subject}\n`);
          }

          if (processed === difficulties.length) {
            db.close();
            console.log('✅ Library database verified - ready for testing!');
            process.exit(0);
          }
        });
      });
    });
  });
});
