/* shared: seeded glyph field + grid-locked crosshairs + palettes (used by every prototype; worker imports it too) */
(function (g) {
  var T1 = "0 1 0 1 { } [ ] < > / ; = + * # $ ? & ( )".split(" "),
      T2 = "&& => :: </> == != fn if 0x NaN -> <= {}".split(" ");
  function rng(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  var PAL = {
    dark:  { c: ["#05e6f2", "#fc8c0c", "#e8eef8"], w: [.55, .30, .15], ga: [.12, .30], xa: [.28, .55],
             grid: "rgba(150,205,255,.065)", major: "rgba(150,205,255,.11)", glow: "rgba(5,230,242,.10)" },
    light: { c: ["#0b1236", "#007a99"], w: [.60, .40], ga: [.05, .12], xa: [.16, .30],
             grid: "rgba(11,18,54,.05)", major: "rgba(11,18,54,.085)", glow: "rgba(0,122,153,.06)" }
  };
  function pick(r, w) { var x = r(), i = 0; for (; i < w.length - 1; i++) if ((x -= w[i]) < 0) break; return i; }
  function field(W, H, theme, o) {
    o = o || {}; var P = PAL[theme] || PAL.dark, seed = o.seed || 101, r = rng(seed), cell = o.cell || 54,
        n = Math.max(8, Math.min(o.max || 90, Math.round(W * H / 1.5e6 * (o.density || 60)))), gl = [], xs = [];
    for (var i = 0; i < n; i++) {
      var t = r() < .3 ? T2[r() * T2.length | 0] : T1[r() * T1.length | 0];
      gl.push({ t: t, x: r() * W, y: r() * H, s: 14 + r() * 9 | 0, a: P.ga[0] + r() * (P.ga[1] - P.ga[0]), c: P.c[pick(r, P.w)],
                vx: (r() - .5) * 4, vy: -(3 + r() * 7), ph: r() * 6.28, f: .2 + r() * .5 });
    }
    /* crosshairs: a hash per intersection, so they stay put when the viewport resizes */
    for (var y = 1; y * cell < H; y++) for (var x = 1; x * cell < W; x++) {
      var h = rng(seed ^ Math.imul(x, 73856093) ^ Math.imul(y, 19349663)); h(); if (h() < (o.cross || .07))
        xs.push({ x: x * cell, y: y * cell, a: P.xa[0] + h() * (P.xa[1] - P.xa[0]), c: P.c[pick(h, P.w)] });
    }
    return { g: gl, x: xs, P: P, cell: cell, W: W, H: H };
  }
  function pos(G, t, W, H) { var x = (G.x + G.vx * t) % (W + 80), y = (G.y + G.vy * t) % (H + 80); return [(x < 0 ? x + W + 80 : x) - 40, (y < 0 ? y + H + 80 : y) - 40]; }
  g.CCBG = { field: field, pos: pos, PAL: PAL };
})(self);
