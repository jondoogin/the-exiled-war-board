// Flat-file store. Good enough for a 50-person clan and trivially swappable
// for SQLite/Postgres later.
//
// Two files, deliberately:
//   data/state.json    the synced record — roster, wars, events. Written only
//                      by `npm run sync`, which the daily Action runs.
//   data/excuses.json  declared absences — a human judgement, never derived
//                      from the API. Written only by a person.
//
// They are split because they have different authors. One file would mean the
// scheduled sync and the leadership page overwriting each other's commits
// every time both happened on the same day.

import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const DATA_FILE = resolve(HERE, '../data/state.json');
export const EXCUSES_FILE = resolve(HERE, '../data/excuses.json');

export function emptyState() {
  return {
    version: 2,
    clan: null,
    syncedAt: null,
    members: {},     // tag -> member record (current + departed)
    wars: [],        // one entry per completed river race week
    exemptions: [],  // { tag, warId, note, createdAt } — from excuses.json
    events: []       // roster + role history, newest last
  };
}

async function readJson(file, fallback) {
  if (!existsSync(file)) return fallback;
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

export async function loadState(file = DATA_FILE, excusesFile = EXCUSES_FILE) {
  const state = { ...emptyState(), ...(await readJson(file, {})) };
  const excuses = await readJson(excusesFile, null);
  // A v1 store kept excuses inside state.json; keep honouring them until the
  // first write moves them across.
  state.exemptions = Array.isArray(excuses) ? excuses : state.exemptions || [];
  return state;
}

async function writeAtomic(file, value) {
  await mkdir(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2) + '\n');
  await rename(tmp, file);
}

export async function saveState(state, file = DATA_FILE, excusesFile = EXCUSES_FILE) {
  const { exemptions, ...synced } = state;
  await writeAtomic(file, synced);
  await writeAtomic(excusesFile, exemptions || []);
  return state;
}

/** Excuses alone, for the write path that only ever touches them. */
export async function saveExcuses(exemptions, excusesFile = EXCUSES_FILE) {
  await writeAtomic(excusesFile, exemptions || []);
  return exemptions;
}

export function addEvent(state, event) {
  state.events.push({ at: new Date().toISOString(), ...event });
  if (state.events.length > 2000) state.events = state.events.slice(-2000);
  return state;
}
