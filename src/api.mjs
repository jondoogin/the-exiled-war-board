// Thin Clash Royale API client. Node 18+ global fetch, no dependencies.

const DEFAULT_BASE = 'https://proxy.royaleapi.dev/v1';

export class ClashApiError extends Error {
  constructor(status, body, url) {
    super(`Clash API ${status} for ${url}: ${body?.reason || body?.message || 'unknown error'}`);
    this.status = status;
    this.body = body;
  }
}

export function normalizeTag(tag) {
  const t = String(tag || '').trim().toUpperCase().replace(/^#/, '').replace(/O/g, '0');
  if (!t) throw new Error('Missing clan tag');
  return `#${t}`;
}

export function createClient({ token, base = DEFAULT_BASE } = {}) {
  if (!token) throw new Error('CR_API_TOKEN is required');

  async function get(path, params) {
    const url = new URL(base.replace(/\/$/, '') + path);
    for (const [k, v] of Object.entries(params || {})) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
    });
    const text = await res.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
    if (!res.ok) throw new ClashApiError(res.status, body, url.pathname);
    return body;
  }

  const clanPath = (tag) => `/clans/${encodeURIComponent(normalizeTag(tag))}`;

  return {
    get,
    clan: (tag) => get(clanPath(tag)),
    members: (tag) => get(`${clanPath(tag)}/members`),
    currentRiverRace: (tag) => get(`${clanPath(tag)}/currentriverrace`),
    riverRaceLog: (tag, limit = 10) => get(`${clanPath(tag)}/riverracelog`, { limit })
  };
}

/** "20260910T093017.000Z" -> "2026-09-10T09:30:17.000Z" */
export function parseClashDate(value) {
  if (!value) return null;
  const m = String(value).match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/);
  if (!m) return new Date(value).toISOString();
  const [, y, mo, d, h, mi, s] = m;
  return `${y}-${mo}-${d}T${h}:${mi}:${s}.000Z`;
}
