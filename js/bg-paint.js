/* Background painter (dark theme only): "+" marks on the 56px grid, faint sub-divided cells and drifting code glyphs.
   Shared by the worker (js/bg-worker.js, OffscreenCanvas) and the main-thread fallback (js/bg.js). Numbers: design SPEC v2, variant F. */
(function (g) {
  var FONT = '"CCBG Mono","CC Mono",ui-monospace,monospace';
  /* glyph set, weighted by relative frequency */
  var SET = [];
  [["{", 3], ["}", 3], ["[", 2], ["]", 2], ["(", 2], [")", 2], ["<", 2], [">", 2], ["</>", 1], ["==", 1], ["!=", 1], ["<=", 1], ["=>", 1], ["->", 1], ["fn", 1], ["if", 1],
   ["0x", 1], ["NaN", 1], ["$", 1], ["#", 1], ["&", 1], ["*", 1], ["?", 1], ["/", 1], ["\\", 1], [";", 1], ["0", 4], ["1", 4]].forEach(function (x) { for (var i = 0; i < x[1]; i++) SET.push(x[0]); });
  /* colours: [hex, share, alpha lo, alpha hi] */
  var GC = [["#05e6f2", .55, .10, .24], ["#fc8c0c", .30, .10, .25], ["#EEF1F8", .15, .08, .18]];
  var XC = [["#05e6f2", .45, .22, .38], ["#EEF1F8", .35, .20, .35], ["#fc8c0c", .20, .18, .30]];
  /* page types: glyph density x, glyph alpha x, speed px/s, marks on majors only, mark alpha x */
  var TYPES = { landing: [1, 1, 4, 9, 0, 1], mkt: [.7, .8, 3, 7, 0, 1], app: [.5, .6, 3, 6, 1, .6], auth: [.6, .7, 3, 6, 0, 1], err: [.8, .9, 4, 8, 0, 1] };
  function rng(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function pick(r, L) { var x = r(); for (var i = 0; i < L.length - 1; i++) if ((x -= L[i][1]) < 0) return L[i]; return L[L.length - 1]; }
  function alpha(r, c) { var u = r(), v = r(); return c[2] + (c[3] - c[2]) * (u < .6 ? v / 3 : 1 / 3 + v * 2 / 3); }   /* 60% in the lower third */
  function ease(x) { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); }

  g.CCBGP = function (cv) {
    var ctx = cv.getContext("2d"), W = 0, H = 0, dpr = 1, T, r = rng(101), G = [], X = [], S = [], R = [], O = [], x0 = 0, sz, still = false;
    function inBox(x, y, w, h, L, pad) { for (var i = 0; i < L.length; i++) { var q = L[i]; if (x + w > q[0] - pad && x < q[0] + q[2] + pad && y + h > q[1] - pad && y < q[1] + q[3] + pad) return true; } return false; }
    /* distance fade: 1 far from text, 0 at the text box (20px band), so a glyph drifting towards copy fades out instead of passing under it */
    function near(x, y, w, h) { var k = 1; for (var j = 0; j < R.length; j++) { var q = R[j], dx = Math.max(q[0] - x - w, 0, x - q[0] - q[2]), dy = Math.max(q[1] - y - h, 0, y - q[1] - q[3]);
      if (dx < 20 && dy < 20) { var dd = Math.sqrt(dx * dx + dy * dy); if (dd < 20) k = Math.min(k, dd / 20); } } return k; }
    function spawn(o, t, first) {
      var s = sz[0] + r() * (sz[1] - sz[0] + 1) | 0, tok = SET[r() * SET.length | 0];
      if (tok.length > 1) s = sz[0] + (s - sz[0]) / 2 | 0;   /* multi-char tokens: lower half of the size range */
      var w = s * .6 * tok.length, ok = false, x, y;
      for (var k = 0; k < 14 && !ok; k++) { x = 8 + r() * (W - 16 - w); y = 72 + r() * (H - 80 - s); ok = !inBox(x, y, w, s, R, 20) && !inBox(x, y, w, s, O, 4); }
      var c = pick(r, GC);
      o.t = tok; o.s = s; o.w = w; o.x = x; o.y = y; o.c = c[0]; o.a = alpha(r, c) * T[1]; o.b = r() < .15 ? 600 : 400; o.ok = ok;
      o.vy = -(T[2] + r() * (T[3] - T[2])); o.vx = (r() - .5) * 1.2; o.life = 20 + r() * 25; o.t0 = first ? t - r() * o.life * .8 : t;
      return o;
    }
    function setup(o) {
      W = o.W; H = o.H; dpr = Math.min(o.dpr || 1, 1.5); still = !!o.still; T = TYPES[o.type] || TYPES.mkt;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      var ph = W < 600, base = W >= 1100 ? 3.6 : W >= 600 ? 3 : 2.4, area = W * H / 1e5;
      sz = W >= 1100 ? [14, 22] : W >= 600 ? [13, 20] : [12, 18];
      if (ph && T[3] > 6) T = T.slice(), T[2] = 3, T[3] = 6;   /* phones: 3-6 px/s */
      r = rng(101 + W * 7 + H);
      var n = Math.min(70, Math.round(area * base * T[0])); G = [];
      for (var i = 0; i < n; i++) G.push(spawn({}, o.time || 0, true));
      /* marks on the grid lattice (x = centre + k*56, y = k*56): 2.4 per 100k px², 40% on majors (app pages: majors only) */
      x0 = (W / 2) % 56; X = []; S = [];
      var cols = Math.ceil(W / 56) + 1, rows = Math.ceil(H / 56) + 1, nx = Math.round(area * 2.4), cx = Math.round(W / 2);
      for (var m = 0, tries = 0; m < nx && tries < nx * 20; tries++) {
        var maj = T[4] || r() < .4, i2 = r() * cols | 0, j2 = r() * rows | 0, xx = Math.round(x0 + i2 * 56), yy = j2 * 56;
        if (maj) { xx = cx + Math.round((xx - cx) / 224) * 224; yy = Math.round(yy / 224) * 224; }
        if (xx < 4 || xx > W - 4 || yy < 64 || yy > H - 4) continue;
        var c2 = pick(r, XC); X.push([xx, yy, c2[0], (c2[2] + r() * (c2[3] - c2[2])) * T[5]]); m++;
      }
      /* sub-divided cells: 1 in 18 (phones 1 in 24), 2x2 split at soft white 3% */
      var sr = rng(7), p = ph ? 1 / 24 : 1 / 18;
      for (var a = -1; a < cols; a++) for (var b = 0; b < rows; b++) if (sr() < p) S.push([Math.round(x0 + a * 56), b * 56]);
    }
    function frame(t) {
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalAlpha = .03; ctx.fillStyle = "#EEF1F8";
      for (var s = 0; s < S.length; s++) { var c = S[s]; ctx.fillRect(c[0] + 28, c[1], 1, 56); ctx.fillRect(c[0], c[1] + 28, 56, 1); }
      for (var m = 0; m < X.length; m++) { var q = X[m], k = near(q[0] - 4, q[1] - 4, 9, 9); if (k <= 0) continue;
        ctx.globalAlpha = q[3] * k; ctx.fillStyle = q[2]; ctx.fillRect(q[0] - 4, q[1], 9, 1); ctx.fillRect(q[0], q[1] - 4, 1, 9); }
      ctx.textBaseline = "top"; var f = "";
      for (var i = 0; i < G.length; i++) {
        var o = G[i], age = t - o.t0;
        if (age > o.life) { spawn(o, t, false); age = 0; }
        if (!o.ok) continue;
        var x = o.x + o.vx * age, y = o.y + o.vy * age;
        var a = still ? .9 : ease(age / 2.5) * ease((o.life - age) / 3);
        if (y < 64) a *= ease((y - 40) / 24);
        a *= o.a * near(x, y, o.w, o.s); if (a < .004) continue;
        var ff = o.b + " " + o.s + "px " + FONT; if (ff !== f) { ctx.font = f = ff; }
        ctx.globalAlpha = a; ctx.fillStyle = o.c; ctx.fillText(o.t, x, y);
      }
      ctx.globalAlpha = 1;
    }
    return { setup: setup, frame: frame, rects: function (t, o) { R = t || []; O = o || []; } };
  };
  /* 20fps loop; time only advances while running (no catch-up jump after a pause) */
  g.CCBGL = function (paint, fps) {
    var raf = self.requestAnimationFrame ? self.requestAnimationFrame.bind(self) : function (f) { return setTimeout(function () { f(performance.now()); }, 1000 / fps); },
        run = false, last = 0, t = 0, step = 1000 / fps - 3, id = 0;
    function tick(now) { if (!run) return; var dt = now - last; if (dt >= step) { last = now; t += Math.min(dt, 100) / 1000; paint(t); } raf(tick); }
    return { start: function () { if (!run) { run = true; last = performance.now(); raf(tick); } }, stop: function () { run = false; }, once: function () { paint(t); }, time: function () { return t; } };
  };
})(self);
