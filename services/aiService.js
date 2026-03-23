/**
 * AI SERVICE - CENTRAL AI CALL HUB
 *
 * CRITICAL: This is the ONLY file that calls OpenRouter API
 * Want to swap models? Change ONE CONFIG file (config/models.js)
 * Want to switch AI providers? Modify callOpenRouterAPI() function only
 *
 * All 9 AI functions route through this file!
 */

const { CONFIG_KEYS, AI_MODEL_CONFIG } = require('../config/models');
const { AI_TIMEOUT_MS } = require('../config/constants');

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// Check if API key is loaded
if (!OPENROUTER_API_KEY) {
  console.warn('⚠️  WARNING: OPENROUTER_API_KEY not found in .env file!');
  console.warn('⚠️  Questions will use local fallback instead of AI');
} else {
  console.log('✅ API Key loaded: ' + OPENROUTER_API_KEY.substring(0, 20) + '...');
}

// ========================================
// MCQ DIFFICULTY GUIDANCE & FALLBACKS
// ========================================

const MCQ_DIFFICULTY_GUIDANCE = {
  easy: `Focus on basic concepts, straightforward options with obvious distractors.`,
  medium: `Create questions requiring moderate reasoning with plausible distractors.`,
  hard: `Create complex scenarios with similar-looking options that require deep reasoning.`
};

const FALLBACK_MCQ_POOLS = {
  easy: [
    {
      question: "What is the normal resting heart rate for a healthy adult?",
      options: { A: "60-100 bpm", B: "40-60 bpm", C: "100-120 bpm", D: "120-140 bpm" },
      correctOption: "A",
      explanation: "Normal resting heart rate in adults is 60-100 beats per minute."
    },
    {
      question: "Which organ system is responsible for transporting oxygen throughout the body?",
      options: { A: "Circulatory system", B: "Respiratory system", C: "Nervous system", D: "Digestive system" },
      correctOption: "A",
      explanation: "The circulatory system transports oxygen and nutrients via blood."
    },
    {
      question: "What is the normal human body temperature?",
      options: { A: "37°C (98.6°F)", B: "35°C (95°F)", C: "39°C (102°F)", D: "40°C (104°F)" },
      correctOption: "A",
      explanation: "Normal body temperature is approximately 37°C."
    },
    {
      question: "How many bones are in the adult human skeleton?",
      options: { A: "206", B: "186", C: "226", D: "266" },
      correctOption: "A",
      explanation: "Adults have 206 bones in their skeleton."
    },
    {
      question: "Which of the following is the basic unit of life?",
      options: { A: "Cell", B: "Tissue", C: "Organ", D: "Protein" },
      correctOption: "A",
      explanation: "The cell is the basic functional and structural unit of life."
    }
  ],
  medium: [
    {
      question: "What is the role of the parasympathetic nervous system?",
      options: { A: "Fight or flight response", B: "Rest and digest response", C: "Muscle contraction", D: "Pain sensation" },
      correctOption: "B",
      explanation: "The parasympathetic nervous system promotes rest, digestion, and recovery."
    },
    {
      question: "Which enzyme is responsible for breaking down lactose?",
      options: { A: "Amylase", B: "Lipase", C: "Lactase", D: "Protease" },
      correctOption: "C",
      explanation: "Lactase breaks down lactose into glucose and galactose."
    },
    {
      question: "What is the primary function of mitochondria?",
      options: { A: "Protein synthesis", B: "Energy (ATP) production", C: "DNA storage", D: "Waste disposal" },
      correctOption: "B",
      explanation: "Mitochondria produce ATP through cellular respiration."
    },
    {
      question: "Which hormone regulates blood glucose levels?",
      options: { A: "Cortisol", B: "Adrenaline", C: "Insulin", D: "Thyroid hormone" },
      correctOption: "C",
      explanation: "Insulin lowers blood glucose by promoting cellular uptake."
    },
    {
      question: "What causes the systolic/diastolic blood pressure readings?",
      options: { A: "Heart contraction and relaxation", B: "Breathing cycles", C: "Muscle activity", D: "Digestion" },
      correctOption: "A",
      explanation: "Systolic = contraction, Diastolic = relaxation of the ventricles."
    }
  ],
  hard: [
    {
      question: "How does the Frank-Starling mechanism regulate cardiac output?",
      options: { A: "Increased preload increases ventricular stretch and contraction force", B: "Sympathetic stimulation directly increases heart rate", C: "Afterload determines overall cardiac performance", D: "Baroreceptors control all aspects of cardiac function" },
      correctOption: "A",
      explanation: "Increased venous return stretches cardiac muscle fibers, enhancing contractility through optimal sarcomere length."
    },
    {
      question: "What is the pathophysiology of Type 2 Diabetes Mellitus?",
      options: { A: "Autoimmune destruction of pancreatic beta cells", B: "Insulin resistance with progressive beta cell dysfunction", C: "Complete absence of insulin production", D: "Excessive glucagon secretion" },
      correctOption: "B",
      explanation: "T2DM involves insulin resistance and gradual loss of beta cell function over time."
    },
    {
      question: "Describe the role of the blood-brain barrier in neuroprotection.",
      options: { A: "Permits free movement of all substances for optimal brain function", B: "Selectively restricts large molecules while allowing essential nutrients and protecting from toxins", C: "Prevents all molecules from entering the brain", D: "Only restricts bacteria, not drugs or toxins" },
      correctOption: "B",
      explanation: "The BBB maintains selective permeability, protecting neural tissue while allowing necessary substances."
    },
    {
      question: "How do statins reduce cardiovascular risk at the molecular level?",
      options: { A: "Direct vasodilation of coronary vessels", B: "Inhibition of HMG-CoA reductase decreasing LDL and inflammation", C: "Increase in HDL cholesterol only", D: "Reduction of blood pressure alone" },
      correctOption: "B",
      explanation: "Statins block cholesterol synthesis and reduce both LDL and inflammatory markers."
    },
    {
      question: "What is the mechanism of action of ACE inhibitors in heart failure management?",
      options: { A: "Direct cardiac contractility enhancement", B: "Inhibition of angiotensin II formation and reduced vasoconstriction/aldosterone secretion", C: "Increased heart rate to improve cardiac output", D: "Direct reduction of blood viscosity" },
      correctOption: "B",
      explanation: "ACE inhibitors block angiotensin II production, reducing afterload and remodeling in heart failure."
    }
  ]
};

// ========================================
// MASTER AI FUNCTION - ALL CALLS ROUTE HERE
// ========================================

/**
 * MASTER AI FUNCTION
 * Change ONE LINE here to swap to different AI provider/model
 * @param {string} prompt - User prompt
 * @param {string} configKey - CONFIG_KEYS.QUESTION_GENERATION, MCQ_GENERATION, EVALUATION, PERFECT_ANSWER
 * @param {number} timeoutMs - Override timeout (default: 30000ms)
 * @returns {Promise<string>} Generated response from AI
 */
async function callOpenRouterAPI(prompt, configKey = CONFIG_KEYS.QUESTION_GENERATION, timeoutMs = AI_TIMEOUT_MS) {
  if (!OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY not set");
  }

  // Validate configKey to prevent silent fallbacks
  if (!AI_MODEL_CONFIG[configKey]) {
    const validKeys = Object.values(CONFIG_KEYS).join(', ');
    throw new Error(`Invalid configKey: "${configKey}". Valid keys: ${validKeys}`);
  }

  const config = AI_MODEL_CONFIG[configKey];

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: config.temperature,
        max_tokens: config.maxTokens
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutHandle);

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`API error ${response.status}: ${err.substring(0, 200)}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from API');
    }

    return content;
  } catch (error) {
    clearTimeout(timeoutHandle);
    if (error.name === 'AbortError') {
      throw new Error(`API request timeout after ${timeoutMs}ms`);
    }
    throw error;
  }
}

// ========================================
// AI WRAPPER FUNCTIONS - Question Generation
// ========================================

/**
 * Generate generic (non-PDF) long-form question
 */
async function generateGenericQuestion() {
  try {
    console.log('🤖 Calling OpenRouter API for AI question...');

    const prompt = 'Generate ONE medical viva exam question. Return ONLY the question as a single sentence.';
    const question = await callOpenRouterAPI(prompt, CONFIG_KEYS.QUESTION_GENERATION);

    console.log('✅ AI Question Generated Successfully:', question.substring(0, 50) + '...');
    return question;
  } catch (error) {
    console.error('❌ AI Question Generation Failed:', error.message);
    throw error;
  }
}

/**
 * Generate perfect (model) answer for a question
 */
async function generatePerfectAnswer(question) {
  try {
    console.log('✏️ [PERFECT ANSWER] Generating answer for:', question.substring(0, 60) + '...');

    const prompt = `You are a senior medical educator. Provide a PERFECT, CONCISE, exam-ready answer to this medical viva question.

QUESTION: ${question}

Requirements:
- Be comprehensive but focused (2-4 sentences)
- Include key mechanisms and clinical relevance
- Use proper medical terminology
- Be suitable for a high-scoring exam response

ANSWER:`;

    const perfectAnswer = await callOpenRouterAPI(prompt, CONFIG_KEYS.PERFECT_ANSWER);

    console.log('✅ [PERFECT ANSWER] Generated successfully:', perfectAnswer.substring(0, 80) + '...');
    return perfectAnswer;

  } catch (error) {
    console.error('❌ [PERFECT ANSWER] Generation Failed:', error.message);
    throw error;
  }
}

/**
 * Generate perfect answer using PDF chunk as context
 */
async function generatePerfectAnswerFromContext(chunkText, question) {
  try {
    console.log('📖 Generating contextual answer from PDF chunk...');

    const prompt = `You are a senior medical educator. Provide a PERFECT, exam-ready answer to this question using ONLY information from the provided study material.

STUDY MATERIAL:
"""
${chunkText}
"""

QUESTION: ${question}

Requirements:
- Answer must be based on the study material above
- Be comprehensive but focused (2-4 sentences)
- Include specific details from the material
- Use proper medical terminology
- Be suitable for a high-scoring exam response

ANSWER:`;

    const contextualAnswer = await callOpenRouterAPI(prompt, CONFIG_KEYS.PERFECT_ANSWER);

    if (!contextualAnswer) {
      throw new Error('Empty answer received from API');
    }

    console.log('✅ [CONTEXTUAL ANSWER] Generated:', contextualAnswer.substring(0, 80) + '...');
    return contextualAnswer;

  } catch (error) {
    console.error('❌ [CONTEXTUAL ANSWER] Generation Failed:', error.message);
    // Fall back to generic perfect answer if contextual fails
    try {
      console.log('   Falling back to generic perfect answer...');
      return await generatePerfectAnswer(question);
    } catch (fallbackError) {
      console.error('❌ Fallback also failed:', fallbackError.message);
      throw error;
    }
  }
}

/**
 * Evaluate student answer using AI professor evaluation
 */
async function evaluateAnswerWithAI(question, answer) {
  if (!OPENROUTER_API_KEY) {
    console.warn('⚠️ No API key, skipping AI evaluation');
    throw new Error('API key not configured');
  }

  try {
    console.log('🎓 Calling AI Professor for strict evaluation...');

    const prompt = `You are a strict medical viva examiner. Evaluate this student's answer professionally and concisely.

QUESTION: ${question}

STUDENT'S ANSWER: ${answer}

Provide EXACTLY this format (be concise and direct):

Score: X/10

Strengths:
- (1-2 key strengths)

Weaknesses:
- (1-2 key gaps)

Missing Concepts:
- (1-2 important concepts not mentioned)

Follow-up Question:
(A challenging follow-up question to test deeper understanding)`;

    const aiEvaluation = await callOpenRouterAPI(prompt, CONFIG_KEYS.EVALUATION);
    console.log('✅ AI Evaluation Complete');

    // Extract score from AI response
    const scoreMatch = aiEvaluation.match(/Score:\s*(\d+)/);
    const score = scoreMatch ? Math.min(Math.max(parseInt(scoreMatch[1]), 0), 10) : 5;

    return {
      score: score,
      feedback: aiEvaluation,
      isAIPowered: true
    };
  } catch (error) {
    console.error('❌ AI Evaluation failed:', error.message);
    throw error;
  }
}

// ========================================
// MCQ GENERATION FUNCTIONS
// ========================================

/**
 * Generate generic MCQ question
 */
async function generateMCQQuestion(difficulty = 'medium') {
  const MAX_RETRIES = 2;
  let lastError;

  // Build guidance and prompt ONCE before retry loop (avoid rebuilding on each attempt)
  const difficultyGuidance = MCQ_DIFFICULTY_GUIDANCE[difficulty] || MCQ_DIFFICULTY_GUIDANCE.medium;
  const prompt = `You are a medical examiner creating multiple-choice questions.

TASK: Generate ONE medical MCQ question with exactly 4 options (A, B, C, D).

DIFFICULTY: ${difficulty.toUpperCase()}
${difficultyGuidance}

Return ONLY valid JSON (no markdown, no backticks!) in this exact format:
{
  "question": "single sentence question here",
  "options": {
    "A": "option text here",
    "B": "option text here",
    "C": "option text here",
    "D": "option text here"
  },
  "correctOption": "A",
  "explanation": "why this is correct"
}`;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`🤖 Generating generic MCQ question (${difficulty}) - Attempt ${attempt}/${MAX_RETRIES}...`);

      // Use helper function to call API
      const content = await callOpenRouterAPI(prompt, CONFIG_KEYS.MCQ_GENERATION);

      if (!content) {
        console.error('❌ Missing content in API response');
        lastError = new Error('Empty response from API');
        if (attempt < MAX_RETRIES) {
          await delay(1000 * attempt);
          continue;
        }
        throw lastError;
      }

      // Parse JSON response
      let mcqData;
      try {
        mcqData = JSON.parse(content);
      } catch (e) {
        console.error('❌ Failed to parse MCQ response:', content.substring(0, 200));
        lastError = new Error('Invalid JSON format from API');
        if (attempt < MAX_RETRIES) {
          await delay(1000 * attempt);
          continue;
        }
        throw lastError;
      }

      console.log('✅ MCQ Question Generated:', mcqData.question.substring(0, 80) + '...');

      return {
        question: mcqData.question,
        options: mcqData.options,
        correctOption: mcqData.correctOption,
        explanation: mcqData.explanation,
        difficulty: difficulty,
        questionType: 'mcq',
        pdfBased: false,
        source: 'ai'
      };
    } catch (error) {
      lastError = error;
      console.error(`❌ MCQ Generation Attempt ${attempt} Failed:`, error.message);
      if (attempt < MAX_RETRIES) {
        console.log(`⏳ Retrying in ${1000 * attempt}ms...`);
        await delay(1000 * attempt);
      }
    }
  }

  // All retries failed - return fallback MCQ
  console.warn('⚠️ All API retries failed, using fallback MCQ');
  return getFallbackMCQ(difficulty);
}

/**
 * Return a fallback MCQ when API fails
 */
function getFallbackMCQ(difficulty = 'medium') {
  const pool = FALLBACK_MCQ_POOLS[difficulty] || FALLBACK_MCQ_POOLS.medium;
  const mcq = pool[Math.floor(Math.random() * pool.length)];
  console.log(`📦 Using fallback MCQ: "${mcq.question.substring(0, 50)}..."`);

  return {
    question: mcq.question,
    options: mcq.options,
    correctOption: mcq.correctOption,
    explanation: mcq.explanation,
    difficulty: difficulty,
    questionType: 'mcq',
    pdfBased: false,
    source: 'fallback',
    isRevision: false,
    reviewCount: 0
  };
}

// ========================================
// UTILITY FUNCTIONS
// ========================================

/**
 * Promise-based delay
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ========================================
// EXPORTS
// ========================================

module.exports = {
  // Master function
  callOpenRouterAPI,

  // Generic question generation
  generateGenericQuestion,

  // Perfect answer generation
  generatePerfectAnswer,
  generatePerfectAnswerFromContext,

  // Answer evaluation
  evaluateAnswerWithAI,

  // MCQ generation
  generateMCQQuestion,
  getFallbackMCQ,

  // Utilities
  delay,

  // Constants
  MCQ_DIFFICULTY_GUIDANCE,
  FALLBACK_MCQ_POOLS,
  CONFIG_KEYS
};
