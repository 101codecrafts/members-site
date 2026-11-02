/* Tutor view — data from CC_API.fetchTutorOverview(), payout requests via CC_API.requestPayout() */
(async function () {
  const { $, esc, ugx } = window.CC_UI, API = window.CC_API;
  const t = await API.fetchTutorOverview(); const cls = ["or", "", "ink", "cy"];
  $("#t-kpis").innerHTML = t.kpis.map((k, i) => `<div class="kpi ${cls[i]}"><small>${esc(k.label)}</small><b>${k.money ? ugx(k.value) : esc(k.value)}</b></div>`).join("");
  $("#tb-tc tbody").innerHTML = t.courses.map(c => `<tr><td><b>${esc(c.title)}</b></td><td>${c.learners}</td><td><span class="pill ${c.status.split(" ")[0]}">${esc(c.status)}</span></td><td>${c.completion ? c.completion + "%" : "—"}</td></tr>`).join("");
  $("#tb-tl tbody").innerHTML = t.learners.map(l => `<tr><td><b>${esc(l.name)}</b></td><td>${esc(l.course)}</td><td><div class="row" style="flex-wrap:nowrap"><div class="prog" style="flex:1" role="progressbar" aria-valuenow="${l.progress}" aria-valuemin="0" aria-valuemax="100" aria-label="${esc(l.name)} progress"><i style="width:${l.progress}%"></i></div><b>${l.progress}%</b></div></td><td>${esc(l.last)}</td></tr>`).join("");
  $("#ls-sessions").innerHTML = t.sessions.map(s => `<div class="li"><span class="date"><span>${s.m}<br><b>${s.d}</b></span></span><div class="grow"><b>${esc(s.title)}</b><small>${esc(s.meta)}</small></div></div>`).join("");
  $("#ls-payouts").innerHTML = t.payouts.map(p => `<div class="li"><div class="grow"><b>${ugx(p.amount)}</b><small>${esc(p.method)} · requested ${esc(p.requested)}</small></div><span class="pill ${p.status}">${esc(p.status)}</span></div>`).join("");
  $("#payout-form").onsubmit = async e => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); const r = await API.requestPayout(+f.amount, f.method); $("#payout-msg").textContent = r ? "Payout requested." : `Request for ${ugx(+f.amount)} via ${f.method} saved — the payouts backend is not connected yet.`; };
  $("#new-course").onclick = () => alert("Course builder opens here (POST /api/tutor/courses). Courses go to admin approval before publishing.");
})();
