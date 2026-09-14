// Assembles the war board from the design system + the app shell.
//
// Emits two pages from the same source:
//   dist/index.html   the public board, read-only
//   dist/leader.html  the same board plus a write path for excuses
//
// The Artifact host wraps output in <!doctype><head><body>, so each page emits
// only <title>, the font link, one <style>, the markup, and one <script>.
//
//   node scripts/build-ledger.mjs [--data data/state.json] [--out dist/index.html]
//                                 [--repo owner/name] [--public-only]

import { readFile, writeFile, mkdir } from 'node:fs/promises';
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

const REPO = arg('--repo', 'jondoogin/the-exiled-war-board');

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

function page({ title, extraCss = '', preBody = '', boot, extraScript = '' }) {
  return `<title>${title}</title>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<style>
${tokens}
${components}
${extraCss}</style>

${preBody}${body}
<script type="application/json" id="seed">${seed}</script>
<script>
${app}
</script>
${extraScript}<script>
${boot}
</script>
`;
}

const pages = [
  {
    out: arg('--out', 'dist/index.html'),
    html: page({
      title: 'The Exiled War Board',
      boot: 'startBoard(JSON.parse(document.getElementById("seed").textContent));'
    })
  }
];

if (!has('--public-only')) {
  pages.push({
    out: 'dist/leader.html',
    html: page({
      title: 'The Exiled War Board — Leadership',
      extraCss: leaderCss,
      preBody: leaderBody + '\n',
      extraScript: `<script>window.__WAR_BOARD_REPO__ = ${JSON.stringify(REPO)};</script>\n`,
      boot: leaderJs
    })
  });
}

for (const { out, html } of pages) {
  const target = resolve(ROOT, out);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, html);
  console.log(`${target} — ${(html.length / 1024).toFixed(1)} kB`);
}
