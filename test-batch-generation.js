const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Connect to database
const dbPath = path.join(__dirname, 'data', 'progress.db');
const db = new sqlite3.Database(dbPath);

// Create test data
const testFileId = 'pdf_test_123456';
const testFileName = 'Test_Pathology.pdf';

const testChunks = [
  {
    chunkText: 'Neoplasia is defined as an uncontrolled growth of abnormal cells. The process involves multiple steps: initiation (DNA damage), promotion (clonal expansion), and progression (additional mutations). Key mechanisms include loss of tumor suppressors like p53 and activation of oncogenes.',
    chunkType: 'General'
  },
  {
    chunkText: 'The p53 gene acts as a guardian of the genome. When DNA damage is detected, p53 activates cell cycle checkpoints and can trigger apoptosis. Loss of p53 function is one of the most common genetic abnormalities in cancer, found in over 50% of malignancies.',
    chunkType: 'Mechanism'
  },
  {
    chunkText: 'Example: In colorectal cancer, a adenoma-carcinoma sequence occurs over 10-15 years. Loss of APC → K-RAS activation → p53 loss → invasion. This multi-step progression is a classic example of the genetic model of cancer.',
    chunkType: 'Example'
  },
  {
    chunkText: 'Clinically, understanding neoplastic transformation helps in cancer screening and prevention. For example, HPV vaccination prevents cervical cancer by blocking oncogenic HPV strains. Colorectal cancer screening detects adenomas before malignant transformation.',
    chunkType: 'Clinical'
  },
  {
    chunkText: 'Angiogenesis is essential for tumors to grow beyond 1-2mm. Tumors secrete VEGF (vascular endothelial growth factor) to recruit new blood vessels. This process is a hallmark of cancer and is targeted by anti-VEGF therapies like bevacizumab.',
    chunkType: 'Mechanism'
  },
  {
    chunkText: 'Metastasis requires the "seed and soil" concept: cancer cells (seed) must survive in the bloodstream, extravasate, and find a hospitable microenvironment (soil) to establish secondary tumors. This explains organ-specific metastatic patterns.',
    chunkType: 'General'
  }
];

console.log('🔧 Setting up test PDF and chunks in database...\n');

// Insert test PDF metadata
db.run(
  `INSERT INTO uploaded_files (fileId, originalFilename, totalChunks, uploadTime, status)
   VALUES (?, ?, ?, datetime('now'), 'complete')`,
  [testFileId, testFileName, testChunks.length],
  (err) => {
    if (err) {
      console.error('❌ Error inserting test PDF:', err.message);
      db.close();
      return;
    }
    console.log(`✅ Inserted test PDF: ${testFileId} - ${testFileName}`);

    // Insert test chunks
    let inserted = 0;
    testChunks.forEach((chunk, index) => {
      db.run(
        `INSERT INTO pdf_chunks (fileId, chunkIndex, chunkText, chunkType)
         VALUES (?, ?, ?, ?)`,
        [testFileId, index, chunk.chunkText, chunk.chunkType],
        (err) => {
          if (err) {
            console.error(`❌ Error inserting chunk ${index}:`, err.message);
          } else {
            inserted++;
            console.log(`✅ Inserted chunk ${index + 1}/${testChunks.length}`);
          }

          if (inserted === testChunks.length) {
            console.log(`\n✅ Test setup complete!`);
            console.log(`📊 Test PDF ID: ${testFileId}`);
            console.log(`📄 Test PDF Name: ${testFileName}`);
            console.log(`🔢 Total Chunks: ${testChunks.length}`);
            console.log('\n📝 Now you can test with:\n');
            console.log(`curl -X POST http://localhost:9999/pdf/generate-questions \\`);
            console.log(`  -H "Content-Type: application/json" \\`);
            console.log(`  -d '{"sessionId":"test_session_123","fileId":"${testFileId}","numberOfQuestions":6}'`);
            db.close();
          }
        }
      );
    });
  }
);
