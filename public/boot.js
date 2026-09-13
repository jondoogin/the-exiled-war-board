// Local-app bootstrap. The board itself is design/ledger.app.js — shared with
// the hosted build — so this only fetches the seed and wires the two controls
// that exist when there is a server behind the page.

async function load() {
  const res = await fetch('/api/board');
  const seed = await res.json();
  window.startBoard(seed);
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
