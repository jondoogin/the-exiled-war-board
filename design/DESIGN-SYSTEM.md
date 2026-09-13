# The Exiled — design system

A printed war ledger pinned to a wooden arcade cabinet. Clash Royale is a
daylit, physical place — painted boards, parchment banners, stamped gold — so
the page is bright, saturated, and made of objects with outlines and hard
shadows. Analog here means ink on paper: halftone, dither, misregistration,
worn stock. Not neon on black, which is the modern-tech look and the thing this
is deliberately not.

The one dark surface is the cabinet's own CRT, inset in the board, and it is
the only thing allowed to glow. That contrast is the whole idea: a bright
printed sheet with a single live screen in it.

Readable everywhere, because the people using it are in their forties and are
checking it on a phone in bad light.

Two files are the system. Everything else consumes them.

| File | Role |
| --- | --- |
| `tokens.css` | Every colour, face, size, space, duration. The only place a raw hex belongs. |
| `components.css` | The component layer, built strictly from tokens. |
| `ledger.body.html` | The page shell — markup only, no styling decisions. |
| `ledger.app.js` | The board. Exposes `window.startBoard(seed)`. |

Both consumers assemble from those same four files:

- **Hosted board** — `node scripts/build-ledger.mjs` inlines everything into
  `dist/ledger.html` for publishing.
- **Local app** — `src/server.mjs` serves `design/` directly and composes the
  same shell at request time.

Change a token and both move together. That is the whole point; resist styling
anything at the call site.

## Principles

1. **Legibility outranks the bit.** The CRT is a costume, not an excuse. Body
   copy is a real sans at a real size. The 8-bit face is rationed to labels.
2. **Colour means something.** Blue is interaction. Gold is fame — the river
   race currency — and nothing else. Violet is identity and rank. Green, amber
   and red are status only, kept clear of the brand hues so blue never has to
   double as "good".
3. **Count what the clan counts.** Sixteen decks a week, so the week meter is
   sixteen literal blocks. Nobody has to interpret a smooth bar.
4. **The page is finished the moment it paints.** Animation is a flourish on a
   frame that already reads. Nothing loops, nothing waits on scroll.

## Colour

Single-theme by decision, not omission: a printed sheet has no dark mode. Every
surface is painted explicitly so the page never inherits its host's background.

**The cabinet and the paper** — `--ex-board #123a63` (painted cabinet) ·
`--ex-paper #f6e7c2` (the ledger sheet) · `--ex-paper-2 #ecd8a8` (ruled rows,
wells, drawers). Ink is `--ex-ink #241a10`: a warm brown-black, printed ink on
stock, never `#000`.

**The tube** — `--ex-tube #0e1a12` with `--ex-phosphor #7cf07a` and
`--ex-phosphor-2 #ffd05e`. Used only inside `.hud`. Scanlines live there and
nowhere else, so they read as a screen rather than a filter over the page.

**Arena** — `--ex-blue #2f7fd4` · `--ex-gold #f2b31c` · `--ex-purple #8a4fd0`.

**Status** — `--ex-win #46a63f` · `--ex-watch #e8951f` · `--ex-danger #cf3a2b`.

Every arena and status colour has an **ink-safe twin** (`--ex-blue-ink`,
`--ex-danger-ink`, …). The bright value is a fill; the `-ink` value is type on
parchment. Using a fill colour for text on this ground is the one colour
mistake this system makes easy to avoid — `band()` returns ink, `bandFill()`
returns fill, and they are never crossed.

## Type

Four faces, each with a job. More than four would be indulgence; fewer loses
the register shift between arcade and document.

| Token | Face | Where |
| --- | --- | --- |
| `--ex-display` | Lilita One | h1 (ink-outlined, hard-dropped, like a painted arena banner), tile numerals, member names, score |
| `--ex-pixel` | Press Start 2P | labels of one to three words, 9–11px only |
| `--ex-body` | Roboto Slab | anything anyone actually reads |
| `--ex-data` | Space Mono | figures that must line up in a column |

Press Start 2P is texture. If a pixel-font string wraps to a second line, it is
being used wrong — shorten the label or change the face. Nothing below 9px.

Scale: `--ex-t-xs 11` → `--ex-t-3xl clamp(34px, 8vw, 56px)`, a 1.25 ratio off a
15px base.

## Layout and form

**Nothing is a hairline.** Every element is a printed object: a `--ex-stroke`
(3px) or `--ex-rule` (2px) ink outline, a flat fill, and a hard shadow with no
blur, because ink does not blur. Buttons sit on their shadow and drop onto it
when pressed.

Square corners throughout (`--ex-edge: 0`) — printed labels and 8-bit screens
have no radii. The single exception is the CRT, which is rounded because tube
glass is. 4px spacing base. Touch targets never below `--ex-tap: 44px`. The roster is a
stacked card list below 880px and a six-column grid above it, from one DOM
structure: `.metrics` switches to `display: contents` and its children become
grid cells.

## Components

- `.hud` / `.tile` — the arcade status bar. Four figures, glowing, with an 8-bit
  label and one line of context. `.is-gold` and `.is-danger` recolour a tile.
- `.m` / `.m-main` — a roster row. Severity rides on the row (`.sev1` promote,
  `.sev2` warn, `.sev3` demote or kick) and paints the left rule. `.top` gilds
  the badge for the first three.
- `.verdict` — the call, as a bordered pill. One class per outcome.
- `.week` / `.meter` / `.seg` — the week cell. Sixteen blocks in a 4x4, one per
  deck, filled in the week's score-band colour; unfilled blocks are dithered the
  way an 8-bit screen shaded an empty gauge. The card turns gold when excused.
  The grid shape echoes four battle days of four, but the API reports only a
  weekly total — so the blocks are never labelled by day.
- `.banner` — one state message, amber rule, never more than one on screen.
- `.btn`, `.switch`, `input[type=search]`, `select` — controls. All at least
  44px tall, all with a visible `:focus-visible` ring in blue.

## Motion

Mechanical, not smooth. `--ex-ease` is `steps(8, end)` — a counter ticking over,
not a curve a physical object could not make. `--ex-fast 110ms` for state,
`--ex-slow 560ms` for score bars filling. Deck blocks stagger 22ms apart so a
meter loads block by block. `--ex-ease-soft` exists only for the button press,
which is the one thing on the page with real mass. Everything is disabled
wholesale under `prefers-reduced-motion`.

## Accessibility notes

- Body and label text clear 4.5:1 on their own surfaces; `--ex-ink-3` is for
  supporting text at 11px and up, never for the only copy in a row.
- Status is never colour alone — every verdict carries its word, every missed
  week shows `0/16`.
- The scanline overlay is `pointer-events: none` and confined to the CRT.
- Texture never carries meaning: halftone, grain and dither are surface only,
  and every state they sit under is also stated in colour and in words.
