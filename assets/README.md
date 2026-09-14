# Brand assets

Drop the artwork here with exactly these names. The build copies this folder to
`dist/assets/` and the pages reference it by relative path.

| File | What it is |
| --- | --- |
| `logo-shield.webp` | The crest lockup — shield, crown, "THE EXILED", goblin. Header and favicon |
| `footer-march.webp` | The wide banner: goblins leaving the castle. Full-bleed at the page foot |
| `goblin-rock.png` | Goblin sitting on a rock. Shown when a filter matches nobody |
| `goblin-bindle.png` | Goblin walking with a bindle. In the repo, not yet placed |
| `og-card.png` | 1200x630 share card. Generated, not drawn — see below |

Transparent PNG. The crest wants to read at 96px, so anything from roughly
512px square up is plenty; the footer banner is full-bleed and wants ~2000px
wide. Keep each under about 400KB — this is a page people open on phones on
clan-chat data.

Unused files are still copied, so the spare goblins can be dropped in now and
placed later.

## The share card

`og-card.png` is the preview Discord, Slack and iMessage show when the link is
posted. It is rendered from the design system rather than drawn:

```bash
node scripts/build-og.mjs
```

That needs playwright (`npx playwright install chromium`). It composes the
crest, the wordmark and the march banner at 1200x630 and screenshots them, so
the card cannot drift from the palette or the typefaces. The brand faces are
embedded in `scripts/og-fonts.css`; the script refuses to render rather than
quietly fall back to system fonts, which would make the card look like a
different product wherever it unfurled.

It is run by hand, not in CI — a browser is heavy for a daily job, and the card
carries no live data for a rebuild to refresh. Re-run it if the crest, the
palette or the wording changes.

**Chat apps cache unfurls hard.** Discord holds them for around a day. To see a
change immediately, post the link with a throwaway query string
(`...?v=2`) — the card is fetched fresh for a URL it has not seen.
