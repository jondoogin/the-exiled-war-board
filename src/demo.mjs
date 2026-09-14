// Generates a believable fake clan so the dashboard can be driven with no API
// key. It builds API-shaped payloads and pushes them through the real merge
// functions, so the ingest path is the same one a live sync uses.

import { mergeMembers, mergeWarLog, mergeCurrentRace } from './sync.mjs';
import { emptyState, saveState, addEvent } from './store.mjs';

let seed = 20260913;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const jitter = (n, spread) => Math.max(0, Math.round(n + (rnd() - 0.5) * spread));

const CLAN_TAG = '#P2VPUYUU';
const WEEKS = 8;

// archetype: [decks-used mean out of 16, fame-per-deck mean]
const ARCHETYPES = {
  anchor: [16, 205],
  solid: [15, 180],
  streaky: [11, 165],
  fading: [7, 140],
  ghost: [1, 90],
  rising: [16, 195]
};

const NAMES = [
  ['RoyalGiantJon', 'leader', 'anchor'],
  ['HogRiderHank', 'coLeader', 'anchor'],
  ['MegaKnightMia', 'coLeader', 'solid'],
  ['LogBaitLuis', 'coLeader', 'solid'],
  ['XbowXander', 'elder', 'anchor'],
  ['GoblinGail', 'elder', 'solid'],
  ['MinerMarcus', 'elder', 'streaky'],
  ['LavaLoonLena', 'elder', 'solid'],
  ['SparkySam', 'elder', 'fading'],
  ['BalloonBex', 'elder', 'solid'],
  ['PekkaPete', 'elder', 'streaky'],
  ['ValkyrieVi', 'member', 'rising'],
  ['WallBreakerWes', 'member', 'solid'],
  ['ArcherQueenAri', 'member', 'streaky'],
  ['GraveyardGus', 'member', 'fading'],
  ['ElixirEddie', 'member', 'solid'],
  ['RamRiderRae', 'member', 'streaky'],
  ['IceWizardIvy', 'member', 'solid'],
  ['FireballFinn', 'member', 'ghost'],
  ['SkeletonSkye', 'member', 'fading'],
  ['ZapZoe', 'member', 'solid'],
  ['GolemGreta', 'member', 'streaky'],
  ['BanditBruno', 'member', 'solid'],
  ['TeslaTova', 'member', 'rising'],
  ['CannonCarl', 'member', 'ghost'],
  ['MortarMo', 'member', 'solid'],
  ['PrincessPia', 'member', 'streaky']
];

const DEPARTED = ['DriftedDave', 'member', 'ghost'];
const NEWCOMER = ['FreshFinley', 'member', 'rising'];

function tagFor(i) {
  return `#DEMO${String(i).padStart(4, '0')}`;
}

function memberPayload(name, role, i) {
  return {
    tag: tagFor(i),
    name,
    role,
    lastSeen: '20260913T120000.000Z',
    expLevel: 10 + Math.floor(rnd() * 5),
    trophies: 5200 + Math.floor(rnd() * 2200),
    donations: jitter(180, 320),
    donationsReceived: jitter(200, 300)
  };
}

function clashDate(d) {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.(\d{3})Z/, '.$1Z');
}

function warParticipant(member, weekIndex) {
  const [deckMean, fameMean] = ARCHETYPES[member.archetype];
  let decks = Math.min(16, jitter(deckMean, 5));
  // rising players start rough and climb; fading players do the reverse
  if (member.archetype === 'rising') decks = Math.min(16, Math.max(0, decks - (WEEKS - weekIndex) * 2));
  if (member.archetype === 'fading') decks = Math.max(0, decks - weekIndex);
  if (member.archetype === 'ghost' && weekIndex >= WEEKS - 2) decks = 0;
  const fame = decks * jitter(fameMean, 70);
  return {
    tag: member.tag,
    name: member.name,
    fame,
    repairPoints: rnd() > 0.7 ? jitter(400, 800) : 0,
    boatAttacks: Math.floor(decks / 4),
    decksUsed: decks
  };
}

async function main() {
  const state = emptyState();
  const roster = NAMES.map(([name, role, archetype], i) => ({
    ...memberPayload(name, role, i),
    archetype
  }));
  const departed = { ...memberPayload(DEPARTED[0], DEPARTED[1], 90), archetype: DEPARTED[2] };
  const newcomer = { ...memberPayload(NEWCOMER[0], NEWCOMER[1], 91), archetype: NEWCOMER[2] };

  const start = new Date('2026-09-13T12:00:00Z');
  const weekDate = (i) => new Date(start.getTime() - (WEEKS - i) * 7 * 864e5);

  // First sync: eight weeks ago, departed member still present.
  mergeMembers(state, [...roster, departed], weekDate(0).toISOString());

  const warItems = [];
  for (let w = 0; w < WEEKS; w++) {
    const cast = [...roster, ...(w < WEEKS - 2 ? [departed] : []), ...(w >= WEEKS - 3 ? [newcomer] : [])];
    const participants = cast.map((m) => warParticipant(m, w));
    const clanFame = participants.reduce((s, p) => s + p.fame, 0);
    warItems.push({
      seasonId: 104,
      sectionIndex: w,
      createdDate: clashDate(weekDate(w)),
      standings: [
        {
          rank: pick([1, 1, 2, 2, 3, 4, 5]),
          trophyChange: pick([180, 120, 60, -30]),
          clan: {
            tag: CLAN_TAG,
            name: 'The Exiled',
            fame: clanFame,
            repairPoints: participants.reduce((s, p) => s + p.repairPoints, 0),
            participants
          }
        }
      ]
    });
  }
  mergeWarLog(state, warItems, CLAN_TAG);

  // Later sync: newcomer joined three weeks ago, departed member is gone,
  // one member has been promoted since.
  const promoted = roster.find((m) => m.name === 'ValkyrieVi');
  promoted.role = 'elder';
  mergeMembers(state, [...roster, newcomer], weekDate(WEEKS - 3).toISOString());
  state.members[newcomer.tag].joinedAt = weekDate(WEEKS - 3).toISOString();

  // Current, still-running week.
  mergeCurrentRace(
    state,
    {
      periodType: 'warDay',
      periodIndex: 5,
      sectionIndex: WEEKS,
      clan: {
        tag: CLAN_TAG,
        name: 'The Exiled',
        fame: 0,
        repairPoints: 0,
        participants: [...roster, newcomer].map((m) => {
          const p = warParticipant(m, WEEKS - 1);
          p.decksUsed = Math.min(8, p.decksUsed);
          p.fame = Math.round(p.fame / 2);
          return p;
        })
      }
    },
    start.toISOString()
  );

  state.clan = { tag: CLAN_TAG, name: 'The Exiled', members: roster.length + 1, clanWarTrophies: 4120, description: 'Sample clan' };
  state.syncedAt = start.toISOString();

  // A couple of declared absences, so the exemption path is visible.
  const sparky = Object.values(state.members).find((m) => m.name === 'SparkySam');
  const gus = Object.values(state.members).find((m) => m.name === 'GraveyardGus');
  const lastWarId = state.wars.filter((w) => w.complete).slice(-1)[0].id;
  const prevWarId = state.wars.filter((w) => w.complete).slice(-2)[0].id;
  state.exemptions = [
    { tag: sparky.tag, warId: lastWarId, note: 'Declared ahead of time — work travel', createdAt: start.toISOString() },
    { tag: gus.tag, warId: prevWarId, note: 'Declared ahead of time — hospital', createdAt: start.toISOString() }
  ];
  addEvent(state, { type: 'note', detail: 'Demo data generated — not real clan results' });
  state.demo = true;

  await saveState(state);
  console.log(`Demo data written: ${Object.keys(state.members).length} members, ${state.wars.length} wars.`);
  console.log('Run `npm start` and open http://localhost:5180');
}

main();
