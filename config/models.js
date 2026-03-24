/**
 * AI Model Configuration
 * CRITICAL: This is the ONLY place to change AI models
 * Change here once, affects all 9 AI calls throughout the app
 */

const CONFIG_KEYS = Object.freeze({
  QUESTION_GENERATION: 'questionGeneration',
  MCQ_GENERATION: 'mcqGeneration',
  EVALUATION: 'evaluation',
  PERFECT_ANSWER: 'perfectAnswer'
});

const DEFAULT_MODEL = 'stepfun/step-3.5-flash:free';
const SELECTED_MODEL = process.env.AI_MODEL || DEFAULT_MODEL;

/**
 * AI_MODEL_CONFIG: Central configuration for all AI calls
 * Temperature: 0.5 = consistent, 0.8+ = creative
 * maxTokens: Higher = longer responses, more cost
 */
const AI_MODEL_CONFIG = {
  [CONFIG_KEYS.QUESTION_GENERATION]: {
    model: SELECTED_MODEL,
    temperature: 0.8,
    maxTokens: 250
  },
  [CONFIG_KEYS.MCQ_GENERATION]: {
    model: SELECTED_MODEL,
    temperature: 0.8,
    maxTokens: 400
  },
  [CONFIG_KEYS.EVALUATION]: {
    model: SELECTED_MODEL,
    temperature: 0.7,
    maxTokens: 350
  },
  [CONFIG_KEYS.PERFECT_ANSWER]: {
    model: SELECTED_MODEL,
    temperature: 0.5,
    maxTokens: 300
  }
};

console.log(`🤖 AI Model: ${SELECTED_MODEL}`);

module.exports = {
  CONFIG_KEYS,
  AI_MODEL_CONFIG
};
