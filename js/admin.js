/* Admin console: legacy "Tools" tab (round 11). The console itself is js/admin-console.js (real data only).
   What stays here: the social links editor. The announcement composer is wired by js/feed.js.
   The old demo KPI/chart/user/payout tables were removed: admins never see invented numbers. */
(function () {
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const API = window.CC_API, D = window.CC_DATA || {};
  const ico = n => (window.CC_UI && window.CC_UI.ico) ? window.CC_UI.ico(n) : "";
  if (!$("#ls-social") || !API) return;
  let social = [];
  function renderSocial() {
    $("#ls-social").innerHTML = social.map((s, i) => `<li class="li soc-row" draggable="true" data-i="${i}">
      <button type="button" class="btn sm drag" aria-label="Reorder ${esc(s.label)} (use arrow keys)">${ico("grip")}</button>
      <span class="date" style="background:var(--fill-inverse);color:#fff">${ico(s.icon)}</span>
      <label class="field grow"><span>${esc(s.label)}</span><input type="url" value="${esc(s.url)}" placeholder="https://…" data-k="url"></label>
      <span class="toggle"><input type="checkbox" data-k="active" ${s.active ? "checked" : ""} aria-label="Show ${esc(s.label)}"><span></span></span></li>`).join("");
    $("#social-preview").innerHTML = (window.CC_UI && window.CC_UI.socialRow(social)) || `<small class="muted">No active links yet</small>`;
  }
  async function socialEditor() {
    const live = await API.fetchSocialLinks().catch(() => null);
    social = live || JSON.parse(JSON.stringify(D.social || []));
    renderSocial();
    const list = $("#ls-social"); let from = null;
    list.addEventListener("input", e => { const row = e.target.closest(".soc-row"); if (!row) return; const s = social[row.dataset.i]; if (e.target.dataset.k === "url") s.url = e.target.value.trim(); if (e.target.dataset.k === "active") s.active = e.target.checked; $("#social-preview").innerHTML = window.CC_UI.socialRow(social); });
    list.addEventListener("change", e => { if (e.target.dataset.k === "active") { social[e.target.closest(".soc-row").dataset.i].active = e.target.checked; renderSocial(); } });
    list.addEventListener("dragstart", e => { from = +e.target.closest(".soc-row").dataset.i; e.dataTransfer.effectAllowed = "move"; });
    list.addEventListener("dragover", e => e.preventDefault());
    list.addEventListener("drop", e => { e.preventDefault(); const row = e.target.closest(".soc-row"); if (!row) return; const to = +row.dataset.i; const [m] = social.splice(from, 1); social.splice(to, 0, m); renderSocial(); });
    list.addEventListener("keydown", e => { const b = e.target.closest(".drag"); if (!b || !["ArrowUp", "ArrowDown"].includes(e.key)) return; e.preventDefault(); const i = +b.closest(".soc-row").dataset.i, j = i + (e.key === "ArrowUp" ? -1 : 1); if (j < 0 || j >= social.length) return; [social[i], social[j]] = [social[j], social[i]]; renderSocial(); $$(".drag", list)[j].focus(); });
    $("#social-save").onclick = async () => { const bad = social.find(s => s.url && !/^https:\/\//.test(s.url)); if (bad) { $("#social-msg").textContent = `${bad.label}: links must start with https://`; return; } const r = await API.saveSocialLinks(social).catch(() => null); $("#social-msg").textContent = r ? "Saved. Every footer now uses these links." : "Links not saved: the server didn't accept them. Try again in a minute."; };
  }
  /* the Tools tab is lazy: build the editor the first time it opens */
  let built = false;
  const go = () => { if (!built && location.hash === "#tools") { built = true; socialEditor(); } };
  addEventListener("hashchange", go); go();
})();
