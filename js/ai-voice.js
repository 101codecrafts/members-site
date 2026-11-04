/* 101 AI voice (round 8): free browser speech for the floating assistant. No API, no cost, no dependencies.
   Talk back: speechSynthesis, best natural English voice, sentence-by-sentence while a reply streams, markdown/links/emoji
   stripped, <=180-char chunks + Chrome keep-alive, pause/resume, events + a 0..1 mouth level for a mascot.
   Listen: (webkit)SpeechRecognition, interim + final transcript, friendly errors, hidden where unsupported.
   Voice replies setting: localStorage.cc_ai_voice "1"/"0" (unset = Off until the speaker or the mic is used).
   Global mute: localStorage.cc_mute "1", <html data-mute> or window.CC_MUTE. Buttons: js/ai-voice-ui.js. API: docs/ai-voice.md */
(function (W) {
  if (W.AIVoice) return;
  var d = document, html = d.documentElement, SS = W.speechSynthesis, UT = W.SpeechSynthesisUtterance,
    SR = W.SpeechRecognition || W.webkitSpeechRecognition, ua = navigator.userAgent, LS = {}, KEY = "cc_ai_voice", MAX = 180,
    KEEP = /Chrome\//.test(ua) && !/Android|Edg\//.test(ua), A = {}, H = {}, now = function () { return Date.now(); };
  try { LS = localStorage; } catch (e) {}
  function emit(t, a) { (H[t] || []).slice().forEach(function (f) { try { f(a); } catch (e) { setTimeout(function () { throw e; }); } }); if (typeof A["on" + t] == "function") A["on" + t](a); }
  function get(k) { try { return LS[k]; } catch (e) {} }
  function put(k, v) { try { LS[k] = v; } catch (e) {} }

  /* ---------- voices ---------- */
  var voice = null, voices = [], badVoice = false, rate = 1, sp = 1;
  function score(v) {
    var n = v.name, l = (v.lang || "").replace("_", "-").toLowerCase(), s = l == "en-gb" ? 12 : l == "en-us" ? 10 : /^en/.test(l) ? 4 : -999;
    if (/natural/i.test(n)) s += 60; else if (/neural|premium|enhanced/i.test(n)) s += 45;
    if (/google/i.test(n)) s += 30; else if (/microsoft/i.test(n)) s += 15;
    if (!v.localService) s += 4;
    if (/samantha|daniel|serena|karen|moira|tessa|libby|sonia|ryan|aria|jenny|guy|martha|arthur/i.test(n)) s += 8;
    if (/espeak|compact|albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|fred|junior|ralph|kathy|eddy|flo|grandma|grandpa|reed|rocko|sandy|shelley/i.test(n)) s -= 50;
    return s + (v["default"] ? 2 : 0);
  }
  function load() {
    if (!SS) return; voices = (SS.getVoices() || []).filter(function (v) { return score(v) > 0; }).sort(function (a, b) { return score(b) - score(a); });
    var want = get(KEY + "_name"); voice = voices.filter(function (v) { return v.name == want; })[0] || voices[0] || null; return voices.length;
  }
  if (SS) {
    load(); if (SS.addEventListener) SS.addEventListener("voiceschanged", load); else SS.onvoiceschanged = load;
    for (var i = 1; i <= 20; i++) setTimeout(function () { if (!voices.length) load(); }, i * 250);   // Android / Safari: voiceschanged can be late or never fire
  }

  /* ---------- text: markdown -> speakable ---------- */
  var EMO; try { EMO = new RegExp("[\\p{Extended_Pictographic}\\u{1F1E6}-\\u{1F1FF}\\u{1F3FB}-\\u{1F3FF}\\uFE0F\\u200D\\u20E3]", "gu"); } catch (e) { EMO = /[\uD800-\uDFFF\u2600-\u27BF\uFE0F\u200D]/g; }
  function clean(s) {
    return String(s || "").replace(/^[\s|:-]+$/gm, "").replace(/\u0001/g, " The code is shown on screen. ").replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (_, t) { return /^(https?:|www\.)/i.test(t) ? "the link" : t; })
      .replace(/<?\b(?:https?:\/\/|www\.)[^\s<>]+>?/gi, "the link").replace(/`([^`]*)`/g, "$1")
      .replace(/^\s{0,3}(?:#{1,6}\s+|>\s?|[-*+•]\s+|\d+[.)]\s+)/gm, "").replace(/(^|[^\w])(\*\*|__|~~|\*|_)(?=\S)([^]*?\S)\2(?!\w)/g, "$1$3").replace(/\*+|~~|__/g, "")
      .replace(/\s*\|\s*/g, ", ").replace(/(^|\s)[*_~#>]+(?=\s|$)/g, "$1").replace(EMO, "").replace(/\s[-–—]+\s/g, ", ").replace(/ & /g, " and ")
      .replace(/\b101(?= ?(?:codecrafts|ai|cc)\b)/gi, "one oh one").replace(/\s+/g, " ").replace(/\s+([,.!?;:])/g, "$1").replace(/^[,\s]+|[,\s]+$/g, "");
  }
  function chunk(s) {   // Chrome stops long utterances (~15 s): keep each one short, cut at a comma, else a space
    var out = [], c; while (s.length > MAX) { c = Math.max(s.lastIndexOf(", ", MAX), s.lastIndexOf("; ", MAX)); if (c < 60) c = s.lastIndexOf(" ", MAX); if (c < 1) c = MAX; out.push(s.slice(0, c + 1).trim()); s = s.slice(c + 1).trim(); }
    if (s) out.push(s); return out;
  }
  var buf = "", q = [], cur = null, pend = null, speaking = false, paused = false, gen = 0, started = false, fin = false, once = false, st = "idle", dog = 0, ka = 0, unlocked = false;
  function take(final) {   // pull whole sentences off the streamed buffer
    buf = buf.replace(/```[^]*?```/g, "\n\u0001\n");
    var o = buf.indexOf("```"), lim = o < 0 ? buf.length : o, re = /([.!?…]+["'”’)\]*_]*)(?=\s)|\n/g, m, last = 0, out = [];
    while ((m = re.exec(buf)) && m.index < lim) {
      var end = m.index + (m[1] ? m[1].length : 0), seg = buf.slice(last, end);
      if (m[1] == "." && /(\b(e\.g|i\.e|etc|vs|mr|mrs|ms|dr|prof|st|no|approx|incl|fig)|(^|[\s.])[A-Za-z]|^\s*\d+)\.$/i.test(seg)) continue;
      out.push(seg); last = end;
    }
    if (!final && lim - last > 260) { var c = buf.lastIndexOf(" ", lim); if (c > last) { out.push(buf.slice(last, c)); last = c; } }
    if (final) { out.push(buf.slice(last, lim) + (o < 0 ? "" : "\n\u0001")); buf = ""; } else buf = buf.slice(last);
    out.forEach(function (s) { s = clean(s); if (/[a-z0-9]/i.test(s)) q.push.apply(q, chunk(s)); });
  }
  function muted() { return W.CC_MUTE === true || get("cc_mute") === "1" || html.hasAttribute("data-mute"); }
  function enabled() { return get(KEY) === "1"; }
  function ok() { return !!(SS && UT) && !A._ttsOff && !muted() && (enabled() || once); }
  function state(s) { if (s != st) { st = s; emit("state", s); } }

  /* ---------- lip-sync: syllable timeline, re-anchored by word boundary events ---------- */
  function plan(t) {
    var w = [], re = /[A-Za-z0-9'’]+|[,.;:!?]/g, m;
    while ((m = re.exec(t))) {
      var x = m[0], g = x.toLowerCase().replace(/e$/, "").match(/[aeiouy]+/g) || [];
      if (/^[,.;:!?]$/.test(x)) w.push({ i: m.index, d: /[,;:]/.test(x) ? .22 : .36 });
      else { if (/^\d+$/.test(x)) g = x.split("").concat(x.split("")); if (!g.length) g = ["e"]; w.push({ i: m.index, g: g, d: g.length / 4.4 + .05 }); }
    }
    return w;
  }
  var lv = 0, tick = 0;
  function mouth() {
    var c = cur, t = 0;
    if (c && c.t0 && !paused) {
      var w = c.w, k = 0, e = (now() - c.a0) / 1000 * rate / sp;
      while (k < w.length - 1 && w[k + 1].i <= c.at) k++;
      for (; k < w.length && e > w[k].d; k++) e -= w[k].d;
      var x = w[k];
      if (x && x.g) { c.est = x.i; var f = Math.min(1, e / x.d / .88) * x.g.length, y = x.g[Math.min(x.g.length - 1, f | 0)]; t = (/[ao]/.test(y) ? 1 : /e/.test(y) ? .75 : .55) * Math.pow(Math.sin(Math.PI * (f % 1)), 1.4); }
      else if (!x) t = .6 * Math.pow(Math.sin(Math.PI * (e * 4.4 % 1)), 1.4);   // voice slower than the estimate: keep moving until onend
    }
    var n = c && !paused ? Math.round((lv * .35 + t * .65) * 100) / 100 : 0; if (n < .02) n = 0;
    if (n != lv) { lv = n; emit("mouth", n); }
    if (!c && !n) { clearInterval(tick); tick = 0; }
  }

  /* ---------- speaking ---------- */
  function say(t, from) {
    if (muted()) return hush();
    var g = gen, u = new UT(t.slice(from)), v = badVoice ? null : voice, c = cur = { t: t, u: u, at: from, a0: 0, t0: 0, w: plan(t), est: from };
    if (v) { u.voice = v; u.lang = v.lang; } else u.lang = "en-GB";
    u.rate = rate; u.pitch = 1; u.volume = 1;
    u.onstart = function () { if (g != gen) return; c.t0 = c.a0 = now(); if (!started) { started = true; emit("start"); } state("talking"); if (!tick) tick = setInterval(mouth, 33); };
    u.onboundary = function (e) {
      if (g != gen || (e.name && e.name != "word")) return; var at = from + e.charIndex, t1 = now(), est = 0;
      if (c.b) { c.w.forEach(function (x) { if (x.i >= c.at && x.i < at) est += x.d; }); if (est > .1) sp = Math.min(2.5, Math.max(.4, sp * .7 + (t1 - c.a0) / 1000 * rate / est * .3)); }   // learn this voice's pace
      c.at = at; c.a0 = t1; c.b = 1; emit("boundary", { charIndex: c.at, text: t, word: (t.slice(c.at).match(/^\S+/) || [""])[0] }); };
    u.onend = u.onerror = function (e) {
      if (g != gen || cur != c) return; clearTimeout(dog); speaking = false; cur = null;
      if (e && e.type == "error" && !/interrupted|canceled/.test(e.error)) {
        if (v && !badVoice && /synthesis|voice|language/.test(e.error)) { badVoice = true; q.unshift(t.slice(from)); }   // some Android builds reject an explicit voice
        else { emit("error", { code: e.error }); if (!voices.length && e.error == "synthesis-failed") { A._ttsOff = true; emit("tts", false); return hush(); } }   // no speech engine at all
      }
      next();
    };
    speaking = true; if (SS.paused) SS.resume(); SS.speak(u);
    clearTimeout(dog); dog = setTimeout(function () { if (cur == c) { SS.cancel(); u.onend(); } }, (t.length - from) / 14 / rate * 2500 + 5000);   // onend sometimes never fires
  }
  function next() { if (speaking || paused) return; if (q.length) return say(q.shift(), 0); if (fin) done(false); }
  function done(x) { var s = started; started = fin = false; if (!x) once = false; mouth(); state("idle"); if (s) emit("end", { cancelled: x }); }
  function hush() { gen++; q = []; buf = ""; pend = cur = null; paused = speaking = fin = false; clearTimeout(dog); if (SS) SS.cancel(); done(true); }
  if (KEEP) ka = setInterval(function () { var v = cur && cur.u.voice; if (speaking && !paused && SS.speaking && (!v || !v.localService)) { SS.pause(); SS.resume(); } }, 10000);   // Chrome desktop cuts remote voices after ~15 s

  A.supported = function () { return { tts: !!(SS && UT) && !A._ttsOff, stt: !!SR && !A._sttOff }; };
  A.speak = function (text, o) {
    o = o || {}; if (!ok()) { buf = ""; return false; }
    buf += text || ""; take(!!o.final); if (o.final) fin = true; next(); return true;
  };
  A.say = function (text) { hush(); return A.speak(text, { final: true }); };
  A.stop = function (o) { if (o && o.reset) once = false; A.stopListening(true); hush(); };
  A.pause = function () {
    if (paused || !started) return; paused = true;
    if (cur) { var c = cur; pend = [c.t, c.b ? c.at : c.est]; gen++; cur = null; speaking = false; clearTimeout(dog); SS.cancel(); }
    state("paused"); mouth();
  };
  A.resume = function () { if (!paused) return; paused = false; var p = pend; pend = null; state("talking"); if (p) say(p[0], p[1]); else next(); };
  A.enabled = enabled;
  A.setEnabled = function (b) { b = !!b; put(KEY, b ? "1" : "0"); if (b) A.unlock(); else { once = false; A.stop(); } emit("enabled", b); };
  A.setMuted = function (b) { put("cc_mute", b ? "1" : "0"); if (b) A.stop(); };
  A.state = function () { return st; };
  A.voices = function () { load(); return voices.slice(); };
  A.voice = function () { return voice; };
  A.setVoice = function (name) { put(KEY + "_name", name || ""); load(); return voice; };
  A.setRate = function (r) { rate = Math.min(2, Math.max(.5, +r || 1)); };
  A.clean = clean;
  A.unlock = function () {   // iOS/Safari: the first utterance must start inside a tap
    if (unlocked || !SS || !UT) return; unlocked = true; var u = new UT(" "); u.volume = 0; SS.speak(u);
  };
  A.on = function (t, f) { (H[t] = H[t] || []).push(f); return function () { A.off(t, f); }; };
  A.off = function (t, f) { H[t] = (H[t] || []).filter(function (g) { return g != f; }); };
  A.bindMascot = function (m) {
    var a = A.on("mouth", function (l) { if (m.setMouth) m.setMouth(l); }), b = A.on("state", function (s) { if (m.setState) m.setState(s == "paused" ? "idle" : s); });
    return function () { a(); b(); };
  };

  /* ---------- listening ---------- */
  var rec = null, MSG = {
    "not-allowed": "Microphone access is blocked. Allow it in your browser settings, or type your question.",
    "service-not-allowed": "Voice input isn't available in this browser. Please type your question.",
    "no-speech": "I didn't catch that. Tap the mic and try again.",
    "audio-capture": "No microphone was found. Please type your question.",
    network: "Voice input needs an internet connection. Please type your question.",
    "language-not-supported": "Voice input isn't available for English here. Please type your question.",
    aborted: ""
  };
  function fail(c) { var e = new Error(MSG[c] != null ? MSG[c] : "Voice input stopped. Please try again or type your question."); e.code = c; return e; }
  A.listening = function () { return !!rec; };
  A.stopListening = function (abort) { if (rec) try { abort ? rec.abort() : rec.stop(); } catch (e) {} };
  A.listen = function (o) {
    o = o || {}; if (!A.supported().stt) return Promise.reject(fail("service-not-allowed"));
    A.stopListening(true); hush();
    var nl = (navigator.language || "").toLowerCase(), langs = o.lang ? [o.lang] : (nl == "en-ug" ? ["en-UG"] : []).concat(nl == "en-us" ? ["en-US", "en-GB"] : ["en-GB", "en-US"]), li = 0;
    return new Promise(function (res, rej) {
      function go() {
        var r = rec = new SR(), final = "", interim = "", code = "";
        r.lang = langs[li]; r.interimResults = true; r.continuous = false; r.maxAlternatives = 1;
        r.onstart = function () { state("listening"); emit("listen", true); };
        r.onresult = function (e) {
          var f = "", it = ""; for (var i = 0; i < e.results.length; i++) { var x = e.results[i]; if (x.isFinal) f += x[0].transcript; else it += x[0].transcript; }
          final = f; interim = (f + " " + it).trim(); emit("interim", interim);
        };
        r.onerror = function (e) { code = e.error || "error"; };
        r.onend = function () {
          var mine = rec == r; if (mine) rec = null;
          if (mine && code == "language-not-supported" && li < langs.length - 1) { li++; return go(); }
          if (mine) { state("idle"); emit("listen", false); }
          var text = (final || (code ? "" : interim)).trim();
          if (text) {
            if (get(KEY) == null) A.setEnabled(true); else once = true;   // spoken to, so it talks back
            emit("final", text); return res(text);
          }
          code = code || "no-speech";
          if (code == "service-not-allowed") { A._sttOff = true; emit("stt", false); }
          var er = fail(code); if (er.message) emit("error", { code: code, message: er.message }); rej(er);
        };
        try { r.start(); } catch (e) { rec = null; state("idle"); rej(fail("start")); }
      }
      go();
    });
  };

  addEventListener("pagehide", function () { A.stop({ reset: true }); });
  W.AIVoice = A;
})(window);
