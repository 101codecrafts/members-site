/* engine 2: OffscreenCanvas in a dedicated Worker (same painter as engine 1); main thread only forwards resize/theme/pause.
   Fallback: no transferControlToOffscreen or Worker -> load canvas.js (main thread). */
(function () {
  var el = CCH.layer(), cv = document.createElement("canvas");
  if (!cv.transferControlToOffscreen || !window.Worker || /[?&]noworker/.test(location.search)) { var s = document.createElement("script"); s.src = "/proto-bg/canvas.js"; document.head.appendChild(s); return; }
  el.appendChild(cv);
  var off = cv.transferControlToOffscreen(), w = new Worker("/proto-bg/worker-thread.js"), red = CCH.reduced();
  var msg = function () { return { W: innerWidth, H: innerHeight, dpr: CCH.dpr(), theme: CCH.theme(), run: !red }; };
  var m = msg(); m.canvas = off; w.postMessage(m, [off]);
  CCH.guard(function (r) { w.postMessage({ rects: r }); });
  var up = function () { w.postMessage(msg()); }; CCH.onResize(up); CCH.onTheme(up);
  CCH.onPause(el, function (p) { if (!red) w.postMessage({ run: !p }); });
})();
