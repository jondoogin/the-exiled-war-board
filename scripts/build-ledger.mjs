// Assembles the hosted war board from the design system + the app shell.
// The Artifact host wraps the output in <!doctype><head><body>, so this emits
// only <title>, the font link, one <style>, the markup, and one <script>.
//
//   node scripts/build-ledger.mjs [--data data/state.json] [--out dist/ledger.html]

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { compactState } from '../src/compact.mjs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? fallback : process.argv[i + 1];
};

const FONTS =
  'https://fonts.googleapis.com/css2' +
  '?family=Lilita+One' +
  '&family=Press+Start+2P' +
  '&family=Archivo:wght@400;500;600' +
  '&family=IBM+Plex+Mono:wght@400;500' +
  '&display=swap';

const [tokens, components, body, app, raw] = await Promise.all([
  readFile(resolve(ROOT, 'design/tokens.css'), 'utf8'),
  readFile(resolve(ROOT, 'design/components.css'), 'utf8'),
  readFile(resolve(ROOT, 'design/ledger.body.html'), 'utf8'),
  readFile(resolve(ROOT, 'design/ledger.app.js'), 'utf8'),
  readFile(resolve(ROOT, arg('--data', 'data/state.json')), 'utf8')
]);

const seed = JSON.stringify(compactState(JSON.parse(raw)));
const html = `<title>The Exiled War Board</title>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<style>
${tokens}
${components}
</style>

${body}
<script type="application/json" id="seed">${seed}</script>
<script>
${app}
startBoard(JSON.parse(document.getElementById("seed").textContent));
</script>
`;

const out = resolve(ROOT, arg('--out', 'dist/ledger.html'));
await mkdir(dirname(out), { recursive: true });
await writeFile(out, html);
console.log(`${out} — ${(html.length / 1024).toFixed(1)} kB`);
