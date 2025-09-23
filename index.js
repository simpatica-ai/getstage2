const { VertexAI } = require('@google-cloud/vertexai');
const functions = require('@google-cloud/functions-framework');

// Initialize Vertex AI outside the handler for better performance
const vertex_ai = new VertexAI({
  project: 'new-man-app',
  location: 'us-central1'
});

functions.http('getstage2', async (req, res) => {
  // Set CORS headers
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    // Validate request body
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).send({ error: 'Invalid request body' });
    }

    const { virtueName, virtueDef, characterDefectAnalysis, stage1MemoContent, stage2MemoContent, stage1Complete, previousPrompts } = req.body;

    // Validate required fields
    if (!virtueName || !virtueDef || !characterDefectAnalysis) {
      return res.status(400).send({ error: 'Missing required fields: virtueName, virtueDef, and characterDefectAnalysis are required.' });
    }

    // Check if Stage 1 is complete
    if (!stage1Complete || !stage1MemoContent || stage1MemoContent.trim().length < 50) {
      return res.status(200).send({
        prompt: "Before beginning Stage 2 (Building), please complete Stage 1 (Dismantling) first. Stage 1 provides the foundation for understanding what needs to change before you can build new, healthier habits. Return to Stage 1 and mark it as complete when you've finished your reflection.",
        requiresStage1: true
      });
    }

    // --- STAGE 2 BUILDING PROMPT ---
    const prompt = `
      You are an empathetic and wise recovery coach. Your task is to generate a focused, actionable writing prompt for a user working on Stage 2 of their virtue development: "Building".

      **Building Virtue Definition:** The building virtue process is a cycle of intentional, daily work to align your actions with your values. Reflection is a cornerstone of this process, encompassing a series of practices to deepen self-awareness and learning. It includes evening journaling to review your day and note successes, challenges, and lessons learned related to the virtue. This practice is your personal space for processing and understanding your growth. It involves honestly acknowledging struggles but pairing that with kindness. You view lapses not as failures but as valuable learning opportunities. The goal is to collect raw data for understanding your growth and to reinforce successes.

      **USER CONTEXT:**
      - **Virtue:** ${virtueName}
      - **Virtue Definition:** ${virtueDef}
      - **Stage 1 Completed Work:** """${stage1MemoContent}"""
      - **Stage 2 Progress:** """${stage2MemoContent || "The user has not started Stage 2 writing yet."}"""
      - **Previous Prompts Given:** ${previousPrompts ? `"""${JSON.stringify(previousPrompts)}"""` : "No previous prompts for this virtue stage."}

      **COMPLETION CHECK:** Analyze the user's Stage 2 writing progress. If they have adequately built new positive behaviors and practices to replace dismantled defects, and demonstrate consistent reflection on successes/challenges, acknowledge completion and suggest readiness for Stage 3 (Practice).

      **YOUR TASK:**
      Generate a focused writing prompt (limit 200 words) that:
      ${stage2MemoContent ? 
        `1. Acknowledges their existing Stage 2 progress and insights, referencing previous prompts if relevant
         2. Either: (a) If building appears complete, congratulate them and suggest readiness for Stage 3, OR (b) Focus on areas still needing development
         3. If incomplete, identify ONE specific building topic for today's reflection` 
        : 
        `1. Acknowledges their Stage 1 insights and transition to building
         2. Identifies ONE specific, limited writing topic for today's reflection
         3. Focuses on building new positive habits related to ${virtueName}`}
      4. Encourages reflection on recent successes, challenges, triggers, or lessons learned
      5. Ends with a specific question about applying lessons to future actions

      Keep the scope narrow and actionable. Frame with empathy and encouragement.
    `;

    // --- Model Execution Logic (Unchanged) ---
    // Use gemini-2.5-flash-lite as primary, with fallbacks
    const modelNames = [
      'gemini-2.5-flash-lite',  // Primary model
      'gemini-2.0-flash-lite',  // Fallback 1
      'gemini-1.5-flash-lite',  // Fallback 2
      'gemini-1.5-flash',       // Fallback 3
      'gemini-pro'              // Final fallback
    ];
    let promptResponseText = '';
    let successfulModel = '';

    for (const modelName of modelNames) {
      try {
        console.log(`Trying model: ${modelName}`);
        const generativeModel = vertex_ai.getGenerativeModel({ model: modelName });
        const result = await generativeModel.generateContent(prompt);
        const response = result.response;

        if (response.candidates && response.candidates[0] && response.candidates[0].content) {
          promptResponseText = response.candidates[0].content.parts[0].text;
          successfulModel = modelName;
          console.log(`Success with model: ${modelName}`);
          break;
        } else {
          throw new Error('Invalid response format from model');
        }
      } catch (error) {
        console.warn(`Model ${modelName} failed:`, error.message);
        continue;
      }
    }

    if (!promptResponseText) {
      console.error('All models failed.');
      // A simple fallback if all AI models fail
      promptResponseText = `Take a quiet moment to reflect on the virtue of ${virtueName}. Consider one specific time this week where you found it challenging to practice. What was the situation? What feelings came up for you? Gently explore this memory without judgment.`;
    }

    res.status(200).send({
      prompt: promptResponseText,
      model: successfulModel || 'fallback'
    });

  } catch (error) {
    console.error('Unexpected error in getstage2 function:', error);
    res.status(500).send({ error: 'Internal server error' });
  }
});
