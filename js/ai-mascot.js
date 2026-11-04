/* 101 AI mascot: the 101 logo morphs into a little robot and back, with friendly gestures.
   Dependency-free inline SVG + one requestAnimationFrame loop (SVG transforms/geometry only, no layout).
   const m = AIMascot.mount(el, {size: 56, launcher: true, label: "101 AI assistant", shadow: "#022A78", point: "left"});
   m.pin() holds the current shape (no launcher cycle or hover morphs) until toLogo()/toRobot(). A resting logo runs no rAF loop.
   m.toRobot() / m.toLogo() -> Promise   m.gesture(name[, opts]) -> Promise   m.setState(s)   m.setMouth(0..1)   m.destroy()
   Gestures: wave hi5 celebrate pump nod shake shrug think point bow blink hop.  States: idle listening thinking talking sleep.
   Still (no tweens, instant swaps) under prefers-reduced-motion or localStorage.cc_bg_motion = off|reduced. Pauses when the tab is hidden. */
(function (W, D) {
  "use strict";
  var NS = "http://www.w3.org/2000/svg", uid = 0, PI = Math.PI, sin = Math.sin, cos = Math.cos, rnd = Math.random;
  var cl = function (x) { return x < 0 ? 0 : x > 1 ? 1 : x; }, L = function (a, b, t) { return a + (b - a) * t; };
  var seg = function (u, a, b) { return cl((u - a) / (b - a)); };
  var sn = function (t) { return (1 - cos(PI * t)) / 2; };                                        /* sine in-out */
  var io = function (t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(2 - 2 * t, 3) / 2; };     /* cubic in-out */
  var oq = function (t) { return 1 - Math.pow(1 - t, 4); };                                       /* quart out */
  var ob = function (t) { t -= 1; return 1 + 2.4 * t * t * t + 1.4 * t * t; };                     /* back out (soft overshoot) */
  var bump = function (u, a, p, b) { return u <= a || u >= b ? 0 : u < p ? sn((u - a) / (p - a)) : sn((b - u) / (b - p)); };
  var r2 = function (n) { return Math.round(n * 100) / 100; };

  /* Geometry, viewBox 0 0 200 200. Logo traced from the brand mark (square side 84, centred). Body-local coords = logo coords. */
  var SQ = [59.28, 57.66, 84], HOLE = [77.89, 75.76, 46.44, 48.31], SCR = [76.78, 75.16, 49, 49];
  var ONE = [[38.88, 21, 14.17], [175.2, 21.17, 12.46]], OB = 142.34, OL = 84.68, FH = 18.1;   /* "1": pivot x, stem w, flag w */
  var FACE = [   /* logo trapezoid split in three (pieces overlap 0.3 so no seam), then robot rects: cx, cy, w, h */
    [93.94, 88.73, 101.41, 88.73, 101.41, 107.95, 92.08, 107.95], [100.81, 88.73, 108.11, 88.73, 110.1, 107.95, 100.81, 107.95],
    [92.08, 107.65, 110.1, 107.65, 110.67, 113.32, 91.55, 113.32]];
  var EYE = [93.4, 109.1, 92.8, 8.6, 15], MOU = [101.28, 110.9, 12.5, 3.2];
  var TX = -1.28, TY = -17.66, SHL = [57.3, 145.3, 84], AW = 13, AL = 36, REST = 20, K = 1.2, FLOOR = 162;
  var LEGS = [[74.8, -10], [108.4, 10]], LW = 16.8, FW = 26.6, FTH = 9;

  /* Pose channels are additive deltas around the neutral robot. */
  var KEYS = "aL aR lean by sx sy cr hop ex ey es bl mo mw mr fx fy dots ring zz".split(" ");
  var zero = function () { var p = {}; KEYS.forEach(function (k) { p[k] = 0; }); return p; };

  /* Gestures: duration (ms) + keyframes per channel as [t, value, ...] in 0..1; implicit 0 at both ends; eased between keys. */
  var G = {
    wave: [1700, { aR: [.16, -138, .3, -112, .42, -146, .54, -112, .66, -146, .78, -120, .86, -128], lean: [.18, -3, .8, -3], mw: [.15, .4, .85, .4], bl: [.2, .3, .8, .3], cr: [.08, 2, .2, 0], ey: [.2, -1, .8, -1] }],
    hi5: [1500, { cr: [.12, 6, .24, 0, .56, 0, "o", .62, 6, .74, 0], sy: [.12, -.08, .24, .08, .4, 0, .56, .03, "o", .62, -.08, .74, .02, .84, 0], sx: [.12, .06, .24, -.05, .4, 0, .56, -.02, "o", .62, .06, .74, -.01, .84, 0], hop: [.12, 0, "o", .34, -17, "i", .56, 0], aL: [.1, -8, .28, 150, .38, 140, .48, 152, .58, 142, .82, 140], aR: [.1, 8, .28, -150, .38, -140, .48, -152, .58, -142, .82, -140], es: [.2, .22, .8, .22], mo: [.25, .7, .75, .7] }],
    pump: [1500, { aR: [.18, -104, .32, -150, .44, -100, .56, -150, .68, -100, .84, -100], aL: [.2, 6, .8, 6], by: [.32, -2, .44, 1, .56, -2, .68, 1, .8, 0], cr: [.44, 2, .56, 0, .68, 2, .8, 0], mw: [.15, .45, .85, .45], bl: [.2, .35, .85, .35], lean: [.2, 3, .8, 3] }],
    nod: [1100, { fy: [.18, 4, .36, -1.5, .54, 4, .72, -1, .86, 0], ey: [.18, 1.5, .36, -.5, .54, 1.5, .72, 0], by: [.18, .8, .36, 0, .54, .8, .72, 0], sy: [.18, -.025, .36, .01, .54, -.025, .72, 0], mw: [.15, .3, .85, .3] }],
    shake: [1200, { fx: [.14, -3.5, .3, 3.5, .46, -3.5, .62, 3, .78, -1, .9, 0], ex: [.1, -2.5, .26, 2.5, .42, -2.5, .58, 2.5, .74, -1, .86, 0], lean: [.18, 2.5, .34, -2.5, .5, 2.5, .66, -2, .82, .5], mw: [.15, .2, .85, .2], aL: [.2, -4, .8, -4], aR: [.2, 4, .8, 4] }],
    shrug: [1500, { aL: [.22, 64, .3, 58, .72, 58], aR: [.22, -64, .3, -58, .72, -58], by: [.2, -4, .3, -3, .72, -3], mr: [.22, -12, .72, -12], ex: [.22, 2.5, .72, 2.5], ey: [.22, -1.5, .72, -1.5], lean: [.24, 4, .72, 4], bl: [.22, .18, .72, .18], cr: [.08, 2, .2, 0, .78, 2, .9, 0] }],
    think: [2200, { aR: [.2, 52, .3, 46, .8, 46], lean: [.22, -4, .8, -4], ex: [.22, -2, .8, -2], ey: [.18, -4, .8, -4], mr: [.22, 7, .8, 7], dots: [.3, 1, .82, 1], bl: [.5, .15, .54, 1, .58, .15, .8, .15] }],
    point: [1500, { aL: [.2, 92, .27, 80, .34, 84, .78, 84], ex: [.18, -4, .8, -4], lean: [.2, -3, .8, -3], fx: [.2, -1.5, .8, -1.5], mw: [.2, .35, .8, .35], cr: [.06, 2, .18, 0] }],
    bow: [1700, { cr: [.2, 5, .62, 5, .74, -1.5, .84, 0], sy: [.2, -.1, .62, -.1, .74, .03, .84, 0], sx: [.2, .05, .62, .05, .74, -.02, .84, 0], fy: [.24, 6, .62, 6, .76, -1, .86, 0], bl: [.22, 1, .64, 1, .7, 0], aL: [.2, -14, .64, -14, .74, 4, .84, 0], aR: [.2, 14, .64, 14, .74, -4, .84, 0], mw: [.2, .35, .8, .35] }],
    blink: [190, { bl: [.45, 1, .55, 1] }],
    hop: [950, { cr: [.18, 6, .3, -1, .68, 0, "o", .74, 5, .88, 0], sy: [.18, -.08, .3, .09, .46, 0, .68, .03, "o", .74, -.07, .88, .02], sx: [.18, .06, .3, -.05, .46, 0, .68, -.02, "o", .74, .05, .88, 0], hop: [.2, 0, "o", .46, -18, "i", .68, 0], es: [.3, .15, .7, .15], aL: [.3, 22, .55, 10, .78, -6, .9, 0], aR: [.3, -22, .55, -10, .78, 6, .9, 0] }]
  };
  G.celebrate = G.hi5;
  G.point_right = [1500, { aR: [.2, -92, .27, -80, .34, -84, .78, -84], ex: [.18, 4, .8, 4], lean: [.2, 3, .8, 3], fx: [.2, 1.5, .8, 1.5], mw: [.2, .35, .8, .35], cr: [.06, 2, .18, 0] }];
  var FRIENDLY = ["wave", "nod", "hop", "hi5", "pump"];
  var EZ = { i: function (t) { return t * t * t; }, o: function (t) { return 1 - Math.pow(1 - t, 3); } };
  function sample(k, t) {   /* keyframe track at t: implicit (0,0) and (1,0); "i"/"o" before a key = ease-in/out into it (gravity) */
    var px = 0, pv = 0, e = io;
    for (var i = 0; i <= k.length; i += 2) {
      if (typeof k[i] === "string") { e = EZ[k[i]]; i--; continue; }
      var x = i < k.length ? k[i] : 1, v = i < k.length ? k[i + 1] : 0;
      if (t <= x) return L(pv, v, e(x > px ? (t - px) / (x - px) : 1));
      px = x; pv = v; e = io;
    }
    return 0;
  }

  /* State base poses at time t (s). */
  function base(s, t, p, mouthExt) {
    var b = sin(t * 2 * PI / 3.4);
    p.sy += .013 * b; p.by += -.5 * b; p.aL += 2.2 * sin(t * 1.8 - .7); p.aR -= 2.2 * sin(t * 1.8 - .4);
    if (s === "listening") { p.es += .26; p.lean += 4; p.by -= 1.5; p.ring = (t % 1.4) / 1.4; p.mw += .15; p.ey -= .5; }
    else if (s === "thinking") { p.aR += 46 + 3 * sin(t * 3); p.lean -= 4; p.ex -= 2; p.ey -= 4; p.mr += 7; p.dots = 1; }
    else if (s === "talking") { p.mo = mouthExt >= 0 ? mouthExt : cl(.45 + .3 * sin(t * 17) + .25 * sin(t * 29 + 1)); p.aL += 3 * sin(t * 2.6); p.aR -= 4 * sin(t * 2.2 + 1); p.mw += .1; }
    else if (s === "sleep") { var c = sin(t * 2 * PI / 5); p.sy += .02 * c - .013 * b; p.by += 2.2 - .8 * c + .5 * b; p.bl = .92; p.lean += 4; p.aL -= 8; p.aR += 8; p.zz = (t % 2.6) / 2.6; p.mw -= .25; }
    return p;
  }

  function el(tag, at, par) { var e = D.createElementNS(NS, tag); for (var k in at) e.setAttribute(k, at[k]); if (par) par.appendChild(e); return e; }

  function mount(host, o) {
    o = o || {};
    var id = "aim" + (++uid), size = o.size || 56;
    var svg = el("svg", { viewBox: "0 0 200 200", width: size, height: size, role: "img", "aria-label": o.label || "101 AI assistant", focusable: "false", style: "overflow:visible;display:block" });
    el("style", {}, svg).textContent = "." + id + "o{fill:var(--aim-o,#FFA615)}." + id + "c{fill:var(--aim-c,#2BE0DA)}." + id + "n{fill:var(--aim-n,#03103A)}." + id + "s{--aim-o:var(--aim-sh,#022A78);--aim-c:var(--aim-sh,#022A78);--aim-n:var(--aim-sh,#022A78)}";
    if (o.shadow) svg.style.setProperty("--aim-sh", o.shadow);
    var deco = el("g", { "aria-hidden": "true" }, svg);
    var ring = el("circle", { cx: 100, cy: 78, r: 66, fill: "none", stroke: "var(--aim-ring,var(--aim-c,#2BE0DA))", "stroke-width": 3, opacity: 0 }, deco);
    var floor = el("ellipse", { cx: 100, cy: FLOOR + FTH, rx: 0, ry: 5.5, fill: "var(--aim-floor,var(--aim-sh,#022A78))" }, deco);
    var root = el("g", {}, deco);
    var mk = function (par, nm) { var u = el("use", { href: "#" + id + nm, "class": id + "s", visibility: "hidden" }, par); return [u, el("g", { id: id + nm }, par)]; };
    var lg = mk(root, "l"), legs = [], feet = [];
    for (var i = 0; i < 2; i++) { legs.push(el("rect", { "class": id + "o", width: LW, height: 0 }, lg[1])); feet.push(el("rect", { "class": id + "o", height: 0 }, lg[1])); }
    var body = el("g", {}, root), bd = mk(body, "b");
    el("rect", { "class": id + "c", x: SQ[0], y: SQ[1], width: SQ[2], height: SQ[2] }, bd[1]);
    var hole = el("rect", { "class": id + "n" }, bd[1]);
    var trap = el("polygon", { "class": id + "o", points: "93.94,88.73 108.11,88.73 110.67,113.32 91.55,113.32" }, bd[1]);   /* seamless logo underlay */
    var face = FACE.map(function () { return el("polygon", { "class": id + "o" }, bd[1]); });
    var arms = [0, 1].map(function (j) {
      var a = mk(body, "a" + j);
      return { use: a[0], g: a[1], stem: el("rect", { "class": id + "o" }, a[1]), flag: el("rect", { "class": id + "o" }, a[1]) };
    });
    var DOT = [[151, 40, 3.6], [162, 28, 4.8], [176, 14, 6.2]], fx = el("g", {}, root), dots = DOT.map(function (d) { return el("circle", { "class": id + "o", r: d[2] }, fx); });
    var zz = el("path", { d: "M-5-5h10l-10 10h10", fill: "none", stroke: "var(--aim-c,#2BE0DA)", "stroke-width": 2.6, "stroke-linejoin": "round", "stroke-linecap": "round", opacity: 0 }, root);
    host.appendChild(svg);

    /* ---- state ---- */
    var u = o.robot ? 1 : 0, mt = null, st = "idle", prevSt = "idle", stT = 9, clock = 0, last = 0, raf = 0, dead = false;
    var frozen = false, gq = [], gNow = null, mouthExt = -1, mouthAt = -9, lag = 0, lagV = 0, prevBy = 0;
    var nextBlink = 2 + rnd() * 3, nextLook = 5 + rnd() * 4, look = null, nextFriendly = 12 + rnd() * 8, pinned = !!o.robot, busy = false, hovering = false, ct = 0;
    var mq = W.matchMedia ? W.matchMedia("(prefers-reduced-motion: reduce)") : null;
    var still = function () { var m = ""; try { m = W.localStorage.cc_bg_motion || ""; } catch (e) {} return !!(mq && mq.matches) || m === "off" || m === "reduced"; };
    var STILL = still();

    function pose() {
      var p = zero(), t = clock;
      base(st, t, p, -1);
      if (stT < .35 && prevSt !== st) {   /* blend from the previous state's pose */
        var q = base(prevSt, t, zero(), -1), k = sn(stT / .35);
        KEYS.forEach(function (c) { p[c] = L(q[c], p[c], k); });
      }
      if (gNow) {
        var g = G[gNow.n], tt = cl(gNow.t / g[0]), env = sn(seg(tt, 0, .15)) * sn(seg(1 - tt, 0, .15)), q2 = base("idle", t, zero(), -1);
        KEYS.forEach(function (c) { p[c] = L(p[c], q2[c], c === "mo" && st === "talking" ? 0 : env); var k2 = g[1][c]; if (k2) p[c] += sample(k2, tt); });
      }
      if (look) { var lt = cl(look.t / 1.6), e2 = sn(seg(lt, 0, .2)) * sn(seg(1 - lt, 0, .2)); p.ex += look.x * e2; p.ey += look.y * e2; }
      if (blinkT >= 0) p.bl = Math.max(p.bl, 1 - Math.abs(blinkT / .09 - 1));
      if (t - mouthAt < .3) p.mo = mouthExt;   /* external lip-sync wins, unblended */
      p.aL += lag; p.aR -= lag;
      return p;
    }
    var blinkT = -1;

    function quad(cx, cy, w, h, r) {
      var c = cos(r * PI / 180), s = sin(r * PI / 180), out = [];
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (q) { var x = q[0] * w / 2, y = q[1] * h / 2; out.push(cx + x * c - y * s, cy + x * s + y * c); });
      return out;
    }
    function render(p) {
      var cb = ob(seg(u, .1, .66)), cg = oq(seg(u, .3, .74)), cf = ob(seg(u, .32, .86)), cs = io(seg(u, .45, 1));
      var an = bump(u, 0, .07, .2), ld = bump(u, .66, .8, .98);
      var k = L(1, K, io(seg(u, .1, .66)));
      root.setAttribute("transform", "translate(100 106) scale(" + r2(k) + ") translate(-100 " + r2(-106 + p.hop * u) + ")");
      var cr = (p.cr + 5 * ld) * u, ty = TY * cb + (p.by * u) + cr, tx = TX * cb;
      var sx = 1 + p.sx * u + .05 * an + .045 * ld, sy = 1 + p.sy * u - .08 * an - .06 * ld, bx = SQ[0] + 42;
      body.setAttribute("transform", "translate(" + r2(tx + bx) + " " + r2(ty + OB) + ") rotate(" + r2(p.lean * u) + ") scale(" + r2(sx * 1e3) / 1e3 + " " + r2(sy * 1e3) / 1e3 + ") translate(" + -bx + " " + -OB + ")");
      var d = r2(3.6 * cs);
      [lg[0], bd[0], arms[0].use, arms[1].use].forEach(function (s) { s.setAttribute("x", d); s.setAttribute("y", d); s.setAttribute("visibility", d > .05 ? "visible" : "hidden"); });
      /* legs: grow from under the square down to the floor */
      var top = OB + ty - 12 * cg;
      for (var i = 0; i < 2; i++) {
        var lh = Math.max(0, (FLOOR - top) * cg), fh = FTH * cl(cg * 1.4), lx = LEGS[i][0] + tx;
        legs[i].setAttribute("x", r2(lx)); legs[i].setAttribute("y", r2(top)); legs[i].setAttribute("height", r2(lh));
        var fw = L(LW, FW, cl(cg * 1.2)); feet[i].setAttribute("x", r2(LEGS[i][1] < 0 ? lx + LW - fw : lx)); feet[i].setAttribute("width", r2(fw));
        feet[i].setAttribute("y", r2(top + lh - fh * (1 - cg))); feet[i].setAttribute("height", r2(fh));
      }
      floor.setAttribute("rx", r2(46 * cs * (1 + p.hop / 60)));
      floor.setAttribute("opacity", r2(.85 * cs * (1 + p.hop / 50)));
      /* face screen */
      var h = HOLE, sc = SCR;
      hole.setAttribute("x", r2(L(h[0], sc[0], cf))); hole.setAttribute("y", r2(L(h[1], sc[1], cf)));
      hole.setAttribute("width", r2(L(h[2], sc[2], cf))); hole.setAttribute("height", r2(L(h[3], sc[3], cf)));
      var fxo = p.fx, fyo = p.fy, es = 1 + p.es, eh = EYE[4] * es * (1 - .9 * cl(p.bl)), mw = MOU[2] * (1 + p.mw) * (1 - .22 * p.mo), mh = MOU[3] + 6.5 * p.mo;
      var tg = [quad(EYE[0] + fxo + p.ex, EYE[2] + fyo + p.ey, EYE[3] * es, eh, 0), quad(EYE[1] + fxo + p.ex, EYE[2] + fyo + p.ey, EYE[3] * es, eh, 0),
        quad(MOU[0] + fxo + p.ex * .5, MOU[1] + fyo + p.ey * .4, mw, mh, p.mr)];
      trap.setAttribute("visibility", cf > 0 ? "hidden" : "visible");
      for (i = 0; i < 3; i++) {
        var s0 = FACE[i], pts = [];
        for (var j = 0; j < 8; j += 2) pts.push(r2(L(s0[j], tg[i][j], cf)) + "," + r2(L(s0[j + 1], tg[i][j + 1], cf)));
        face[i].setAttribute("points", pts.join(" "));
      }
      /* the two 1s rotate into the arms */
      for (i = 0; i < 2; i++) {
        var A = arms[i], on = ONE[i], sg = i ? -1 : 1, ar = ob(seg(u, .04, .7)), al = oq(seg(u, .02, .4)), pm = oq(seg(u, .02, .34));
        var ang = L(180, 180 - sg * (180 - REST), ar) + (i ? p.aR : p.aL) * u;
        var px = L(on[0], SHL[i], pm), py = L(OB, SHL[2], pm);
        var w = L(on[1], AW, al), len = L(OL, AL, al), fw2 = on[2] * (1 - io(seg(u, .03, .36)));
        A.g.setAttribute("transform", "translate(" + r2(px) + " " + r2(py) + ") rotate(" + r2(ang) + ")");
        A.stem.setAttribute("x", r2(-w / 2)); A.stem.setAttribute("width", r2(w)); A.stem.setAttribute("height", r2(len));
        A.flag.setAttribute("x", r2(w / 2 - .3)); A.flag.setAttribute("y", r2(len - FH)); A.flag.setAttribute("width", r2(fw2 > .05 ? fw2 + .3 : 0)); A.flag.setAttribute("height", FH);
      }
      /* effects */
      for (i = 0; i < 3; i++) dots[i].setAttribute("transform", "translate(" + DOT[i][0] + " " + r2(DOT[i][1] - (STILL ? 0 : 2.4 * sin(clock * 4 - i * .9))) + ") scale(" + r2(ob(cl(p.dots * 3.2 - i * 1.1)) * (u > .9 ? 1 : 0)) + ")");
      ring.setAttribute("opacity", r2(p.ring ? (1 - p.ring) * .8 * u : 0));
      ring.setAttribute("transform", "translate(100 78) scale(" + r2(.8 + .35 * p.ring) + ") translate(-100 -78)");
      zz.setAttribute("opacity", r2(p.zz ? sn(seg(p.zz, 0, .25)) * (1 - seg(p.zz, .6, 1)) * u : 0));
      zz.setAttribute("transform", "translate(" + r2(150 + 10 * p.zz) + " " + r2(46 - 26 * p.zz) + ") scale(" + r2(.7 + .5 * p.zz) + ")");
    }

    function frame(now) {
      raf = 0; if (dead || frozen) return;
      var dt = Math.min(.05, last ? (now - last) / 1e3 : .016); last = now;
      clock += dt; stT += dt;
      if (mt) { mt.t += dt; var k = cl(mt.t / mt.d); u = L(mt.a, mt.b, sn(k)); if (k >= 1) { var r = mt.res; mt = null; r(true); } }
      if (gNow) { gNow.t += dt * 1e3; if (gNow.t >= G[gNow.n][0]) { var rr = gNow.res; gNow = null; rr(true); } }
      if (!gNow && gq.length && !mt && u === 1) { gNow = gq.shift(); gNow.t = 0; }
      if (blinkT >= 0) { blinkT += dt; if (blinkT > .18) blinkT = -1; }
      if (look) { look.t += dt; if (look.t > 1.6) look = null; }
      if (u === 1 && !mt) {   /* idle life */
        if (clock > nextBlink) { if (st !== "sleep") blinkT = 0; nextBlink = clock + 2.2 + rnd() * 4 + (rnd() < .2 ? -1.8 : 0); }
        if (st === "idle" && !gNow) {
          if (clock > nextLook) { var sd = rnd() < .5 ? -1 : 1; look = { t: 0, x: 3.5 * sd, y: rnd() * 2 - 1.5 }; nextLook = clock + 6 + rnd() * 5; }
          if (clock > nextFriendly && !o.launcher) { run(FRIENDLY[(rnd() * FRIENDLY.length) | 0]); nextFriendly = clock + 12 + rnd() * 8; }
        }
      }
      var p = pose();
      var vy = (p.hop + p.by + p.cr) - prevBy; prevBy = p.hop + p.by + p.cr;   /* arms drag behind vertical motion (overlap) */
      lagV += (-vy * 6 - lag) * 60 * dt; lagV *= Math.pow(.02, dt); lag += lagV * dt * 10; lag = Math.max(-14, Math.min(14, lag));
      render(p);
      if (u > 0 || mt || gNow || gq.length || blinkT >= 0) kick(); else last = 0;   /* resting logo: the loop sleeps (no rAF) */
    }
    function arm() { clearTimeout(ct); if (o.launcher && !dead) ct = setTimeout(function () { if (D.hidden || pinned || busy) arm(); else cycle(); }, 25e3); }
    function kick() { if (!raf && !dead && !STILL && !D.hidden) raf = W.requestAnimationFrame(frame); }
    function paint() { if (STILL) { var p = zero(); base(st, 0, p, mouthExt >= 0 ? mouthExt : -1); if (st === "talking") p.mo = mouthExt >= 0 ? mouthExt : 0; p.ring = st === "listening" ? .25 : 0; p.zz = st === "sleep" ? .4 : 0; p.sy = 0; p.by = st === "sleep" ? 2 : st === "listening" ? -1.5 : 0; p.aL -= 2.2 * sin(-.7); p.aR += 2.2 * sin(-.4); render(p); } else kick(); }

    function morph(b) {
      if (mt) { mt.res(false); mt = null; }
      return new Promise(function (res) {
        if (STILL || u === b) { u = b; paint(); return res(true); }
        var d = (b ? 1100 : 900) * Math.abs(b - u);
        mt = { a: u, b: b, t: 0, d: d / 1e3, res: res }; if (b) { nextBlink = clock + d / 1e3 + .25; } kick();
      });
    }
    function run(n, opt) {
      if (n === "point" && ((opt && opt.dir) || o.point) === "right") n = "point_right";
      if (!G[n]) return Promise.reject(new Error("AIMascot: unknown gesture " + n));
      if (STILL) return Promise.resolve(false);
      if (n === "blink") { blinkT = 0; kick(); return new Promise(function (r) { setTimeout(r, 190); }); }
      return new Promise(function (res) { if (gq.length > 1) gq.shift().res(false); gq.push({ n: n, res: res }); if (u < 1 && !mt) morph(1); kick(); });
    }
    function cycle() {
      if (STILL || busy || pinned) return;
      busy = true;
      morph(1).then(function (ok) { return ok && !pinned ? run(FRIENDLY[(rnd() * FRIENDLY.length) | 0]) : 0; })
        .then(function () { return pinned || hovering ? 0 : morph(0); }).then(function () { busy = false; arm(); });
    }
    var enter = function () { hovering = true; if (pinned) return; if (STILL) { u = 1; paint(); } else cycle(); };
    var leave = function () { hovering = false; if (pinned) return; if (STILL) { u = 0; paint(); } else if (!busy) morph(0); };
    var trig = o.trigger || host;
    if (o.launcher) { trig.addEventListener("pointerenter", enter); trig.addEventListener("focusin", enter); trig.addEventListener("pointerleave", leave); trig.addEventListener("focusout", leave); }
    var vis = function () { last = 0; if (!D.hidden) kick(); };
    var chg = function () { var s = still(); if (s !== STILL) { STILL = s; if (s) { mt && (u = mt.b, mt.res(true), mt = null); gq.forEach(function (g) { g.res(false); }); gq = []; gNow && gNow.res(false); gNow = null; look = null; blinkT = -1; } paint(); } };
    var sto = function (e) { if (!e || e.key === "cc_bg_motion") chg(); };
    D.addEventListener("visibilitychange", vis); W.addEventListener("storage", sto);
    if (mq) mq.addEventListener ? mq.addEventListener("change", chg) : mq.addListener(chg);
    paint(); arm();

    return {
      el: svg,
      toRobot: function () { pinned = true; return morph(1); },
      toLogo: function () { pinned = false; gq.forEach(function (g) { g.res(false); }); gq = []; if (gNow) { gNow.res(false); gNow = null; } arm(); return morph(0); },
      pin: function () { pinned = true; return this; },   /* hold the current shape: no launcher cycling or hover morphs */
      gesture: run,
      setState: function (s) { if (s !== st && /^(idle|listening|thinking|talking|sleep)$/.test(s)) { prevSt = st; st = s; stT = 0; if (s === "talking") mouthAt = -9; paint(); } return this; },
      setMouth: function (v) { mouthExt = cl(+v || 0); mouthAt = clock; if (STILL) paint(); return this; },
      setSize: function (n) { size = n; svg.setAttribute("width", n); svg.setAttribute("height", n); return this; },
      refreshMotion: chg,
      _seek: function (uu, n, ms, s, c) { frozen = true; u = uu; gNow = n ? { n: n, t: ms || 0, res: function () {} } : null; if (s) st = prevSt = s; stT = 9; clock = c || 0; blinkT = -1; look = null; lag = 0; render(pose()); },
      destroy: function () {
        dead = true; clearTimeout(ct); if (raf) W.cancelAnimationFrame(raf); D.removeEventListener("visibilitychange", vis); W.removeEventListener("storage", sto);
        if (mq) mq.removeEventListener ? mq.removeEventListener("change", chg) : mq.removeListener(chg);
        if (o.launcher) { trig.removeEventListener("pointerenter", enter); trig.removeEventListener("focusin", enter); trig.removeEventListener("pointerleave", leave); trig.removeEventListener("focusout", leave); }
        if (mt) mt.res(false); gq.forEach(function (g) { g.res(false); }); if (gNow) gNow.res(false); svg.remove();
      }
    };
  }
  W.AIMascot = { mount: mount, gestures: Object.keys(G).filter(function (n) { return n !== "point_right"; }), states: ["idle", "listening", "thinking", "talking", "sleep"] };
})(window, document);
