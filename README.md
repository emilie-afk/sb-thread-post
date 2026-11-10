
## Private style guide (not in Git)

The writing guide (voice, rules, examples, prompt template) is confidential and
lives only in this site's **Netlify Blobs** store `private-config`, key `threads-style-guide`.
The page sends only the user's input and options; the prompt is assembled on the
server after the password check, and only the generated text is returned. If the
guide is missing or invalid, the tool answers 503 "Style guide is not configured"
before any paid model call.

Setup (owner approval required; it changes production configuration):
1. Keep the real guide JSON **outside** this repository and any published folder.
   Shape: `docs/style-guide.example.json` (fictional).
2. `npm install`, then
   `NETLIFY_SITE_ID=<site id> NETLIFY_AUTH_TOKEN=<token> node scripts/upload-style-guide.mjs /path/to/guide.json`
   (prints size and fingerprint only).
3. Deploy. Later guide edits: upload again; no redeploy needed (picked up within about a minute).

Other settings: APP_PASSWORD, SESSION_SECRET (random, at least 32 characters, different
from other secrets), ANTHROPIC_API_KEY. Unlock sends the password once to
`/.netlify/functions/session`, which sets an expiring HttpOnly session cookie (12 h); the
password is no longer stored in the browser. "Lock" signs out only after the server
confirms. The post-type buttons load from the server after sign-in.

Tests: `npm test` (mocked model, fictional guide and credentials). The browser test runs when
Playwright is installed (`npm i -D playwright && npx playwright install chromium`) and is skipped otherwise.

Preview check (no paid model call): `PREVIEW_PASSWORD=<password> node scripts/preview-check.mjs https://deploy-preview-N--<site>.netlify.app --guide /path/outside/repo/guide.json`
— confirms unauthenticated requests are refused, sign-in works, the function can read the private
guide (400 for a deliberately incomplete request; 503 means missing or unreadable), and the
published page contains no guide text (prints counts only).
