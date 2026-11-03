/* engine 4: DOM spans driven by the Web Animations API. JS computes each glyph's drift (own speed/direction) and breathing,
   el.animate() hands transform+opacity to the compositor, so no per-frame JS. */
(function () {
  var el = CCH.layer(), box = document.createElement("div"), anims = [], red = CCH.reduced();
  box.style.cssText = "position:absolute;inset:0"; el.appendChild(box);
  function build() {
    anims.forEach(function (a) { a.cancel(); }); anims = [];
    var W = innerWidth, H = innerHeight, F = CCBG.field(W, H, CCH.theme()), fr = document.createDocumentFragment(); box.textContent = "";
    F.g.forEach(function (G) {
      var s = document.createElement("span"); s.textContent = G.t;
      s.style.cssText = "position:absolute;left:0;top:0;font:" + G.s + 'px/1 "CC Mono",monospace;white-space:pre;color:' + G.c + ";opacity:" + G.a.toFixed(3);
      fr.appendChild(s);
      var dur = (H + 80) / -G.vy, x0 = G.x, dx = G.vx * dur, ph = ((H + 40 - G.y) / -G.vy) % dur;   // one full pass bottom->top
      var p = CCBG.pos(G, 0, W, H);
      if (red) { s.style.transform = "translate(" + p[0].toFixed(1) + "px," + p[1].toFixed(1) + "px)"; return; }
      anims.push(s.animate([{ transform: "translate(" + x0.toFixed(1) + "px," + (H + 40) + "px)" }, { transform: "translate(" + (x0 + dx).toFixed(1) + "px,-40px)" }],
        { duration: dur * 1000, iterations: Infinity, delay: -ph * 1000, easing: "linear" }));
      anims.push(s.animate([{ opacity: G.a * .5 }, { opacity: G.a }], { duration: 6283 / G.f / 2, iterations: Infinity, direction: "alternate", easing: "ease-in-out", delay: -G.ph * 1000 / G.f, composite: "replace" }));
    });
    F.x.forEach(function (X) { var i = document.createElement("i"); i.className = "ccbg-x"; i.style.cssText = "left:" + X.x + "px;top:" + X.y + "px;color:" + X.c + ";opacity:" + X.a.toFixed(2); fr.appendChild(i); });
    box.appendChild(fr);
  }
  (document.fonts ? document.fonts.load('16px "CC Mono"') : Promise.resolve()).then(build);
  /* text guard for DOM: the compositor owns each glyph's position, so JS cannot dim one glyph; instead cut holes in the layer with a mask */
  CCH.guard(function (r) { var m = ["linear-gradient(#000,#000)"].concat(r.map(function (q) { return "linear-gradient(#000,#000) " + (q[0] - 6).toFixed(0) + "px " + (q[1] - 6).toFixed(0) + "px/" + (q[2] + 12).toFixed(0) + "px " + (q[3] + 12).toFixed(0) + "px no-repeat"; })).join(",");
    box.style.webkitMask = box.style.mask = r.length ? m : ""; box.style.webkitMaskComposite = "xor"; box.style.maskComposite = "exclude"; });
  CCH.onResize(build); CCH.onTheme(build);
  CCH.onPause(el, function (p) { anims.forEach(function (a) { p ? a.pause() : a.play(); }); });
})();
