/* 101 AI voice buttons (round 8): drop-in speaker toggle + mic button for the 101 AI panel. Needs js/ai-voice.js first.
   101 Neo-Brutalist: 2px borders, hard shadows, 44px targets, aria-pressed, light + dark themes, reduced motion.
   AIVoice.ui.speaker({head}) -> <button> | null;  AIVoice.ui.mic({input, onFinal, onError, head, lang}) -> <span> | null */
(function (W) {
  var A = W.AIVoice, d = document, ua = navigator.userAgent, now = Date.now, IOS = /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (!A || A.ui) return;
  function enabled() { return A.enabled(); }
  var CSS = ".aiv-w{position:relative;display:inline-flex}.aiv-w[hidden],.aiv-b[hidden]{display:none}.aiv-b{position:relative;width:44px;height:44px;min-width:44px;display:inline-grid;place-items:center;margin:0;padding:0;cursor:pointer;background:#fff;color:#0B1236;border:2px solid #0B1236;border-radius:0;box-shadow:3px 3px 0 #0B1236;-webkit-tap-highlight-color:transparent;transition:transform .12s,box-shadow .12s}" +
    ".aiv-b svg{width:20px;height:20px;stroke:currentColor;fill:none;stroke-width:2.2;stroke-linecap:square;stroke-linejoin:miter}.aiv-b:hover{transform:translate(-1px,-1px);box-shadow:4px 4px 0 #0B1236}.aiv-b:active{transform:translate(2px,2px);box-shadow:1px 1px 0 #0B1236}" +
    ".aiv-b:focus-visible{outline:3px solid #00b9e6;outline-offset:2px}.aiv-b[aria-pressed=true]{background:#05e6f2;color:#0B1236}" +
    "html[data-theme=dark] .aiv-b{background:#0B1236;color:#F3F5FA;border-color:#E8ECF5;box-shadow:3px 3px 0 #05e6f2}html[data-theme=dark] .aiv-b[aria-pressed=true]{background:#05e6f2;color:#0B1236}" +
    ".aiv-b.aiv-h,html[data-theme=dark] .aiv-b.aiv-h{background:none;color:#fff;border-color:transparent;box-shadow:none;transform:none}.aiv-b.aiv-h:hover{border-color:#05e6f2}.aiv-b.aiv-h[aria-pressed=true]{color:#05e6f2;border-color:#05e6f2}" +
    ".aiv-b.aiv-on,html[data-theme=dark] .aiv-b.aiv-on{background:#fc8c0c;color:#0B1236}.aiv-on::after{content:\"\";position:absolute;inset:-7px;border:2px solid #fc8c0c;pointer-events:none;animation:aivp 1.2s ease-out infinite}" +
    "@keyframes aivp{0%{transform:scale(.86);opacity:1}100%{transform:scale(1.3);opacity:0}}" +
    ".aiv-tip{position:absolute;right:-2px;bottom:calc(100% + 12px);z-index:3;width:max-content;max-width:min(260px,80vw);padding:6px 9px;background:#0B1236;color:#fff;border:2px solid #0B1236;box-shadow:3px 3px 0 #05e6f2;font:600 11px/1.4 var(--font-mono,\"CC Mono\",\"JetBrains Mono\",monospace);letter-spacing:.3px;text-align:left;overflow-wrap:anywhere}" +
    "html[data-theme=dark] .aiv-tip{border-color:#E8ECF5}.aiv-tip b{color:#05e6f2;font-weight:700;letter-spacing:1.5px}" +
    "@media (prefers-reduced-motion:reduce){.aiv-b{transition:none}.aiv-on::after{animation:none;inset:-5px}}html.lite .aiv-on::after{animation:none}";
  function ui() { if (!d.getElementById("aiv-css")) { var s = d.createElement("style"); s.id = "aiv-css"; s.textContent = CSS; d.head.appendChild(s); } }
  function btn(cls, label, svg) { ui(); var b = d.createElement("button"); b.type = "button"; b.className = "aiv-b " + cls; b.setAttribute("aria-label", label); b.title = label; b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + svg + "</svg>"; return b; }
  var SPK = '<path d="M4 9h4l5-4v14l-5-4H4z"/>', WAV = '<path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/>', OFF = '<path d="M16.5 9.5l5 5M21.5 9.5l-5 5"/>';
  A.ui = {
    speaker: function (o) {   // o.head: white-on-navy style for the panel header
      if (!A.supported().tts) return null; o = o || {};
      var b = btn("aiv-spk" + (o.head ? " aiv-h" : ""), "Voice replies", SPK + WAV);
      function sync(on) { b.setAttribute("aria-pressed", String(on)); b.querySelector("svg").innerHTML = SPK + (on ? WAV : OFF); }
      sync(enabled()); A.on("enabled", sync); A.on("tts", function () { b.hidden = true; });
      b.addEventListener("click", function () { A.setEnabled(!enabled()); });
      return b;
    },
    mic: function (o) {   // o.input: textarea for the live transcript; o.onFinal(text): send it; o.head as above
      if (!A.supported().stt) return null; o = o || {};
      var w = d.createElement("span"), b = btn("aiv-mic" + (o.head ? " aiv-h" : ""), "Speak your question", '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8"/>'),
        tip = d.createElement("span"), tt = 0, down = 0, viaPtr = false;
      w.className = "aiv-w"; tip.className = "aiv-tip"; tip.setAttribute("role", "status"); tip.hidden = true; b.setAttribute("aria-pressed", "false"); w.appendChild(b); w.appendChild(tip);
      function show(h, ms) { clearTimeout(tt); tip.hidden = !h; tip.innerHTML = h || ""; if (ms) tt = setTimeout(function () { tip.hidden = true; }, ms); }
      function esc(s) { var x = d.createElement("i"); x.textContent = s; return x.innerHTML; }
      function on(v) { b.classList.toggle("aiv-on", v); b.setAttribute("aria-pressed", String(v)); b.setAttribute("aria-label", v ? "Stop listening" : "Speak your question"); }
      A.on("listen", on); A.on("stt", function () { w.hidden = true; });
      A.on("interim", function (t) { if (A.listening()) { show("<b>LISTENING</b> " + esc(t)); if (o.input) { o.input.value = t; o.input.dispatchEvent(new Event("input", { bubbles: true })); } } });
      function start() {
        show("<b>LISTENING…</b>");
        A.listen(o).then(function (t) { show(""); if (o.input) o.input.value = t; if (o.onFinal) o.onFinal(t); else if (o.input && o.input.form) o.input.form.requestSubmit ? o.input.form.requestSubmit() : o.input.form.submit(); },
          function (e) { if (e.message) show(esc(e.message), 5000); else show(""); if (o.onError) o.onError(e); });
      }
      b.addEventListener("pointerdown", function (e) { if (e.button || IOS || A.listening()) return; down = now(); viaPtr = true; start(); });   // hold to talk: release after a hold sends
      b.addEventListener("pointerup", function () { if (down && now() - down > 450) A.stopListening(); down = 0; });
      b.addEventListener("click", function () { A.unlock(); if (viaPtr) { viaPtr = false; return; } if (A.listening()) A.stopListening(); else start(); });
      return w;
    }
  };
})(window);
