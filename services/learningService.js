/**
 * LEARNING SERVICE - Duolingo Style MCQ Learning Engine
 * Handles spaced repetition and revision scheduling
 */

const { MCQ_REVISION_PERCENTAGE, MCQ_REVISION_LIMIT } = require('../config/constants');

/**
 * Duolingo-style logic: 70% new questions, 30% revision
 * @param {array} sessionPerformance - { correctQuestions, wrongQuestions }
 * @returns {string} 'NEW' or a wrong question object to revise
 */
function selectNextQuestionLogic(sessionPerformance) {
  if (Math.random() < MCQ_REVISION_PERCENTAGE && sessionPerformance.wrongQuestions.length > 0) {
    // 30% of time: Revise wrong question
    return selectRevisionQuestion(sessionPerformance.wrongQuestions);
  } else {
    // 70% of time: New question
    return 'NEW';
  }
}

/**
 * Pick a wrong question that needs revision
 * Prioritizes questions that haven't been reviewed recently
 */
function selectRevisionQuestion(wrongQuestions) {
  if (wrongQuestions.length === 0) return 'NEW';

  // Sort by last reviewed time, pick one that needs review
  const sortedByReview = wrongQuestions.sort((a, b) => {
    const aTime = new Date(a.lastReviewedAt || 0).getTime();
    const bTime = new Date(b.lastReviewedAt || 0).getTime();
    return aTime - bTime; // Older reviews first
  });

  // Return the one most overdue for review
  return sortedByReview[0];
}

/**
 * Update question review count after answering
 */
function updateReviewCount(question, isCorrect) {
  if (!question.reviewCount) {
    question.reviewCount = 0;
  }

  if (!isCorrect && question.reviewCount < MCQ_REVISION_LIMIT) {
    question.reviewCount += 1;
    question.lastReviewedAt = new Date().toISOString();
  }

  return question;
}

/**
 * Determine if question should be marked for removal (graduated)
 * Criteria: Answered correctly consistently
 */
function shouldMarkForRemoval(question, consecutiveCorrect = 2) {
  return question.reviewCount >= MCQ_REVISION_LIMIT && consecutiveCorrect >= 2;
}

/**
 * Calculate learning progress metrics
 */
function calculateProgress(sessionPerformance) {
  const total = sessionPerformance.correctQuestions.length + sessionPerformance.wrongQuestions.length;
  const correct = sessionPerformance.correctQuestions.length;
  const accuracy = total > 0 ? (correct / total * 100).toFixed(1) : 0;

  return {
    correct,
    wrong: sessionPerformance.wrongQuestions.length,
    total,
    accuracy: `${accuracy}%`,
    needsReview: sessionPerformance.wrongQuestions.filter(q => q.reviewCount < MCQ_REVISION_LIMIT).length
  };
}

/**
 * ADAPTIVE LEARNING: Extract topic from question text
 * Uses keyword matching + AI extraction (fallback pattern)
 * @param {string} question - The MCQ question text
 * @param {object} options - The MCQ options object
 * @returns {object} { topic, subtopic }
 */
function extractTopicFromQuestion(question, options = {}) {
  // Topic mapping: medical specialties and key concepts
  const topicKeywords = {
    'Cardiology': ['heart', 'cardiac', 'coronary', 'arrhythmia', 'hypertension', 'myocardial', 'angina', 'ventricle', 'atrium'],
    'Neurology': ['brain', 'nerve', 'neural', 'stroke', 'epilepsy', 'seizure', 'alzheimer', 'parkinson', 'meningitis', 'neuron'],
    'Anatomy': ['bone', 'muscle', 'anatomy', 'skeletal', 'organ', 'anatomical', 'ligament', 'tendon', 'artery', 'vein'],
    'Biochemistry': ['enzyme', 'protein', 'glucose', 'metabol', 'lipid', 'amino acid', 'nucleotide', 'glycolysis', 'krebs'],
    'Pharmacology': ['drug', 'medication', 'antibiotic', 'receptor', 'antagonist', 'agonist', 'dose', 'adverse effect'],
    'Immunology': ['immune', 'antibody', 'antigen', 'lymphocyte', 'infection', 'vaccine', 'immunity', 'cytokine'],
    'Pathology': ['disease', 'pathology', 'tumor', 'necrosis', 'inflammation', 'fibrosis', 'biopsy', 'malignant'],
    'Physiology': ['blood', 'respiration', 'digestion', 'homeostasis', 'oxygen', 'carbon dioxide', 'pressure', 'secretion'],
    'Dermatology': ['skin', 'dermat', 'rash', 'eczema', 'psoriasis', 'melanoma', 'lesion', 'epidermis'],
    'Microbiology': ['bacteria', 'virus', 'fungal', 'prototype', 'infection', 'microbe', 'gram-positive', 'gram-negative']
  };

  const text = (question + ' ' + JSON.stringify(options)).toLowerCase();
  let matchedTopic = 'General';
  let maxMatches = 0;

  // Find topic with most keyword matches
  for (const [topic, keywords] of Object.entries(topicKeywords)) {
    const matches = keywords.filter(kw => text.includes(kw)).length;
    if (matches > maxMatches) {
      maxMatches = matches;
      matchedTopic = topic;
    }
  }

  // Subtopic extraction (simplified)
  const subtopic = maxMatches > 0 ? 'General' : 'General';

  return {
    topic: matchedTopic,
    subtopic: subtopic
  };
}

/**
 * ADAPTIVE LEARNING: Update topic performance tracking
 * @param {object} db - Database instance
 * @param {string} sessionId - Session ID
 * @param {string} topic - Medical topic
 * @param {string} subtopic - Subtopic within topic
 * @param {boolean} isCorrect - Whether user answered correctly
 */
async function updateTopicPerformance(db, sessionId, topic, subtopic, isCorrect) {
  try {
    // Get current performance for this topic
    const current = await new Promise((resolve, reject) => {
      db.get(
        `SELECT total_attempts, correct_attempts FROM topic_performance
         WHERE sessionid = ? AND topic = ? AND subtopic = ?`,
        [sessionId, topic, subtopic || 'General'],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    const totalAttempts = (current?.total_attempts || 0) + 1;
    const correctAttempts = (current?.correct_attempts || 0) + (isCorrect ? 1 : 0);
    const accuracy = (correctAttempts / totalAttempts * 100).toFixed(2);

    // Insert or update topic performance
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO topic_performance (sessionid, topic, subtopic, total_attempts, correct_attempts, accuracy, last_attempted)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(sessionid, topic, subtopic) DO UPDATE SET
           total_attempts = ?,
           correct_attempts = ?,
           accuracy = ?,
           last_attempted = ?`,
        [sessionId, topic, subtopic || 'General', totalAttempts, correctAttempts, accuracy, new Date().toISOString(),
         totalAttempts, correctAttempts, accuracy, new Date().toISOString()],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    return { totalAttempts, correctAttempts, accuracy };
  } catch (error) {
    console.warn('⚠️ Error updating topic performance:', error.message);
    // Non-critical: don't break question flow if tracking fails
    return null;
  }
}

/**
 * ADAPTIVE LEARNING: Get weak topics (accuracy < 70%)
 * @param {object} db - Database instance
 * @param {string} sessionId - Session ID
 * @returns {Promise<array>} Array of weak topics sorted by lowest accuracy
 */
async function getWeakTopics(db, sessionId) {
  try {
    return await new Promise((resolve, reject) => {
      db.all(
        `SELECT topic, subtopic, accuracy, total_attempts FROM topic_performance
         WHERE sessionid = ? AND accuracy < 70
         ORDER BY accuracy ASC`,
        [sessionId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  } catch (error) {
    console.warn('⚠️ Error fetching weak topics:', error.message);
    return []; // Fallback: no weak topics (will generate random question)
  }
}

/**
 * ADAPTIVE LEARNING: Select topic for next question
 * 70% chance weak topic, 30% chance new random topic
 * @param {object} db - Database instance
 * @param {string} sessionId - Session ID
 * @returns {Promise<string|null>} Topic string or null (for random)
 */
async function selectTopicForQuestion(db, sessionId) {
  try {
    const weakTopics = await getWeakTopics(db, sessionId);

    // 70% chance: Pick weak topic
    if (weakTopics.length > 0 && Math.random() < 0.7) {
      const selected = weakTopics[Math.floor(Math.random() * weakTopics.length)];
      console.log(`📊 Adaptive Learning: Selecting weak topic "${selected.topic}" (${selected.accuracy}% accuracy)`);
      return selected.topic;
    }

    // 30% chance: Return null (trigger random/new topic generation)
    console.log(`🎲 Adaptive Learning: Selecting random new topic (30% chance)`);
    return null;
  } catch (error) {
    console.warn('⚠️ Error in topic selection:', error.message);
    return null; // Fallback to random
  }
}

module.exports = {
  selectNextQuestionLogic,
  selectRevisionQuestion,
  updateReviewCount,
  shouldMarkForRemoval,
  calculateProgress,
  extractTopicFromQuestion,
  updateTopicPerformance,
  getWeakTopics,
  selectTopicForQuestion
};
