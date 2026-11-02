/*!
 * 101 Assistant — drop-in chat bubble for the static 101 Codecrafts pages.
 * No dependencies. Renders inside a Shadow DOM so it never clashes with page CSS.
 *
 * Add ONE tag before </body> on any page:
 *   <script src="/js/assistant-widget.js" defer></script>
 * Optional attributes (defaults shown):
 *   data-api="/api/assistant"        streaming chat endpoint (Next.js app)
 *   data-faq="/api/faq"              FAQ JSON endpoint
 *   data-page="/assistant"           full-page assistant link
 *   data-open="false"                open on load
 * If the static pages are served from a different origin than the Next.js app,
 * use absolute URLs and add that origin to AI_ALLOWED_ORIGINS on the server.
 *
 * Security: model output is inserted with textContent / createElement only
 * (never innerHTML); links are limited to http(s), mailto and same-site paths.
 */
(function () {
  "use strict";
  if (window.__codecraftsAssistant) return;
  window.__codecraftsAssistant = true;

  var script = document.currentScript || document.querySelector('script[src*="assistant-widget"]');
  var cfg = {
    api: (script && script.getAttribute("data-api")) || "/api/assistant",
    faq: (script && script.getAttribute("data-faq")) || "/api/faq",
    page: (script && script.getAttribute("data-page")) || "/assistant",
    open: script && script.getAttribute("data-open") === "true",
  };
  var STORE = "101-assistant-widget-v1";
  var MAX_INPUT = 4000;

  // ------------------------------------------------------------------ styles
  var css = [
    ":host{all:initial}",
    "*{box-sizing:border-box}",
    ".w{--o:#fc8c0c;--c:#05e6f2;--n:#011d3c;--ink:#10181f;--page:#f7f8f8;--muted:#3e5d74;font-family:Barlow,system-ui,-apple-system,'Segoe UI',sans-serif;color:var(--ink);position:fixed;right:20px;bottom:20px;z-index:2147483000}",
    ".fab{display:flex;align-items:center;gap:10px;border:3px solid var(--ink);background:var(--o);color:var(--ink);padding:12px 16px;font:800 14px/1 'Saira Semi Condensed','Arial Narrow',system-ui,sans-serif;letter-spacing:.1em;text-transform:uppercase;box-shadow:6px 6px 0 var(--ink);cursor:pointer;transition:transform .12s,box-shadow .12s}",
    ".fab:hover{transform:translate(-2px,-2px);box-shadow:8px 8px 0 var(--ink)}",
    ".fab:active{transform:translate(3px,3px);box-shadow:2px 2px 0 var(--ink)}",
    ".fab i{width:14px;height:14px;background:var(--c);border:2px solid var(--ink);display:inline-block}",
    ".panel{position:absolute;right:0;bottom:64px;width:min(400px,calc(100vw - 32px));height:min(620px,calc(100vh - 110px));background:#fff;border:3px solid var(--ink);box-shadow:8px 8px 0 var(--ink);display:none;flex-direction:column}",
    ".open .panel{display:flex}",
    ".head{display:flex;align-items:center;justify-content:space-between;background:var(--n);color:#fff;padding:10px 12px;border-bottom:3px solid var(--ink)}",
    ".head b{font:800 14px/1 'Saira Semi Condensed','Arial Narrow',system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase}",
    ".head b:before{content:'';display:inline-block;width:10px;height:10px;background:var(--c);border:2px solid #fff;margin-right:8px;vertical-align:-1px}",
    ".x{border:2px solid #fff;background:transparent;color:#fff;width:30px;height:30px;font:800 16px/1 system-ui;cursor:pointer}",
    ".tabs{display:grid;grid-template-columns:1fr 1fr;border-bottom:3px solid var(--ink)}",
    ".tabs button{border:0;background:#fff;padding:9px;font:800 12px 'Saira Semi Condensed','Arial Narrow',system-ui;letter-spacing:.1em;text-transform:uppercase;cursor:pointer}",
    ".tabs button+button{border-left:3px solid var(--ink)}",
    ".tabs button[aria-selected=true]{background:var(--c);color:var(--n)}",
    ".log{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:10px;background:var(--page)}",
    ".m{max-width:90%;padding:9px 12px;border:2px solid var(--ink);font-size:14.5px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}",
    ".u{align-self:flex-end;background:var(--o);box-shadow:-3px 3px 0 var(--ink)}",
    ".b{align-self:flex-start;background:#fff;box-shadow:3px 3px 0 var(--c)}",
    ".b a{color:#0a5f8f}",
    ".b pre{white-space:pre;overflow-x:auto;background:var(--n);color:#e8f7ff;padding:8px;margin:6px 0;font:12.5px/1.45 ui-monospace,Menlo,Consolas,monospace}",
    ".cite{display:inline-block;min-width:18px;text-align:center;background:var(--c);color:var(--n)!important;border:1.5px solid var(--ink);font:800 11px/16px system-ui;text-decoration:none;margin:0 2px;padding:0 3px}",
    ".src{margin-top:8px;padding-top:6px;border-top:2px dashed #cfd8de;font-size:12.5px;white-space:normal}",
    ".src a{display:block;color:var(--n)}",
    ".dots span{display:inline-block;width:7px;height:7px;margin-right:3px;background:var(--o);border:1.5px solid var(--ink);animation:b 1s infinite steps(2)}",
    ".dots span:nth-child(2){animation-delay:.2s;background:var(--c)}.dots span:nth-child(3){animation-delay:.4s}",
    "@keyframes b{50%{transform:translateY(-3px)}}",
    "@media (prefers-reduced-motion:reduce){.dots span{animation:none}.fab{transition:none}}",
    ".chips{display:flex;flex-wrap:wrap;gap:6px}",
    ".chip{border:2px solid var(--ink);background:#fff;padding:5px 8px;font:600 12.5px system-ui;cursor:pointer;box-shadow:2px 2px 0 var(--ink)}",
    "form{display:flex;gap:8px;padding:10px;border-top:3px solid var(--ink);background:#fff}",
    "textarea{flex:1;resize:none;border:2px solid var(--ink);padding:9px;font:14px/1.4 system-ui;min-height:42px;max-height:120px}",
    ".send{border:2px solid var(--ink);background:var(--o);font:800 12px 'Saira Semi Condensed','Arial Narrow',system-ui;letter-spacing:.1em;text-transform:uppercase;padding:0 14px;cursor:pointer;box-shadow:3px 3px 0 var(--ink)}",
    ".send:disabled{opacity:.5;cursor:not-allowed}",
    "button:focus-visible,textarea:focus-visible,input:focus-visible,a:focus-visible{outline:3px solid #00b9e6;outline-offset:2px}",
    ".foot{font-size:11px;color:var(--muted);padding:0 10px 8px;background:#fff}",
    ".foot a{color:var(--n)}",
    ".faq{flex:1;overflow-y:auto;padding:10px;display:none;flex-direction:column;gap:8px;background:var(--page)}",
    ".faq input{border:2px solid var(--ink);padding:9px;font:14px system-ui;box-shadow:3px 3px 0 var(--c)}",
    ".q{border:2px solid var(--ink);background:#fff}",
    ".q>button{all:unset;box-sizing:border-box;display:flex;justify-content:space-between;gap:8px;width:100%;padding:10px;font:700 14px/1.3 system-ui;color:var(--n);cursor:pointer}",
    ".q>button[aria-expanded=true]{background:var(--c)}",
    ".q p{margin:0;padding:0 10px 10px;font-size:13.5px;line-height:1.5;white-space:pre-line}",
    ".q .ask{all:unset;cursor:pointer;margin:0 10px 10px;font:800 11px system-ui;text-transform:uppercase;text-decoration:underline;color:var(--n)}",
    ".badge{display:inline-block;margin:0 10px 8px;border:1.5px solid var(--o);background:#fff7e8;font:800 10px system-ui;text-transform:uppercase;padding:2px 5px}",
    ".sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}",
    "@media (max-width:480px){.w{right:12px;bottom:12px}.panel{bottom:60px}}",
  ].join("");

  // ------------------------------------------------------------- dom helpers
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === "text") n.textContent = attrs[k];
      else if (k.slice(0, 2) === "on") n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return n;
  }
  function safeHref(u) {
    u = String(u || "").trim();
    if (u.charAt(0) === "/" && u.charAt(1) !== "/") return u;
    if (/^https?:\/\//i.test(u) || /^mailto:/i.test(u)) return u;
    return null;
  }

  /** Render assistant text (markdown-lite) using DOM nodes only. */
  function renderAnswer(container, text, citations) {
    container.textContent = "";
    var parts = String(text).split(/```[a-zA-Z0-9]*\n?/);
    parts.forEach(function (chunk, i) {
      if (i % 2 === 1) { container.appendChild(el("pre", { text: chunk.replace(/\n$/, "") })); return; }
      var re = /(\*\*[^*]+\*\*)|(\[([^\]]+)\]\(([^)\s]+)\))|(\[(\d{1,2})\])|(`[^`]+`)|(https?:\/\/[^\s)]+)/g, last = 0, m;
      while ((m = re.exec(chunk))) {
        if (m.index > last) container.appendChild(document.createTextNode(chunk.slice(last, m.index)));
        if (m[1]) container.appendChild(el("strong", { text: m[1].slice(2, -2) }));
        else if (m[2]) {
          var h = safeHref(m[4]);
          container.appendChild(h ? el("a", { href: h, target: h.charAt(0) === "/" ? "_self" : "_blank", rel: "noopener noreferrer", text: m[3] }) : document.createTextNode(m[3]));
        } else if (m[5]) {
          var c = (citations || []).filter(function (x) { return x.n === Number(m[6]); })[0], ch = c && safeHref(c.url);
          container.appendChild(ch ? el("a", { class: "cite", href: ch, title: c.title, text: String(c.n) }) : document.createTextNode(m[5]));
        } else if (m[7]) container.appendChild(el("code", { text: m[7].slice(1, -1) }));
        else if (m[8]) { var hu = safeHref(m[8]); container.appendChild(hu ? el("a", { href: hu, target: "_blank", rel: "noopener noreferrer", text: m[8] }) : document.createTextNode(m[8])); }
        last = m.index + m[0].length;
      }
      if (last < chunk.length) container.appendChild(document.createTextNode(chunk.slice(last)));
    });
    var used = {};
    String(text).replace(/\[(\d{1,2})\]/g, function (_, n) { used[n] = 1; return _; });
    var srcs = (citations || []).filter(function (c) { return used[c.n] && safeHref(c.url); });
    if (srcs.length) {
      var box = el("div", { class: "src" }, [el("b", { text: "Sources" })]);
      srcs.forEach(function (c) { box.appendChild(el("a", { href: safeHref(c.url), text: "[" + c.n + "] " + c.title })); });
      container.appendChild(box);
    }
  }

  // --------------------------------------------------------------- state ---
  var state = { messages: [], busy: false, conversationId: null };
  try { var saved = JSON.parse(sessionStorage.getItem(STORE) || "null"); if (saved && Array.isArray(saved.messages)) state = Object.assign(state, saved, { busy: false }); } catch (e) {}
  function persist() { try { sessionStorage.setItem(STORE, JSON.stringify({ messages: state.messages.slice(-20), conversationId: state.conversationId })); } catch (e) {} }

  // ------------------------------------------------------------------ build
  var host = el("div", { id: "codecrafts-assistant" });
  var root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
  root.appendChild(el("style", { text: css }));
  var wrap = el("div", { class: "w" });
  var log = el("div", { class: "log", role: "log", "aria-live": "polite" });
  var faqBox = el("div", { class: "faq", role: "tabpanel", "aria-label": "FAQ" });
  var input = el("textarea", { rows: "1", maxlength: String(MAX_INPUT), placeholder: "Ask about joining, paths, events…", "aria-label": "Message the 101 Assistant" });
  var send = el("button", { class: "send", type: "submit", text: "Send" });
  var form = el("form", { onsubmit: function (e) { e.preventDefault(); ask(input.value); } }, [input, send]);
  var tabChat = el("button", { role: "tab", "aria-selected": "true", type: "button", text: "Chat", onclick: function () { showTab("chat"); } });
  var tabFaq = el("button", { role: "tab", "aria-selected": "false", type: "button", text: "FAQ", onclick: function () { showTab("faq"); } });
  var panel = el("div", { class: "panel", role: "dialog", "aria-label": "101 Assistant", "aria-modal": "false" }, [
    el("div", { class: "head" }, [el("b", { text: "101 Assistant" }), el("button", { class: "x", type: "button", "aria-label": "Close assistant", text: "×", onclick: function () { toggle(false); } })]),
    el("div", { class: "tabs", role: "tablist" }, [tabChat, tabFaq]),
    log, faqBox, form,
    el("div", { class: "foot" }, ["AI can make mistakes — confirm prices & dates. ", el("a", { href: cfg.page, text: "Open full assistant →" })]),
  ]);
  var fab = el("button", { class: "fab", type: "button", "aria-expanded": "false", "aria-controls": "panel", onclick: function () { toggle(); } }, [el("i", { "aria-hidden": "true" }), "Ask 101 AI"]);
  wrap.appendChild(panel); wrap.appendChild(fab); root.appendChild(wrap);

  input.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(input.value); } });
  wrap.addEventListener("keydown", function (e) { if (e.key === "Escape") toggle(false); });

  function toggle(force) {
    var open = typeof force === "boolean" ? force : !wrap.classList.contains("open");
    wrap.classList.toggle("open", open);
    fab.setAttribute("aria-expanded", String(open));
    if (open) { renderLog(); setTimeout(function () { input.focus(); }, 30); } else fab.focus();
  }
  function showTab(t) {
    var chat = t === "chat";
    tabChat.setAttribute("aria-selected", String(chat)); tabFaq.setAttribute("aria-selected", String(!chat));
    log.style.display = chat ? "flex" : "none"; form.style.display = chat ? "flex" : "none"; faqBox.style.display = chat ? "none" : "flex";
    if (!chat) loadFaq();
  }

  function renderLog() {
    log.textContent = "";
    if (!state.messages.length) {
      log.appendChild(el("div", { class: "m b", text: "Hi! I'm the 101 Assistant. Ask me about joining, learning paths, courses, events or payments — or paste code to explain." }));
      var chips = el("div", { class: "chips" });
      ["How do I join?", "Which path suits me?", "Upcoming events?", "How do I pay?"].forEach(function (q) { chips.appendChild(el("button", { class: "chip", type: "button", text: q, onclick: function () { ask(q); } })); });
      log.appendChild(chips);
    }
    state.messages.forEach(function (m) {
      var node = el("div", { class: "m " + (m.role === "user" ? "u" : "b") });
      if (m.role === "user") node.textContent = m.content; else renderAnswer(node, m.content, m.citations);
      log.appendChild(node);
    });
    log.scrollTop = log.scrollHeight;
  }

  // ------------------------------------------------------------- streaming
  function ask(text) {
    text = String(text || "").trim().slice(0, MAX_INPUT);
    if (!text || state.busy) return;
    input.value = "";
    state.messages.push({ role: "user", content: text });
    var bot = { role: "assistant", content: "", citations: [] };
    state.messages.push(bot);
    renderLog();
    var bubble = log.lastChild;
    bubble.textContent = "";
    bubble.appendChild(el("span", { class: "dots", "aria-label": "Assistant is typing" }, [el("span"), el("span"), el("span")]));
    state.busy = true; send.disabled = true;

    var body = { messages: state.messages.slice(0, -1).slice(-16).map(function (m) { return { role: m.role, content: m.content }; }) };
    if (state.conversationId) body.conversationId = state.conversationId;

    fetch(cfg.api, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(body) })
      .then(function (res) {
        if (res.status === 429) return res.json().then(function (j) { throw new Error(j.message || "You've hit the chat limit — try again in a few minutes."); });
        if (!res.ok || !res.body) throw new Error("The assistant is unavailable right now. Please try again shortly.");
        var reader = res.body.getReader(), dec = new TextDecoder(), buf = "";
        function pump() {
          return reader.read().then(function (r) {
            if (r.done) return;
            buf += dec.decode(r.value, { stream: true });
            var lines = buf.split("\n"); buf = lines.pop();
            lines.forEach(function (line) {
              if (line.indexOf("data: ") !== 0) return;
              var data = line.slice(6).trim();
              if (!data || data === "[DONE]") return;
              var ev; try { ev = JSON.parse(data); } catch (e) { return; }
              if (ev.messageMetadata) {
                if (ev.messageMetadata.citations) bot.citations = ev.messageMetadata.citations;
                if (ev.messageMetadata.conversationId) state.conversationId = ev.messageMetadata.conversationId;
              }
              if (ev.type === "text-delta" && typeof ev.delta === "string") { bot.content += ev.delta; renderAnswer(bubble, bot.content, bot.citations); log.scrollTop = log.scrollHeight; }
              if (ev.type === "error") bot.content = bot.content || (ev.errorText || "Sorry, something went wrong.");
            });
            return pump();
          });
        }
        return pump();
      })
      .catch(function (err) { bot.content = err && err.message ? err.message : "Sorry, something went wrong."; })
      .then(function () {
        if (!bot.content) bot.content = "Sorry, I couldn't answer that. Please try again.";
        renderAnswer(bubble, bot.content, bot.citations);
        state.busy = false; send.disabled = false; persist(); input.focus();
      });
  }

  // ------------------------------------------------------------------- FAQ
  var faqLoaded = false;
  function loadFaq() {
    if (faqLoaded) return; faqLoaded = true;
    faqBox.textContent = "";
    var search = el("input", { type: "search", placeholder: "Search FAQs…", "aria-label": "Search FAQs" });
    var list = el("div");
    faqBox.appendChild(search); faqBox.appendChild(list);
    var items = [];
    function draw() {
      var q = search.value.toLowerCase().trim(); list.textContent = "";
      var shown = items.filter(function (f) { return !q || (f.question + " " + f.answer + " " + (f.tags || []).join(" ")).toLowerCase().indexOf(q) !== -1; });
      if (!shown.length) list.appendChild(el("div", { class: "m b", text: "No match — try the Chat tab." }));
      shown.forEach(function (f) {
        var a = el("div", { hidden: "" }, [el("p", { text: f.answer }), f.beingConfirmed ? el("span", { class: "badge", text: "Details being confirmed" }) : null,
          el("button", { class: "ask", type: "button", text: "Ask a follow-up →", onclick: function () { showTab("chat"); ask(f.question); } })]);
        var b = el("button", { type: "button", "aria-expanded": "false", onclick: function () { var o = b.getAttribute("aria-expanded") === "true"; b.setAttribute("aria-expanded", String(!o)); if (o) a.setAttribute("hidden", ""); else a.removeAttribute("hidden"); } }, [f.question, el("span", { "aria-hidden": "true", text: "+" })]);
        list.appendChild(el("div", { class: "q" }, [b, a]));
      });
    }
    search.addEventListener("input", draw);
    fetch(cfg.faq, { credentials: "omit" }).then(function (r) { return r.json(); }).then(function (j) { items = (j && j.items) || []; draw(); })
      .catch(function () { faqLoaded = false; list.appendChild(el("div", { class: "m b", text: "Couldn't load the FAQ right now." })); });
  }

  function mount() { document.body.appendChild(host); if (cfg.open) toggle(true); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
})();
