/* Leadership page: the board, plus a write path.
 *
 * Excuses are a human judgement, never derived from the API, so they live in
 * data/excuses.json — a file the daily sync never touches.
 *
 * This page holds no credential. It sends the shared password and the pending
 * changes to a small endpoint that holds the GitHub token server-side; that
 * endpoint commits the file, and the push rebuilds the site. A static page
 * cannot keep a secret, so it does not try to: the password gates the endpoint,
 * and the token never reaches a browser.
 */
(function () {
  "use strict";

  var ENDPOINT = window.__WAR_BOARD_API__ || "";
  var STORE_KEY = "exiled-leader-password";

  var pending = {}; // "tag|warId" -> the excused state we mean to publish
  var seed = JSON.parse(document.getElementById("seed").textContent);

  /* What the server holds, as best this page knows. Seeded from the build and
     moved forward on every successful publish — comparing against the build
     snapshot instead would mean un-excusing a week published in this same
     session looked like a no-op, and the button would never re-enable. */
  var published = {};
  (seed.ex || []).forEach(function (e) { published[e[0] + "|" + e[1]] = true; });

  var msg = document.getElementById("leadmsg");
  var publishBtn = document.getElementById("publish");
  var passInput = document.getElementById("leadpass");

  function readPass() {
    try { return localStorage.getItem(STORE_KEY) || ""; } catch (err) { return ""; }
  }
  function writePass(value) {
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
    publishBtn.textContent = n === 0 ? "Publish" : "Publish " + n;
    passInput.classList.toggle("is-set", Boolean(passInput.value));
    Array.prototype.forEach.call(document.querySelectorAll(".week[data-war]"), function (el) {
      var detail = el.closest(".detail");
      if (!detail) return;
      el.classList.toggle("is-pending", (detail.dataset.detail + "|" + el.dataset.war) in pending);
    });
  }

  async function publish() {
    var password = passInput.value.trim();
    if (!password) {
      passInput.focus();
      return say("Password first.", "bad");
    }
    if (!ENDPOINT) {
      return say("No publish endpoint configured yet — see the README.", "bad");
    }

    publishBtn.disabled = true;
    say("Publishing…");

    var changes = Object.keys(pending).map(function (key) {
      var split = key.indexOf("|");
      return { tag: key.slice(0, split), warId: key.slice(split + 1), excused: pending[key] };
    });

    try {
      var res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: password, changes: changes })
      });
      var body = await res.json().catch(function () { return {}; });
      if (res.status === 401) {
        writePass("");
        throw new Error("Wrong password.");
      }
      if (!res.ok) throw new Error(body.error || "Publish failed (" + res.status + ").");

      writePass(password);
      // The server now holds these, so they become the baseline.
      Object.keys(pending).forEach(function (key) {
        if (pending[key]) published[key] = true;
        else delete published[key];
      });
      pending = {};
      refresh();
      say("Published. The board catches up in about a minute.", "good");
    } catch (err) {
      say(err.message, "bad");
      refresh();
    }
  }

  publishBtn.addEventListener("click", publish);
  passInput.addEventListener("input", refresh);
  passInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && pendingCount()) publish();
  });

  passInput.value = readPass();

  window.startBoard(seed, {
    onExcuse: function (tag, warId, excused) {
      var key = tag + "|" + warId;
      var startedExcused = published[key] === true;
      // Toggling back to where it started is not a change worth publishing.
      if (excused === startedExcused) delete pending[key];
      else pending[key] = excused;
      refresh();
      var n = pendingCount();
      say(n ? n + " unpublished change" + (n === 1 ? "" : "s") + "." : "Tap any week to excuse it.");
    }
  });

  refresh();
})();
