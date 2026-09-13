// Pull the clan's current state from the Clash API and fold it into the store.
// Safe to run repeatedly; every merge is idempotent by war id and member tag.

import { createClient, normalizeTag, parseClashDate } from './api.mjs';
import { loadState, saveState, addEvent } from './store.mjs';

const ROLE_ORDER = ['member', 'elder', 'coLeader', 'leader'];

export function warIdFor(item) {
  return `${item.seasonId ?? 's?'}-${item.sectionIndex ?? 0}`;
}

function participantsMap(list = []) {
  const out = {};
  for (const p of list) {
    out[p.tag] = {
      name: p.name,
      fame: p.fame ?? 0,
      repairPoints: p.repairPoints ?? 0,
      boatAttacks: p.boatAttacks ?? 0,
      decksUsed: p.decksUsed ?? 0
    };
  }
  return out;
}

/** Fold /clans/{tag}/members into state, emitting join / leave / role events. */
export function mergeMembers(state, items, now = new Date().toISOString()) {
  const seen = new Set();
  for (const m of items) {
    seen.add(m.tag);
    const existing = state.members[m.tag];
    if (!existing) {
      state.members[m.tag] = {
        tag: m.tag,
        name: m.name,
        role: m.role,
        joinedAt: now,
        firstSeen: now,
        lastSeen: parseClashDate(m.lastSeen) || now,
        trophies: m.trophies,
        donations: m.donations,
        expLevel: m.expLevel,
        status: 'active',
        roleHistory: [{ at: now, to: m.role }]
      };
      addEvent(state, { type: 'join', tag: m.tag, name: m.name, detail: `Joined as ${m.role}` });
      continue;
    }
    if (existing.status === 'departed') {
      existing.status = 'active';
      existing.joinedAt = now;
      addEvent(state, { type: 'rejoin', tag: m.tag, name: m.name, detail: 'Rejoined the clan' });
    }
    if (existing.role !== m.role) {
      const up = ROLE_ORDER.indexOf(m.role) > ROLE_ORDER.indexOf(existing.role);
      existing.roleHistory = [...(existing.roleHistory || []), { at: now, from: existing.role, to: m.role }];
      addEvent(state, {
        type: up ? 'promote' : 'demote',
        tag: m.tag,
        name: m.name,
        detail: `${existing.role} -> ${m.role}`
      });
      existing.role = m.role;
    }
    Object.assign(existing, {
      name: m.name,
      trophies: m.trophies,
      donations: m.donations,
      expLevel: m.expLevel,
      lastSeen: parseClashDate(m.lastSeen) || existing.lastSeen
    });
  }

  for (const member of Object.values(state.members)) {
    if (member.status !== 'departed' && !seen.has(member.tag)) {
      member.status = 'departed';
      member.departedAt = now;
      addEvent(state, {
        type: 'leave',
        tag: member.tag,
        name: member.name,
        // The API cannot distinguish a kick from a voluntary exit.
        detail: `Left or was removed (was ${member.role})`
      });
    }
  }
  return state;
}

/** Fold /riverracelog items (completed weeks) into state.wars. */
export function mergeWarLog(state, logItems, clanTag) {
  const tag = normalizeTag(clanTag);
  for (const item of logItems || []) {
    const standing = (item.standings || []).find((s) => s.clan?.tag === tag);
    if (!standing) continue;
    const id = warIdFor(item);
    const war = {
      id,
      seasonId: item.seasonId,
      sectionIndex: item.sectionIndex,
      createdDate: parseClashDate(item.createdDate),
      rank: standing.rank,
      trophyChange: standing.trophyChange,
      clanFame: standing.clan?.fame ?? 0,
      clanRepair: standing.clan?.repairPoints ?? 0,
      complete: true,
      participants: participantsMap(standing.clan?.participants)
    };
    const at = state.wars.findIndex((w) => w.id === id);
    if (at === -1) {
      state.wars.push(war);
      addEvent(state, { type: 'war-recorded', detail: `War ${id} finished rank ${war.rank}` });
    } else {
      state.wars[at] = { ...state.wars[at], ...war };
    }
  }
  state.wars.sort((a, b) => String(a.createdDate).localeCompare(String(b.createdDate)));
  return state;
}

/** Fold /currentriverrace in as a provisional, still-running week. */
export function mergeCurrentRace(state, race, now = new Date().toISOString()) {
  if (!race?.clan) return state;
  const id = `${race.clan.tag}-current-${race.sectionIndex ?? 0}`;
  const war = {
    id,
    createdDate: now,
    rank: null,
    clanFame: race.clan.fame ?? 0,
    clanRepair: race.clan.repairPoints ?? 0,
    complete: false,
    periodType: race.periodType,
    periodIndex: race.periodIndex,
    participants: participantsMap(race.clan.participants)
  };
  const at = state.wars.findIndex((w) => !w.complete);
  if (at === -1) state.wars.push(war);
  else state.wars[at] = { ...state.wars[at], ...war, createdDate: state.wars[at].createdDate };
  state.wars.sort((a, b) => String(a.createdDate).localeCompare(String(b.createdDate)));
  return state;
}

export async function sync({ token, base, clanTag } = {}) {
  const client = createClient({ token, base });
  const state = await loadState();
  const now = new Date().toISOString();

  const [clan, members, log, current] = await Promise.all([
    client.clan(clanTag),
    client.members(clanTag),
    client.riverRaceLog(clanTag, 10).catch(() => ({ items: [] })),
    client.currentRiverRace(clanTag).catch(() => null)
  ]);

  state.clan = {
    tag: clan.tag,
    name: clan.name,
    members: clan.members,
    clanWarTrophies: clan.clanWarTrophies,
    description: clan.description
  };
  mergeMembers(state, members.items || [], now);
  mergeWarLog(state, log.items || [], clanTag);
  if (current) mergeCurrentRace(state, current, now);
  state.syncedAt = now;

  await saveState(state);
  return state;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const token = process.env.CR_API_TOKEN;
  const clanTag = process.env.CR_CLAN_TAG;
  const base = process.env.CR_API_BASE;
  if (!token || !clanTag) {
    console.error('Set CR_API_TOKEN and CR_CLAN_TAG (see env.example). For a no-key demo run: npm run demo');
    process.exit(1);
  }
  sync({ token, clanTag, base })
    .then((s) => console.log(`Synced ${s.clan?.name} — ${Object.keys(s.members).length} tracked members, ${s.wars.length} wars`))
    .catch((err) => { console.error(err.message); process.exit(1); });
}
