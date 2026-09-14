import { buildScoreboard, DEFAULT_CONFIG } from '/scoring.mjs';

const $ = (sel) => document.querySelector(sel);
const state = { raw: null, config: structuredClone(DEFAULT_CONFIG), sort: { key: 'score', dir: -1 }, open: new Set() };

const ROLE_LABEL = { leader: 'Leader', coLeader: 'Co-leader', elder: 'Elder', member: 'Member' };
const ACTION_LABEL = { promote: 'Promote', hold: 'Hold', watch: 'Watch', warn: 'Warn', demote: 'Demote', kick: 'Kick (at Member)', departed: 'Departed' };

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—');
const fmtTime = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');

function scoreColor(score) {
  if (score === null) return 'var(--muted)';
  if (score >= state.config.thresholds.promote) return 'var(--good)';
  if (score >= state.config.thresholds.hold) return 'var(--ok)';
  if (score >= state.config.thresholds.warn) return 'var(--warn)';
  return 'var(--bad)';
}

async function load() {
  const res = await fetch('/api/state');
  state.raw = await res.json();
  if (state.raw.defaults) state.config = { ...structuredClone(state.raw.defaults), ...state.config };
  paintHeader();
  syncKnobs();
  render();
}

function paintHeader() {
  const { clan, syncedAt, demo, configured } = state.raw;
  $('#clan-name').textContent = clan?.name ? `${clan.name} — war tracker` : 'Clan War Tracker';
  $('#clan-sub').textContent = [
    clan?.tag,
    clan?.members ? `${clan.members} in clan` : null,
    syncedAt ? `synced ${fmtTime(syncedAt)}` : 'never synced'
  ].filter(Boolean).join(' · ');
  const banner = $('#banner');
  if (demo) {
    banner.hidden = false;
    banner.textContent = 'Demo data. These are generated members and war results, not your clan. Set CR_API_TOKEN and CR_CLAN_TAG, then hit Sync, to load real numbers.';
  } else if (!configured) {
    banner.hidden = false;
    banner.textContent = 'No API credentials configured — Sync will fail until CR_API_TOKEN and CR_CLAN_TAG are set.';
  }
}

function tiles(rows) {
  const active = rows.filter((r) => r.status !== 'departed');
  const scored = active.filter((r) => r.score !== null);
  const avg = scored.length ? (scored.reduce((s, r) => s + r.score, 0) / scored.length).toFixed(1) : '—';
  const flagged = active.filter((r) => r.action === 'demote' || r.action === 'kick').length;
  const promote = active.filter((r) => r.action === 'promote').length;
  const decks = active.reduce((s, r) => s + r.decksUsed, 0);
  const possible = active.reduce((s, r) => s + r.decksPossible, 0);
  const cells = [
    [active.length, 'Active members'],
    [avg, 'Average score'],
    [possible ? `${((decks / possible) * 100).toFixed(1)}%` : '—', 'Deck usage'],
    [promote, 'Promote candidates'],
    [flagged, 'At risk'],
    [state.raw.wars.filter((w) => w.complete !== false).length, 'Wars tracked']
  ];
  $('#tiles').innerHTML = cells.map(([v, k]) => `<div class="tile"><b>${v}</b><span>${k}</span></div>`).join('');
}

function visibleRows(rows) {
  const q = $('#search').value.trim().toLowerCase();
  const role = $('#filter-role').value;
  const action = $('#filter-action').value;
  const departed = $('#show-departed').checked;
  return rows.filter((r) => {
    if (!departed && r.status === 'departed') return false;
    if (role && r.role !== role) return false;
    if (action && r.action !== action) return false;
    if (q && !(`${r.name} ${r.tag}`.toLowerCase().includes(q))) return false;
    return true;
  });
}

function sortRows(rows) {
  const { key, dir } = state.sort;
  return [...rows].sort((a, b) => {
    const av = a[key], bv = b[key];
    if (av === bv) return a.rank - b.rank;
    if (av === null || av === undefined) return 1;
    if (bv === null || bv === undefined) return -1;
    return (typeof av === 'string' ? av.localeCompare(bv) : av - bv) * dir;
  });
}

function warCell(h) {
  const label = fmtDate(h.createdDate);
  if (h.status === 'not-in-clan') {
    return `<div class="war war-not-in-clan"><b>—</b><em>${label} · not in clan</em></div>`;
  }
  const excused = h.status === 'excused';
  return `<button type="button" class="war war-${h.status}" data-warid="${h.warId}" title="${excused ? 'Click to remove the excuse' : 'Click to mark this war excused'}">
    <b>${h.decksUsed}/${state.config.decksPerWar}</b>
    <em>${label} · ${h.fame.toLocaleString()} fame</em>
    <em>${excused ? 'excused' : `score ${h.score}`}</em>
  </button>`;
}

function detailRow(r) {
  return `<tr class="detail" data-detail="${r.tag}"><td colspan="9">
    <p class="reason"><strong>${ACTION_LABEL[r.action]}</strong> — ${r.reason}
      ${r.trend !== null ? ` Last 3 wars vs the 3 before: ${r.trend > 0 ? '+' : ''}${r.trend}.` : ''}
      ${r.warsExcused ? ` ${r.warsExcused} war${r.warsExcused === 1 ? '' : 's'} excused and excluded.` : ''}</p>
    <div class="wars">${r.history.map(warCell).join('')}</div>
    <p class="hint">Click a war to toggle a declared absence. Excused wars leave the average and break the miss streak.</p>
  </td></tr>`;
}

function render() {
  const { rows } = buildScoreboard(
    { members: state.raw.members, wars: state.raw.wars, exemptions: state.raw.exemptions },
    state.config
  );
  tiles(rows);
  const shown = sortRows(visibleRows(rows));
  $('#count').textContent = `${shown.length} of ${rows.length} tracked`;

  $('#rows').innerHTML = shown.map((r) => {
    const trend = r.trend === null ? '<span class="flat">—</span>'
      : `<span class="${r.trend > 1 ? 'up' : r.trend < -1 ? 'down' : 'flat'}">${r.trend > 0 ? '+' : ''}${r.trend}</span>`;
    return `<tr class="row ${r.status === 'departed' ? 'departed' : ''}" data-tag="${r.tag}">
      <td class="num">${r.rank}</td>
      <td><span class="member"><span>${r.name} <span class="chip">${ROLE_LABEL[r.role] || r.role}</span></span>
        <small>${r.tag} · joined ${fmtDate(r.joinedAt)}</small></span></td>
      <td class="num"><span class="score"><span>${r.score ?? '—'}</span>
        <span class="bar"><i style="width:${r.score ?? 0}%;background:${scoreColor(r.score)}"></i></span></span></td>
      <td class="num">${trend}</td>
      <td class="num">${r.deckRate ?? '—'}%<br><small style="color:var(--muted)">${r.decksUsed}/${r.decksPossible}</small></td>
      <td class="num">${r.warsPlayed}<small style="color:var(--muted)">/${r.warsTracked}</small>${r.warsExcused ? `<br><small style="color:var(--warn)">${r.warsExcused} excused</small>` : ''}</td>
      <td class="num">${r.avgFame.toLocaleString()}</td>
      <td class="num">${r.missStreak || '—'}</td>
      <td><span class="act act-${r.action}">${ACTION_LABEL[r.action]}</span></td>
    </tr>${state.open.has(r.tag) ? detailRow(r) : ''}`;
  }).join('');

  document.querySelectorAll('th[data-sort]').forEach((th) => {
    th.setAttribute('aria-sort', th.dataset.sort === state.sort.key ? (state.sort.dir === 1 ? 'ascending' : 'descending') : 'none');
  });

  $('#events').innerHTML = (state.raw.events || []).slice(0, 60).map((e) =>
    `<li class="ev-${e.type}"><time>${fmtTime(e.at)}</time><span>${e.name ? `<strong>${e.name}</strong> — ` : ''}${e.detail}</span></li>`
  ).join('') || '<li>No roster activity recorded yet.</li>';
}

function syncKnobs() {
  const c = state.config;
  const set = (id, val, outId, fmt = (v) => v) => { $(id).value = val; $(outId).textContent = fmt(val); };
  set('#w-participation', c.weights.participation, '#out-participation', (v) => `${Math.round(v * 100)}%`);
  set('#w-efficiency', c.weights.efficiency, '#out-efficiency', (v) => `${Math.round(v * 100)}%`);
  set('#w-contribution', c.weights.contribution, '#out-contribution', (v) => `${Math.round(v * 100)}%`);
  set('#halfLifeWars', c.halfLifeWars, '#out-halflife');
  set('#t-promote', c.thresholds.promote, '#out-promote');
  set('#t-hold', c.thresholds.hold, '#out-hold');
  set('#t-warn', c.thresholds.warn, '#out-warn');
  $('#includeIncomplete').checked = Boolean(c.includeIncomplete);
}

function bindKnobs() {
  const map = {
    '#w-participation': (v) => (state.config.weights.participation = +v),
    '#w-efficiency': (v) => (state.config.weights.efficiency = +v),
    '#w-contribution': (v) => (state.config.weights.contribution = +v),
    '#halfLifeWars': (v) => (state.config.halfLifeWars = +v),
    '#t-promote': (v) => (state.config.thresholds.promote = +v),
    '#t-hold': (v) => (state.config.thresholds.hold = +v),
    '#t-warn': (v) => (state.config.thresholds.warn = +v)
  };
  for (const [sel, apply] of Object.entries(map)) {
    $(sel).addEventListener('input', (e) => { apply(e.target.value); syncKnobs(); render(); });
  }
  $('#includeIncomplete').addEventListener('change', (e) => {
    state.config.includeIncomplete = e.target.checked;
    render();
  });
  $('#reset-knobs').addEventListener('click', () => {
    state.config = structuredClone(state.raw.defaults || DEFAULT_CONFIG);
    syncKnobs();
    render();
  });
}

function bind() {
  ['#search', '#filter-role', '#filter-action', '#show-departed'].forEach((sel) =>
    $(sel).addEventListener('input', render));

  document.querySelectorAll('th[data-sort]').forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      state.sort = state.sort.key === key
        ? { key, dir: -state.sort.dir }
        : { key, dir: key === 'name' || key === 'action' || key === 'rank' ? 1 : -1 };
      render();
    });
  });

  $('#rows').addEventListener('click', async (e) => {
    const warBtn = e.target.closest('.war');
    if (warBtn) {
      const tag = warBtn.closest('.detail').dataset.detail;
      await fetch('/api/exemptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag, warId: warBtn.dataset.warid, note: 'Declared ahead of time' })
      });
      const fresh = await (await fetch('/api/state')).json();
      state.raw.exemptions = fresh.exemptions;
      state.raw.events = fresh.events;
      render();
      return;
    }
    const row = e.target.closest('.row');
    if (!row) return;
    const tag = row.dataset.tag;
    state.open.has(tag) ? state.open.delete(tag) : state.open.add(tag);
    render();
  });

  $('#sync').addEventListener('click', async () => {
    const btn = $('#sync');
    btn.disabled = true;
    btn.textContent = 'Syncing…';
    try {
      const res = await fetch('/api/sync', { method: 'POST' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Sync failed');
      await load();
    } catch (err) {
      const banner = $('#banner');
      banner.hidden = false;
      banner.textContent = err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Sync from API';
    }
  });
}

bind();
bindKnobs();
load();
