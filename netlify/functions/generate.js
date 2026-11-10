// Netlify Function that writes Threads post ideas with the Anthropic Claude API.
// Requires ANTHROPIC_API_KEY, APP_PASSWORD and SESSION_SECRET (Netlify environment
// variables) and the private style guide in Netlify Blobs (scripts/upload-style-guide.mjs).
//
// Access: an expiring HttpOnly session cookie from /.netlify/functions/session
// (sign-in with the shared password). The session is checked first, before the
// guide is loaded or the model called.
//   { action: "types" }                 → { types: [{ id, name, purpose, badge }] }
//   { plant, typeId, count }            → { text }
// The prompt is assembled here; the browser never receives the guide.

const { loadGuide, typeList, buildPrompt } = require('../lib/style-guide');
const S = require('../lib/session');

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body)
});

function createHandler(deps = {}) {
  const env = deps.env || process.env;
  const fetchImpl = deps.fetch || fetch;
  const now = deps.now || Date.now;

  return async (event) => {
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
    if (!env.ANTHROPIC_API_KEY || !env.APP_PASSWORD) return json(500, { error: 'Server not configured.' });

    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON body' }); }
    body = body && typeof body === 'object' ? body : {};

    // 1. Session before anything else, so bad auth never loads the guide or burns API tokens.
    if (!S.verify(env, event.headers || {}, now())) {
      return json(401, { error: 'Not signed in' });
    }

    // 2. Private guide. Missing or invalid → clear error, no model call.
    const guide = await loadGuide(event, deps);
    if (!guide) return json(503, { error: 'Style guide is not configured on the server. Ask an admin to upload it.' });

    if (body.action === 'types') return json(200, { types: typeList(guide) });

    // 3. User input and options only.
    const plant = typeof body.plant === 'string' ? body.plant.trim() : '';
    const count = Number(body.count);
    if (!plant || plant.length > 2000) return json(400, { error: 'Type a plant name (up to 2,000 characters).' });
    if (!Number.isInteger(count) || count < 1 || count > 10) return json(400, { error: 'Invalid number of ideas.' });
    const prompt = buildPrompt(guide, { plant, typeId: body.typeId, count });
    if (!prompt) return json(400, { error: 'Unknown post type. Reload the page.' });

    try {
      const apiResponse = await fetchImpl('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1500,
          messages: [{ role: 'user', content: prompt }]
        })
      });

      if (!apiResponse.ok) {
        console.error('Anthropic API error status', apiResponse.status);
        return json(502, { error: `Model request failed (status ${apiResponse.status}). Try again.` });
      }

      const data = await apiResponse.json();
      const text = data.content?.[0]?.text || '';
      return json(200, { text });
    } catch (e) {
      return json(500, { error: 'Server error. Try again.' });
    }
  };
}

exports.handler = createHandler();
exports.createHandler = createHandler;
