// r12 ui-a11y regressions (source-level; the axe/keyboard runs live in work/round12/ui-skills/a11y/tools)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const R = p => readFileSync(new URL("../" + p, import.meta.url), "utf8");

test("Q17 auth consent links are underlined on the live page (WCAG 1.4.1)", () => {
  assert.match(R("css/auth-flow.css"), /html:not\(\.static\) \.af-legal a\{text-decoration:underline/);
});
test("Q18 plan meter: no aria-label on a role-less div; the visible text carries the value", () => {
  const s = R("js/learner.js");
  assert.doesNotMatch(s, /class="meter" aria-label=/);
  assert.match(s, /class="meter" aria-hidden="true"/);
  assert.match(s, /course\$\{maxCourses === 1 \? "" : "s"\} used<\/small>/);
});
test("Q20 words tile: accessible name comes from the visible words (WCAG 2.5.3)", () => {
  const s = R("src/index.html"), a = s.slice(s.indexOf('<a class="hov words-tile"'), s.indexOf("</a>", s.indexOf('<a class="hov words-tile"')));
  assert.doesNotMatch(a, /aria-label=/);
  assert.doesNotMatch(a, /<ul class="wt-list" aria-hidden/);
  assert.match(a, /<span class="sr-only">: join 101 Codecrafts<\/span>/);
});
test("course error view keeps a page h1", () => {
  assert.match(R("js/pages.js"), /"courses\.html", "Browse courses", "h1"\)/);
});
test("SplitText never names a plain div with aria-label", () => {
  assert.match(R("js/motion.js"), /aria: named \? "auto" : "hidden"/);
});
test("index skip link lands on the hero h1, not the wrapper that starts with the header", () => {
  const s = R("src/index.html");
  assert.match(s, /<a class="skip" href="#start">/);
  assert.match(s, /<h1 id="start" tabindex="-1"/);
});
test("search dialog: no listbox without options; focus trapped and restored; polite count", () => {
  const s = R("js/ui.js");
  assert.doesNotMatch(s, /class="ccs-list" role="listbox"/);
  assert.match(s, /o\._from = document\.activeElement/);
  assert.match(s, /role="status" aria-live="polite"><\/p><ul class="ccs-list">/);
});
test("launch promo bar is inserted after the skip link", () => {
  assert.match(R("js/ads.js"), /sk \? sk\.after\(b\)/);
});
