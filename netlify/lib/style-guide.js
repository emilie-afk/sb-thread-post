// style-guide.js — the private Threads writing guide: post types (name, purpose,
// soft-pitch setting, instructions), soft-pitch rules and the prompt template.
// Stored in Netlify Blobs (store "private-config", key "threads-style-guide");
// never in Git or the published page. Shape: docs/style-guide.example.json.

const { readPrivateConfig } = require('./private-config');
const { validTemplate, fill } = require('./template');

const KEY = 'threads-style-guide';
const VARS = ['count', 'typeName', 'typePurpose', 'typeInstructions', 'plant', 'pitchRule'];
const PITCH = ['yes', 'sometimes', 'no'];

function parseGuide(raw) {
  let g;
  try { g = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
  if (!g || typeof g !== 'object') return null;
  if (!validTemplate(g.template, VARS, ['plant', 'typeInstructions'])) return null;
  if (!g.pitchRules || PITCH.some((k) => typeof g.pitchRules[k] !== 'string')) return null;
  if (!Array.isArray(g.types) || !g.types.length) return null;
  const ids = new Set();
  for (const t of g.types) {
    if (!t || typeof t.id !== 'string' || !t.id || ids.has(t.id)) return null;
    ids.add(t.id);
    for (const k of ['name', 'purpose', 'instructions']) if (typeof t[k] !== 'string') return null;
    if (!PITCH.includes(t.softPitch)) return null;
  }
  return g;
}

async function loadGuide(event, deps) {
  const raw = await readPrivateConfig(event, KEY, deps);
  return raw == null ? null : parseGuide(raw);
}

// What the page needs to show the type buttons (no instructions).
function typeList(g) {
  return g.types.map((t) => ({ id: t.id, name: t.name, purpose: t.purpose, badge: t.softPitch !== 'no' }));
}

function buildPrompt(g, { plant, typeId, count }) {
  const t = g.types.find((x) => x.id === typeId);
  if (!t) return null;
  return fill(g.template, {
    count, typeName: t.name, typePurpose: t.purpose, typeInstructions: t.instructions, plant, pitchRule: g.pitchRules[t.softPitch],
  });
}

module.exports = { loadGuide, parseGuide, typeList, buildPrompt, KEY };
