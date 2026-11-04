/* Frame tunnel (final CTA band). Scenario's grid-tunnel idea, made Neo-Brutalist: nested square-cornered frames with thick
   navy-outlined strokes and hard shadows snap one frame outward every 1.5 s (overshoot, then hold), 8 snaps per 12 s;
   every 4th frame is orange and keeps its colour as it travels; a solid orange block marks the vanishing point. */
CCL.def("tunnel", function (x, w, h, t, P) {
  var M = CCL, cyc = Math.floor(t / 1.5), e = M.ob(M.win(M.ph(t, 1.5), 0, .3)), cx = w * .9, cy = h * .5, k, z, p1 = new Path2D(), p2 = new Path2D();
  for (k = 9; k >= 0; k--) {
    z = 8 * Math.pow(1.55, k + e);
    if (z * 1.7 > w * 2.4) continue;
    (((k - cyc) % 4 + 4) % 4 ? p1 : p2).rect(Math.round(cx - z * .85), Math.round(cy - z / 2), Math.round(z * 1.7), Math.round(z));
  }
  M.bl(x, P, p1, P.c1, 4); M.bl(x, P, p2, P.c2, 4);
  var b = new Path2D(); b.rect(Math.round(cx - 7), Math.round(cy - 7), 14, 14); M.bk(x, P, b, P.c2, 4);
});
