/* Contour terraces (inner-page headers). Scenario's contour lines, made Neo-Brutalist: the contour of a hill drawn as a
   terrace of flat bars (heights snapped to 10 px steps) on the right half of the header only, navy outlines and hard
   shadows; the hill jumps between three spots on a 12 s cycle (overshoot, hold), its top bar orange. */
CCL.def("contour", function (x, w, h, t, P) {
  var M = CCL, x0 = Math.round(w * .5), cw = w < 700 ? 18 : 26, p = M.ph(t, 12), n = Math.ceil((w - x0) / cw), i, X, H, best = -1, bi = 0, A = new Path2D(), T = new Path2D(), hs = [];
  var hx = x0 + (w - x0) * (.3 + .4 * M.ob(M.win(p, 0, .1)) - .25 * M.ob(M.win(p, .33, .43)) - .15 * M.ob(M.win(p, .66, .76))), hw = Math.max(70, (w - x0) * .22);
  for (i = 0; i < n; i++) {
    X = x0 + i * cw; H = Math.floor(h * .78 * Math.exp(-Math.pow((X + cw / 2 - hx) / hw, 2)) / 10) * 10;
    hs.push(H); if (H > best) { best = H; bi = i; }
  }
  for (i = 0; i < n; i++) if (hs[i] > 0) (i == bi ? T : A).rect(x0 + i * cw, h - hs[i], cw, hs[i] + 4);
  M.bk(x, P, A, P.c1, 4); M.bk(x, P, T, P.c2, 4);
});
