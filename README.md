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

## Connecting your clan

The API key is the only fiddly part, and it is fiddly for one reason: **Supercell
locks every key to the IP addresses you name when you create it.**

1. **Get the clan tag.** In game, under the clan name. Capital letters, and the
   character that looks like O is always a zero.
2. **Make a key** at [developer.clashroyale.com](https://developer.clashroyale.com)
   (free, needs a Supercell account) under Account -> Create New Key. It asks
   for allowed IPs. Two ways to answer:
   - **Running it on one machine with a stable IP** — put that machine's public
     IP in (`curl https://api.ipify.org` tells you). Set
     `CR_API_BASE=https://api.clashroyale.com/v1`.
   - **Running it anywhere with a changing IP** (a laptop, most hosts, anything
     serverless) — whitelist `45.79.218.79` instead and leave
     `CR_API_BASE=https://proxy.royaleapi.dev/v1`. That is RoyaleAPI's public
     proxy; your key rides through their fixed IP. This is the easier path.
3. **Fill in the environment and check it:**

```bash
cp env.example .env     # add CR_API_TOKEN and CR_CLAN_TAG
set -a && . ./.env && set +a
npm run doctor          # says exactly what is wrong, if anything
```

4. **Pull the data:**

```bash
npm run sync            # or hit "Sync from API" in the UI
npm start
```

`npm run doctor` walks credentials, egress IP, and all four endpoints, and stops
at the first real problem with the fix attached. A 403 is nearly always the IP
whitelist rather than a bad key — and if the refusal did not come from Supercell
at all, the doctor says so instead of sending you to re-issue a working key.

## Marking declared absences

Two pages ship from the same build:

| Page | Who | What it does |
| --- | --- | --- |
| `/` | the clan | Read-only board. Tapping a week changes only that person's own browser. |
| `/leader.html` | leadership | The same board, plus publishing. |

Excuses live in `data/excuses.json`, which the daily sync never writes — they
are a human judgement, not something the API knows. The leadership page commits
to that file directly through the GitHub API, and the push rebuilds the site, so
a week excused from a phone reaches the shared board in about a minute.

**Why an endpoint and not just a password in the page.** The board is a static
site. Anything shipped to the browser is readable by anyone who opens devtools,
so a page cannot hold a GitHub token no matter what gates it — and GitHub's
secret scanning would revoke a leaked one within minutes. `api/excuse.js` is the
only thing that holds the token. Leaders send a shared password; the token stays
in the host's environment.

**Setting it up once:**

1. Create a fine-grained token at github.com/settings/personal-access-tokens —
   repository access **only** `the-exiled-war-board`, permissions
   **Contents: Read and write**, nothing else.
2. Deploy this repo to Vercel (`vercel` in the project root, or import it at
   vercel.com/new). It serves `api/excuse.js` automatically.
3. In the Vercel project's **Settings -> Environment Variables**, add:
   - `LEADER_PASSWORD` — the word you share with your co-leaders
   - `GH_TOKEN` — the token from step 1
   - `GH_REPO` — `jondoogin/the-exiled-war-board` (optional; this is the default)
4. Nothing to configure on GitHub: the endpoint URL is the build's default,
   since it is public. Use the project's **production** domain
   (`the-exiled-war-board.vercel.app`) rather than a deployment-specific one —
   the hashed URLs pin to a single build and go stale on the next deploy. If the
   endpoint ever moves, set a `WAR_BOARD_API` repository variable or pass
   `--api` to the build; either overrides the default.

Then share the password. Anyone who has it can excuse a week from
`/leader.html`; nobody needs a GitHub account. Changing the password is an
environment-variable edit and a redeploy — it does not touch the token, and
revoking the token does not require telling anyone.

A shared password is a shared password: it decides who can edit, not who did.
The commit history records every change, so you can always see what was excused
and when, but not which leader did it.

## Keeping it current without touching it

`.github/workflows/sync.yml` runs the whole loop daily: pull from the API,
commit the updated store, rebuild the board, deploy it. Nobody has to remember
anything.

**Git is the database.** There is no server to keep alive and no database to
run — `data/state.json` is committed on every sync, which is why it is not
gitignored. That also means the repo history is a record of the clan: every
join, departure, promotion and war result arrives as its own commit.

To turn it on, once:

1. Push this repo to GitHub.
2. **Settings -> Secrets and variables -> Actions -> New repository secret:**
   `CR_API_TOKEN`, your developer.clashroyale.com key.
3. Optionally add a repository **variable** `CR_CLAN_TAG` if it is not The
   Exiled. The workflow defaults to `#P2VPUYUU`.
4. **Settings -> Pages -> Source: GitHub Actions.**
5. Actions tab -> Sync and publish -> **Run workflow** to prove it before
   waiting a day.

The key must whitelist `45.79.218.79` — the RoyaleAPI proxy — rather than any
particular machine's IP. GitHub's runners get a different address on every run,
so a home-IP-locked key works locally and fails here.

### What is public, and what is not

This repo is public so GitHub Pages is free. That means two things are readable
by anyone:

- **`data/state.json`** — clan member names, player tags, and every war result
  the tracker has recorded. All of it is already public through the Clash API;
  the difference is that here it is aggregated and search-indexable.
- **The board itself**, at the Pages URL.

What is *not* in the repo, and must never be: the API key. It lives in `.env`
locally (gitignored) and in GitHub Actions secrets for CI. Secrets are not
exposed to workflow runs from forked pull requests, so a public repo does not
put the key at risk.

If any of that changes your mind, make the repo private and drop the last three
steps of the workflow, then point Vercel or Netlify at it instead — they deploy
`dist/` on every push, and the sync commit is the trigger. Pages on a private
repo needs a paid plan; those hosts do not.

A failed sync fails the run and leaves the previous deploy up, which is the
behaviour you want: a stale board beats a broken one. GitHub emails you when a
scheduled workflow fails.

**Start syncing sooner rather than later.** `/riverracelog` only returns about
ten past races and there is no endpoint for older ones. Every week you do not
sync is a week of history that cannot be recovered later.

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
node scripts/build-ledger.mjs      # -> dist/index.html
```

## Next steps if this graduates past prototype

- Cron the sync (GitHub Action or a small always-on host) so history accrues.
- Swap the JSON file for SQLite once history is long enough to care.
- Read-only share link for the clan, write access for leadership.
- Per-member notes and a warning log, so "we told them twice" is on record.
