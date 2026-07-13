// api/refine.js
// This runs on Vercel's servers, not in the browser — so your API key stays hidden.
// Uses Google's Gemini API (free tier, no card required for AI Studio keys).

export default async function handler(req, res) {
  // Allow requests from any origin (so your HTML page can call this)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { draft, tone } = req.body || {};

  if (!draft || typeof draft !== 'string' || !draft.trim()) {
    return res.status(400).json({ error: 'Missing draft email text.' });
  }

  const systemPrompt = `You are a cold email refinement tool. The user will paste a rough draft cold email and a desired tone. Rewrite it to be clear, tightly structured (short paragraphs, one clear call-to-action), and effective for cold outreach — never robotic or over-salesy. Preserve the sender's original intent, facts, and key details exactly; do not invent new claims, names, or numbers. Keep length close to the original unless it's clearly too long or too short.

Respond ONLY with valid JSON, no markdown fences, no preamble, in this exact shape:
{"refined_email": "the full rewritten email as plain text, no subject line needed", "notes": "1-2 short sentences on the key changes you made and why, written directly to the user"}`;

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { text: `${systemPrompt}\n\nTone: ${tone || 'Direct and confident'}\n\nDraft email:\n${draft}` }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1000
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Gemini API error:', errText);
      return res.status(502).json({ error: 'Upstream API error.' });
    }

    const data = await response.json();
    const textBlock = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textBlock) {
      return res.status(502).json({ error: 'No text returned from model.' });
    }

    let cleaned = textBlock.replace(/```json|```/g, '').trim();
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      // Fallback: if the model didn't return clean JSON, just send the raw text back
      parsed = { refined_email: cleaned, notes: '' };
    }

    return res.status(200).json(parsed);
  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Server error refining email.' });
  }
}
