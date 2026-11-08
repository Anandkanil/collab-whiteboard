// Netlify Function: generates an AI summary of a whiteboard.
// The Gemini API key lives only on the server (Netlify env var GEMINI_API_KEY),
// so it is never shipped to visitors' browsers.

const MAX_TEXT_LENGTH = 8000;

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export default async (req) => {
  if (req.method !== 'POST') {
    return json(405, { error: 'Method not allowed.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return json(500, { error: 'AI summary is not set up yet (GEMINI_API_KEY is missing on the server).' });
  }

  let payload;
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: 'Invalid request.' });
  }

  const text = String(payload?.text || '').slice(0, MAX_TEXT_LENGTH);
  const counts = payload?.counts && typeof payload.counts === 'object' ? payload.counts : {};

  const prompt = [
    'You are summarizing a collaborative whiteboard for the people working on it.',
    'Give a short summary of the main ideas, then a few suggested next steps as bullet points.',
    'If there is little or no text, say so briefly and describe the board from the element counts.',
    `Text on the board: ${text || 'None'}`,
    `Element counts: ${JSON.stringify(counts).slice(0, 500)}`,
  ].join('\n');

  // Try the main model first; if Google says it's busy (or it's slow), fall back
  // to the lighter Flash model. Each attempt is capped so the function never
  // hits Netlify's request timeout.
  const models = [...new Set([process.env.GEMINI_MODEL || 'gemini-flash-latest', 'gemini-flash-lite-latest'])];
  const ATTEMPT_TIMEOUT_MS = 12000;
  let busy = false;

  for (const model of models) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
          signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
        },
      );

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        console.error('Gemini error', model, res.status, data?.error?.message);
        if ([429, 500, 503, 504].includes(res.status)) {
          busy = true;
          continue;
        }
        return json(502, { error: `The AI service returned an error (${res.status}). Please try again later.` });
      }

      const summary = data?.candidates?.[0]?.content?.parts
        ?.map((part) => part.text || '')
        .join('')
        .trim();

      return json(200, { summary: summary || 'No summary generated.' });
    } catch (err) {
      console.error('Gemini request failed', model, err?.name, err?.message);
      busy = true;
    }
  }

  return json(503, {
    error: busy
      ? 'The AI is busy right now. Please try again in a minute.'
      : 'Could not reach the AI service. Please try again later.',
  });
};
