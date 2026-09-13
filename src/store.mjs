// Flat-file store. One JSON document, rewritten atomically. Good enough for a
// 50-person clan and trivially swappable for SQLite/Postgres later.

import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const DATA_FILE = resolve(HERE, '../data/state.json');

export function emptyState() {
  return {
    version: 1,
    clan: null,
    syncedAt: null,
    members: {},     // tag -> member record (current + departed)
    wars: [],        // one entry per completed river race week
    exemptions: [],  // { tag, warId, note, createdAt }
    events: []       // roster + role history, newest last
  };
}

export async function loadState(file = DATA_FILE) {
  if (!existsSync(file)) return emptyState();
  const raw = await readFile(file, 'utf8');
  return { ...emptyState(), ...JSON.parse(raw) };
}

export async function saveState(state, file = DATA_FILE) {
  await mkdir(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify(state, null, 2));
  await rename(tmp, file);
  return state;
}

export function addEvent(state, event) {
  state.events.push({ at: new Date().toISOString(), ...event });
  if (state.events.length > 2000) state.events = state.events.slice(-2000);
  return state;
}
