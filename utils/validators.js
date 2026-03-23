/**
 * Input Validation Schemas
 * Validates request bodies for all endpoints
 */

/**
 * Validate session creation request
 */
function validateSessionCreation(req) {
  const { mode } = req.body;

  if (!mode) {
    throw new Error('mode is required');
  }

  if (!['practice', 'exam', 'mcq'].includes(mode)) {
    throw new Error('mode must be one of: practice, exam, mcq');
  }

  return { valid: true };
}

/**
 * Validate progress save request
 */
function validateProgressSave(req) {
  const { sessionId, question, answer, score } = req.body;

  if (!sessionId) throw new Error('sessionId is required');
  if (!question) throw new Error('question is required');
  if (answer === undefined) throw new Error('answer is required');
  if (score === undefined) throw new Error('score is required');

  if (typeof score !== 'number' || score < 0 || score > 10) {
    throw new Error('score must be a number between 0 and 10');
  }

  return { valid: true };
}

/**
 * Validate question request
 */
function validateQuestionRequest(req) {
  const { sessionId } = req.query;

  // sessionId is optional, but if provided, should be valid format
  if (sessionId && !sessionId.startsWith('session_')) {
    throw new Error('Invalid sessionId format');
  }

  return { valid: true };
}

/**
 * Validate MCQ question request
 */
function validateMCQRequest(req) {
  const { difficulty } = req.body;

  if (difficulty && !['easy', 'medium', 'hard'].includes(difficulty)) {
    throw new Error('difficulty must be one of: easy, medium, hard');
  }

  return { valid: true };
}

/**
 * Validate evaluation request
 */
function validateEvaluationRequest(req) {
  const { question, answer } = req.body;

  if (!question || typeof question !== 'string' || question.length < 5) {
    throw new Error('question must be a string with at least 5 characters');
  }

  if (!answer || typeof answer !== 'string' || answer.length < 3) {
    throw new Error('answer must be a string with at least 3 characters');
  }

  return { valid: true };
}

/**
 * Validate perfect answer request
 */
function validatePerfectAnswerRequest(req) {
  const { question } = req.body;

  if (!question || typeof question !== 'string' || question.length < 5) {
    throw new Error('question must be a string with at least 5 characters');
  }

  return { valid: true };
}

/**
 * Validate PDF upload request
 */
function validatePDFUpload(req) {
  if (!req.file) {
    throw new Error('No file provided');
  }

  if (req.file.mimetype !== 'application/pdf') {
    throw new Error('Only PDF files are allowed');
  }

  if (req.file.size > 10 * 1024 * 1024) {
    throw new Error('File size must be less than 10MB');
  }

  return { valid: true };
}

module.exports = {
  validateSessionCreation,
  validateProgressSave,
  validateQuestionRequest,
  validateMCQRequest,
  validateEvaluationRequest,
  validatePerfectAnswerRequest,
  validatePDFUpload
};
