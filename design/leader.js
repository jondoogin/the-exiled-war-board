/* Leadership page: the board, plus a write path.
 *
 * Excuses are a human judgement, never derived from the API, so they live in
 * data/excuses.json — a file the daily sync never touches. This page commits
 * straight to that file through the GitHub contents API, and the resulting
 * push rebuilds the site. A week excused from a phone is on the shared board
 * about a minute later.
 *
 * The access token is held in this browser's localStorage and nowhere else. It
 * is never written into the page, never committed, and never sent anywhere but
 * api.github.com.
 */
(function () {
  "use strict";

  var REPO = window.__WAR_BOARD_REPO__;
  var FILE = "data/excuses.json";
  var STORE_KEY = "exiled-publish-token";

  var pending = {}; // "tag|warId" -> the excused state we mean to publish
  var seed = JSON.parse(document.getElementById("seed").textContent);

  var msg = document.getElementById("leadmsg");
  var publishBtn = document.getElementById("publish");
  var auth = document.getElementById("leadauth");
  var tokenInput = document.getElementById("ghtoken");

  function readToken() {
    try { return localStorage.getItem(STORE_KEY) || ""; } catch (err) { return ""; }
  }
  function writeToken(value) {
    try { localStorage.setItem(STORE_KEY, value); } catch (err) { /* private window */ }
  }

  function say(text, kind) {
    msg.textContent = text;
    msg.className = "leadbar-msg" + (kind ? " is-" + kind : "");
  }

  function pendingCount() { return Object.keys(pending).length; }

  function refresh() {
    var n = pendingCount();
    publishBtn.disabled = n === 0;
    publishBtn.textContent = n === 0
      ? "Nothing to publish"
      : "Publish " + n + " change" + (n === 1 ? "" : "s");
    Array.prototype.forEach.call(document.querySelectorAll(".week[data-war]"), function (el) {
      var detail = el.closest(".detail");
      if (!detail) return;
      el.classList.toggle("is-pending", (detail.dataset.detail + "|" + el.dataset.war) in pending);
    });
  }

  function toBase64(text) {
    var bytes = new TextEncoder().encode(text);
    var binary = "";
    bytes.forEach(function (b) { binary += String.fromCharCode(b); });
    return btoa(binary);
  }
  function fromBase64(text) {
    var binary = atob(String(text).replace(/\s/g, ""));
    var bytes = Uint8Array.from(binary, function (c) { return c.charCodeAt(0); });
    return new TextDecoder().decode(bytes);
  }

  async function contents(options) {
    var res = await fetch(
      "https://api.github.com/repos/" + REPO + "/contents/" + FILE,
      Object.assign({
        headers: {
          Authorization: "Bearer " + readToken(),
          Accept: "application/vnd.github+json"
        }
      }, options || {})
    );
    if (res.status === 401 || res.status === 403) {
      throw new Error("That token was rejected. It needs Contents: read and write on this repository.");
    }
    if (res.status === 404 && !options) return null; // no excuses file yet
    if (!res.ok) {
      var body = await res.json().catch(function () { return {}; });
      throw new Error(body.message || "GitHub answered " + res.status);
    }
    return res.json();
  }

  async function publish() {
    if (!readToken()) {
      auth.hidden = false;
      tokenInput.focus();
      return say("Paste an access token first. It stays in this browser.", "bad");
    }
    publishBtn.disabled = true;
    say("Publishing…");
    try {
      // Re-read the live file rather than trusting the copy baked into this
      // page — someone may have excused a week since it was built.
      var current = await contents(null);
      var list = current ? JSON.parse(fromBase64(current.content)) : [];

      Object.keys(pending).forEach(function (key) {
        var split = key.indexOf("|");
        var tag = key.slice(0, split);
        var warId = key.slice(split + 1);
        var at = list.findIndex(function (e) { return e.tag === tag && e.warId === warId; });
        if (pending[key] && at === -1) {
          list.push({
            tag: tag,
            warId: warId,
            note: "Declared ahead of time",
            createdAt: new Date().toISOString()
          });
        } else if (!pending[key] && at !== -1) {
          list.splice(at, 1);
        }
      });

      var n = pendingCount();
      var payload = {
        message: "Excuse " + n + " week" + (n === 1 ? "" : "s"),
        content: toBase64(JSON.stringify(list, null, 2) + "\n")
      };
      if (current) payload.sha = current.sha;

      await contents({ method: "PUT", body: JSON.stringify(payload) });

      pending = {};
      refresh();
      say("Published. The shared board catches up in about a minute.", "good");
    } catch (err) {
      say(err.message, "bad");
      refresh();
    }
  }

  publishBtn.addEventListener("click", publish);

  document.getElementById("savetoken").addEventListener("click", function () {
    var value = tokenInput.value.trim();
    if (!value) return say("Nothing pasted.", "bad");
    writeToken(value);
    tokenInput.value = "";
    auth.hidden = true;
    say("Saved in this browser. Tap a week to excuse it.", "good");
  });

  tokenInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") document.getElementById("savetoken").click();
  });

  if (!readToken()) auth.hidden = false;

  window.startBoard(seed, {
    onExcuse: function (tag, warId, excused) {
      var key = tag + "|" + warId;
      var startedExcused = (seed.ex || []).some(function (e) { return e[0] === tag && e[1] === warId; });
      // Toggling back to where it started is not a change worth publishing.
      if (excused === startedExcused) delete pending[key];
      else pending[key] = excused;
      refresh();
      say(pendingCount()
        ? "Unpublished changes. Hit Publish when you are done."
        : "No unpublished changes.");
    }
  });

  refresh();
})();
