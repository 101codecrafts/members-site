// r12 ui-polish-copy: copy honesty guards (LG2 money wording, no raw error codes, no fake success, Q12 provider logos)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";

const R = p => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const srcPages = readdirSync(new URL("../src/", import.meta.url)).filter(f => f.endsWith(".html"));
const strip = s => s.replace(/<!--[\s\S]*?-->/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

test("LG2: no user-facing copy says 101 holds money 'in escrow'", () => {
  for (const f of srcPages.filter(f => !/^(terms|seller-terms|refunds)\.html$/.test(f))) {   // legal drafts are legal's
    const text = strip(R("src/" + f)).replace(/class="[^"]*"/g, "");   // the .pi-escrow CSS hook is not copy
    assert.doesNotMatch(text, /\bescrow\b/i, f);
  }
  for (const f of ["js/market.js", "js/market-data.js"]) {
    const visible = (strip(R(f)).match(/"[^"]*"|`[^`]*`/g) || []).join("\n").replace(/\bk\.escrow\b|\bescrow:|"Paid · in escrow"/g, "");   // legacy status key kept as an alias
    assert.doesNotMatch(visible, /in escrow|from escrow|Escrow frozen|held in escrow/i, f);
  }
});

test("errors never show a raw status, a Clerk status code or browser jargon", () => {
  const a = R("js/auth-flow.js");
  assert.doesNotMatch(a, /"Request failed \("/);
  assert.doesNotMatch(a, /\(" \+ esc\(r\.status\) \+ "\)/);
  assert.doesNotMatch(a, /Something went wrong/);
  assert.match(a, /function statusMsg\(st\)/);
  assert.doesNotMatch(R("js/builder.js"), /Something went wrong/);
});

test("no fake success when the API answers nothing (beta tests, tester list, bug reports)", () => {
  const p = R("js/pages.js");
  assert.match(p, /const r = await API\.joinCampaign\(id\); if \(!r\)/);
  assert.match(p, /const r = await API\.becomeTester\(\{\}\); toast\(r \?/);
  assert.doesNotMatch(p, /The reports backend is not connected yet/);
  for (const f of ["js/events.js", "js/feed.js"]) assert.doesNotMatch(R(f), /in-app \+ email|syncs when the backend|sync when the backend/, f);
});

test("Q12: provider names from the API map to the local logo files", () => {
  const p = R("js/pages.js");
  const body = p.match(/const provKey = k => \{([^\n]*)\};/);
  assert.ok(body, "provKey present");
  const PALIAS = { khanacademy: "khan", microsoftlearn: "microsoft", cisconetacad: "cisco", netacad: "cisco" };
  const provKey = new Function("PALIAS", "k", body[1]).bind(null, PALIAS);
  for (const [raw, key] of [["edX", "edx"], ["freeCodeCamp", "freecodecamp"], ["Coursera", "coursera"], ["Khan Academy", "khan"], ["Microsoft Learn", "microsoft"]]) {
    assert.equal(provKey(raw), key);
    assert.ok(existsSync(new URL(`../assets/img/courses/${key}.svg`, import.meta.url)), key + ".svg exists");
  }
  assert.match(p, /P\[x\.provider\] \? `assets\/img\/courses\/\$\{x\.provider\}\.svg` : ""/);
});
