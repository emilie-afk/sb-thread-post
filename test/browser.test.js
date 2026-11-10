// Browser test of the real page against the real functions (mocked model, fictional guide).
// Needs Playwright and Chrome/Chromium; skipped when Playwright isn't installed.
// Set CHROME_PATH to use an installed Chrome instead of Playwright's Chromium.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

let chromium = null;
try { ({ chromium } = require('playwright')); } catch { /* skipped below */ }

const ROOT = path.join(__dirname, '..');
const GUIDE = fs.readFileSync(path.join(ROOT, 'docs', 'style-guide.example.json'), 'utf8');
const ENV = { APP_PASSWORD: 'fictional-pass', SESSION_SECRET: 'fictional-session-secret-0123456789abcdef', ANTHROPIC_API_KEY: 'test-key-not-real' };

test('password unlock uses a server session; post-type controls; Lock only after the server confirms', { skip: !chromium && 'Playwright not installed', timeout: 60000 }, async () => {
  let modelCalls = 0;
  const fetch = async () => { modelCalls++; return new Response(JSON.stringify({ content: [{ text: '1. idea one\n2. idea two\n3. idea three' }] })); };
  const fns = {
    '/.netlify/functions/session': require('../netlify/functions/session.js').createHandler({ env: ENV }),
    '/.netlify/functions/generate': require('../netlify/functions/generate.js').createHandler({ env: ENV, fetch, getStore: () => ({ get: async () => GUIDE }) }),
  };
  const server = http.createServer(async (req, res) => {
    let body = ''; for await (const c of req) body += c;
    if (req.url === '/') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(fs.readFileSync(path.join(ROOT, 'index.html'))); }
    const fn = fns[req.url]; if (!fn) { res.writeHead(404); return res.end(); }
    const r = await fn({ httpMethod: req.method, headers: req.headers, body }); res.writeHead(r.statusCode, r.headers); res.end(r.body);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  try {
    const ctx = await browser.newContext();
    await ctx.addInitScript(() => { if (!window.name) { sessionStorage.setItem('sbpw', 'old-raw-password'); window.name = 'seeded'; } });
    const page = await ctx.newPage();
    await page.goto(`http://localhost:${server.address().port}/`);
    assert.equal(await page.evaluate(() => sessionStorage.getItem('sbpw')), null, 'old stored password removed');
    assert.equal(await page.locator('.type-btn').count(), 0, 'no post types before sign-in');
    await page.fill('#passwordInput', 'wrong'); await page.click('#passwordSubmit');
    await page.waitForFunction(() => document.getElementById('passwordError').textContent.includes('Wrong password'));
    await page.fill('#passwordInput', ENV.APP_PASSWORD); await page.click('#passwordSubmit');
    await page.waitForSelector('.type-btn');
    assert.deepEqual(await page.$$eval('.type-btn', (b) => b.map((x) => x.innerText.replace(/\s+/g, ' ').trim())),
      ['Example tip Fictional purpose.', 'Example pickSOFT PITCH Fictional purpose two.']);
    assert.equal(await page.evaluate(() => sessionStorage.length + localStorage.length), 0, 'nothing stored in the browser');
    assert.equal(await page.evaluate(() => document.cookie), '');
    await page.reload(); await page.waitForSelector('.type-btn');
    await page.click('.type-btn >> nth=1'); await page.fill('#plant', 'Echeveria'); await page.selectOption('#count', '3');
    await page.click('#generate'); await page.waitForSelector('.idea');
    assert.equal(await page.locator('.idea').count(), 3);
    assert.equal(modelCalls, 1);

    // Lock failures keep the session and say so
    for (const fail of [(r) => r.fulfill({ status: 500, body: '{}' }), (r) => r.abort('failed')]) {
      await page.route('**/.netlify/functions/session', (r) => (r.request().method() === 'DELETE' ? fail(r) : r.continue()));
      await page.click('#logoutLink');
      await page.waitForFunction(() => /Lock failed/.test(document.getElementById('status').textContent));
      assert.ok(!(await page.isVisible('#passwordGate')));
      assert.equal((await ctx.cookies()).length, 1);
      await page.unroute('**/.netlify/functions/session');
    }
    // Lock succeeds
    await page.click('#logoutLink');
    await page.waitForSelector('#passwordGate', { state: 'visible' });
    assert.equal((await ctx.cookies()).length, 0);
    await page.reload(); await page.waitForSelector('#passwordGate', { state: 'visible' });
  } finally { await browser.close(); server.close(); }
});
