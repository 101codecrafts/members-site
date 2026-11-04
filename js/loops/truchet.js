/* Truchet arcs (WhatsApp community band), Neo-Brutalist: thick arcs with a navy outline and a hard shadow. After Scenario Motion Loops; notes in docs/loops.md */
CCL.def("truchet", function (x, w, h, t, P) {
  var M = CCL, s = Math.max(44, Math.min(64, h / 2.6)), r = s / 2, nx = Math.ceil(w / s), ny = Math.ceil(h / s), i, j, a, cx, cy, n, D, c, b, ox, oy, q;
  for (q = 0; q < 2; q++) {
    var p = new Path2D();
    for (j = 0; j < ny; j++) for (i = 0; i < nx; i++) {
      n = j * 97 + i; if ((M.rand(n, 3) < .1) != !!q) continue;
      D = (i / nx) * 2.4 + j * .35;
      a = (Math.floor((t - D) / 6) + (M.rand(n, 1) < .5 ? 1 : 0) + M.ob(M.win(M.ph(t, 6, -D), .55, .7))) * Math.PI / 2;
      cx = i * s + r; cy = j * s + r;
      for (c = 0; c < 2; c++) {
        b = a + c * Math.PI; ox = cx + Math.SQRT2 * r * Math.cos(b - Math.PI * .75); oy = cy + Math.SQRT2 * r * Math.sin(b - Math.PI * .75);
        p.moveTo(ox + r * Math.cos(b), oy + r * Math.sin(b)); p.arc(ox, oy, r, b, b + Math.PI / 2);
      }
    }
    M.bl(x, P, p, q ? P.c2 : P.c1, 5);
  }
});
