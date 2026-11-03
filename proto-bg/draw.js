/* shared canvas-2D painter (main thread and worker). all=true paints grid, crosshairs and glow too (cached bitmap). */
(function (g) {
  g.CCDRAW = function (cv, opt) {
    var ctx = cv.getContext("2d"), R = [], F, W, H, dpr, cache = null, all = opt.all;
    function setup(o) {
      W = o.W; H = o.H; dpr = o.dpr; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      F = CCBG.field(W, H, o.theme); F.g.sort(function (a, b) { return a.s - b.s; }); cache = null;
      if (all) { var c = new OffscreenCanvas(cv.width, cv.height), x = c.getContext("2d"), P = F.P; x.scale(dpr, dpr);
        var gr = x.createLinearGradient(0, H * .78, 0, H); gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(1, P.glow); x.fillStyle = gr; x.fillRect(0, H * .78, W, H * .22);
        for (var i = 0; i * 54 < Math.max(W, H); i++) { x.fillStyle = i % 4 ? P.grid : P.major; x.fillRect(i * 54, 0, 1, H); x.fillRect(0, i * 54, W, 1); }
        F.x.forEach(function (p) { x.globalAlpha = p.a; x.fillStyle = p.c; x.fillRect(p.x - 6, p.y, 13, 1); x.fillRect(p.x, p.y - 6, 1, 13); });
        cache = c; }
    }
    /* text guard: 1 far from guarded text, fading to .1 inside a 28px band */
    function near(x, y, w, h) { var k = 1; for (var j = 0; j < R.length; j++) { var q = R[j], dx = Math.max(q[0] - x - w, 0, x - q[0] - q[2]), dy = Math.max(q[1] - y - h, 0, y - q[1] - q[3]), dd = Math.sqrt(dx * dx + dy * dy); if (dd < 28) k = Math.min(k, .1 + .9 * dd / 28); } return k; }
    function frame(t) {
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height); if (cache) ctx.drawImage(cache, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.textBaseline = "top"; var s = 0;
      if (!all) for (var m = 0; m < F.x.length; m++) { var X = F.x[m]; ctx.globalAlpha = X.a * near(X.x - 6, X.y - 6, 13, 13); ctx.fillStyle = X.c; ctx.fillRect(X.x - 6, X.y, 13, 1); ctx.fillRect(X.x, X.y - 6, 1, 13); }
      for (var i = 0; i < F.g.length; i++) { var G = F.g[i], p = CCBG.pos(G, t, W, H);
        if (G.s !== s) { s = G.s; ctx.font = s + 'px "CC Mono",monospace'; }
        ctx.globalAlpha = near(p[0], p[1], G.s * .6 * G.t.length, G.s) * G.a * (.75 + .25 * Math.sin(t * G.f + G.ph)); ctx.fillStyle = G.c; ctx.fillText(G.t, p[0], p[1]); }
      ctx.globalAlpha = 1;
    }
    return { setup: setup, frame: frame, rects: function (r) { R = r; } };
  };
  /* 30fps loop with pause; raf = requestAnimationFrame (worker has it in Chromium; else setTimeout) */
  g.CCLOOP = function (paint, fps) {
    var raf = self.requestAnimationFrame ? self.requestAnimationFrame.bind(self) : function (f) { return setTimeout(function () { f(performance.now()); }, 1000 / fps); },
        run = false, last = 0, t0 = performance.now(), step = 1000 / fps - 2;
    function tick(now) { if (!run) return; if (now - last >= step) { last = now; paint((now - t0) / 1000); } raf(tick); }
    return { start: function () { if (!run) { run = true; raf(tick); } }, stop: function () { run = false; }, once: function () { paint((performance.now() - t0) / 1000); } };
  };
})(self);
