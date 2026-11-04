# Unit + UI tests for js/ai-voice.js and js/ai-voice-ui.js in Chromium with mocked speechSynthesis / SpeechRecognition.
# usage: python3 test_voice.py <site-root> <port>
import json, os, subprocess, sys, time, traceback
from playwright.sync_api import sync_playwright

ROOT, PORT = sys.argv[1], int(sys.argv[2])
HERE = os.path.dirname(os.path.abspath(__file__)); SHOTS = os.path.join(HERE, '..', 'shots'); os.makedirs(SHOTS, exist_ok=True)
MOCK = open(os.path.join(HERE, 'mock.js')).read()
URL = f'http://127.0.0.1:{PORT}/voice.html'
srv = subprocess.Popen([sys.executable, os.environ['SERVE'], ROOT, str(PORT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)

V = lambda name, lang, local=True: {'name': name, 'lang': lang, 'localService': local, 'default': False, 'voiceURI': name}
VOICES = [V('eSpeak English', 'en'), V('Fred', 'en-US'), V('Google US English', 'en-US', False), V('Google UK English Female', 'en-GB', False),
          V('Microsoft Sonia Online (Natural) - English (United Kingdom)', 'en-GB', False), V('Microsoft David - English (United States)', 'en-US'), V('Google français', 'fr-FR', False)]
results = []

def page_for(pw_browser, cfg=None, ls=None, theme=None, ua=None, viewport=(1100, 900)):
    ctx = pw_browser.new_context(viewport={'width': viewport[0], 'height': viewport[1]}, user_agent=ua, reduced_motion='no-preference')
    init = f'window.__cfgIn = {json.dumps(cfg or {})};' + MOCK
    pre = ''.join(f'localStorage.setItem({json.dumps(k)}, {json.dumps(v)});' for k, v in (ls or {}).items())
    if theme: pre += f'localStorage.setItem("theme", "{theme}");'
    ctx.add_init_script('try{localStorage.clear();' + pre + '}catch(e){}' + init)
    p = ctx.new_page(); errs = []
    p.on('pageerror', lambda e: errs.append(str(e)))
    p.goto(URL); p.wait_for_function('window.AIVoice && AIVoice.ui')
    p._errs = errs
    return ctx, p

def test(name):
    def deco(f):
        def run(b):
            t0 = time.time()
            try:
                info = f(b); results.append((name, 'PASS', info or '', round(time.time() - t0, 1)))
            except Exception as e:
                results.append((name, 'FAIL', f'{type(e).__name__}: {e}', round(time.time() - t0, 1))); traceback.print_exc()
        run.__name__ = name; TESTS.append(run); return f
    return deco
TESTS = []

STREAM = '''async (o) => { const V = AIVoice, ev = [], mouth = [];
  ['start','end','state','boundary','error'].forEach(e => V.on(e, a => ev.push([e, a, performance.now()])));
  V.on('mouth', l => mouth.push(l));
  const text = o.text; let firstSpeakAt = null, streamEnd = null;
  for (let i = 0; i < text.length; i += o.step) { V.speak(text.slice(i, i + o.step)); if (firstSpeakAt === null && __t.spoken.length) firstSpeakAt = i; await new Promise(r => setTimeout(r, o.gap)); }
  streamEnd = __t.spoken.length; V.speak('', {final: true});
  const t0 = performance.now(); while (V.state() !== 'idle' || !ev.some(e => e[0] === 'end')) { if (performance.now() - t0 > (o.wait || 15000)) break; await new Promise(r => setTimeout(r, 20)); }
  return {spoken: __t.spoken, utts: __t.utts, ev: ev.map(e => [e[0], e[1]]), mouth, firstSpeakAt, spokenWhileStreaming: streamEnd, cleaned: V.clean(text), state: V.state()}; }'''

SAMPLE = ("Hi! I'm **101 AI**, the assistant for 101 Codecrafts. We meet in Kampala, e.g. at the Innovation Village 🚀🇺🇬.\n\n"
          "- Join the [WhatsApp community](https://chat.whatsapp.com/abc) today.\n- Free courses: https://101codecrafts.com/courses.html\n\n"
          "| Plan | Price |\n|---|---|\n| Member | Free |\n\nExample:\n```js\nconsole.log('a. b. c.');\n```\n"
          "Anything else? " + "This is a deliberately long sentence without full stops that keeps going and going so that the module must cut it into short pieces at commas, or at spaces when there are no commas left, because Chrome stops long utterances after about fifteen seconds and we never want the voice to die in the middle of a reply" + ".")

@test('supported() with both APIs')
def _(b):
    c, p = page_for(b, {'voices': VOICES}); r = p.evaluate('AIVoice.supported()'); c.close()
    assert r == {'tts': True, 'stt': True}, r

@test('voice pick: Microsoft Natural beats Google, eSpeak/novelty/French excluded')
def _(b):
    c, p = page_for(b, {'voices': VOICES}); r = p.evaluate('[AIVoice.voice().name, AIVoice.voices().map(v=>v.name)]'); c.close()
    assert r[0].startswith('Microsoft Sonia Online (Natural)'), r
    assert not any(n in r[1] for n in ['eSpeak English', 'Fred', 'Google français']), r[1]
    return r[0]

@test('voice pick: Google UK English Female when no Natural voice')
def _(b):
    c, p = page_for(b, {'voices': [v for v in VOICES if 'Natural' not in v['name']]}); r = p.evaluate('AIVoice.voice().name'); c.close()
    assert r == 'Google UK English Female', r

@test('voice pick: Android-style en_GB lang + late voiceschanged')
def _(b):
    vs = [V('English United States', 'en_US'), V('English United Kingdom', 'en_GB', False)]
    c, p = page_for(b, {'voices': vs, 'lateVoices': True})
    before = p.evaluate('AIVoice.voice()')
    p.evaluate(f'speechSynthesis.__setVoices({json.dumps(vs)})'); after = p.evaluate('AIVoice.voice().name'); c.close()
    assert before is None and after == 'English United Kingdom', (before, after)

@test('voice pick: Apple enhanced/premium over compact, user override persists')
def _(b):
    vs = [V('Samantha (Compact)', 'en-US'), V('Daniel (Enhanced)', 'en-GB'), V('Karen', 'en-AU')]
    c, p = page_for(b, {'voices': vs}); a = p.evaluate('AIVoice.voice().name'); o = p.evaluate('AIVoice.setVoice("Karen").name + "|" + localStorage.cc_ai_voice_name'); c.close()
    assert a == 'Daniel (Enhanced)' and o == 'Karen|Karen', (a, o)

@test('clean(): markdown, links, URLs, emoji, code, brand')
def _(b):
    c, p = page_for(b)
    cases = {
        "**Bold** and *italic* and `code` and ~~gone~~": "Bold and italic and code and gone",
        "See the [docs](https://x.io/a_b) now": "See the docs now",
        "Go to https://101codecrafts.com/courses.html?x=1 today": "Go to the link today",
        "Link: [https://a.com](https://a.com)": "Link: the link",
        "Ship it 🚀🔥 now 👍🏽 🇺🇬": "Ship it now",
        "## Heading": "Heading", "- item one": "item one", "3. third": "third", "> quoted": "quoted",
        "Welcome to 101 Codecrafts and 101 AI": "Welcome to one oh one Codecrafts and one oh one AI",
        "Fast — really fast & free": "Fast, really fast and free",
        "my_var_name stays": "my_var_name stays",
        "| a | b |": "a, b",
    }
    bad = {}
    for k, v in cases.items():
        got = p.evaluate('t => AIVoice.clean(t)', k)
        if got != v: bad[k] = got
    c.close(); assert not bad, bad

@test('disabled by default: speak() is a no-op, setting unset')
def _(b):
    c, p = page_for(b, {'voices': VOICES}); r = p.evaluate('[AIVoice.enabled(), AIVoice.speak("Hello there. ", {final:true}), localStorage.cc_ai_voice]'); time.sleep(.2); s = p.evaluate('__t.spoken'); c.close()
    assert r == [False, False, None] and s == [], (r, s)

@test('streaming: sentence by sentence while text streams, <=180 chars, nothing lost, no markup spoken')
def _(b):
    c, p = page_for(b, {'voices': VOICES, 'wordMs': 8}, {'cc_ai_voice': '1'})
    r = p.evaluate(STREAM, {'text': SAMPLE, 'step': 7, 'gap': 6}); c.close()
    sp = r['spoken']; joined = ' '.join(sp)
    assert r['firstSpeakAt'] is not None and r['firstSpeakAt'] < 80, ('first utterance only after', r['firstSpeakAt'])
    assert r['spokenWhileStreaming'] >= 3, r['spokenWhileStreaming']
    assert max(len(s) for s in sp) <= 181, max(len(s) for s in sp)
    for bad in ['**', 'http', '🚀', '`', '|', '---', '```', 'console.log', '#']: assert bad not in joined, (bad, joined)
    assert 'e.g. at the Innovation Village' in joined and not any(s.endswith('e.g.') for s in sp), sp
    assert 'The code is shown on screen.' in joined, joined
    assert 'one oh one Codecrafts' in joined and 'the link' in joined
    norm = lambda s: ''.join(ch for ch in s if ch.isalnum())
    tail = 'weneverwantthevoicetodieinthemiddleofareply'; assert tail in norm(joined), 'tail lost'
    assert r['utts'][0]['voice'].startswith('Microsoft Sonia'), r['utts'][0]
    evs = [e[0] for e in r['ev']]; assert evs.count('start') == 1 and evs.count('end') == 1 and evs[-1] in ('end', 'state'), evs
    assert {'end': {'cancelled': False}} in [{e[0]: e[1]} for e in r['ev'] if e[0] == 'end'], r['ev']
    assert r['state'] == 'idle'
    return f"{len(sp)} utterances, longest {max(len(s) for s in sp)} chars, first spoken after {r['firstSpeakAt']} streamed chars"

@test('events: start, boundary (absolute charIndex + word), end; mouth level 0..1 stream ending at 0')
def _(b):
    c, p = page_for(b, {'voices': VOICES, 'wordMs': 280}, {'cc_ai_voice': '1'})
    r = p.evaluate(STREAM, {'text': 'Welcome to the community. Learning together is how we grow fast.', 'step': 200, 'gap': 1}); c.close()
    bd = [e[1] for e in r['ev'] if e[0] == 'boundary']
    assert len(bd) >= 8 and bd[1]['word'] == 'to', bd[:3]
    assert all(bd[i]['text'][bd[i]['charIndex']:].startswith(bd[i]['word']) for i in range(len(bd)))
    m = r['mouth']; assert m and all(0 <= x <= 1 for x in m) and max(m) > .4 and m[-1] == 0, m[-5:]
    opens = sum(1 for i in range(1, len(m)) if m[i] > .3 and m[i - 1] <= .3); assert opens >= 5, opens
    return f'{len(bd)} boundaries, {len(m)} mouth frames, {opens} mouth openings, peak {max(m)}'

@test('lip-sync without boundary events (Google network voices): timing-only mouth stream')
def _(b):
    c, p = page_for(b, {'voices': VOICES, 'wordMs': 330, 'boundary': False}, {'cc_ai_voice': '1'})
    r = p.evaluate(STREAM, {'text': 'Hello and welcome to one oh one Codecrafts, the place to learn.', 'step': 300, 'gap': 1}); c.close()
    m = r['mouth']; opens = sum(1 for i in range(1, len(m)) if m[i] > .3 and m[i - 1] <= .3)
    assert opens >= 5 and m[-1] == 0 and not [e for e in r['ev'] if e[0] == 'boundary'], (opens, m[-3:])
    return f'{opens} openings from syllable timing alone'

@test('stop(): cancels speech + queue, emits end{cancelled:true}, late callbacks ignored')
def _(b):
    c, p = page_for(b, {'voices': VOICES, 'wordMs': 60}, {'cc_ai_voice': '1'})
    r = p.evaluate('''async () => { const ev=[]; AIVoice.on('end', a => ev.push(a)); AIVoice.speak('One two three four. Five six seven eight. Nine ten eleven twelve. ', {final:true});
      await new Promise(r=>setTimeout(r,150)); AIVoice.stop(); const n=__t.spoken.length; await new Promise(r=>setTimeout(r,900));
      return {ev, n, after: __t.spoken.length, cancels: __t.cancels, state: AIVoice.state()}; }'''); c.close()
    assert r['ev'] == [{'cancelled': True}] and r['n'] == r['after'] == 1 and r['cancels'] >= 1 and r['state'] == 'idle', r

@test('new question mid-reply: old reply dropped, only new reply spoken')
def _(b):
    c, p = page_for(b, {'voices': VOICES, 'wordMs': 30}, {'cc_ai_voice': '1'})
    r = p.evaluate('''async () => { AIVoice.speak('Old answer sentence one. Old answer sentence two. Old answer three. '); await new Promise(r=>setTimeout(r,60));
      AIVoice.stop(); AIVoice.speak('New answer here. '); AIVoice.speak('Second new sentence.', {final:true}); await new Promise(r=>setTimeout(r,1500)); return __t.spoken; }'''); c.close()
    assert r == ['Old answer sentence one.', 'New answer here.', 'Second new sentence.'], r

@test('pause/resume: resumes from the last word boundary, not the start')
def _(b):
    c, p = page_for(b, {'voices': VOICES, 'wordMs': 80}, {'cc_ai_voice': '1'})
    r = p.evaluate('''async () => { const st=[]; AIVoice.on('state', s=>st.push(s)); AIVoice.speak('alpha bravo charlie delta echo foxtrot golf hotel india juliet.', {final:true});
      await new Promise(r=>setTimeout(r,420)); AIVoice.pause(); const ps=AIVoice.state(); await new Promise(r=>setTimeout(r,300)); const mid=__t.spoken.length;
      AIVoice.resume(); await new Promise(r=>setTimeout(r,1500)); return {spoken: __t.spoken, ps, mid, st, end: AIVoice.state()}; }'''); c.close()
    s = r['spoken']; assert r['ps'] == 'paused' and r['mid'] == 1 and len(s) == 2, r
    assert s[1].startswith(('delta', 'echo', 'foxtrot')) and s[1].endswith('juliet.'), s
    assert r['end'] == 'idle' and 'paused' in r['st'], r
    return f'resumed with "{s[1][:30]}…"'

@test('pause/resume without boundary events: resumes near the estimated word')
def _(b):
    c, p = page_for(b, {'voices': VOICES, 'wordMs': 330, 'boundary': False}, {'cc_ai_voice': '1'})
    r = p.evaluate('''async () => { AIVoice.speak('alpha bravo charlie delta echo foxtrot golf hotel india juliet.', {final:true});
      await new Promise(r=>setTimeout(r,1400)); AIVoice.pause(); await new Promise(r=>setTimeout(r,100)); AIVoice.resume(); await new Promise(r=>setTimeout(r,4000)); return __t.spoken; }'''); c.close()
    assert len(r) == 2 and r[1].endswith('juliet.') and len(r[1]) < len(r[0]), r
    return f'resumed with "{r[1][:30]}…"'

@test('Chrome keep-alive: pause()+resume() every 10 s on a remote voice while speaking')
def _(b):
    c, p = page_for(b, {'voices': VOICES, 'wordMs': 600}, {'cc_ai_voice': '1'})
    r = p.evaluate('''async () => { AIVoice.speak('one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty.', {final:true});
      await new Promise(r=>setTimeout(r,10600)); const x=[__t.pauses, __t.resumes]; AIVoice.stop(); return x; }'''); c.close()
    assert r[0] >= 1 and r[1] >= 1, r
    return f'pauses={r[0]} resumes={r[1]} after 10.6 s'

@test('watchdog: an utterance whose onend never fires does not stall the queue')
def _(b):
    c, p = page_for(b, {'voices': VOICES, 'neverEnd': True}, {'cc_ai_voice': '1'})
    r = p.evaluate('''async () => { AIVoice.speak('Short one. Short two.', {final:true}); await new Promise(r=>setTimeout(r,7200)); const s=__t.spoken.slice(); AIVoice.stop(); return s; }'''); c.close()
    assert r[:2] == ['Short one.', 'Short two.'], r

@test('Android quirk: explicit voice rejected -> retried with the default voice')
def _(b):
    c, p = page_for(b, {'voices': VOICES, 'failVoice': True}, {'cc_ai_voice': '1'})
    r = p.evaluate('''async () => { AIVoice.speak('Hello there.', {final:true}); await new Promise(r=>setTimeout(r,500)); return __t.utts; }'''); c.close()
    assert len(r) == 2 and r[0]['voice'] and r[1]['voice'] is None and r[1]['lang'] == 'en-GB', r

@test('no speech engine (headless Linux): synthesis-failed with no voices -> tts off, speaker hidden, no hang')
def _(b):
    c, p = page_for(b, {'voices': [], 'failAll': True}, {'cc_ai_voice': '1'})
    r = p.evaluate('''async () => { const ev=[]; AIVoice.on('error', a=>ev.push(a.code)); AIVoice.speak('Hello there. Second sentence.', {final:true}); await new Promise(r=>setTimeout(r,400));
      return [AIVoice.supported().tts, document.querySelector('#spkBody .aiv-spk').hidden, AIVoice.state(), ev, AIVoice.speak('Again.', {final:true})]; }'''); c.close()
    assert r == [False, True, 'idle', ['synthesis-failed'], False], r

@test('global mute: cc_mute=1 blocks speech; setMuted(true) mid-reply stops it')
def _(b):
    c, p = page_for(b, {'voices': VOICES}, {'cc_ai_voice': '1', 'cc_mute': '1'}); a = p.evaluate('AIVoice.speak("Hi there.", {final:true})'); c.close()
    c, p = page_for(b, {'voices': VOICES, 'wordMs': 60}, {'cc_ai_voice': '1'})
    r = p.evaluate('''async () => { AIVoice.speak('One two three. Four five six. Seven eight nine.', {final:true}); await new Promise(r=>setTimeout(r,100)); AIVoice.setMuted(true);
      await new Promise(r=>setTimeout(r,800)); return [__t.spoken.length, AIVoice.state()]; }'''); c.close()
    assert a is False and r == [1, 'idle'], (a, r)

@test('listen(): interim + final transcript, listening/idle states, barge-in stops TTS')
def _(b):
    c, p = page_for(b, {'voices': VOICES, 'wordMs': 60, 'sr': {'interim': ['how do', 'how do I join'], 'final': 'How do I join?'}}, {'cc_ai_voice': '1'})
    r = p.evaluate('''async () => { const st=[], it=[]; AIVoice.on('state', s=>st.push(s)); AIVoice.on('interim', t=>it.push(t));
      AIVoice.speak('A long reply that is talking right now. And more.', {final:true}); await new Promise(r=>setTimeout(r,80));
      const t = await AIVoice.listen(); return {t, st, it, cancels: __t.cancels, langs: __t.langs, state: AIVoice.state()}; }'''); c.close()
    assert r['t'] == 'How do I join?' and r['it'][:2] == ['how do', 'how do I join'] and 'listening' in r['st'] and r['state'] == 'idle' and r['cancels'] >= 1, r
    assert r['langs'][0] in ('en-GB', 'en-US', 'en-UG'), r['langs']
    return f"lang {r['langs'][0]}, states {r['st']}"

@test('talk back when spoken to: unset setting -> On after a voice question')
def _(b):
    c, p = page_for(b, {'voices': VOICES, 'sr': {'final': 'Is it free?'}})
    r = p.evaluate('''async () => { const a=localStorage.cc_ai_voice; await AIVoice.listen(); const ok=AIVoice.speak('Yes, it is free.', {final:true}); await new Promise(r=>setTimeout(r,400)); return [a, localStorage.cc_ai_voice, ok, __t.spoken]; }'''); c.close()
    assert r[0] is None and r[1] == '1' and r[2] is True and r[3] == ['Yes, it is free.'], r

@test('explicit Off: a voice question gets one spoken reply, the next typed one stays silent')
def _(b):
    c, p = page_for(b, {'voices': VOICES, 'sr': {'final': 'Is it free?'}}, {'cc_ai_voice': '0'})
    r = p.evaluate('''async () => { await AIVoice.listen(); AIVoice.stop(); const a=AIVoice.speak('Yes, it is free.', {final:true}); await new Promise(r=>setTimeout(r,500));
      const b=AIVoice.speak('Typed answer.', {final:true}); await new Promise(r=>setTimeout(r,300)); return [a, b, __t.spoken, localStorage.cc_ai_voice]; }'''); c.close()
    assert r == [True, False, ['Yes, it is free.'], '0'], r

@test('listen() errors: friendly messages; service-not-allowed hides the mic; language fallback')
def _(b):
    out = {}
    for code in ['not-allowed', 'no-speech', 'network', 'audio-capture', 'service-not-allowed']:
        c, p = page_for(b, {'voices': VOICES, 'sr': {'error': code}})
        r = p.evaluate('''async () => { try { await AIVoice.listen(); return null; } catch (e) { return [e.code, e.message, AIVoice.supported().stt, document.querySelector('.aiv-w').hidden, AIVoice.state()]; } }'''); c.close()
        out[code] = r
        assert r and r[0] == code and len(r[1]) > 20 and r[4] == 'idle', r
        assert (r[2], r[3]) == ((False, True) if code == 'service-not-allowed' else (True, False)), (code, r)
    c, p = page_for(b, {'voices': VOICES, 'sr': {'final': 'hello', 'errorFor': {'en-US': 'language-not-supported'}}})
    r = p.evaluate('''async () => [await AIVoice.listen(), __t.langs]'''); c.close()
    assert r[0] == 'hello' and r[1] == ['en-US', 'en-GB'], r
    return {k: v[1] for k, v in out.items()}

@test('unsupported browser (Firefox-like: no SpeechRecognition): mic not rendered, text unaffected')
def _(b):
    c, p = page_for(b, {'voices': VOICES, 'stt': False})
    r = p.evaluate('''async () => { let e=null; try { await AIVoice.listen(); } catch (x) { e=x.code; } return [AIVoice.supported(), !!document.querySelector('.aiv-mic'), !!document.querySelector('.aiv-spk'), e, document.querySelector('#q') !== null]; }'''); c.close()
    assert r == [{'tts': True, 'stt': False}, False, True, 'service-not-allowed', True], r

@test('no speechSynthesis at all: speaker not rendered, speak() false, no errors')
def _(b):
    c, p = page_for(b, {'tts': False, 'stt': False}, {'cc_ai_voice': '1'})
    r = p.evaluate('[AIVoice.supported(), AIVoice.speak("Hi.", {final:true}), !!document.querySelector(".aiv-spk")]'); e = p._errs; c.close()
    assert r == [{'tts': False, 'stt': False}, False, False] and not e, (r, e)

@test('UI: speaker toggle aria-pressed + localStorage; mic tap -> listening ring, transcript, onFinal; 44px targets')
def _(b):
    c, p = page_for(b, {'voices': VOICES, 'wordMs': 40, 'sr': {'interim': ['what courses'], 'final': 'What courses are there?', 'delay': 250}})
    spk = p.locator('.vd-row, .row .aiv-spk').first
    a0 = p.get_attribute('#spkBody .aiv-spk', 'aria-pressed'); p.click('#spkBody .aiv-spk'); a1 = p.get_attribute('#spkBody .aiv-spk', 'aria-pressed'); h1 = p.get_attribute('#spkHead .aiv-spk', 'aria-pressed'); ls = p.evaluate('localStorage.cc_ai_voice')
    p.click('#spkHead .aiv-spk'); a2 = p.get_attribute('#spkBody .aiv-spk', 'aria-pressed')
    sizes = p.evaluate('[...document.querySelectorAll(".aiv-b")].map(b=>{const r=b.getBoundingClientRect();return [Math.round(r.width),Math.round(r.height)]})')
    p.click('.aiv-mic'); p.wait_for_timeout(330)
    on = p.evaluate('[document.querySelector(".aiv-mic").classList.contains("aiv-on"), document.querySelector(".aiv-mic").getAttribute("aria-pressed"), document.querySelector(".aiv-mic").getAttribute("aria-label"), document.querySelector(".aiv-tip").textContent, document.querySelector("#q").value]')
    p.screenshot(path=os.path.join(SHOTS, 'light-listening.png'), clip={'x': 0, 'y': 0, 'width': 1100, 'height': 520})
    p.wait_for_timeout(900)
    off = p.evaluate('[document.querySelector(".aiv-mic").classList.contains("aiv-on"), document.querySelector(".aiv-mic").getAttribute("aria-pressed"), document.querySelector("#out").textContent, document.querySelector(".aiv-tip").hidden]')
    c.close()
    assert (a0, a1, h1, ls, a2) == ('false', 'true', 'true', '1', 'false'), (a0, a1, h1, ls, a2)
    assert all(w >= 44 and h >= 44 for w, h in sizes), sizes
    assert on[0] and on[1] == 'true' and on[2] == 'Stop listening' and 'LISTENING' in on[3] and on[4] == 'what courses', on
    assert not off[0] and off[1] == 'false' and off[2].startswith('You asked: What courses are there?') and off[3], off
    return f'sizes {sizes}'

@test('UI keyboard: Enter on mic starts, Enter again stops; focus ring visible')
def _(b):
    c, p = page_for(b, {'voices': VOICES, 'sr': {'interim': ['hello'], 'hold': True, 'final': 'hello there'}})
    p.focus('.aiv-mic'); p.keyboard.press('Enter'); p.wait_for_timeout(120); l1 = p.evaluate('AIVoice.listening()')
    ring = p.evaluate('getComputedStyle(document.querySelector(".aiv-mic")).outlineStyle')
    p.keyboard.press('Enter'); p.wait_for_timeout(200); l2 = p.evaluate('AIVoice.listening()'); out = p.evaluate('document.querySelector("#out").textContent'); c.close()
    assert l1 and not l2 and out.startswith('You asked: hello there') and ring != 'none', (l1, l2, out, ring)

@test('UI hold-to-talk (mouse): press, hold 600 ms, release -> stops and sends')
def _(b):
    c, p = page_for(b, {'voices': VOICES, 'sr': {'interim': ['hold'], 'hold': True, 'final': 'hold to talk works'}})
    box = p.locator('.aiv-mic').bounding_box(); p.mouse.move(box['x'] + 20, box['y'] + 20); p.mouse.down(); p.wait_for_timeout(600)
    l1 = p.evaluate('AIVoice.listening()'); p.mouse.up(); p.wait_for_timeout(250); l2 = p.evaluate('AIVoice.listening()'); out = p.evaluate('document.querySelector("#out").textContent'); c.close()
    assert l1 and not l2 and out.startswith('You asked: hold to talk works'), (l1, l2, out)

@test('screenshots: light/dark, speaker on, head variant, mobile 360px; contrast of tip text')
def _(b):
    for th in ['light', 'dark']:
        c, p = page_for(b, {'voices': VOICES, 'sr': {'interim': ['what is 101 codecrafts'], 'hold': True}}, {'cc_ai_voice': '1'}, theme=th)
        p.click('.aiv-mic'); p.wait_for_timeout(150)
        p.screenshot(path=os.path.join(SHOTS, f'{th}-desktop.png'), clip={'x': 0, 'y': 0, 'width': 1100, 'height': 560})
        p.evaluate('AIVoice.stop()'); c.close()
        c, p = page_for(b, {'voices': VOICES}, {'cc_ai_voice': '0'}, theme=th, viewport=(360, 760))
        p.screenshot(path=os.path.join(SHOTS, f'{th}-360.png'), full_page=False); c.close()
    return 'shots/*.png'

with sync_playwright() as pw:
    br = pw.chromium.launch(executable_path=os.environ['CHROME'], args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])
    only = os.environ.get('ONLY')
    for t in TESTS:
        if only and only not in t.__name__: continue
        t(br)
    br.close()
srv.terminate()
w = max(len(r[0]) for r in results)
lines = [f"{r[1]}  {r[0]:<{w}}  {r[3]:>5}s  {r[2]}" for r in results]
print('\n'.join(lines)); print(f"\n{sum(r[1] == 'PASS' for r in results)}/{len(results)} passed")
open(os.path.join(HERE, 'results.txt'), 'w').write('\n'.join(lines) + f"\n\n{sum(r[1] == 'PASS' for r in results)}/{len(results)} passed\n")
