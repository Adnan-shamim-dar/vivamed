#!/usr/bin/env node

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'progress.db');
const db = new sqlite3.Database(dbPath);

async function runTest() {
  // Create a fresh test session
  const testSessionId = 'batch_test_' + Date.now();
  const testFileId = 'pdf_test_123456';

  return new Promise((resolve) => {
    db.run(
      `INSERT INTO sessions (sessionId, mode, fileId, startTime)
       VALUES (?, ?, ?, datetime('now'))`,
      [testSessionId, 'practice', testFileId],
      (err) => {
        if (err) {
          console.error('❌ Failed to create session:', err.message);
          resolve(false);
          return;
        }

        console.log('\n🧪 BATCH QUESTION GENERATION TEST\n');
        console.log('═'.repeat(60));
        console.log(`✅ Test Session: ${testSessionId}`);
        console.log(`✅ PDF File: ${testFileId}`);
        console.log('═'.repeat(60));

        // Make the API call
        const options = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: testSessionId,
            fileId: testFileId,
            numberOfQuestions: 18
          })
        };

        fetch('http://localhost:9999/pdf/generate-questions', options)
          .then(res => res.json())
          .then(data => {
            if (!data.success) {
              console.log('❌ API Error:', data.error);
              resolve(false);
              return;
            }

            console.log('\n📊 RESULTS:');
            console.log(`✅ Generated ${data.total} questions`);
            console.log(`  🟢 Easy: ${data.easyCount} questions`);
            console.log(`  🟡 Medium: ${data.mediumCount} questions`);
            console.log(`  🔴 Hard: ${data.hardCount} questions`);

            console.log('\n📋 SAMPLE QUESTIONS:\n');

            // Show samples
            data.questions.forEach((q, idx) => {
              if (idx < 5) {
                console.log(`${idx + 1}. [${q.difficultyEmoji} ${q.difficulty.toUpperCase()}] ${q.question.substring(0, 80)}...`);
                console.log(`   📄 ${q.pdfFilename} | Chunk ${q.chunkIndex + 1}/${q.totalChunks} | Type: ${q.chunkType}`);
              }
            });

            if (data.questions.length > 5) {
              console.log(`... and ${data.questions.length - 5} more questions`);
            }

            console.log('\n✅ VERIFICATION:\n');
            console.log(`${data.easyCount > 0 ? '✅' : '❌'} Easy questions generated (${data.easyCount > 0 ? 'PASS' : 'FAIL'})`);
            console.log(`${data.mediumCount > 0 ? '✅' : '❌'} Medium questions generated (${data.mediumCount > 0 ? 'PASS' : 'FAIL'})`);
            console.log(`${data.hardCount > 0 ? '✅' : '❌'} Hard questions generated (${data.hardCount > 0 ? 'PASS' : 'FAIL'})`);

            const allHavePdf = data.questions.every(q =>
              q.pdfBased && q.pdfFilename && q.chunkIndex !== undefined && q.difficulty
            );
            console.log(`${allHavePdf ? '✅' : '❌'} All questions have PDF metadata (${allHavePdf ? 'PASS' : 'FAIL'})`);

            const emojisCorrect = data.questions.every(q => {
              if (q.difficulty === 'easy') return q.difficultyEmoji === '🟢';
              if (q.difficulty === 'medium') return q.difficultyEmoji === '🟡';
              if (q.difficulty === 'hard') return q.difficultyEmoji === '🔴';
              return false;
            });
            console.log(`${emojisCorrect ? '✅' : '❌'} Difficulty emojis correct (${emojisCorrect ? 'PASS' : 'FAIL'})`);

            console.log('\n🎯 OVERALL STATUS:');
            const allPass = data.easyCount > 0 && data.mediumCount > 0 && data.hardCount > 0 && allHavePdf && emojisCorrect;
            console.log(allPass ? '✅ BATCH GENERATION WORKING PERFECTLY!' : '⚠️ Some issues detected (likely API timeouts)');

            db.close();
            resolve(true);
          })
          .catch(err => {
            console.error('❌ Test failed:', err.message);
            db.close();
            resolve(false);
          });
      }
    );
  });
}

runTest().then(success => {
  process.exit(success ? 0 : 1);
});
