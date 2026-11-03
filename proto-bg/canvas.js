/* engine 1: Canvas 2D on requestAnimationFrame (main thread), 30fps, DPR-aware (capped at 2), glyphs only */
(function () {
  var el = CCH.layer(), cv = document.createElement("canvas"); el.appendChild(cv);
  var D = CCDRAW(cv, { all: false }), L = CCLOOP(D.frame, CCH.fps()), red = CCH.reduced();
  function setup() { D.setup({ W: innerWidth, H: innerHeight, dpr: CCH.dpr(), theme: CCH.theme() }); L.once(); }
  (document.fonts ? document.fonts.load('16px "CC Mono"') : Promise.resolve()).then(function () { setup(); if (!red) L.start(); });
  CCH.guard(D.rects);
  CCH.onResize(setup); CCH.onTheme(setup);
  CCH.onPause(el, function (p) { if (red) return; p ? L.stop() : L.start(); });
})();
