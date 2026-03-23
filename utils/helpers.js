/**
 * Utility Helper Functions
 * Extracted from scattered locations in server.js
 * All utility functions in ONE place for reusability
 */

const crypto = require('crypto');

/**
 * Generate unique session ID
 */
function generateSessionId() {
  return `session_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * Calculate text similarity using Jaccard index
 * Used for deduplication when saving questions to library
 * Returns 0 (completely different) to 1 (identical)
 */
function calculateSimilarity(text1, text2) {
  const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(w => w.length > 3));

  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

/**
 * Promise-based delay
 * Used for retry logic and spam prevention
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get random items from an array
 * Used for fallback questions and random selection
 */
function getRandomItems(arr, count) {
  if (count >= arr.length) return arr;
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

/**
 * Get single random item from array
 */
function getRandomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Get next question from a pool (FIFO queue style)
 * Used for question bank rotation
 */
function getNextFromPool(pool, currentIndex = 0) {
  return pool[currentIndex % pool.length];
}

/**
 * Sanitize text for database storage
 * Removes/escapes dangerous characters
 */
function sanitizeText(text) {
  if (!text) return '';
  return text
    .replace(/'/g, "''")  // Escape single quotes for SQL
    .trim()
    .substring(0, 5000);  // Limit length
}

/**
 * Extract JSON from text (even if wrapped in markdown code blocks)
 * Used for parsing AI responses
 */
function extractJSON(text) {
  if (!text) return null;

  try {
    // Try direct parse first
    return JSON.parse(text);
  } catch (e1) {
    // Try removing markdown code blocks
    try {
      const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
      return JSON.parse(cleaned);
    } catch (e2) {
      // Try finding JSON object in text
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
      } catch (e3) {
        return null;
      }
    }
  }
}

module.exports = {
  generateSessionId,
  calculateSimilarity,
  delay,
  getRandomItems,
  getRandomItem,
  getNextFromPool,
  sanitizeText,
  extractJSON
};
