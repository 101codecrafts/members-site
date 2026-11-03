importScripts("field.js", "draw.js");
var D, L, font = new FontFace("CC Mono", "url(../assets/fonts/jetbrains-mono-var.woff2)");
var ready = font.load().then(function (f) { self.fonts.add(f); }).catch(function () {});
onmessage = function (e) { var o = e.data; ready.then(function () {
  if (o.canvas) { D = CCDRAW(o.canvas, { all: false }); L = CCLOOP(D.frame, 30); }
  if (o.rects) D.rects(o.rects);
  if (o.W) { D.setup(o); L.once(); }
  if (o.run === true) L.start(); else if (o.run === false) L.stop();
}); };
