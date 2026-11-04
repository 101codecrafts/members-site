/* Bauhaus shapes (sign-in / sign-up side panel), Neo-Brutalist: a coarse grid of flat quarter discs, half discs, squares
   and triangles in cyan, orange and white, each with a 3 px navy outline and a hard screen-space shadow. On its own
   staggered 12 s cycle each turns +90 deg, holds, +90 deg, holds, swings -180 deg back and holds, every turn with an
   overshoot; the cycle ends where it started, so the loop closes. */
CCL.def("bauhaus", function (x, w, h, t, P) {
  var M = CCL, s = Math.max(90, Math.min(150, w / 4)), r = s * .36, nx = Math.ceil(w / s), ny = Math.ceil(h / s), i, j, n, k, a, p, c, L;
  for (j = 0; j < ny; j++) for (i = 0; i < nx; i++) {
    n = i * 31 + j * 7; k = Math.floor(M.rand(n, 1) * 5); if (k == 4) continue;
    p = M.ph(t, 12, -M.rand(n, 2) * 12);
    a = (M.ob(M.win(p, 0, .1)) + M.ob(M.win(p, .33, .43)) - 2 * M.ob(M.win(p, .66, .78))) * 90 + Math.floor(M.rand(n, 3) * 4) * 90;
    L = new Path2D();
    if (k == 0) { L.moveTo(-r, -r); L.arc(-r, -r, 2 * r, 0, Math.PI / 2); L.closePath(); }
    else if (k == 1) { L.arc(0, 0, r, 0, Math.PI); L.closePath(); }
    else if (k == 2) L.rect(-r * .75, -r * .75, r * 1.5, r * 1.5);
    else { L.moveTo(-r, r); L.lineTo(r, r); L.lineTo(-r, -r); L.closePath(); }
    var G = new Path2D(); G.addPath(L, new DOMMatrix().translate(i * s + s / 2, j * s + s / 2).rotate(a));
    c = M.rand(n, 4); M.bk(x, P, G, c < .22 ? P.c2 : c < .4 ? P.c3 : P.c1, 6);
  }
});
