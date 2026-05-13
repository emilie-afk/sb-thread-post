// Netlify Function that proxies requests to the Anthropic Claude API.
// Requires two environment variables (set in Netlify -> Site settings -> Environment variables):
//   ANTHROPIC_API_KEY = your Anthropic API key (from console.anthropic.com)
//   APP_PASSWORD      = the password users must enter to use the generator

exports.handler = async (event) => {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Server is missing ANTHROPIC_API_KEY. Set it in Netlify environment variables.'
      })
    };
  }

  if (!process.env.APP_PASSWORD) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Server is missing APP_PASSWORD. Set it in Netlify environment variables.'
      })
    };
  }

  let prompt, password;
  try {
    const body = JSON.parse(event.body || '{}');
    prompt = body.prompt;
    password = body.password;
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  // Check password BEFORE doing anything else so we don't burn API tokens on bad auth
  if (!password || password !== process.env.APP_PASSWORD) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Wrong password' })
    };
  }

  if (!prompt || typeof prompt !== 'string') {
    return { statusCode: 400, body: JSON.stringify({ error: 'prompt is required' }) };
  }

  // Cap prompt length to keep costs sane
  if (prompt.length > 8000) {
    return { statusCode: 400, body: JSON.stringify({ error: 'prompt too long' }) };
  }

  try {
    const apiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
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
      const errText = await apiResponse.text();
      return {
        statusCode: apiResponse.status,
        body: JSON.stringify({ error: `Anthropic API error: ${errText}` })
      };
    }

    const data = await apiResponse.json();
    const text = data.content?.[0]?.text || '';

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    };
  } catch (e) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: e.message || String(e) })
    };
  }
};
