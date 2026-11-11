/* 101 Codecrafts — CCFirstSteps: the "first steps" task list a new account sees on its home (round 13, flows).
   Pattern: GOV.UK "Complete multiple tasks" (task names start with a verb, one status per task: Done / To do / Waiting /
   Cannot start yet, completed tasks quiet, the next task loud) + NN/g empty states (say what goes here and give ONE
   direct path to fill it). Every status comes from real account data; a task we can't measure is never shown as done.
   ?static=1 (mockup screenshots): renders nothing.

   CCFirstSteps.html({ key, title?, label?, intro, items:[{ label, hint, status, href, cta }], welcome, dismissable }) -> string
     title: an h3 inside the list (omit when the host card's own heading names it; then `label` names the region)
     hints show only on the next task and on waiting / blocked ones (keeps the list short)
     status: "done" | "todo" | "waiting" | "blocked" | "optional"
   CCFirstSteps.session() -> the raw GET /api/v1/auth/session answer (tutor / store fields, r13 API) or null
   CCFirstSteps.welcome() -> true on the first visit after sign-up (?welcome=1 from /auth)
   Dismiss ("Hide these steps") is remembered per account in localStorage; finished lists hide themselves. */
(function () {
  "use strict";
  var STATIC = /[?&]static/.test(location.search);
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var LABEL = { done: "Done", todo: "To do", waiting: "Waiting", blocked: "Cannot start yet", optional: "Optional" };
  var uid = function () { var a = window.CCAccess; return (a && a.user && a.user.id) || "me"; };
  var keyOf = function (k) { return "cc_fs_hide_" + k + "_" + uid(); };
  function hidden(k) { try { return localStorage.getItem(keyOf(k)) === "1"; } catch (e) { return false; } }
  function hide(k) { try { localStorage.setItem(keyOf(k), "1"); } catch (e) {} }

  function html(o) {
    if (STATIC || !o || !o.items || !o.items.length) return "";
    var items = o.items.filter(Boolean);
    var need = items.filter(function (i) { return i.status !== "done" && i.status !== "optional"; });
    if (!need.length && !o.keepWhenDone) return "";
    if (hidden(o.key) && !o.welcome) return "";
    var done = items.filter(function (i) { return i.status === "done"; }).length;
    var nextIdx = items.findIndex(function (i) { return i.status === "todo"; });
    var row = function (it, n) {
      var id = "fs-" + esc(o.key) + "-" + n;
      var name = it.href && it.status !== "blocked" && it.status !== "done"
        ? '<a href="' + esc(it.href) + '" aria-describedby="' + id + '-s">' + esc(it.label) + "</a>"
        : "<span>" + esc(it.label) + "</span>";
      return '<li class="fs-item is-' + esc(it.status) + (n === nextIdx ? " is-next" : "") + '">' +
        '<span class="fs-n" aria-hidden="true">' + (it.status === "done" ? "✓" : n + 1) + "</span>" +
        '<div class="fs-name">' + name + (it.hint && (n === nextIdx || it.status === "waiting" || it.status === "blocked") ? "<small>" + esc(it.hint) + "</small>" : "") +
        (n === nextIdx && it.cta && it.href ? '<a class="btn sm or fs-cta" href="' + esc(it.href) + '">' + esc(it.cta) + "</a>" : "") + "</div>" +
        '<span class="fs-st" id="' + id + '-s">' + esc(LABEL[it.status] || it.status) + "</span></li>";
    };
    return '<section class="fs" data-fs="' + esc(o.key) + '"' + (o.title ? ' aria-labelledby="fs-h-' + esc(o.key) + '"' : ' aria-label="' + esc(o.label || "First steps") + '"') + ">" +
      '<div class="fs-head">' + (o.title ? '<h3 id="fs-h-' + esc(o.key) + '">' + esc(o.title) + "</h3>" : "") + '<span class="fs-count"><span class="fs-ring" style="--p:' + Math.round(done / Math.max(1, items.length) * 100) + '" aria-hidden="true"><b>' + done + "/" + items.length + "</b></span>" + done + " of " + items.length + " done</span></div>" +
      (o.intro ? '<p class="fs-intro">' + esc(o.intro) + "</p>" : "") +
      '<ol class="fs-list">' + items.map(row).join("") + "</ol>" + (items.length - done > 0 ? '<span class="fs-left">' + (items.length - done) + " left</span>" : '<span class="fs-left">All done</span>') +
      (o.dismissable === false ? "" : '<button type="button" class="fs-hide" data-fs-hide="' + esc(o.key) + '">Hide these steps</button>') + "</section>";
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-fs-hide]"); if (!b) return;
    var k = b.getAttribute("data-fs-hide"); hide(k);
    var box = b.closest(".fs"); if (!box) return;
    var host = box.parentNode;
    box.outerHTML = '<p class="fs-gone" role="status" tabindex="-1">Steps hidden. ' + (host && host.dataset.fsRestore ? esc(host.dataset.fsRestore) : "") + "</p>";
    var g = host && host.querySelector(".fs-gone"); if (g) g.focus();
    document.dispatchEvent(new CustomEvent("cc:firststeps-hidden", { detail: k }));
  });
  function session() { var a = window.CC_AUTH; return (a && a.session) || null; }
  var WELCOME = !STATIC && /[?&]welcome=1/.test(location.search);   // read once: the flag is removed from the URL below
  function welcome() { return WELCOME; }
  /* drop ?welcome=1 from the address bar after the first paint, so a reload or a shared link doesn't repeat it */
  if (welcome()) setTimeout(function () { try { var u = new URL(location.href); u.searchParams.delete("welcome"); history.replaceState(history.state, "", u.pathname + u.search + u.hash); } catch (e) {} }, 1500);

  window.CCFirstSteps = { html: html, session: session, welcome: welcome, hidden: hidden, static: STATIC };
})();
