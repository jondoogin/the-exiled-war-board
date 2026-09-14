// Write endpoint for the leadership page.
//
// The board is a static site, so it cannot hold a credential: anything shipped
// to the browser is readable by anyone who opens devtools. This function is the
// only thing that holds one. Leaders send a shared password; the GitHub token
// stays here, in the host's environment, and never reaches a browser.
//
// Deploy on Vercel with two environment variables:
//   LEADER_PASSWORD   the word you share with your co-leaders
//   GH_TOKEN          fine-grained PAT, Contents: read and write, this repo only
//   GH_REPO           optional, defaults to jondoogin/the-exiled-war-board
//
// Rotating the password is an env-var edit and a redeploy. Rotating it does not
// touch the token, and revoking the token does not require telling anyone.

const FILE = 'data/excuses.json';
const API = 'https://api.github.com';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

/** Constant-time-ish compare, so a wrong password cannot be probed by timing. */
function sameSecret(a, b) {
  const x = String(a || '');
  const y = String(b || '');
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

async function gh(repo, token, options) {
  const res = await fetch(`${API}/repos/${repo}/contents/${FILE}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'exiled-war-board',
      ...(options?.headers || {})
    }
  });
  if (res.status === 404 && !options?.method) return null;
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `GitHub answered ${res.status}`);
  }
  return res.json();
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const password = process.env.LEADER_PASSWORD;
  const token = process.env.GH_TOKEN;
  const repo = process.env.GH_REPO || 'jondoogin/the-exiled-war-board';

  if (!password || !token) {
    return res.status(500).json({ error: 'Server is missing LEADER_PASSWORD or GH_TOKEN.' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  if (!sameSecret(body.password, password)) {
    return res.status(401).json({ error: 'Wrong password.' });
  }

  const changes = Array.isArray(body.changes) ? body.changes : [];
  if (!changes.length) return res.status(400).json({ error: 'No changes sent.' });
  if (changes.length > 200) return res.status(400).json({ error: 'Too many changes at once.' });

  try {
    // Read the live file rather than trusting the caller's copy — two leaders
    // marking excuses at once must not clobber each other.
    const current = await gh(repo, token);
    const list = current
      ? JSON.parse(Buffer.from(current.content, 'base64').toString('utf8'))
      : [];

    for (const change of changes) {
      const { tag, warId, excused } = change || {};
      if (typeof tag !== 'string' || typeof warId !== 'string') continue;
      const at = list.findIndex((e) => e.tag === tag && e.warId === warId);
      if (excused && at === -1) {
        list.push({
          tag,
          warId,
          note: typeof change.note === 'string' && change.note ? change.note : 'Declared ahead of time',
          createdAt: new Date().toISOString()
        });
      } else if (!excused && at !== -1) {
        list.splice(at, 1);
      }
    }

    await gh(repo, token, {
      method: 'PUT',
      body: JSON.stringify({
        message: `Excuse ${changes.length} week${changes.length === 1 ? '' : 's'}`,
        content: Buffer.from(JSON.stringify(list, null, 2) + '\n', 'utf8').toString('base64'),
        ...(current ? { sha: current.sha } : {})
      })
    });

    return res.status(200).json({ ok: true, excuses: list.length });
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
}
