// Assembles the war board from the design system + the app shell.
//
// Emits two pages from the same source:
//   dist/index.html   the public board, read-only
//   dist/leader.html  the same board plus a write path for excuses
//
// Each page is a complete, self-contained HTML document: these are served
// straight off a static host, which adds nothing around them.
//
//   node scripts/build-ledger.mjs [--data data/state.json] [--out dist/index.html]
//                                 [--api https://host/api/excuse] [--public-only]

import { readFile, writeFile, mkdir, cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { compactState } from '../src/compact.mjs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadState } from '../src/store.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? fallback : process.argv[i + 1];
};
const has = (flag) => process.argv.includes(flag);

// Where the leadership page sends its excuses. A public URL, so it lives here
// rather than in a repository variable — one less thing to configure, and
// nothing about it is secret. Override with --api or WAR_BOARD_API if the
// endpoint ever moves.
const API = arg('--api', process.env.WAR_BOARD_API || 'https://the-exiled-war-board.vercel.app/api/excuse');

// Where the board lives. Only needed so the share card can be an absolute URL:
// Discord, Slack and iMessage all resolve og:image against nothing.
const SITE = (arg('--site', process.env.WAR_BOARD_SITE || 'https://jondoogin.github.io/the-exiled-war-board/'))
  .replace(/\/?$/, '/');
const SHARE_TEXT = 'Every member of The Exiled scored on decks used, fame earned and weeks missed.';

const FONTS =
  'https://fonts.googleapis.com/css2' +
  '?family=Lilita+One' +
  '&family=Press+Start+2P' +
  '&family=Roboto+Slab:wght@400;700' +
  '&family=Space+Mono:wght@400;700' +
  '&display=swap';

const read = (p) => readFile(resolve(ROOT, p), 'utf8');

const [tokens, components, body, app, leaderCss, leaderBody, leaderJs] = await Promise.all([
  read('design/tokens.css'),
  read('design/components.css'),
  read('design/ledger.body.html'),
  read('design/ledger.app.js'),
  read('design/leader.css'),
  read('design/leader.body.html'),
  read('design/leader.js')
]);

// Through the store, so excuses come from data/excuses.json rather than being
// expected inside the synced state.
const state = await loadState(resolve(ROOT, arg('--data', 'data/state.json')));
const seed = JSON.stringify(compactState(state));

/* A complete document, not a fragment. These are served straight off a static
   host, which adds nothing: without the doctype the page renders in quirks
   mode, without the charset the encoding falls to whatever the server guesses,
   and without the viewport a phone lays the page out at ~980px and zooms out —
   so none of the phone CSS would ever apply on the device it was written for. */
function page({ title, path = '', extraCss = '', preBody = '', boot, extraScript = '' }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${SHARE_TEXT}">
<link rel="icon" href="assets/logo-shield.webp">

<!-- The unfurl in clan chat. og:image must be absolute — a relative path
     resolves against nothing in Discord, Slack or iMessage. -->
<meta property="og:type" content="website">
<meta property="og:site_name" content="The Exiled">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${SHARE_TEXT}">
<meta property="og:url" content="${SITE}${path}">
<meta property="og:image" content="${SITE}assets/og-card.png">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="The Exiled crest beside the words War Board, over a road of goblins leaving a castle">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#123a63">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<style>
${tokens}
${components}
${extraCss}</style>
</head>
<body>
${preBody}${body}
<script type="application/json" id="seed">${seed}</script>
<script>
${app}
</script>
${extraScript}<script>
${boot}
</script>
</body>
</html>
`;
}

const pages = [
  {
    out: arg('--out', 'dist/index.html'),
    html: page({
      title: 'The Exiled War Board',
      path: '',
      boot: 'startBoard(JSON.parse(document.getElementById("seed").textContent));'
    })
  }
];

if (!has('--public-only')) {
  pages.push({
    out: 'dist/leader.html',
    html: page({
      title: 'The Exiled War Board — Leadership',
      path: 'leader.html',
      extraCss: leaderCss,
      preBody: leaderBody + '\n',
      extraScript: `<script>window.__WAR_BOARD_API__ = ${JSON.stringify(API)};</script>\n`,
      boot: leaderJs
    })
  });
}

// Artwork rides alongside the pages rather than being inlined: the footer
// banner alone would add a megabyte of base64 to every page load.
const assetsDir = resolve(ROOT, 'assets');
if (existsSync(assetsDir)) {
  // Mirror, don't merge: a stale copy of a since-deleted or renamed asset would
  // otherwise keep being served, and the build would look like it worked.
  await rm(resolve(ROOT, 'dist/assets'), { recursive: true, force: true });
  await cp(assetsDir, resolve(ROOT, 'dist/assets'), { recursive: true });
  const missing = ['logo-shield.webp', 'footer-march.webp', 'goblin-rock.png', 'og-card.png']
    .filter((f) => !existsSync(resolve(assetsDir, f)));
  if (missing.length) {
    console.warn(`  note: artwork not yet added — ${missing.join(', ')} (see assets/README.md)`);
  }
}

for (const { out, html } of pages) {
  const target = resolve(ROOT, out);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, html);
  console.log(`${target} — ${(html.length / 1024).toFixed(1)} kB`);
}
