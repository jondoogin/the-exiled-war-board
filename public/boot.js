// Local-app bootstrap. The board itself is design/ledger.app.js — shared with
// the hosted build — so this only fetches the seed and wires the two controls
// that exist when there is a server behind the page.

async function load() {
  const res = await fetch('/api/board');
  const seed = await res.json();
  window.startBoard(seed, {
    // Excuses belong in the store, not in one person's browser — that is what
    // survives a rebuild and reaches everyone the board is shared with.
    async onExcuse(tag, warId, excused) {
      const saved = await fetch('/api/exemptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag, warId, note: 'Declared ahead of time' })
      });
      if (!saved.ok) {
        const body = await saved.json().catch(() => ({}));
        throw new Error(body.error || `server said ${saved.status}`);
      }
      return excused;
    }
  });
  document.getElementById('banner').hidden = !seed.demo;
}

document.getElementById('sync').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Syncing';
  try {
    const res = await fetch('/api/sync', { method: 'POST' });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Sync failed');
    location.reload();
  } catch (err) {
    const banner = document.getElementById('banner');
    banner.hidden = false;
    banner.querySelector('.msg').textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
});

load();
