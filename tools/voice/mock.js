// Test doubles for speechSynthesis + SpeechRecognition. Configure with window.__cfg before the page scripts run.
(function () {
  var cfg = window.__cfg = Object.assign({ voices: [], tts: true, stt: true, wordMs: 40, boundary: true, neverEnd: false, failVoice: false, failAll: false, sr: null, lateVoices: false }, window.__cfgIn || {});
  var T = window.__t = { spoken: [], utts: [], cancels: 0, pauses: 0, resumes: 0, langs: [], srStarts: 0, srAborts: 0 };
  if (!cfg.tts) { try { Object.defineProperty(window, "speechSynthesis", { value: undefined, configurable: true }); Object.defineProperty(window, "SpeechSynthesisUtterance", { value: undefined, configurable: true }); } catch (e) {} }
  else {
    function U(t) { this.text = t; this.voice = null; this.lang = ""; this.rate = 1; this.pitch = 1; this.volume = 1; }
    var cur = null, queue = [], timers = [], voices = cfg.lateVoices ? [] : cfg.voices, L = {};
    function clear() { timers.forEach(clearTimeout); timers = []; }
    function fire(u, n, e) { e = e || {}; e.type = n; e.utterance = u; if (u["on" + n]) u["on" + n](e); }
    function run() {
      if (cur || !queue.length) return; var u = cur = queue.shift();
      if (u.volume === 0) { cur = null; return run(); }
      T.spoken.push(u.text); T.utts.push({ text: u.text, voice: u.voice && u.voice.name, lang: u.lang, rate: u.rate });
      timers.push(setTimeout(function () {
        if ((cfg.failVoice && u.voice) || cfg.failAll) { cur = null; fire(u, "error", { error: "synthesis-failed" }); run(); return; }
        fire(u, "start");
        var re = /\S+/g, m, k = 0;
        while ((m = re.exec(u.text))) { (function (i, w) { k++; if (cfg.boundary) timers.push(setTimeout(function () { if (cur === u) fire(u, "boundary", { name: "word", charIndex: i, charLength: w.length }); }, k * cfg.wordMs)); })(m.index, m[0]); }
        if (!cfg.neverEnd) timers.push(setTimeout(function () { if (cur !== u) return; cur = null; fire(u, "end"); run(); }, (k + 1) * cfg.wordMs));
      }, 5));
    }
    var S = {
      getVoices: function () { return voices.slice(); },
      speak: function (u) { queue.push(u); run(); },
      cancel: function () { T.cancels++; clear(); var all = (cur ? [cur] : []).concat(queue); cur = null; queue = []; all.forEach(function (u) { setTimeout(function () { fire(u, "error", { error: "interrupted" }); }, 1); }); },
      pause: function () { T.pauses++; }, resume: function () { T.resumes++; },
      get speaking() { return !!cur; }, get pending() { return queue.length > 0; }, paused: false,
      addEventListener: function (t, f) { (L[t] = L[t] || []).push(f); },
      __setVoices: function (v) { voices = v; (L.voiceschanged || []).forEach(function (f) { f({}); }); }
    };
    Object.defineProperty(window, "speechSynthesis", { value: S, configurable: true });
    Object.defineProperty(window, "SpeechSynthesisUtterance", { value: U, configurable: true });
  }
  // SpeechRecognition: cfg.sr = { interim:[...], final:"...", error:"code", errorFor:{lang:code}, delay }
  function R() { this.lang = ""; this.interimResults = false; this.continuous = false; }
  R.prototype.start = function () {
    var r = this, s = cfg.sr || {}, d = s.delay || 30; T.srStarts++; T.langs.push(r.lang); r._t = [];
    function at(ms, f) { r._t.push(setTimeout(f, ms)); }
    at(5, function () { r.onstart && r.onstart({}); });
    var err = (s.errorFor && s.errorFor[r.lang]) || s.error;
    if (err) { at(d, function () { r.onerror && r.onerror({ error: err }); r.onend && r.onend({}); }); return; }
    var i = 0; (s.interim || []).forEach(function (t) { at(d * ++i, function () { r.onresult && r.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: t }], { isFinal: false })] }); }); });
    if (s.hold) return;   // wait for stop()
    at(d * ++i, function () { if (s.final != null) r.onresult && r.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: s.final }], { isFinal: true })] }); });
    at(d * ++i + 5, function () { r.onend && r.onend({}); });
  };
  R.prototype.stop = function () { var r = this, s = cfg.sr || {}; setTimeout(function () { if (s.hold && s.final) r.onresult && r.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: s.final }], { isFinal: true })] }); r.onend && r.onend({}); }, 10); };
  R.prototype.abort = function () { var r = this; T.srAborts++; (r._t || []).forEach(clearTimeout); setTimeout(function () { r.onerror && r.onerror({ error: "aborted" }); r.onend && r.onend({}); }, 5); };
  if (cfg.stt) { Object.defineProperty(window, "SpeechRecognition", { value: R, configurable: true, writable: true }); Object.defineProperty(window, "webkitSpeechRecognition", { value: R, configurable: true, writable: true }); } else { try { delete window.webkitSpeechRecognition; delete window.SpeechRecognition; Object.defineProperty(window, "webkitSpeechRecognition", { value: undefined, configurable: true }); Object.defineProperty(window, "SpeechRecognition", { value: undefined, configurable: true }); } catch (e) {} }
})();
