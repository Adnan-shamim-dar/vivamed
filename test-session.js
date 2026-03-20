const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Connect to database
const dbPath = path.join(__dirname, 'data', 'progress.db');
const db = new sqlite3.Database(dbPath);

const testSessionId = 'test_session_' + Date.now();
const testFileId = 'pdf_test_123456';

console.log('🔧 Creating test session...\n');

// Create test session
db.run(
  `INSERT INTO sessions (sessionId, mode, fileId, startTime)
   VALUES (?, ?, ?, datetime('now'))`,
  [testSessionId, 'practice', testFileId],
  (err) => {
    if (err) {
      console.error('❌ Error creating test session:', err.message);
      db.close();
      return;
    }
    console.log(`✅ Created test session: ${testSessionId}`);
    console.log(`📄 Linked to PDF: ${testFileId}\n`);

    console.log('🧪 Testing batch question generation endpoint...\n');
    console.log('📝 Use this curl command:\n');
    console.log(`curl -X POST http://localhost:9999/pdf/generate-questions \\`);
    console.log(`  -H "Content-Type: application/json" \\`);
    console.log(`  -d '{`);
    console.log(`    "sessionId":"${testSessionId}",`);
    console.log(`    "fileId":"${testFileId}",`);
    console.log(`    "numberOfQuestions":6`);
    console.log(`  }'`);

    console.log('\n🎯 Expected response:\n');
    console.log('✅ success: true');
    console.log('📋 questions: array of 6 questions');
    console.log('  - 2 Easy (🟢)');
    console.log('  - 2 Medium (🟡)');
    console.log('  - 2 Hard (🔴)');
    console.log('✅ Each question should have:');
    console.log('  - question: string');
    console.log('  - difficulty: "easy" | "medium" | "hard"');
    console.log('  - difficultyEmoji: "🟢" | "🟡" | "🔴"');
    console.log('  - chunkIndex: number');
    console.log('  - totalChunks: 6');
    console.log('  - pdfFilename: "Test_Pathology.pdf"');
    console.log('  - pdfBased: true');
    console.log('  - source: "pdf-ai"');

    db.close();
  }
);
