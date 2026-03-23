/**
 * PDF SERVICE
 * Handles all PDF processing: extraction, chunking, and classification
 */

const pdfParse = require('pdf-parse');
const fs = require('fs').promises;
const { PDF_CHUNK_MIN_WORDS, PDF_CHUNK_MAX_WORDS } = require('../config/constants');

/**
 * Process PDF file: Extract text → Create chunks → Classify content
 * @param {string} filePath - Path to PDF file
 * @param {string} originalFilename - Original filename
 * @returns {Promise<object>} { extractedText, chunks[] }
 */
async function processPDF(filePath, originalFilename) {
  try {
    const dataBuffer = await fs.readFile(filePath);
    const pdfData = await pdfParse(dataBuffer);
    const fullText = pdfData.text;

    const chunks = intelligentChunk(fullText);

    console.log(`📄 PDF Processed: ${originalFilename}`);
    console.log(`   Total text: ${fullText.split(/\s+/).length} words`);
    console.log(`   Chunks created: ${chunks.length}`);

    return {
      extractedText: fullText,
      chunks: chunks.map((text, idx) => ({
        chunkIndex: idx,
        text,
        type: classifyChunkType(text),
        wordCount: text.split(/\s+/).length
      }))
    };
  } catch (error) {
    console.error('❌ PDF Processing Error:', error.message);
    throw error;
  }
}

/**
 * Split text into intelligent chunks (500-1000 words by paragraph breaks)
 * Preserves paragraph structure for better context
 */
function intelligentChunk(text) {
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0);
  const chunks = [];
  let currentChunk = '';

  for (const para of paragraphs) {
    const potentialChunk = currentChunk + (currentChunk ? '\n\n' : '') + para;
    const wordCount = potentialChunk.split(/\s+/).length;

    if (wordCount > PDF_CHUNK_MAX_WORDS) {
      if (currentChunk) chunks.push(currentChunk);
      currentChunk = para;
    } else {
      currentChunk = potentialChunk;
    }
  }

  if (currentChunk) chunks.push(currentChunk);

  return chunks;
}

/**
 * Classify chunk type for question generation context
 * Helps AI understand what kind of content it's working with
 */
function classifyChunkType(text) {
  const lower = text.toLowerCase();

  if (lower.includes('mechanism') || lower.includes('pathophysiology') || lower.includes('process')) {
    return 'mechanism';
  }
  if (lower.includes('example') || lower.includes('case') || lower.includes('patient') || lower.includes('presented')) {
    return 'example';
  }
  if (lower.includes('clinical') || lower.includes('diagnosis') || lower.includes('treatment') || lower.includes('management')) {
    return 'clinical';
  }
  return 'general';
}

/**
 * Get chunk statistics for debugging/logging
 */
function getChunkStats(chunks) {
  return {
    totalChunks: chunks.length,
    avgWordsPerChunk: chunks.reduce((sum, c) => sum + c.wordCount, 0) / chunks.length,
    minWords: Math.min(...chunks.map(c => c.wordCount)),
    maxWords: Math.max(...chunks.map(c => c.wordCount)),
    typeDistribution: {
      mechanism: chunks.filter(c => c.type === 'mechanism').length,
      example: chunks.filter(c => c.type === 'example').length,
      clinical: chunks.filter(c => c.type === 'clinical').length,
      general: chunks.filter(c => c.type === 'general').length
    }
  };
}

module.exports = {
  processPDF,
  intelligentChunk,
  classifyChunkType,
  getChunkStats
};
