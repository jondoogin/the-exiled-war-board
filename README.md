# The Exiled — war board

A self-contained war-participation tracker for a Clash Royale clan. Pulls the
roster and river race results from the official API, keeps its own history,
scores every member on a weighted model, and recommends promote / hold / warn /
demote / kick. No dependencies beyond Node 18+.

## Run it

```bash
npm run demo     # generates a fake 28-person clan with 8 weeks of war history
npm start        # http://localhost:5180
```

Against your real clan:

```bash
cp env.example .env     # fill in CR_API_TOKEN and CR_CLAN_TAG
set -a && . ./.env && set +a
npm run sync             # or hit "Sync from API" in the UI
npm start
```

## What it tracks

Per completed river race week, per member, the API gives `decksUsed`, `fame`,
`repairPoints`, and `boatAttacks`. Everything else is derived here.

| Signal | Meaning |
| --- | --- |
| Score | Weighted 0-100 rolling score, recency-decayed |
| Trend | Last 3 wars vs the 3 before |
| Decks used | Decks played / decks available across tracked wars |
| Wars | Played / tracked, plus excused count |
| Miss streak | Consecutive un-excused wars with zero decks |
| Recommendation | Promote, hold, watch, warn, demote, or kick |

## The scoring model

Each war produces a 0-100 score from three parts:

- **Participation (55%)** — `decksUsed / 16`. Showing up is most of the job.
- **Efficiency (30%)** — `fame / (decksUsed × 180)`. Rewards winning, not just
  attacking. Only counts decks actually used, so a member who plays 4 good decks
  is not scored as a better player than one who plays 16 equally good ones — the
  participation term already handled that.
- **Contribution (15%)** — output (fame + half of repair points) against the
  clan median that same week. This self-adjusts for hard weeks and easy weeks.

Wars are combined with exponential recency decay (half-life 4 wars by default)
over the last 10 tracked weeks. Members who were not in the clan for a war are
excluded from it rather than zeroed.

**Declared absences.** An excused war leaves the average entirely and breaks the
miss streak — it is not a zero. Click any war cell in an expanded row to toggle
the excuse; it is stored with a note and shows up in the activity feed.

**Recommendations.** Two un-excused zero-deck wars, or a rolling score under 50,
flags a demotion — shown as "kick" when the member is already at Member rank, per
clan rule. 82+ over at least 4 wars flags a promotion. Every threshold and weight
is a slider in the UI; drag one and the whole table recomputes in the browser
(the server and the browser import the same `scoring.mjs`).

Nothing here writes to the game. Promotions and demotions are still made by hand
in Clash Royale; this tool only tells you who to look at and why.

## Practical notes on the Clash API

- **Keys are IP-locked.** A key created at developer.clashroyale.com only works
  from the IPs you list. On a host with no fixed IP, point `CR_API_BASE` at
  `https://proxy.royaleapi.dev/v1` and whitelist `45.79.218.79` on the key.
- **`/riverracelog` only keeps roughly the last 10 races.** That is the whole
  reason this keeps its own store: to build history past that window you have to
  snapshot weekly. Run `npm run sync` on a cron (once a day is plenty, and at
  least once after each war week closes) or the data ages out of reach forever.
- **Tags need URL-encoding** — `#` becomes `%23`. `normalizeTag` handles it.
- **The API cannot tell a kick from a quit.** Departures are inferred by diffing
  the roster between syncs and logged with neutral wording.
- **Promotions and demotions are detectable** by role changes between syncs, so
  the activity feed builds itself as long as syncs keep running.
- **The in-progress week is excluded from scoring** by default, since a
  half-finished war drags everyone down. There is a checkbox to include it.

## Layout

```
design/tokens.css        every colour, face, size, duration — see DESIGN-SYSTEM.md
design/components.css    the component layer, built only from tokens
design/ledger.body.html  page shell (markup only)
design/ledger.app.js     the board — window.startBoard(seed)
src/api.mjs              Clash API client
src/sync.mjs             ingest + roster diffing (join / leave / promote / demote)
src/store.mjs            flat JSON store, atomic writes
src/scoring.mjs          the model — shared by server and browser
src/compact.mjs          store -> board payload, shared by server and build
src/demo.mjs             sample clan generator
src/server.mjs           serves design/ directly and composes the shell
scripts/build-ledger.mjs inlines the system into dist/ledger.html for hosting
public/boot.js           local-app bootstrap (fetch seed, wire Sync/Export)
```

The design system is documented in [design/DESIGN-SYSTEM.md](design/DESIGN-SYSTEM.md).
The local app and the hosted board are assembled from the same four design
files, so they cannot drift. To rebuild the hosted page:

```bash
node scripts/build-ledger.mjs      # -> dist/ledger.html
```

## Next steps if this graduates past prototype

- Cron the sync (GitHub Action or a small always-on host) so history accrues.
- Swap the JSON file for SQLite once history is long enough to care.
- Read-only share link for the clan, write access for leadership.
- Per-member notes and a warning log, so "we told them twice" is on record.
