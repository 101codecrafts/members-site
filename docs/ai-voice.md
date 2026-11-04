# 101 AI voice: `js/ai-voice.js` + `js/ai-voice-ui.js`

Free, dependency-free talk-back and voice input for the 101 AI floating assistant. It uses only the browser's own
`speechSynthesis` and `SpeechRecognition` / `webkitSpeechRecognition`, so there is no API key and no per-use cost.
Wired into `js/ai-float.js` in round 8: the panel lazy-loads the generated `js/ai-voice.min.js` and `js/ai-voice-ui.min.js` on first open (regenerate them with `sh tools/minify_voice.sh` after editing the readable sources). The original integration notes are kept at the end of this file.

- `js/ai-voice.js` is the engine, `window.AIVoice`. It has no DOM UI.
- `js/ai-voice-ui.js` holds the drop-in speaker toggle and mic button, `AIVoice.ui`. Load it after the engine.
- `voice.html` (from `src/voice.html`, noindex, not linked) is the developer demo.

## Engine API

| Call | Returns | Notes |
|---|---|---|
| `AIVoice.supported()` | `{tts, stt}` | `tts` turns false after a hard engine failure (no voices plus `synthesis-failed`). `stt` turns false after `service-not-allowed`. |
| `AIVoice.speak(chunk, {final})` | `true` if queued | Pass the reply's deltas as they stream in, then `speak("", {final: true})` once the stream ends. Whole sentences are spoken as soon as they're complete. Returns `false` (and drops the chunk) when voice replies are Off, muted or unsupported. |
| `AIVoice.say(text)` | bool | Same as `stop()` followed by `speak(text, {final: true})`, for a one-off message. |
| `AIVoice.stop([{reset: true}])` | | Cancels speech, empties the queue and aborts listening. Call it when a new question starts. Use `{reset: true}` when the panel closes, so a pending "a voice question gets a voice answer" is dropped too. |
| `AIVoice.pause()` / `AIVoice.resume()` | | Resumes from the last word boundary. With no boundary events, it resumes from the estimated current word. Works the same on every browser, because it doesn't rely on native `pause()`, which acts as cancel on Android. |
| `AIVoice.listen([{lang}])` | `Promise<string>` | Resolves with the final transcript. Interim text arrives on `interim`. It stops any speech first (barge-in). It rejects with an `Error` whose `.code` is the recognition error and whose `.message` is a friendly sentence to show the user (empty for `aborted`). |
| `AIVoice.stopListening()` | | Ends listening early. The words heard so far become the final transcript. |
| `AIVoice.listening()` | bool | |
| `AIVoice.enabled()` / `AIVoice.setEnabled(bool)` | | Stored in `localStorage.cc_ai_voice` (`"1"` or `"0"`). |
| `AIVoice.setMuted(bool)` | | Stored in `localStorage.cc_mute`. The global mute also respects `<html data-mute>` and `window.CC_MUTE === true`. |
| `AIVoice.voices()`, `AIVoice.voice()`, `AIVoice.setVoice(name)` | | Voices come ranked best first. A chosen voice is stored in `localStorage.cc_ai_voice_name`. |
| `AIVoice.setRate(0.5..2)` | | The default is 1. |
| `AIVoice.state()` | `idle`, `talking`, `paused` or `listening` | |
| `AIVoice.clean(markdown)` | string | The speakable text. Exposed for tests. |
| `AIVoice.unlock()` | | Call it inside a tap. iOS and Safari need the first utterance to start from a gesture. Both UI buttons call it for you. |
| `AIVoice.on(evt, fn)` returns `off()`, plus `AIVoice.off(evt, fn)` | | You can also set `AIVoice.onstart = fn` and the same for other events. |
| `AIVoice.bindMascot(m)` returns `unbind()` | | Forwards `mouth` to `m.setMouth(level)` and `state` to `m.setState(s)` (`paused` becomes `idle`). Matches `AIMascot` from round 8. |

### Events

| Event | Payload | When |
|---|---|---|
| `start` | | The first chunk of a reply begins speaking. |
| `end` | `{cancelled}` | The reply finished, or `stop()` cut it off. |
| `boundary` | `{charIndex, word, text}` | A word boundary from the engine. `charIndex` is relative to `text` (the current chunk). |
| `mouth` | `0..1` | About 30 times a second while talking, and exactly 0 at the end. |
| `state` | `idle`, `talking`, `paused` or `listening` | The state changes. |
| `error` | `{code[, message]}` | A speech error or a recognition error. |
| `interim` / `final` | string | Live transcript, then the final one. |
| `listen` | bool | Listening starts or stops. |
| `enabled` | bool | The voice replies setting changes. |
| `tts` / `stt` | `false` | That half has become unavailable. The UI hides the matching button. |

### Behaviour

- **Voice choice.** English voices only. Ranking:
  1. Names containing "Natural" (Edge neural).
  2. Neural, Premium or Enhanced voices (Apple).
  3. Google voices, then Microsoft voices.
  4. en-GB, then en-US, then other English.
  5. Remote voices get a small bonus over local ones.

  eSpeak, "Compact" and Apple novelty voices are excluded. Android's `en_GB` lang form is handled. The list reloads on `voiceschanged` and is also polled for 5 s, because that event can be late or never fire.
- **Talking back when spoken to.** The setting starts unset, which counts as Off. A voice question that succeeds turns it On for good. If the user has explicitly set it Off, a voice question still gets one spoken reply.
- **Text.** Markdown markers, headings, list markers, quotes and tables are stripped. A link reads as its text, or "the link" when the text is itself a URL. Bare URLs read as "the link". Emoji are removed. A fenced code block reads as "The code is shown on screen." "101 Codecrafts" and "101 AI" read as "one oh one".
- **Chunks.** Sentence cuts know common abbreviations (e.g., i.e., Dr., U.S.) and list numbers. Each utterance is at most 180 characters, cut at a comma, else at a space.
- **Chrome workarounds.** On desktop Chrome, a remote voice gets `pause()` + `resume()` every 10 s. The utterance is held in memory so Chrome can't garbage-collect it. A watchdog cancels and moves on if `onend` never fires. If a voice is rejected (some Android builds), the chunk is retried with the default voice.
- **Lip-sync.** A syllable timeline per word: vowel openness sets amplitude, and commas and full stops are pauses. Each word boundary event re-anchors it and adapts it to the voice's real pace. Without boundary events (Google network voices), it runs on timing alone. If the voice is slower than the estimate, the mouth keeps moving until `onend`.
- **Listening.** Language order is en-UG first (only when the browser language is en-UG), then en-GB, then en-US. The next one is tried on `language-not-supported`. Interim results are on, `continuous` is off. Chrome ends listening at the first pause.

## UI pieces (`js/ai-voice-ui.js`)

```js
var spk = AIVoice.ui.speaker({ head: true });                      // <button> or null; head: white icon for the navy panel header
var mic = AIVoice.ui.mic({ input: textarea, onFinal: ask });       // <span> wrapper (button + status tip) or null when unsupported
```

- **Speaker.** `aria-pressed` reflects the voice replies setting. Its label is "Voice replies". The icon shows sound waves when On and a cross when Off.
- **Mic.**
  - Tap to talk. It stops at the first pause and sends.
  - Tap again to stop early.
  - With a mouse, you can also hold for more than 450 ms and release to send.
  - On iOS it starts on `click` (a real gesture).
  - While listening it is orange with a pulsing orange ring. With reduced motion or Lite mode, the ring is still.
  - Labels: `aria-pressed` with "Speak your question" / "Stop listening".
  - A `role=status` tip in JetBrains Mono shows LISTENING plus the live transcript, and shows friendly errors for 5 s.
  - It writes the interim transcript into `input` and calls `onFinal(text)`. Without `onFinal`, it submits `input.form`.
- **Styling.** Both buttons are 44×44 with a 2px border and a 3px hard shadow (cyan in dark). Orange is only ever a fill behind navy icons, never text on white. The CSS is injected once as `<style id="aiv-css">`.

## Wiring into `js/ai-float.js` (for the integrator)

```js
// 1. Lazy-load on first panel open (keeps page load cost at zero):
function loadVoice(cb) { if (window.AIVoice && AIVoice.ui) return cb(); var a = d.createElement("script"); a.src = new URL("ai-voice.js", src).href;
  a.onload = function () { var u = d.createElement("script"); u.src = new URL("ai-voice-ui.js", src).href; u.onload = cb; d.head.appendChild(u); }; d.head.appendChild(a); }
// 2. Header: put AIVoice.ui.speaker({head: true}) before the clear/close buttons. Form: put AIVoice.ui.mic({input: inp, onFinal: ask}) before .ai-send.
// 3. ask(): call AIVoice.stop() before fetching. In the reader loop: var t = dec.decode(c.value, {stream: true}); out += t; AIVoice.speak(t);
//    after the loop: AIVoice.speak("", {final: true}).  Error path: AIVoice.stop(); AIVoice.speak(errorText, {final: true}).
// 4. toggle(false): AIVoice.stop({reset: true}).  Clear button: AIVoice.stop().
// 5. Mascot: AIVoice.bindMascot(mascotInstance).
// 6. sw.js: add js/ai-voice.js and js/ai-voice-ui.js to the precache and bump the cache version.
```
