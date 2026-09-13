// Local dashboard server. Keeps the API token server-side, serves the static
// UI, and exposes a small JSON API. No dependencies.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadState, saveState, addEvent } from './store.mjs';
import { compactState } from './compact.mjs';
import { buildScoreboard, DEFAULT_CONFIG } from './scoring.mjs';
import { sync } from './sync.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC = resolve(HERE, '../public');
const DESIGN = resolve(HERE, '../design');
const FONTS =
  'https://fonts.googleapis.com/css2?family=Lilita+One&family=Press+Start+2P' +
  '&family=Archivo:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap';

/** The page shell is assembled from the same design files the hosted board is
 *  built from, so the local app and the shared link can never drift apart. */
async function shell() {
  const body = await readFile(resolve(DESIGN, 'ledger.body.html'), 'utf8');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>The Exiled War Board</title>
<link rel="icon" href="data:,">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<link rel="stylesheet" href="/design/tokens.css">
<link rel="stylesheet" href="/design/components.css">
</head>
<body>
${body.replace('<section class="hud"', `<div class="controls" style="padding:0 0 var(--ex-s4)">
      <button type="button" class="btn" id="sync">Sync from API</button>
      <a class="btn" href="/api/export.csv" style="display:inline-flex;align-items:center;text-decoration:none">Export CSV</a>
    </div>
    <section class="hud"`)}
<script src="/design/ledger.app.js"></script>
<script src="/boot.js"></script>
</body>
</html>`;
}
const PORT = Number(process.env.PORT || 5180);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

const json = (res, code, body) => {
  const text = JSON.stringify(body);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(text);
};

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return {}; }
}

function csv(rows) {
  const cols = ['rank', 'name', 'tag', 'role', 'score', 'trend', 'deckRate', 'warsPlayed', 'warsMissed', 'warsExcused', 'missStreak', 'avgFame', 'action', 'reason'];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;

  try {
    if (path === '/api/board') {
      const state = await loadState();
      return json(res, 200, Object.assign(compactState(state), {
        demo: Boolean(state.demo),
        syncedAt: state.syncedAt,
        configured: Boolean(process.env.CR_API_TOKEN && process.env.CR_CLAN_TAG)
      }));
    }

    if (path === '/api/state') {
      const state = await loadState();
      return json(res, 200, {
        clan: state.clan,
        syncedAt: state.syncedAt,
        demo: Boolean(state.demo),
        configured: Boolean(process.env.CR_API_TOKEN && process.env.CR_CLAN_TAG),
        defaults: DEFAULT_CONFIG,
        members: state.members,
        wars: state.wars,
        exemptions: state.exemptions,
        events: state.events.slice(-200).reverse()
      });
    }

    if (path === '/api/sync' && req.method === 'POST') {
      if (!process.env.CR_API_TOKEN || !process.env.CR_CLAN_TAG) {
        return json(res, 400, { error: 'CR_API_TOKEN and CR_CLAN_TAG are not set. Copy env.example and fill them in, or run `npm run demo`.' });
      }
      const state = await sync({
        token: process.env.CR_API_TOKEN,
        clanTag: process.env.CR_CLAN_TAG,
        base: process.env.CR_API_BASE
      });
      return json(res, 200, { ok: true, syncedAt: state.syncedAt, wars: state.wars.length });
    }

    if (path === '/api/exemptions' && req.method === 'POST') {
      const { tag, warId, note } = await readBody(req);
      if (!tag || !warId) return json(res, 400, { error: 'tag and warId are required' });
      const state = await loadState();
      const existing = state.exemptions.findIndex((e) => e.tag === tag && e.warId === warId);
      if (existing === -1) {
        state.exemptions.push({ tag, warId, note: note || 'Declared ahead of time', createdAt: new Date().toISOString() });
        addEvent(state, { type: 'exempt', tag, name: state.members[tag]?.name, detail: `Excused for ${warId}: ${note || 'declared ahead of time'}` });
      } else {
        state.exemptions.splice(existing, 1);
        addEvent(state, { type: 'exempt-removed', tag, name: state.members[tag]?.name, detail: `Excuse removed for ${warId}` });
      }
      await saveState(state);
      return json(res, 200, { ok: true, exemptions: state.exemptions });
    }

    if (path === '/api/export.csv') {
      const state = await loadState();
      const { rows } = buildScoreboard(state);
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="clan-scoreboard.csv"'
      });
      return res.end(csv(rows));
    }

    // The browser imports the same scoring module the server uses.
    if (path === '/scoring.mjs') {
      const body = await readFile(join(HERE, 'scoring.mjs'));
      res.writeHead(200, { 'Content-Type': TYPES['.mjs'] });
      return res.end(body);
    }

    if (path.startsWith('/design/')) {
      const file = join(DESIGN, normalize(path.slice('/design/'.length)).replace(/^(\.\.[/\\])+/, ''));
      if (file.startsWith(DESIGN) && existsSync(file)) {
        const body = await readFile(file);
        res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'text/plain', 'Cache-Control': 'no-store' });
        return res.end(body);
      }
    }

    if (path === '/') {
      res.writeHead(200, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-store' });
      return res.end(await shell());
    }

    const file = join(PUBLIC, normalize(path).replace(/^(\.\.[/\\])+/, ''));
    if (file.startsWith(PUBLIC) && existsSync(file)) {
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      return res.end(body);
    }

    json(res, 404, { error: 'Not found' });
  } catch (err) {
    json(res, 500, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`clan-tracker on http://localhost:${PORT}`);
});
