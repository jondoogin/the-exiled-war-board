# The Exiled — design system

A coin-op cabinet in somebody's basement. Clash Royale's arena palette — royal
blue, trophy gold, gem violet — burned into a 1983 CRT. Loud where it counts,
readable everywhere, because the people using it are in their forties and are
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

Single-theme by decision, not omission: a CRT has no light mode. Every surface
is painted explicitly so the page never inherits its host's background.

**Ground** — `--ex-void #07060f` · `--ex-cabinet #100c22` · `--ex-panel #171132`
· `--ex-panel-hi #1f1745` · `--ex-line #2c2259` · `--ex-line-soft #201844`

**Ink** — `--ex-ink #f0ecff` · `--ex-ink-2 #b6adde` · `--ex-ink-3 #7d74ab`.
Violet-biased whites; a neutral grey reads as unconsidered against this much
saturation.

**Brand** — `--ex-blue #3fd2ff` (accent, interaction, focus) ·
`--ex-gold #ffc23d` (fame, and the top three ranks) ·
`--ex-violet #b85cff` (rank chips, the tube's own glow).

**Status** — `--ex-win #4ce08c` · `--ex-watch #ffb23d` · `--ex-danger #ff6767`.
Each has a matching `-wash` at ~14% for fills behind its own foreground.

**Glow** — `--ex-bloom-*` exists because a phosphor tube blooms. Use it on live
numerals, focused controls and the top-rank badge. Never on body text: it
smears at reading sizes.

## Type

Four faces, each with a job. More than four would be indulgence; fewer loses
the register shift between arcade and document.

| Token | Face | Where |
| --- | --- | --- |
| `--ex-display` | Lilita One | h1, tile numerals, member names, score |
| `--ex-pixel` | Press Start 2P | labels of one to three words, 9–11px only |
| `--ex-body` | Archivo | anything anyone actually reads |
| `--ex-data` | IBM Plex Mono | figures that must line up in a column |

Press Start 2P is texture. If a pixel-font string wraps to a second line, it is
being used wrong — shorten the label or change the face. Nothing below 9px.

Scale: `--ex-t-xs 11` → `--ex-t-3xl clamp(34px, 8vw, 56px)`, a 1.25 ratio off a
15px base.

## Layout and form

Square corners throughout (`--ex-edge: 0`) — an 8-bit screen has no radii. 4px
spacing base. Touch targets never below `--ex-tap: 44px`. The roster is a
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
- `.week` / `.meter` / `.seg` — the week cell. Sixteen segments, filled per deck
  used, coloured by the week's score band; gold when excused.
- `.banner` — one state message, amber rule, never more than one on screen.
- `.btn`, `.switch`, `input[type=search]`, `select` — controls. All at least
  44px tall, all with a visible `:focus-visible` ring in blue.

## Motion

`--ex-fast 120ms` for state, `--ex-mid 260ms` for entrances, `--ex-slow 620ms`
for the score bars charging up. Easing is `cubic-bezier(0.2, 0.7, 0.3, 1)` —
quick in, no bounce; arcade, not toy. Deck segments stagger 22ms apart so a
meter fills like a power bar. Everything is disabled wholesale under
`prefers-reduced-motion`.

## Accessibility notes

- Body and label text clear 4.5:1 on their own surfaces; `--ex-ink-3` is for
  supporting text at 11px and up, never for the only copy in a row.
- Status is never colour alone — every verdict carries its word, every missed
  week shows `0/16`.
- The scanline and bloom overlays are `pointer-events: none` and sit behind the
  content's stacking context.
