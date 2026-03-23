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

module.exports = {
  selectNextQuestionLogic,
  selectRevisionQuestion,
  updateReviewCount,
  shouldMarkForRemoval,
  calculateProgress
};
