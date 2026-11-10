// Run: npm test  (node:test; mocked model; fictional guide and credentials only)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHandler } = require('../netlify/functions/generate.js');

const ENV = { APP_PASSWORD: 'fictional-pass', SESSION_SECRET: 'fictional-session-secret-0123456789abcdef', ANTHROPIC_API_KEY: 'test-key-not-real' };
const S = require('../netlify/lib/session.js');
const sessionHandler = require('../netlify/functions/session.js');
const COOKIE = S.COOKIE + '=' + S.issue(ENV).value;   // a valid session for ENV
const GUIDE = fs.readFileSync(path.join(__dirname, '..', 'docs', 'style-guide.example.json'), 'utf8');
function blobs(value = GUIDE) {
  const reads = [];
  return { reads, getStore: (n) => ({ get: async (k) => { reads.push(n + '/' + k); return value; } }) };
}
function mock(status = 200) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push(init);
    return status === 200
      ? new Response(JSON.stringify({ content: [{ text: '1. idea one\n2. idea two' }] }), { status })
      : new Response('provider detail FICTIONAL TEMPLATE', { status });
  };
  return { fetch, calls };
}
// A body with the right password means "signed in": send the session cookie instead, never the password.
const post = ({ password, ...body }, cookie = password === 'fictional-pass' ? COOKIE : '') => ({ httpMethod: 'POST', headers: cookie ? { cookie } : {}, body: JSON.stringify(body) });
const GEN = { password: 'fictional-pass', plant: 'Echeveria', typeId: 'pick', count: 3 };

test('session is checked before the guide is loaded or the model called; missing config denies', async () => {
  const forged = ['', S.COOKIE + '=fictional-pass', S.COOKIE + '=v1.9999999999.' + 'A'.repeat(43),
    S.COOKIE + '=' + S.issue({ ...ENV, SESSION_SECRET: 'another-secret-another-secret-123456' }).value,
    S.COOKIE + '=' + S.issue(ENV, Date.now() - 13 * 3600 * 1000).value];
  for (const cookie of forged) for (const body of [{ plant: 'Echeveria', typeId: 'pick', count: 3 }, { action: 'types' }]) {
    const m = mock(); const b = blobs();
    const r = await createHandler({ env: ENV, fetch: m.fetch, getStore: b.getStore })(post(body, cookie));
    assert.equal(r.statusCode, 401);
    assert.equal(m.calls.length + b.reads.length, 0);
  }
  for (const env of [{ ...ENV, APP_PASSWORD: '' }, { ...ENV, APP_PASSWORD: undefined }, { ...ENV, APP_PASSWORD: 'changed' }, { ...ENV, SESSION_SECRET: '' }, { ...ENV, ANTHROPIC_API_KEY: '' }]) {
    const m = mock(); const b = blobs();
    const r = await createHandler({ env, fetch: m.fetch, getStore: b.getStore })(post(GEN, COOKIE));
    assert.ok([401, 500].includes(r.statusCode), String(r.statusCode));
    assert.equal(m.calls.length + b.reads.length, 0);
    assert.ok(!r.body.includes('ANTHROPIC_API_KEY') && !r.body.includes('APP_PASSWORD'));
  }
  // the old password-in-body request no longer works
  const legacy = await createHandler({ env: ENV, fetch: mock().fetch, getStore: blobs().getStore })({ httpMethod: 'POST', body: JSON.stringify({ password: 'fictional-pass', ...GEN }) });
  assert.equal(legacy.statusCode, 401);
});

test('sign-in endpoint: right password sets an HttpOnly session cookie that works for both requests', async () => {
  const h = sessionHandler.createHandler({ env: ENV });
  const ok = await h({ httpMethod: 'POST', headers: {}, body: JSON.stringify({ password: 'fictional-pass' }) });
  assert.equal(ok.statusCode, 200);
  for (const attr of ['HttpOnly', 'Secure', 'SameSite=Strict']) assert.ok(ok.headers['Set-Cookie'].includes(attr));
  const cookie = ok.headers['Set-Cookie'].split(';')[0];
  assert.equal((await h({ httpMethod: 'POST', headers: {}, body: JSON.stringify({ password: 'nope' }) })).statusCode, 401);
  const g = createHandler({ env: ENV, fetch: mock().fetch, getStore: blobs().getStore });
  assert.equal((await g(post({ action: 'types' }, cookie))).statusCode, 200);
  assert.equal((await g(post({ plant: 'Echeveria', typeId: 'tip', count: 3 }, cookie))).statusCode, 200);
});

test('missing or invalid guide: clear 503 before any paid call', async () => {
  for (const value of [null, '{', JSON.stringify({ template: 'x' }), JSON.stringify({ ...JSON.parse(GUIDE), types: [] })]) {
    const m = mock();
    for (const body of [GEN, { action: 'types', password: 'fictional-pass' }]) {
      const r = await createHandler({ env: ENV, fetch: m.fetch, getStore: blobs(value).getStore })(post(body));
      assert.equal(r.statusCode, 503);
      assert.match(JSON.parse(r.body).error, /Style guide is not configured/);
    }
    assert.equal(m.calls.length, 0);
  }
});

test('type list for the page has labels only, never instructions or rules', async () => {
  const r = await createHandler({ env: ENV, fetch: mock().fetch, getStore: blobs().getStore })(post({ action: 'types', password: 'fictional-pass' }));
  assert.equal(r.statusCode, 200);
  assert.deepEqual(JSON.parse(r.body), { types: [
    { id: 'tip', name: 'Example tip', purpose: 'Fictional purpose.', badge: false },
    { id: 'pick', name: 'Example pick', purpose: 'Fictional purpose two.', badge: true },
  ] });
  assert.ok(!/Fictional instructions|Fictional rule|FICTIONAL TEMPLATE/.test(r.body));
});

test('prompt assembled server-side from plant, type and count; only the text is returned', async () => {
  const m = mock();
  const h = createHandler({ env: ENV, fetch: m.fetch, getStore: blobs().getStore });
  const r = await h(post(GEN));
  assert.equal(r.statusCode, 200);
  assert.deepEqual(JSON.parse(r.body), { text: '1. idea one\n2. idea two' });
  const sent = JSON.parse(m.calls[0].body);
  assert.equal(sent.max_tokens, 1500);
  assert.equal(sent.messages[0].content, 'FICTIONAL TEMPLATE. Write 3 ideas.\nTYPE: Example pick\nPURPOSE: Fictional purpose two.\nGUIDE: Fictional instructions for a pick.\nPLANT: Echeveria\n- Fictional rule: mention the shop.\nReturn numbered ideas 1 through 3.');
  assert.ok(!r.body.includes('test-key-not-real'));
  // bad options
  for (const bad of [{ ...GEN, typeId: 'nope' }, { ...GEN, count: 0 }, { ...GEN, count: '5; drop' }, { ...GEN, plant: '' }, { ...GEN, plant: 'x'.repeat(2001) }, { password: 'fictional-pass', prompt: 'raw prompt' }]) {
    assert.equal((await h(post(bad))).statusCode, 400);
  }
  assert.equal(m.calls.length, 1);
});

test('provider errors and logs never contain the guide or prompt', async () => {
  const logs = []; const o = console.error; console.error = (...a) => logs.push(a.join(' '));
  try {
    const r = await createHandler({ env: ENV, fetch: mock(401).fetch, getStore: blobs().getStore })(post(GEN));
    assert.equal(r.statusCode, 502);
    assert.ok(!r.body.includes('FICTIONAL') && !r.body.includes('provider detail'));
  } finally { console.error = o; }
  assert.ok(!logs.join('\n').includes('FICTIONAL'));
});

test('published page holds no guide', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.ok(!/instructions:|softPitch|STYLE GUIDE|const prompt/.test(html));
  assert.ok(!/sessionStorage\.setItem|localStorage\.setItem/.test(html), 'password never stored in the browser');
  assert.ok(/action: 'types'/.test(html) && /typeId: selectedType\.id/.test(html));
});
