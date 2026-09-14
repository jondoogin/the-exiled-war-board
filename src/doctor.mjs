// Checks a real setup end to end and says exactly what to fix.
//   npm run doctor
//
// Every failure the Clash API hands back has one likely cause; this walks them
// in the order they actually bite, so the first red line is the thing to fix.

import { createClient, normalizeTag, ClashApiError, parseClashDate } from './api.mjs';

const ok = (m) => console.log(`  ok    ${m}`);
const bad = (m) => console.log(`  FAIL  ${m}`);
const note = (m) => console.log(`        ${m}`);

async function publicIp() {
  for (const url of ['https://api.ipify.org', 'https://ifconfig.me/ip']) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (res.ok) return (await res.text()).trim();
    } catch { /* try the next one */ }
  }
  return null;
}

async function main() {
  const token = process.env.CR_API_TOKEN;
  const tag = process.env.CR_CLAN_TAG;
  const base = process.env.CR_API_BASE || 'https://proxy.royaleapi.dev/v1';
  let failed = false;

  console.log('\nThe Exiled — connection check\n');

  console.log('Credentials');
  if (!token) {
    bad('CR_API_TOKEN is not set.');
    note('Get one at https://developer.clashroyale.com -> Account -> Create New Key.');
    note('Then: cp env.example .env && edit it && set -a && . ./.env && set +a');
    failed = true;
  } else if (token.split('.').length !== 3) {
    bad('CR_API_TOKEN does not look like a Supercell JWT (expected three dot-separated parts).');
    note('Copy the whole key string, not the key name or its description.');
    failed = true;
  } else {
    ok(`CR_API_TOKEN present (${token.length} chars, ends ...${token.slice(-6)})`);
  }

  if (!tag) {
    bad('CR_CLAN_TAG is not set.');
    note('Find it in-game under the clan name, e.g. #P2VPUYUU.');
    failed = true;
  } else {
    let normalized;
    try {
      normalized = normalizeTag(tag);
      ok(`CR_CLAN_TAG ${normalized}${normalized !== `#${tag.replace(/^#/, '').toUpperCase()}` ? '  (normalized — O read as zero)' : ''}`);
    } catch (err) {
      bad(err.message);
      failed = true;
    }
  }
  note(`base URL ${base}`);
  if (failed) {
    console.log('\nFix the above, then run this again.\n');
    process.exit(1);
  }

  console.log('\nNetwork');
  const ip = await publicIp();
  const viaProxy = base.includes('royaleapi');
  if (ip) {
    ok(`this machine calls out from ${ip}`);
    note(viaProxy
      ? 'Using the RoyaleAPI proxy, so the key must whitelist 45.79.218.79 — not this IP.'
      : `Calling Supercell directly, so the key must whitelist ${ip}.`);
  } else {
    note('Could not determine the public IP (no outbound access to an IP echo service).');
  }

  console.log('\nEndpoints');
  const client = createClient({ token, base });
  const checks = [
    ['clan profile', () => client.clan(tag)],
    ['members', () => client.members(tag)],
    ['war log', () => client.riverRaceLog(tag, 10)],
    ['current race', () => client.currentRiverRace(tag)]
  ];

  const results = {};
  for (const [name, run] of checks) {
    try {
      results[name] = await run();
      ok(name);
    } catch (err) {
      failed = true;
      if (err instanceof ClashApiError) {
        bad(`${name} — HTTP ${err.status}`);
        if (err.hint) err.hint.split('\n').forEach((line) => note(line.trim() ? line : ''));
      } else {
        bad(`${name} — ${err.message}`);
        note('A network-level failure: no route, DNS, or a proxy refusing the host.');
      }
      break; // the first failure explains the rest
    }
  }

  if (failed) {
    console.log('\nNot connected yet.\n');
    process.exit(1);
  }

  console.log('\nWhat came back');
  const clan = results['clan profile'];
  const members = results['members'].items || [];
  const log = results['war log'].items || [];
  const current = results['current race'];
  console.log(`  ${clan.name} ${clan.tag} — ${clan.members} members, ${clan.clanWarTrophies} war trophies`);
  console.log(`  roster: ${members.length} fetched`);
  console.log(`  war log: ${log.length} completed races` +
    (log.length ? `, oldest ${String(parseClashDate(log[log.length - 1].createdDate)).slice(0, 10)}` : ''));
  console.log(`  current race: ${current?.periodType || 'none in progress'}`);

  if (log.length < 10) {
    console.log(`\n  Note: only ${log.length} past races are retrievable. Supercell keeps about ten`);
    console.log('  and there is no way to fetch older ones — which is why this tool keeps its');
    console.log('  own store. Start syncing daily and history accrues from here forward.');
  }

  console.log('\nConnected. Run `npm run sync` to pull this into the store, then `npm start`.\n');
}

main().catch((err) => {
  console.error(`\nUnexpected failure: ${err.message}\n`);
  process.exit(1);
});
