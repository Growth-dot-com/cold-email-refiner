// api/refine.js
// This runs on Vercel's servers, not in the browser — so your API key stays hidden.
// Uses Groq's free API (OpenAI-compatible format, no card required).

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

  const systemPrompt = `You are a cold email refinement tool. The user will paste a rough draft cold email and a desired tone.

Do two things:

1. Rewrite the email to be clear, tightly structured (short paragraphs, one clear call-to-action), and effective for cold outreach. Preserve the sender's original voice, phrasing, and key details as much as possible — do not flatten it into generic, overly-polished "AI voice." Only tighten structure, fix awkward phrasing, and soften anything that reads as pushy or robotic. Do not invent new claims, names, or numbers. Keep length close to the original unless it's clearly too long or too short.

2. Score the ORIGINAL draft's "spamminess" — how robotic, aggressive, or salesy it would feel to a real recipient — on a 1-10 scale (1 = feels human and low-pressure, 10 = feels like obvious spam/aggressive sales copy). List up to 4 specific phrases from the original draft that most contribute to that score, with a short reason for each.

Respond ONLY with valid JSON, no markdown fences, no preamble, in this exact shape:
{"refined_email": "the full rewritten email as plain text, no subject line needed", "notes": "1-2 short sentences on the key changes you made and why, written directly to the user", "spam_score": 4, "flagged_phrases": [{"phrase": "exact phrase from the original draft", "reason": "short reason this reads as spammy or pushy"}]}

If the draft has no spammy phrases, return an empty array for flagged_phrases and a low score.`;

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 1000,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Tone: ${tone || 'Direct and confident'}\n\nDraft email:\n${draft}` }
        ]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Groq API error:', errText);
      return res.status(502).json({ error: 'Upstream API error.' });
    }

    const data = await response.json();
    const textBlock = data.choices?.[0]?.message?.content;
    if (!textBlock) {
      return res.status(502).json({ error: 'No text returned from model.' });
    }

    let cleaned = textBlock.replace(/```json|```/g, '').trim();
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      parsed = { refined_email: cleaned, notes: '' };
    }

    return res.status(200).json(parsed);
  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Server error refining email.' });
  }
}
