// Thin Clash Royale API client. Node 18+ global fetch, no dependencies.

const DEFAULT_BASE = 'https://proxy.royaleapi.dev/v1';

/* Supercell's failure modes are few and each has exactly one cause worth
   checking first, so the error says what to do rather than what went wrong. */
const HINTS = {
  400: 'Malformed request — usually a clan tag with characters the API rejects.',
  403: 'The key is not valid FROM THIS MACHINE. Supercell locks each key to the\n' +
       '  IP addresses you listed when you created it. Either add this machine\'s\n' +
       '  public IP to the key at developer.clashroyale.com, or set\n' +
       '  CR_API_BASE=https://proxy.royaleapi.dev/v1 and whitelist 45.79.218.79\n' +
       '  on the key instead. (A revoked or mistyped key gives this too.)',
  404: 'No clan with that tag. Check CR_CLAN_TAG — capital letters only, and the\n' +
       '  digit 0 never the letter O.',
  429: 'Rate limited. Back off; a per-day sync does not need to retry hard.',
  500: 'Supercell server error. Not your setup — try again shortly.',
  503: 'The API is in maintenance (it goes down during game updates). Try later.'
};

export class ClashApiError extends Error {
  constructor(status, body, url) {
    super(`Clash API ${status} for ${url}: ${body?.reason || body?.message || 'unknown error'}`);
    this.status = status;
    this.body = body;
    // Supercell always answers with {reason, message}. A refusal without that
    // shape came from something in between — a corporate proxy, a VPN, a
    // sandbox egress policy — and blaming the API key would send you hunting
    // in the wrong place.
    this.fromSupercell = Boolean(body && typeof body.reason === 'string');
    this.hint = !this.fromSupercell && (status === 403 || status === 407)
      ? 'This refusal did not come from Supercell — the response has no "reason"\n' +
        '  field, so something between you and the API blocked it: a proxy, a VPN,\n' +
        '  a firewall, or a sandbox network policy. Check outbound access to\n' +
        '  api.clashroyale.com (or proxy.royaleapi.dev) before touching the key.'
      : HINTS[status] || null;
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
