const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('data/library.db');

db.get('SELECT COUNT(*) as count FROM library_questions', (err, row) => {
  console.log('Total:', row?.count || 0);

  db.get('SELECT * FROM library_questions WHERE difficulty = "medium" LIMIT 1', (e, q) => {
    if (q) {
      console.log('Found medium Q:', q.question.substring(0, 60) + '...');
    } else {
      console.log('No medium questions found');
    }

    db.all('SELECT DISTINCT difficulty, COUNT(*) as cnt FROM library_questions GROUP BY difficulty', (e, rows) => {
      console.log('Difficulties:', rows);
      db.close();
    });
  });
});
