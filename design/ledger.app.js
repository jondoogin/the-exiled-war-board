/* The war board. Same code drives the hosted page and the local app.
   The seed differs, and so does where an excuse belongs: the hosted page has
   no server, so excuses stay in the viewer's browser; the local app hands in
   an onExcuse hook that writes them to the store, which is what carries them
   into the next published build. */
window.startBoard = function (SEED, options) {
  "use strict";

  var opts = options || {};

  var DECKS_PER_WAR = 16;
  var FAME_PER_DECK = 180;
  var STORE_KEY = "exiled-war-board-v1";

  var DEFAULTS = {
    participation: 0.55, efficiency: 0.30, contribution: 0.15,
    halfLife: 4, promote: 82, hold: 65, warn: 50, live: false
  };

  var ROLE_NAME = { leader: "Leader", coLeader: "Co-leader", elder: "Elder", member: "Member" };
  var ROLE_RANK = { member: 0, elder: 1, coLeader: 2, leader: 3 };
  var VERDICT_NAME = {
    promote: "Promote", hold: "Hold", watch: "Watch",
    warn: "Warn", demote: "Demote", kick: "Kick", departed: "Gone"
  };

  var members = SEED.members.map(function (m) {
    return { tag: m[0], name: m[1], role: m[2], joined: m[3], status: m[4] };
  });
  var wars = SEED.wars.map(function (w) {
    var parts = {};
    Object.keys(w.p).forEach(function (t) {
      parts[t] = { decks: w.p[t][0], fame: w.p[t][1], repair: w.p[t][2] };
    });
    var outputs = Object.keys(parts).map(function (t) { return parts[t].fame + parts[t].repair * 0.5; });
    return { id: w.i, date: w.d, rank: w.r, complete: w.c, parts: parts, median: median(outputs) };
  });

  var state = { model: Object.assign({}, DEFAULTS), excuses: {}, open: {}, sort: { key: "score", dir: -1 } };
  restore();
  SEED.ex.forEach(function (e) {
    var k = e[0] + "|" + e[1];
    if (!(k in state.excuses)) state.excuses[k] = true;
  });

  function median(list) {
    var s = list.slice().sort(function (a, b) { return a - b; });
    if (!s.length) return 0;
    var mid = s.length >> 1;
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }
  function clamp01(n) { return n < 0 ? 0 : n > 1 ? 1 : n; }
  function round1(n) { return Math.round(n * 10) / 10; }

  function restore() {
    try {
      var saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
      if (saved && saved.model) state.model = Object.assign({}, DEFAULTS, saved.model);
      if (saved && saved.excuses) state.excuses = saved.excuses;
    } catch (err) { /* blocked storage — defaults are fine */ }
  }
  function persist() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ model: state.model, excuses: state.excuses }));
    } catch (err) { /* the page works without it */ }
  }

  function scoredWars() {
    return wars.filter(function (w) { return state.model.live || w.complete; });
  }

  function warScore(entry, war) {
    var m = state.model;
    var decks = entry ? entry.decks : 0;
    var fame = entry ? entry.fame : 0;
    var repair = entry ? entry.repair : 0;
    var participation = clamp01(decks / DECKS_PER_WAR);
    var efficiency = decks ? clamp01(fame / (decks * FAME_PER_DECK)) : 0;
    var contribution = clamp01((fame + repair * 0.5) / ((war.median || 1) * 1.25));
    var sum = m.participation + m.efficiency + m.contribution || 1;
    var score = 100 * (m.participation * participation + m.efficiency * efficiency + m.contribution * contribution) / sum;
    return { score: round1(score), decks: decks, fame: fame, repair: repair };
  }

  function build() {
    var m = state.model;
    var list = scoredWars();
    var rows = members.map(function (member) {
      var history = list.map(function (war, i) {
        var entry = war.parts[member.tag];
        if (!entry && member.joined > war.date) {
          return { warId: war.id, date: war.date, status: "none", score: 0, decks: 0, fame: 0 };
        }
        var detail = warScore(entry, war);
        detail.warId = war.id;
        detail.date = war.date;
        detail.live = !war.complete;
        detail.status = state.excuses[member.tag + "|" + war.id] === true
          ? "excused" : detail.decks === 0 ? "missed" : "played";
        detail.age = list.length - 1 - i;
        return detail;
      });

      var counted = history.filter(function (h) { return h.status === "played" || h.status === "missed"; });
      var num = 0, den = 0;
      counted.forEach(function (h) {
        var w = Math.pow(0.5, h.age / m.halfLife);
        num += h.score * w;
        den += w;
      });
      var score = den ? round1(num / den) : null;

      var played = counted.filter(function (h) { return h.status === "played"; });
      var excused = history.filter(function (h) { return h.status === "excused"; });

      var streak = 0;
      for (var i = history.length - 1; i >= 0; i--) {
        var h = history[i];
        if (h.status === "excused" || h.status === "none") continue;
        if (h.status === "missed") streak++; else break;
      }

      var recent = avg(counted.slice(-3));
      var prior = avg(counted.slice(-6, -3));
      var decksUsed = played.reduce(function (s, x) { return s + x.decks; }, 0);
      var decksPossible = counted.length * DECKS_PER_WAR;
      var totalFame = counted.reduce(function (s, x) { return s + x.fame; }, 0);

      var row = {
        tag: member.tag, name: member.name, role: member.role, status: member.status,
        joined: member.joined, history: history,
        warsTracked: counted.length, warsPlayed: played.length,
        warsExcused: excused.length, streak: streak, score: score,
        trend: recent !== null && prior !== null ? round1(recent - prior) : null,
        decksUsed: decksUsed, decksPossible: decksPossible,
        deckRate: decksPossible ? round1(decksUsed / decksPossible * 100) : null,
        avgFame: played.length ? Math.round(totalFame / played.length) : 0
      };
      Object.assign(row, verdict(row));
      return row;
    });

    rows.sort(function (a, b) { return (b.score === null ? -1 : b.score) - (a.score === null ? -1 : a.score); });
    var place = 0;
    rows.forEach(function (r) { r.rank = r.status === "departed" ? null : ++place; });
    return rows;
  }

  function avg(list) {
    if (!list.length) return null;
    return list.reduce(function (s, h) { return s + h.score; }, 0) / list.length;
  }

  function verdict(row) {
    var m = state.model;
    if (row.status === "departed") return { action: "departed", why: "No longer in the clan.", sev: 0 };
    if (row.score === null || row.warsTracked < 3) {
      return { action: "watch", why: "Only " + row.warsTracked + " tracked war" + (row.warsTracked === 1 ? "" : "s") + " — too new to judge.", sev: 0 };
    }
    if (row.streak >= 2) {
      return { action: row.role === "member" ? "kick" : "demote", why: row.streak + " un-excused wars in a row with zero decks used.", sev: 3 };
    }
    if (row.score < m.warn) {
      return { action: row.role === "member" ? "kick" : "demote", why: "Rolling score " + row.score + " sits below the " + m.warn + " floor.", sev: 3 };
    }
    if (row.score < m.hold) {
      return { action: "warn", why: "Rolling score " + row.score + " is under the " + m.hold + " hold line.", sev: 2 };
    }
    if (row.score >= m.promote && row.warsTracked >= 4 && ROLE_RANK[row.role] < 2) {
      return { action: "promote", why: "Rolling score " + row.score + " over " + row.warsTracked + " wars clears the " + m.promote + " promote line.", sev: 1 };
    }
    return { action: "hold", why: "Steady at " + row.score + ".", sev: 0 };
  }

  /* Two ramps off one scale: -ink reads as type on parchment, the bright
     twin is a fill. Never use a fill colour for text on this ground. */
  function band(score) {
    var m = state.model;
    if (score === null) return "var(--ex-ink-3)";
    if (score >= m.promote) return "var(--ex-win-ink)";
    if (score >= m.hold) return "var(--ex-blue-ink)";
    if (score >= m.warn) return "var(--ex-watch-ink)";
    return "var(--ex-danger-ink)";
  }

  function bandFill(score) {
    var m = state.model;
    if (score === null) return "var(--ex-ink-3)";
    if (score >= m.promote) return "var(--ex-win)";
    if (score >= m.hold) return "var(--ex-blue)";
    if (score >= m.warn) return "var(--ex-watch)";
    return "var(--ex-danger)";
  }

  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function shortDate(iso) {
    var p = String(iso).split("-");
    return MONTHS[Number(p[1]) - 1] + " " + Number(p[2]);
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  var el = {
    hud: document.getElementById("hud"),
    roster: document.getElementById("roster"),
    tally: document.getElementById("tally"),
    log: document.getElementById("log"),
    q: document.getElementById("q"),
    role: document.getElementById("f-role"),
    verdict: document.getElementById("f-verdict"),
    gone: document.getElementById("f-gone")
  };

  function renderHud(rows) {
    var active = rows.filter(function (r) { return r.status !== "departed"; });
    var scored = active.filter(function (r) { return r.score !== null; });
    var avgScore = scored.length ? (scored.reduce(function (s, r) { return s + r.score; }, 0) / scored.length).toFixed(1) : "—";
    var used = active.reduce(function (s, r) { return s + r.decksUsed; }, 0);
    var poss = active.reduce(function (s, r) { return s + r.decksPossible; }, 0);
    var risk = active.filter(function (r) { return r.sev === 3; }).length;
    var up = active.filter(function (r) { return r.action === "promote"; }).length;
    var tiles = [
      ["", active.length, "Roster", scoredWars().length + " war weeks scored"],
      ["", avgScore, "Clan score", "average of every active member"],
      ["is-gold", poss ? Math.round(used / poss * 100) + "%" : "—", "Decks used", used.toLocaleString() + " of " + poss.toLocaleString()],
      [risk ? "is-danger" : "", risk, "On the block", up + " clear the promote line"]
    ];
    el.hud.innerHTML = tiles.map(function (t) {
      return '<div class="tile ' + t[0] + '"><b>' + t[1] + "</b><span>" + t[2] + "</span><em>" + t[3] + "</em></div>";
    }).join("");
  }

  /* Sixteen blocks, one per deck. Count them the way the clan counts them. */
  function meter(h) {
    var color = h.status === "excused" ? "var(--ex-ink)" : bandFill(h.score);
    var out = "";
    for (var i = 0; i < DECKS_PER_WAR; i++) {
      var on = i < h.decks;
      out += '<span class="seg' + (on ? " on" : "") + '"' +
        (on ? ' style="background:' + color + ";animation-delay:" + (i * 22) + 'ms"' : "") + "></span>";
    }
    return '<span class="meter" aria-hidden="true">' + out + "</span>";
  }

  function weekCell(h) {
    if (h.status === "none") {
      return '<div class="week st-none">' + meter({ decks: 0, score: 0, status: "none" }) +
        '<span class="week-decks">—</span><span class="week-meta">' + shortDate(h.date) + "</span></div>";
    }
    var label = h.status === "excused" ? "excused" : h.live ? "live" : shortDate(h.date);
    return '<button type="button" class="week st-' + h.status + '" data-war="' + h.warId + '" ' +
      'aria-label="' + shortDate(h.date) + ", " + h.decks + " of 16 decks" + (h.status === "excused" ? ", excused" : "") + '">' +
      meter(h) +
      '<span class="week-decks">' + h.decks + '<em>/16</em></span>' +
      '<span class="week-meta">' + label + "</span></button>";
  }

  function detailFor(r) {
    var bits = [r.why];
    if (r.trend !== null) bits.push("Last three wars against the three before: " + (r.trend > 0 ? "+" : "") + r.trend + ".");
    if (r.warsExcused) bits.push(r.warsExcused + " week" + (r.warsExcused === 1 ? "" : "s") + " excused and left out of the average.");
    bits.push(r.avgFame.toLocaleString() + " fame a war on the weeks played.");
    return '<div class="detail" data-detail="' + r.tag + '">' +
      '<p class="why"><b>' + VERDICT_NAME[r.action] + ".</b> " + esc(bits.join(" ")) + "</p>" +
      '<div class="strip-scroll"><div class="strip">' + r.history.map(weekCell).join("") + "</div></div>" +
      '<p class="legend">' +
        "<span>one block = one deck, sixteen a week</span>" +
        '<span><i class="key" style="background:var(--ex-win)"></i>strong week</span>' +
        '<span><i class="key" style="background:var(--ex-danger)"></i>weak or missed</span>' +
        '<span><i class="key" style="background:var(--ex-watch)"></i>excused</span>' +
        "<span>tap a week to excuse it</span>" +
      "</p></div>";
  }

  function visible(rows) {
    var q = el.q.value.trim().toLowerCase();
    var role = el.role.value;
    var v = el.verdict.value;
    var gone = el.gone.checked;
    return rows.filter(function (r) {
      if (!gone && r.status === "departed") return false;
      if (role && r.role !== role) return false;
      if (v && r.action !== v) return false;
      if (q && r.name.toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
  }

  function sorted(rows) {
    var key = state.sort.key, dir = state.sort.dir;
    return rows.slice().sort(function (a, b) {
      var av = a[key], bv = b[key];
      if (av === bv) return (a.rank || 99) - (b.rank || 99);
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      return (typeof av === "string" ? av.localeCompare(bv) : av - bv) * dir;
    });
  }

  function render() {
    var rows = build();
    renderHud(rows);
    var shown = sorted(visible(rows));
    el.tally.textContent = shown.length + " of " + rows.length;

    el.roster.innerHTML = shown.length ? shown.map(function (r) {
      var trend = r.trend === null
        ? '<span class="flat">—</span>'
        : '<span class="' + (r.trend > 1 ? "up" : r.trend < -1 ? "down" : "flat") + '">' + (r.trend > 0 ? "+" : "") + r.trend + "</span>";
      return '<div class="m sev' + r.sev + (r.status === "departed" ? " gone" : "") + (r.rank !== null && r.rank <= 3 ? " top" : "") + '">' +
        '<button type="button" class="m-main" data-tag="' + r.tag + '" aria-expanded="' + (state.open[r.tag] ? "true" : "false") + '">' +
          '<span class="who"><span class="nm"><span class="rk">' + (r.rank === null ? "—" : r.rank) + "</span>" + esc(r.name) +
            '<span class="role r-' + r.role + '">' + (ROLE_NAME[r.role] || r.role) + "</span></span>" +
            // "tracked since", not "joined": the API reports no join date, so
            // everyone present at the first sync carries that sync's date.
            '<span class="sub">tracked since ' + shortDate(r.joined) + " · " + r.warsPlayed + "/" + r.warsTracked + " wars played</span></span>" +
          '<span class="metrics">' +
            '<span class="cell scorecell"><span class="scorenum" style="color:' + band(r.score) + '">' + (r.score === null ? "—" : r.score) + "</span>" +
              '<span class="track"><i style="width:' + (r.score || 0) + "%;background:" + bandFill(r.score) + '"></i></span></span>' +
            '<span class="cell"><span class="lbl">trend</span>' + trend + "</span>" +
            '<span class="cell"><span class="lbl">decks</span><i>' + (r.deckRate === null ? "—" : r.deckRate + "%") + "</i></span>" +
            '<span class="cell"><span class="lbl">wars</span><b>' + r.warsPlayed + "/" + r.warsTracked + "</b>" +
              (r.warsExcused ? " · " + r.warsExcused + " excused" : "") +
              (r.streak ? ' · <i style="color:var(--ex-danger-ink)">' + r.streak + " missed</i>" : "") + "</span>" +
          "</span>" +
          '<span class="verdict v-' + r.action + '">' + VERDICT_NAME[r.action] + "</span>" +
        "</button>" +
        (state.open[r.tag] ? detailFor(r) : "") +
      "</div>";
    }).join("") : '<p class="empty">Nobody matches that filter.</p>';

    Array.prototype.forEach.call(document.querySelectorAll("#colhead button"), function (b) {
      b.setAttribute("data-active", b.dataset.key === state.sort.key ? "1" : "0");
    });
  }

  /* The header states facts about this clan, so it is written from the data
     rather than baked into the markup — a hardcoded roster size becomes a lie
     the first time a real sync lands. */
  function renderHeader() {
    var weeks = wars.filter(function (w) { return w.complete; }).length;
    var roster = members.filter(function (m) { return m.status !== "departed"; }).length;
    var eyebrow = document.getElementById("eyebrow");
    var lede = document.getElementById("lede");
    if (eyebrow) {
      eyebrow.textContent = [
        SEED.clan && SEED.clan.name,
        SEED.clan && SEED.clan.tag,
        weeks + " war week" + (weeks === 1 ? "" : "s") + " scored",
        SEED.demo ? "sample data" : null
      ].filter(Boolean).join(" · ");
    }
    // The sample-roster warning is a claim about the data, so it lives or dies
    // by the data. The static page has no server to hide it for us.
    var banner = document.getElementById("banner");
    if (banner) banner.hidden = !SEED.demo;
    if (lede) {
      lede.innerHTML = weeks + " river race" + (weeks === 1 ? "" : "s") + ", " + roster +
        " members, sixteen decks a week each. One weighted score decides who gets bumped up " +
        "and who gets shown the door. <b>Drag the weights</b> and the whole roster re-sorts — " +
        "that argument is easier to have with names on the screen.";
    }
  }

  function renderLog() {
    var firstWar = wars[0].date;
    var entries = [];
    wars.forEach(function (w) {
      if (w.complete) entries.push({ date: w.date, text: "War week closed at <b>rank " + w.rank + "</b> of 5." });
    });
    members.forEach(function (m) {
      if (m.status === "departed") {
        entries.push({ date: wars[wars.length - 3].date, text: "<b>" + esc(m.name) + "</b> left or was removed." });
      } else if (m.joined > firstWar) {
        entries.push({ date: m.joined, text: "<b>" + esc(m.name) + "</b> joined as " + ROLE_NAME[m.role] + "." });
      }
    });
    entries.sort(function (a, b) { return b.date.localeCompare(a.date); });
    el.log.innerHTML = entries.slice(0, 12).map(function (e) {
      return "<li><time>" + shortDate(e.date) + "</time><span>" + e.text + "</span></li>";
    }).join("");
  }

  var knobs = [
    ["k-part", "o-part", "participation", function (v) { return Math.round(v * 100) + "%"; }],
    ["k-eff", "o-eff", "efficiency", function (v) { return Math.round(v * 100) + "%"; }],
    ["k-con", "o-con", "contribution", function (v) { return Math.round(v * 100) + "%"; }],
    ["k-half", "o-half", "halfLife", function (v) { return v + " wars"; }],
    ["k-promote", "o-promote", "promote", function (v) { return String(v); }],
    ["k-warn", "o-warn", "warn", function (v) { return String(v); }]
  ];

  function syncKnobs() {
    knobs.forEach(function (k) {
      document.getElementById(k[0]).value = state.model[k[2]];
      document.getElementById(k[1]).textContent = k[3](state.model[k[2]]);
    });
    document.getElementById("k-live").checked = state.model.live;
  }

  knobs.forEach(function (k) {
    document.getElementById(k[0]).addEventListener("input", function (e) {
      state.model[k[2]] = Number(e.target.value);
      if (k[2] === "warn" && state.model.hold < state.model.warn) state.model.hold = state.model.warn;
      if (k[2] === "promote" && state.model.hold > state.model.promote) state.model.hold = state.model.promote;
      syncKnobs();
      persist();
      render();
    });
  });

  document.getElementById("k-live").addEventListener("change", function (e) {
    state.model.live = e.target.checked;
    persist();
    render();
  });

  document.getElementById("reset").addEventListener("click", function () {
    state.model = Object.assign({}, DEFAULTS);
    syncKnobs();
    persist();
    render();
  });

  ["q", "f-role", "f-verdict", "f-gone"].forEach(function (id) {
    document.getElementById(id).addEventListener("input", render);
  });

  document.getElementById("colhead").addEventListener("click", function (e) {
    var btn = e.target.closest("button[data-key]");
    if (!btn) return;
    var key = btn.dataset.key;
    state.sort = state.sort.key === key
      ? { key: key, dir: -state.sort.dir }
      : { key: key, dir: key === "name" || key === "action" ? 1 : -1 };
    render();
  });

  el.roster.addEventListener("click", function (e) {
    var week = e.target.closest(".week[data-war]");
    if (week) {
      var tag = week.closest(".detail").dataset.detail;
      var warId = week.dataset.war;
      var key = tag + "|" + warId;
      var next = !state.excuses[key];
      state.excuses[key] = next;
      persist();
      render();
      if (opts.onExcuse) {
        Promise.resolve(opts.onExcuse(tag, warId, next)).catch(function (err) {
          // The store is the record; if it did not take, do not let the screen
          // claim otherwise.
          state.excuses[key] = !next;
          persist();
          render();
          window.alert("Could not save that excuse: " + err.message);
        });
      }
      return;
    }
    var main = e.target.closest(".m-main");
    if (!main) return;
    state.open[main.dataset.tag] = !state.open[main.dataset.tag];
    render();
  });

  renderHeader();
  syncKnobs();
  renderLog();
  render();

  return { render: render, state: state };
};
