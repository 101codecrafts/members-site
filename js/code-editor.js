/* 101 code editor: CodeMirror 6 (pinned bundle, SRI) with a plain <textarea> fallback.
   - Lite mode / data saver / ?static=1: textarea only, nothing downloaded.
   - Normal: loads the vendored CM6 bundle from jsDelivr's GitHub CDN pinned to a commit, with SRI; falls back to the
     same-origin copy (same hash). See assets/vendor/codemirror/README.md.
   Keyboard: in CodeMirror, Tab indents; press Esc then Tab to move focus out of the editor. */
(function () {
  const CM_SHA = "a425e9322755b54fcba81615d18ab451fd5ec512";
  const CM_FILE = "assets/vendor/codemirror/cm6-6.0.2.bundle.min.js";
  const CM_SRI = "sha384-C2fWdEITJ3G0NJQGq/FwrJFiODiMilokzjqBKXKhKnoYp5Ll+whkoUlBgan1eVAs";
  const CDN = `https://cdn.jsdelivr.net/gh/101codecrafts/members-site@${CM_SHA}/${CM_FILE}`;
  const html = document.documentElement;
  const lite = () => html.classList.contains("lite") || html.classList.contains("static") || /[?&]static/.test(location.search);

  let loading = null;
  function addScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement("script"); s.src = src; s.async = true;
      if (location.protocol !== "file:") { s.integrity = CM_SRI; if (/^https:/.test(src)) s.crossOrigin = "anonymous"; } // file:// previews can't do CORS/SRI
      s.onload = () => window.CM6 ? res(window.CM6) : rej(new Error("no CM6")); s.onerror = () => { s.remove(); rej(new Error("load " + src)); };
      document.head.appendChild(s);
    });
  }
  function loadCM() {
    if (window.CM6) return Promise.resolve(window.CM6);
    if (!loading) loading = (location.protocol === "file:" ? addScript(CM_FILE) : addScript(CDN).catch(() => addScript(CM_FILE)));
    return loading;
  }

  const theme = () => window.CM6.EditorView.theme({
    "&": { fontSize: "var(--step--1)", height: "100%", background: "#fff" },
    ".cm-scroller": { fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", lineHeight: "1.55" },
    ".cm-gutters": { background: "#f1f4f6", color: "#3e5d74", borderRight: "2px solid #0B1236" },
    ".cm-activeLine": { background: "rgba(5,230,242,.08)" }, ".cm-activeLineGutter": { background: "rgba(252,140,12,.18)", color: "#0B1236" },
    "&.cm-focused": { outline: "3px solid var(--focus,#00758A)", outlineOffset: "-3px" }, ".cm-cursor": { borderLeftColor: "#0B1236", borderLeftWidth: "2px" }
  });

  /* create(host, { value, lang, label, onChange }) -> { get, set, setLang, focus, kind } */
  function create(host, o = {}) {
    host.classList.add("ed-host");
    const ta = document.createElement("textarea");
    ta.className = "ed-ta"; ta.spellcheck = false; ta.autocapitalize = "off"; ta.setAttribute("autocomplete", "off");
    ta.setAttribute("aria-label", o.label || "Code editor"); ta.value = o.value || "";
    ta.addEventListener("input", () => o.onChange && o.onChange(ta.value));
    host.appendChild(ta);
    const api = { kind: "textarea", get: () => ta.value, set: v => { ta.value = v; }, setLang: () => {}, focus: () => ta.focus() };
    if (lite()) { host.dataset.editor = "textarea"; return api; }
    loadCM().then(CM => {
      const langC = new CM.Compartment();
      const view = new CM.EditorView({
        parent: host,
        state: CM.EditorState.create({ doc: ta.value, extensions: [CM.basicSetup, CM.keymap.of([CM.indentWithTab]), langC.of((CM.lang[o.lang] || CM.lang.cpp)()), theme(),
          CM.EditorView.contentAttributes.of({ "aria-label": o.label || "Code editor" }),
          CM.EditorView.updateListener.of(u => { if (u.docChanged && o.onChange) o.onChange(view.state.doc.toString()); })] })
      });
      ta.remove(); host.dataset.editor = "codemirror";
      Object.assign(api, { kind: "codemirror", view,
        get: () => view.state.doc.toString(),
        set: v => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: v } }),
        setLang: l => view.dispatch({ effects: langC.reconfigure((CM.lang[l] || CM.lang.cpp)()) }),
        focus: () => view.focus() });
    }).catch(() => { host.dataset.editor = "textarea"; });
    return api;
  }
  window.CC_EDITOR = { create, loadCM };
})();
