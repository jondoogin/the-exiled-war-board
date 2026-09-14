// Renders the Open Graph card — the preview Discord, iMessage and Slack show
// when someone drops the link in chat.
//
//   node scripts/build-og.mjs
//
// Output: assets/og-card.png (1200x630), which is committed. This is run by
// hand, not in CI: it needs a browser, and the card has no live data in it, so
// there is nothing for a daily rebuild to refresh. Re-run it if the crest, the
// palette or the wording changes.
//
// Requires playwright to be resolvable (npx playwright install chromium).
// The brand faces are embedded from scripts/og-fonts.css, so no network.

import { readFile, writeFile, unlink } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? fallback : process.argv[i + 1];
};

const tokens = await readFile(resolve(ROOT, 'design/tokens.css'), 'utf8');
// Fonts are embedded rather than linked: a card that quietly fell back to
// system faces would look like a different product wherever it unfurled.
const fonts = await readFile(resolve(ROOT, 'scripts/og-fonts.css'), 'utf8');

const card = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>
${fonts}
${tokens}
* { box-sizing: border-box; margin: 0; }
body {
  width: 1200px;
  height: 630px;
  overflow: hidden;
  position: relative;
  background-color: var(--ex-paper);
  background-image: var(--ex-grain);
  font-family: var(--ex-body);
  border: 14px solid var(--ex-ink);
}
.top {
  display: flex;
  align-items: center;
  gap: 52px;
  padding: 62px 64px 0;
}
.crest { width: 268px; height: 268px; filter: drop-shadow(7px 7px 0 rgba(12, 40, 71, 0.4)); }
.eyebrow {
  font-family: var(--ex-pixel);
  font-size: 17px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ex-ink-2);
}
h1 {
  font-family: var(--ex-display);
  font-size: 116px;
  line-height: 0.9;
  letter-spacing: 0.01em;
  text-transform: uppercase;
  color: var(--ex-gold);
  margin-top: 14px;
  text-shadow:
    -4px 0 0 var(--ex-ink), 4px 0 0 var(--ex-ink),
    0 -4px 0 var(--ex-ink), 0 4px 0 var(--ex-ink),
    -4px -4px 0 var(--ex-ink), 4px -4px 0 var(--ex-ink),
    -4px 4px 0 var(--ex-ink), 4px 4px 0 var(--ex-ink),
    12px 12px 0 var(--ex-blue-ink);
}
h1 .flare { color: #fff3d0; }
.sub {
  font-size: 27px;
  line-height: 1.35;
  color: var(--ex-ink-2);
  margin-top: 26px;
  max-width: 21ch;
}
.sub b { color: var(--ex-ink); font-weight: 700; }
/* The road out, cropped to its content the same way the page footer is. */
.march { position: absolute; left: 0; right: 0; bottom: 0; height: 188px; overflow: hidden; }
.march img { width: 100%; height: 100%; object-fit: cover; object-position: center bottom; }
</style>
</head>
<body>
  <div class="top">
    <img class="crest" src="../assets/logo-shield.webp" alt="">
    <div>
      <p class="eyebrow">Clash Royale &middot; #P2VPUYUU</p>
      <h1>War <span class="flare">Board</span></h1>
      <p class="sub">Who is <b>actually</b> pulling their weight in the river race.</p>
    </div>
  </div>
  <div class="march"><img src="../assets/footer-march.webp" alt=""></div>
</body>
</html>
`;

const tmp = resolve(ROOT, 'dist/.og-card.html');
await writeFile(tmp, card);

const browser = await chromium.launch({ executablePath: arg('--chromium', undefined) });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
const failures = [];
page.on('requestfailed', (r) => failures.push(r.url().split('/').pop()));
await page.goto('file://' + tmp, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(400);

// A card that silently fell back to system fonts is worse than no card: it
// looks like a different product. Fail loudly instead of shipping it.
const usedLilita = await page.evaluate(() =>
  document.fonts.check('116px "Lilita One"') && document.fonts.check('17px "Press Start 2P"'));
if (!usedLilita) {
  await browser.close();
  throw new Error('Brand fonts did not load — refusing to render the card with fallbacks.');
}
if (failures.length) {
  await browser.close();
  throw new Error(`Assets failed to load: ${failures.join(', ')}`);
}

const out = resolve(ROOT, 'assets/og-card.png');
await page.screenshot({ path: out });
await browser.close();
await unlink(tmp);
console.log(`${out} — 1200x630`);
