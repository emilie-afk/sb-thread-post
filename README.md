# Succulents Box Threads Post Generator

A small web app that generates Threads post ideas for Succulents Box. Pick a post type, type in a plant or product, and Claude returns a handful of ready-to-tweak post ideas.

## Stack

- `index.html` — static frontend (vanilla HTML/CSS/JS, no build step)
- `netlify/functions/generate.js` — Netlify Function that proxies requests to the Anthropic Claude API
- `netlify.toml` — Netlify config
- `package.json` — declares Node 18+ for the function runtime

## Deploy

1. Push this folder to a GitHub repo.
2. In Netlify, create a new site from that repo. Defaults are fine (no build command, publish directory `.`).
3. Under **Site settings -> Environment variables**, add:
   - Key: `ANTHROPIC_API_KEY`
   - Value: your Anthropic API key (from console.anthropic.com)
4. Trigger a redeploy. Done.

## Local dev (optional)

Install the Netlify CLI, then:

```
npm install -g netlify-cli
netlify dev
```

Create a `.env` file in the project root with `ANTHROPIC_API_KEY=sk-ant-...` (this file is gitignored).

## Notes

- The function uses model `claude-haiku-4-5-20251001` for speed and cost.
- Cost per generation is fractions of a penny.
- The API key never reaches the browser. All Anthropic calls go through the Netlify Function.
