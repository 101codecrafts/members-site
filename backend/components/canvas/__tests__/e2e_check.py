"""
Headless smoke check for the AI pages (run against `next dev`):
  BASE=http://localhost:3105 python3 components/canvas/__tests__/e2e_check.py
Checks: /whiteboard/scratch renders Excalidraw and drawing works; PNG export
button exists; /whiteboard/playground runs code in the sandbox; /assistant FAQ
accordion + a real streamed chat answer (needs AI_GATEWAY_API_KEY on the server).
Screenshots go to $OUT (default /tmp/ai-e2e).
"""
import os, sys, time
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:3105")
OUT = os.environ.get("OUT", "/tmp/ai-e2e")
os.makedirs(OUT, exist_ok=True)
results = []

def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""), flush=True)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get("CHROMIUM", "/usr/bin/chromium"), args=["--no-sandbox", "--no-proxy-server"])
    page = browser.new_page(viewport={"width": 1366, "height": 860})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))

    # ---- whiteboard scratch
    page.goto(f"{BASE}/whiteboard/scratch", wait_until="domcontentloaded", timeout=120_000)
    page.wait_for_selector("canvas.excalidraw__canvas, .excalidraw canvas", timeout=120_000)
    check("whiteboard: Excalidraw canvas rendered", page.locator(".excalidraw canvas").count() > 0)
    # draw a rectangle: press 'r' then drag
    page.locator(".excalidraw").click(position={"x": 600, "y": 400})
    page.keyboard.press("r")
    page.mouse.move(500, 300); page.mouse.down(); page.mouse.move(700, 450, steps=8); page.mouse.up()
    time.sleep(2.5)  # throttled local save (2 s)
    saved = page.evaluate("localStorage.getItem('101-whiteboard-scratch')")
    check("whiteboard: drawing persisted to scratch storage", saved and '"rectangle"' in saved, (saved or "")[:80])
    check("whiteboard: 'Ask AI about this board' button", page.get_by_role("button", name="✦ Ask AI about this board").count() == 1)
    check("whiteboard: PNG + SVG export buttons", page.get_by_role("button", name="PNG").count() == 1 and page.get_by_role("button", name="SVG").count() == 1)
    with page.expect_download(timeout=30_000) as dl:
        page.get_by_role("button", name="PNG").click()
    path = os.path.join(OUT, "board.png"); dl.value.save_as(path)
    check("whiteboard: PNG export downloads a file", os.path.getsize(path) > 1000, f"{os.path.getsize(path)} bytes")
    # Ask AI (explain) — real call to /api/assistant/board
    page.get_by_role("button", name="✦ Ask AI about this board").click()
    page.get_by_role("button", name="Explain my board").click()
    try:
        page.wait_for_selector("aside[aria-label='Ask AI about this board'] p, aside[aria-label='Ask AI about this board'] li", timeout=90_000)
        txt = page.locator("aside[aria-label='Ask AI about this board']").inner_text()
        check("whiteboard: Ask AI returned an explanation", len(txt) > 120, txt[:160].replace("\n", " "))
    except Exception as e:  # noqa
        check("whiteboard: Ask AI returned an explanation", False, str(e)[:120])
    page.screenshot(path=os.path.join(OUT, "whiteboard.png"))

    # ---- playground
    page.goto(f"{BASE}/whiteboard/playground", wait_until="domcontentloaded", timeout=120_000)
    page.get_by_role("button", name="▶ Run").wait_for(timeout=60_000)
    time.sleep(2)
    page.select_option("select[aria-label='Example']", "grid")
    page.get_by_role("button", name="▶ Run").click()
    time.sleep(1.5)
    console = page.locator("[aria-label='Console output']").inner_text()
    check("playground: sandboxed code ran (console captured)", "Grid drawn" in console, console[:80])
    page.screenshot(path=os.path.join(OUT, "playground.png"))

    # ---- assistant
    page.goto(f"{BASE}/assistant", wait_until="domcontentloaded", timeout=120_000)
    faq_btn = page.get_by_role("button", name="How do I pay for paid programmes or events?")
    faq_btn.wait_for(timeout=120_000)
    for _ in range(20):  # dev server: wait until React has hydrated and the click toggles
        faq_btn.click()
        try:
            page.wait_for_selector("[role=region]", timeout=2_000)
            break
        except Exception:  # noqa
            time.sleep(1)
    region = page.locator("[role=region]").first.inner_text()
    check("assistant: FAQ accordion opens", "Flutterwave" in region and "TODO-CONFIRM" not in region)
    page.fill("#faq-search", "laptop")
    check("assistant: FAQ search filters", page.get_by_role("button", name="Do I need a laptop?").count() == 1)
    page.fill("#ai-input", "How much does it cost to join?")
    page.get_by_role("button", name="Send").click()
    try:
        page.wait_for_function("() => document.querySelectorAll('[role=log] a[title]').length > 0 || /free/i.test(document.querySelector('[role=log]').innerText.split('cost to join?')[1]||'')", timeout=90_000)
        page.wait_for_selector("button:has-text('Send')", timeout=90_000)
        log = page.locator("[role=log]").inner_text()
        check("assistant: streamed answer says joining is free", "free" in log.lower(), log[-200:].replace("\n", " "))
        check("assistant: answer shows sources", "sources" in log.lower())
    except Exception as e:  # noqa
        check("assistant: streamed answer", False, str(e)[:160])
    page.screenshot(path=os.path.join(OUT, "assistant.png"), full_page=False)

    # ---- 101 AI hub (Clerk dummy key in local dev → session unknown; checks render + model picker)
    page.goto(f"{BASE}/ai", wait_until="domcontentloaded", timeout=120_000)
    page.wait_for_selector("select#model option:nth-child(2)", state="attached", timeout=120_000)
    opts = page.locator("select#model option").all_inner_texts()
    check("ai hub: renders with free-model picker", len(opts) >= 2 and "Auto" in opts[0], ", ".join(opts)[:160])
    check("ai hub: tools listed (chat, code helper, lesson, image soon)", page.get_by_role("button", name="Code helper").count() == 1 and page.get_by_text("Coming soon").count() == 1)
    page.screenshot(path=os.path.join(OUT, "ai-hub.png"))

    real_errors = [e for e in errors if "clerk" not in e.lower()]
    check("no uncaught page errors (excluding Clerk dummy-key noise)", not real_errors, "; ".join(real_errors)[:200])
    browser.close()

failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
sys.exit(1 if failed else 0)
