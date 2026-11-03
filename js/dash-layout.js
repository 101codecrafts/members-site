/* 101 Codecrafts — dashboard composition (design system, live site only).
   The dashboard markup is a flat 1536px mockup canvas (kept untouched for ?static=1, whose
   tune.py nudges use nth-child). On the live site this runs synchronously right after </main>,
   before first paint, and groups the flat children into real components:
     .dz-top   hero (+ "Build the future together" as its accent footer) and the hero photo
     .dz-stats stat tiles (a tile without a real number is hidden, never "—")
     .dz-sec   section header (title, one-line sub, View all) + .dz-grid of equal-height cards
     .dz-rail  Quick access, Latest from community, Upcoming events, brand card
   Styling lives in css/system.css (html:not(.static) .app.dz …). Sidebar/top-bar nodes are not moved. */
(function () {
  var html = document.documentElement;
  if (/[?&]static/.test(location.search) || html.classList.contains("static")) return;
  var app = document.querySelector("main.app");
  if (!app || app.classList.contains("dz")) return;
  function kids(sel) { return Array.prototype.filter.call(app.children, function (e) { return e.matches(sel); }); }
  function make(tag, cls, nodes) { var e = document.createElement(tag); e.className = cls; (nodes || []).forEach(function (n) { if (n) e.appendChild(n); }); return e; }
  var foot = kids("footer.foot")[0] || null;
  var hero = kids(".hero")[0], cy = kids(".cyanp")[0], photo = kids(".hero-photo")[0];
  if (!hero) return;

  // ---- top: hero + photo; the cyan slogan becomes the hero's accent footer (no empty slab)
  if (cy) { cy.classList.add("dz-slogan"); hero.appendChild(cy); }
  var top = make("div", "dz-top", [hero, photo]);

  // ---- stats
  var statEls = kids(".stat");
  var stats = make("div", "dz-stats", statEls);
  statEls.forEach(function (s) { s.classList.add("dz-stat"); });

  // ---- sections (Featured tools, Learning paths, Recent activity)
  var secs = kids("h2.sec-h").map(function (h2) {
    var group = [], n = h2.nextElementSibling;
    while (n && !n.matches(".rule, .panel, .qa-h, footer, h2.sec-h, script")) { group.push(n); n = n.nextElementSibling; }
    var head = make("header", "dz-head", [make("div", "dz-head-t", [h2])]);
    var grid = make("div", "dz-grid", []);
    group.forEach(function (g) {
      if (g.matches(".sec-sub")) head.firstChild.appendChild(g);
      else if (g.matches(".viewall")) head.appendChild(g);
      else if (g.matches(".tool, .lp, .act, .study")) { g.classList.add("dz-card"); grid.appendChild(g); }
    });
    var kind = grid.querySelector(".tool") ? "tools" : grid.querySelector(".lp") ? "paths" : "activity";
    grid.classList.add("dz-grid-" + kind);
    var sec = make("section", "dz-sec dz-" + kind, [head, grid]);
    sec.setAttribute("aria-labelledby", h2.id || (h2.id = "dz-h-" + kind));
    return sec;
  });

  // ---- right rail: split the flat run at each decorative .panel
  var rail = make("aside", "dz-rail", []); rail.setAttribute("aria-label", "Shortcuts, community and events");
  var panels = kids(".panel");
  panels.forEach(function (p, i) {
    var run = [], n = p.nextElementSibling;
    while (n && !n.matches(".panel, footer, script")) { run.push(n); n = n.nextElementSibling; }
    var card = make("section", "dz-box", []), head = make("header", "dz-box-h", []), body = make("div", "dz-box-b", []), extra = [];
    run.forEach(function (r) {
      if (r.matches(".qa-h, b.abs, svg.abs")) head.appendChild(r);
      else if (r.matches("a.abs")) { r.classList.add("dz-more"); head.appendChild(r); }
      else if (r.matches(".brandcard")) extra.push(r);
      else body.appendChild(r);
    });
    var k = body.querySelector(".qa") ? "quick" : body.querySelector(".feed") ? "community" : "events";
    card.classList.add("dz-box-" + k); body.classList.add("dz-box-b-" + k);
    if (k === "quick") { var mc = document.createElement("a"); mc.className = "qa-wide"; mc.href = "card.html";
      mc.innerHTML = '<svg aria-hidden="true"><use href="#i-badge"/></svg><span>Make your member card</span><svg aria-hidden="true"><use href="#i-arrow"/></svg>'; body.appendChild(mc); }
    card.appendChild(head); card.appendChild(body); rail.appendChild(card);
    extra.forEach(function (x) { rail.appendChild(x); });
    p.remove();
  });

  var main = make("div", "dz-main", [top, stats].concat(secs));
  app.insertBefore(main, foot);
  app.insertBefore(rail, foot);
  app.classList.add("dz");
  /* "Today in tech" + "From the library" sit in the page flow above the footer (they are parsed after this script) */
  function pullBelow() { var b = document.getElementById("below-fold"); if (b && foot.parentNode === app) app.insertBefore(b, foot); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", pullBelow); else pullBelow();
})();
