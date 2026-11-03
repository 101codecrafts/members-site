/* shared static layer for every engine: CSS hairline grid (54px, major every 4) + bottom glow, (crosshairs are drawn by the engine so the text guard can dim them).
   Painted once; never repainted by the animation. Engines append their own canvas/spans after it. */
(function () {
  var el = CCH.layer();
  CCH.paintStatic = function () {
    var g = el.querySelector(".ccbg-st") || el.insertBefore(document.createElement("div"), el.firstChild), h = '<div class="ccbg-grid"></div>';
    g.className = "ccbg-st";
    g.innerHTML = h;
  };
  CCH.paintStatic(); CCH.onResize(CCH.paintStatic); CCH.onTheme(CCH.paintStatic);
})();
