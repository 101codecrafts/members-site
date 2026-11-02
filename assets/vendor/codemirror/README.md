# CodeMirror 6 bundle (vendored, pinned)

`cm6-6.0.2.bundle.min.js` is an esbuild IIFE build of `entry.js` that exposes `window.CM6`
(basicSetup, EditorView, EditorState, Compartment, keymap, indentWithTab, lang.{cpp,c,java,python,javascript}).

Pinned versions: codemirror 6.0.2, @codemirror/state 6.7.6, view 6.43.15, commands 6.11.1, language 6.13.1,
autocomplete 6.20.4, search 6.7.2, lint 6.9.7, lang-cpp 6.0.3, lang-java 6.0.2, lang-python 6.2.1,
lang-javascript 6.2.5, @lezer/* (common 1.5.5, lr 1.4.12, highlight 1.2.5, cpp 1.1.6, java 1.1.5, python 1.1.19, javascript 1.5.6).

Why vendored: jsDelivr's `/+esm` builds are generated on the fly and jsDelivr says not to use SRI on them.
A static file is SRI-safe, so `js/code-editor.js` loads this exact file from jsDelivr's GitHub CDN pinned to a commit
(`cdn.jsdelivr.net/gh/101codecrafts/members-site@<sha>/assets/vendor/codemirror/...`) with `integrity=sha384-…`,
and falls back to this same-origin copy (same hash). Lite mode never loads it (plain textarea).

Rebuild: `npm i codemirror@6.0.2 @codemirror/state@6.7.6 @codemirror/view@6.43.15 @codemirror/lang-cpp@6.0.3 @codemirror/lang-java@6.0.2 @codemirror/lang-python@6.2.1 @codemirror/lang-javascript@6.2.5 @codemirror/commands@6.11.1 esbuild@0.25.0`
then `npx esbuild entry.js --bundle --minify --format=iife --legal-comments=none --outfile=cm6-6.0.2.bundle.min.js`,
recompute `openssl dgst -sha384 -binary FILE | openssl base64 -A`, update CM_SRI and CM_SHA in js/code-editor.js.
CodeMirror and Lezer are MIT licensed (c) Marijn Haverbeke and others.
