module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    return res.status(200).json({ 
      status: 'PromptLens is running',
      gemini_key_set: !!process.env.GEMINI_API_KEY
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { rawPrompt, category, count, userProfile, usagePatterns, deepProfile } = req.body || {};
  if (!rawPrompt) return res.status(400).json({ error: 'No prompt provided' });

  const apiKey = process.env.GEMINI_API_KEY || 'YOUR_KEY_HERE';
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not set on server' });

  try {
    const prompts = await callGemini(rawPrompt, category || 'general', count || 4, userProfile, usagePatterns, deepProfile, apiKey);
    return res.status(200).json({ prompts });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Enhancement failed' });
  }
}

function buildPrompt(rawPrompt, category, count, userProfile, deepProfile) {
  const catMap = {
    general: 'Clear, detailed, versatile.',
    study: 'Deep learning with examples, analogies, step-by-step.',
    code: 'Programming with language, edge cases, best practices.',
    research: 'Research with evidence, perspectives, sources.',
    writing: 'Content with tone, audience, style, purpose.',
    interview: 'Interview prep with STAR method and tips.'
  };

  const DISPLAY = {
    theory:'Theory-first', examples:'Example-first', visual:'Visual learner',
    handson:'Hands-on', student:'Student', developer:'Developer',
    researcher:'Researcher', creative:'Creative', studying:'Studying',
    coding:'Coding', writing:'Writing', research:'Research',
    simpler:'Simpler language', detailed:'More detail', analogy:'Analogies',
    steps:'Step-by-step', beginner:'Beginner', intermediate:'Intermediate', advanced:'Advanced'
  };

  let profile = '';
  if (userProfile) {
    profile = `
USER PROFILE:
- Learning Style: ${DISPLAY[userProfile.learningStyle] || userProfile.learningStyle || 'unknown'}
- Background: ${DISPLAY[userProfile.background] || userProfile.background || 'unknown'}
- Level: ${DISPLAY[userProfile.level] || userProfile.level || 'unknown'}
- When Confused: ${DISPLAY[userProfile.confusionStyle] || userProfile.confusionStyle || 'unknown'}`;
  }

  if (deepProfile) profile += `\nDEEP PROFILE:\n${deepProfile.slice(0, 400)}`;

  return `You are PromptLens, an expert prompt engineer. Transform this into exactly ${count} distinct personalized prompts.
${profile}

CATEGORY: ${catMap[category] || catMap.general}

RULES:
- Each prompt much better than original
- Each takes a DIFFERENT angle
- Personalize to user profile
- 2-4 sentences each
- Output ONLY this JSON, nothing else:
{"prompts":[{"tag":"Label","text":"prompt here"},{"tag":"Label","text":"prompt here"}]}

Prompt to enhance: "${rawPrompt}"`;
}

async function callGemini(rawPrompt, category, count, userProfile, usagePatterns, deepProfile, apiKey) {
  const prompt = buildPrompt(rawPrompt, category, count, userProfile, deepProfile);

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 2000, temperature: 0.7 }
      })
    }
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Gemini error ${response.status}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

  try {
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean).prompts || [];
  } catch(e) {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]).prompts || [];
    throw new Error('Could not parse response');
  }
}
