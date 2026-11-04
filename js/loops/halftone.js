/* Block halftone (stats strip), Neo-Brutalist: a screen of chunky square blocks whose size snaps between three steps
   (none, small, big) as two travelling waves (6 s and 12 s) pass; big blocks cyan, small ones white, all with a navy
   outline and a hard shadow. The steps make every change a snap; between snaps the blocks hold. */
CCL.def("halftone", function (x, w, h, t, P) {
  var M = CCL, s = w < 700 ? 36 : 46, nx = Math.ceil(w / s), ny = Math.ceil(h / s), i, j, v, r, k = M.TAU / 6 * t, k2 = M.TAU / 12 * t, A = new Path2D(), B = new Path2D();
  for (j = 0; j < ny; j++) for (i = 0; i < nx; i++) {
    v = .55 * Math.sin(k - i * .32 - j * .5) + .45 * Math.sin(k2 + i * .11 - j * .23 + 1);
    if (v < .45) continue;
    r = v > .78 ? s * .36 : s * .2;
    (v > .78 ? A : B).rect(Math.round(i * s + s / 2 - r), Math.round(j * s + s / 2 - r), Math.round(2 * r), Math.round(2 * r));
  }
  M.bk(x, P, B, P.c3, 3); M.bk(x, P, A, P.c1, 4);
});
