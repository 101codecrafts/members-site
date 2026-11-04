/* Isometric cubes (404 page), Neo-Brutalist: a sparse field of flat-shaded cubes (top cyan or orange, left white, right
   navy) with thick navy outlines on isometric lattice nodes. On staggered 6 s beats a cube springs up (overshoot), holds,
   drops and bounces once; its hard shadow stays on the floor, so the lift reads. */
CCL.def("cubes", function (x, w, h, t, P) {
  var M = CCL, s = w < 700 ? 26 : 34, dx = s * .866, N = Math.max(8, Math.min(16, Math.round(w * h / 52000))), C = [], n, i;
  for (n = 0; n < N; n++) {
    var ci = Math.round((M.rand(n, 1) * .92 + .04) * w / dx), cx = ci * dx, cy = Math.round((M.rand(n, 2) * .84 + .08) * h / s) * s + (ci & 1) * s / 2;
    var p = M.ph(t, 6, -n * .75), up = M.ob(M.win(p, .06, .2)) * (1 - Math.pow(M.win(p, .5, .6), 2)), bo = Math.sin(Math.PI * M.win(p, .6, .7)) * .18;
    C.push([cy, cx, (up + bo) * s * 1.1, n]);
  }
  C.sort(function (a, b) { return a[0] - b[0]; });
  x.lineJoin = "miter"; x.lineWidth = 3;
  for (i = 0; i < C.length; i++) {
    var cy = C[i][0], cx = C[i][1], L = C[i][2], y = cy - L, f = new Path2D(), top = new Path2D(), lf = new Path2D(), rt = new Path2D();
    f.moveTo(cx, cy - s); f.lineTo(cx + dx, cy - s / 2); f.lineTo(cx + dx, cy + s / 2); f.lineTo(cx, cy + s); f.lineTo(cx - dx, cy + s / 2); f.lineTo(cx - dx, cy - s / 2); f.closePath();
    x.translate(5, 5); x.fillStyle = P.ol; x.fill(f); x.translate(-5, -5);           /* floor shadow, stays put */
    top.moveTo(cx, y - s); top.lineTo(cx + dx, y - s / 2); top.lineTo(cx, y); top.lineTo(cx - dx, y - s / 2); top.closePath();
    lf.moveTo(cx - dx, y - s / 2); lf.lineTo(cx, y); lf.lineTo(cx, y + s); lf.lineTo(cx - dx, y + s / 2); lf.closePath();
    rt.moveTo(cx + dx, y - s / 2); rt.lineTo(cx, y); rt.lineTo(cx, y + s); rt.lineTo(cx + dx, y + s / 2); rt.closePath();
    x.fillStyle = C[i][3] % 4 ? P.c1 : P.c2; x.fill(top); x.fillStyle = P.c3; x.fill(lf); x.fillStyle = P.ol; x.fill(rt);
    x.strokeStyle = P.ol; x.stroke(top); x.stroke(lf); x.stroke(rt);
  }
});
