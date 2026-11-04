# Real-engine check (no mocks): which voices / APIs this headless Chromium exposes, and what the module does with them.
import os, subprocess, sys, time, json
from playwright.sync_api import sync_playwright
ROOT, PORT = sys.argv[1], int(sys.argv[2])
srv = subprocess.Popen([sys.executable, os.environ['SERVE'], ROOT, str(PORT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
out = {}
with sync_playwright() as pw:
    for mode, args in [('headless', []), ('headless+speech-dispatcher', ['--enable-speech-dispatcher'])]:
        b = pw.chromium.launch(executable_path=os.environ['CHROME'], args=['--no-sandbox'] + args)
        p = b.new_page(); errs = []; p.on('pageerror', lambda e: errs.append(str(e)))
        p.goto(f'http://127.0.0.1:{PORT}/voice.html'); p.wait_for_timeout(3000)
        r = p.evaluate('''async () => { const v = speechSynthesis.getVoices(); localStorage.cc_ai_voice = "1"; const ev = [];
          ['start','end','error'].forEach(e => AIVoice.on(e, a => ev.push([e, a])));
          const ok = AIVoice.speak("Hello from one oh one Codecrafts.", {final: true}); await new Promise(r => setTimeout(r, 6000));
          return {ua: navigator.userAgent, voices: v.map(x => x.name + ' ' + x.lang), supported: AIVoice.supported(), picked: AIVoice.voice() && AIVoice.voice().name, speakOk: ok, events: ev, state: AIVoice.state(),
                  hasSR: !!window.SpeechRecognition, hasWebkitSR: !!window.webkitSpeechRecognition}; }''')
        r['pageErrors'] = errs; out[mode] = r; b.close()
srv.terminate(); print(json.dumps(out, indent=1))
