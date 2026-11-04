/* mascot.html demo controls (internal, noindex) */
(function () {
  "use strict";
  var $ = function (s) { return document.querySelector(s); };
  var ms = [AIMascot.mount($("#mx-a"), { size: 140 }), AIMascot.mount($("#mx-b"), { size: 140 })];
  var all = function (f) { return Promise.all(ms.map(f)); };
  ms.forEach(function (m) { m.el.setAttribute("aria-label", "101 AI mascot"); });
  window.mascots = ms;
  window.launcher = AIMascot.mount($("#mx-launch"), { size: 56, launcher: true });
  document.querySelectorAll("[data-do]").forEach(function (b) { b.onclick = function () { all(function (m) { return m[b.dataset.do](); }); }; });
  var mk = function (par, label, fn, pressed) { var b = document.createElement("button"); b.type = "button"; b.textContent = label; if (pressed != null) b.setAttribute("aria-pressed", pressed); b.onclick = function () { fn(b); }; par.appendChild(b); return b; };
  var names = { wave: "Wave", hi5: "Hi-five / celebrate", pump: "Arm pump", nod: "Nod yes", shake: "Shake no", shrug: "Shrug", think: "Think", point: "Point to chat", bow: "Bow / thanks", blink: "Blink", hop: "Hop" };
  Object.keys(names).forEach(function (n) { mk($("#mx-gest"), names[n], function () { all(function (m) { return m.gesture(n); }); }); });
  mk($("#mx-gest"), "Point right", function () { all(function (m) { return m.gesture("point", { dir: "right" }); }); });
  var sb = [];
  AIMascot.states.forEach(function (s) {
    sb.push(mk($("#mx-state"), s[0].toUpperCase() + s.slice(1), function (b) { sb.forEach(function (x) { x.setAttribute("aria-pressed", x === b); }); all(function (m) { return m.toRobot().then(function () { m.setState(s); }); }); }, s === "idle"));
  });
  $("#mx-mouth").oninput = function (e) { ms.forEach(function (m) { m.setMouth(e.target.value); }); };
  document.querySelectorAll("[data-size]").forEach(function (b) { b.onclick = function () { document.querySelectorAll("[data-size]").forEach(function (x) { x.setAttribute("aria-pressed", x === b); }); ms.forEach(function (m) { m.setSize(+b.dataset.size); }); }; });
})();
