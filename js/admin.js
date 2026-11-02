/* Admin console. All data comes through CC_API (js/api.js); actions call CC_API.adminAction.* */
(function () {
  const { $, $$, esc, ugx, ico } = window.CC_UI, API = window.CC_API, D = window.CC_DATA;
  const toast = msg => { let t = $("#cc-toast"); if (!t) { t = document.createElement("div"); t.id = "cc-toast"; t.setAttribute("role", "status"); document.body.appendChild(t); } t.textContent = msg; t.className = "show"; clearTimeout(t._h); t._h = setTimeout(() => t.className = "", 2600); };
  const cache = {};

  async function kpis() {
    const k = await API.fetchAdminKpis(); const cls = ["ink", "", "", "or", "", "cy", "", "or"];
    $("#kpis").innerHTML = k.map((x, i) => `<div class="kpi ${cls[i] || ""}"><small>${esc(x.label)}</small><b>${x.money ? ugx(x.value) : Number(x.value).toLocaleString("en-US")}</b><i>${esc(x.delta || "")}</i></div>`).join("");
  }
  async function charts() {
    const a = cache.analytics = await API.fetchAnalytics();
    if (!window.Chart) { $$(".chart-box").forEach(b => b.innerHTML = `<p class="muted">Charts load from jsDelivr (Chart.js). Offline right now.</p>`); return; }
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily; Chart.defaults.color = "#10181f"; Chart.defaults.borderColor = "#e0e6ea";
    const OR = "#fc8c0c", CY = "#05e6f2", INK = "#10181f", anim = API.STATIC || document.documentElement.classList.contains("lite") ? false : undefined;
    const base = { responsive: true, maintainAspectRatio: false, animation: anim, plugins: { legend: { labels: { boxWidth: 12, boxHeight: 12 } } } };
    new Chart($("#ch-signups"), { type: "line", data: { labels: a.signups.labels, datasets: [{ label: "Learners", data: a.signups.learners, borderColor: OR, backgroundColor: OR, borderWidth: 3, tension: .25 }, { label: "Tutors", data: a.signups.tutors, borderColor: INK, backgroundColor: INK, borderWidth: 3, tension: .25 }] }, options: base });
    new Chart($("#ch-revenue"), { type: "bar", data: { labels: a.revenue.labels, datasets: [{ label: "UGX (M)", data: a.revenue.ugx, backgroundColor: INK, borderColor: INK }] }, options: { ...base, plugins: { legend: { display: false } } } });
    new Chart($("#ch-funnel"), { type: "bar", data: { labels: a.funnel.labels, datasets: [{ label: "People", data: a.funnel.values, backgroundColor: [CY, OR, INK, "#13a35c"] }] }, options: { ...base, plugins: { legend: { display: false } } } });
    new Chart($("#ch-enrol"), { type: "bar", data: { labels: a.enrolments.labels, datasets: [{ label: "Enrolments", data: a.enrolments.values, backgroundColor: [OR, CY, INK, OR, CY, INK] }] }, options: { ...base, plugins: { legend: { display: false } } } });
    new Chart($("#ch-complete"), { type: "radar", data: { labels: a.completion.labels.map(l => l.split(" ")[0]), datasets: [{ label: "% completed", data: a.completion.values, borderColor: OR, backgroundColor: "rgba(252,140,12,.25)", borderWidth: 2 }] }, options: { ...base, scales: { r: { suggestedMin: 0, suggestedMax: 100 } } } });
  }
  async function pending() {
    const rows = await API.fetchPendingMembers();
    $("#tb-pending tbody").innerHTML = rows.map(r => `<tr data-id="${r.id}"><td><b>${esc(r.name)}</b><br><small>${esc(r.email)}</small></td><td>${esc(r.wants)}</td><td>${esc(r.applied)}</td>
      <td><div class="acts"><button class="btn sm ok" data-act="approveMember">${ico("check")}Approve</button><button class="btn sm no" data-act="rejectMember">${ico("xmark")}Reject</button></div></td></tr>`).join("");
    const s = await API.fetchRecentSignups();
    $("#ls-signups").innerHTML = s.map(u => `<div class="li"><span class="date" aria-hidden="true">${esc(u.name.split(" ").map(w => w[0]).join(""))}</span><div class="grow"><b>${esc(u.name)}</b><small>${esc(u.role)} · ${esc(u.when)}</small></div><span class="pill ${u.role.toLowerCase()}">${esc(u.role)}</span></div>`).join("");
  }
  async function users(role = "") {
    const rows = cache.users = await API.fetchUsers(role);
    $("#tb-users tbody").innerHTML = rows.map(u => `<tr data-id="${u.id}"><td><b>${esc(u.name)}</b></td><td>${esc(u.email)}</td><td><span class="pill ${u.role}">${u.role}</span></td><td><span class="pill ${u.status}">${u.status}</span></td><td>${esc(u.joined)}</td>
      <td><div class="acts"><label class="sr-only" for="role-${u.id}">Change role for ${esc(u.name)}</label><select class="btn sm" id="role-${u.id}" data-act="changeRole">${["learner", "tutor", "admin"].map(r => `<option ${r === u.role ? "selected" : ""}>${r}</option>`).join("")}</select>
      ${u.role === "tutor" && u.status === "pending" ? `<button class="btn sm ok" data-act="verifyTutor">${ico("check")}Verify tutor</button>` : ""}
      <button class="btn sm no" data-act="suspendUser">${u.status === "suspended" ? "Unsuspend" : "Suspend"}</button></div></td></tr>`).join("");
  }
  async function courses() {
    const rows = await API.fetchCourseApprovals();
    $("#tb-courses tbody").innerHTML = rows.map(c => `<tr data-id="${c.id}"><td><b>${esc(c.title)}</b></td><td>${esc(c.tutor)}</td><td>${esc(c.path)}</td><td>${c.price ? ugx(c.price) : "Free"}</td>
      <td><div class="acts"><button class="btn sm ok" data-act="approveCourse">${ico("check")}Approve</button><button class="btn sm no" data-act="rejectCourse">Reject</button></div></td></tr>`).join("");
  }
  async function payments() {
    const p = await API.fetchPayouts();
    $("#tb-payouts tbody").innerHTML = p.map(r => `<tr data-id="${r.id}"><td><b>${esc(r.tutor)}</b></td><td>${ugx(r.amount)}</td><td>${esc(r.method)}<br><small>${esc(r.account)}</small></td><td>${esc(r.requested)}</td>
      <td><div class="acts"><button class="btn sm ok" data-act="approvePayout">Approve</button><button class="btn sm" data-act="holdPayout">Hold</button></div></td></tr>`).join("");
    const t = cache.transactions = await API.fetchTransactions();
    $("#tb-tx tbody").innerHTML = t.map(r => `<tr data-id="${r.id}"><td><small>${esc(r.id)}</small></td><td>${esc(r.type)}</td><td>${esc(r.item)}<br><small>${esc(r.user)} · ${esc(r.when)}</small></td><td>${ugx(r.amount)}</td><td><span class="pill ${r.status}">${r.status}</span></td>
      <td>${r.status === "paid" ? `<button class="btn sm no" data-act="refund">Refund</button>` : ""}</td></tr>`).join("");
  }
  async function moderation() {
    const m = await API.fetchModerationQueue();
    $("#ls-mod").innerHTML = m.map(x => `<div class="li" data-id="${x.id}"><span class="date" style="background:#fde3c4">${ico("flag")}</span><div class="grow"><b>@${esc(x.who)} · ${esc(x.reason)}</b><small>"${esc(x.text)}" · ${x.reports} reports</small></div>
      <div class="acts row"><button class="btn sm no" data-act="moderate" data-v="remove">Remove</button><button class="btn sm" data-act="moderate" data-v="keep">Keep</button></div></div>`).join("");
    const e = await API.fetchEventsAdmin();
    $("#ls-events").innerHTML = e.map(x => `<div class="li"><span class="date"><span>${x.m}<br><b>${x.d}</b></span></span><div class="grow"><b>${esc(x.title)}</b><small>${esc(x.meta)} · ${x.rsvps} RSVPs</small></div><a class="btn sm" href="#" data-cal-link="101codecrafts">Cal.com</a></div>`).join("");
  }
  async function audit() {
    const a = cache.audit = await API.fetchAuditLog();
    $("#tb-audit tbody").innerHTML = a.map(r => `<tr><td>${esc(r.when)}</td><td>${esc(r.who)}</td><td>${esc(r.what)}</td></tr>`).join("");
  }
  async function settings() {
    const f = await API.fetchFlags();
    $("#ls-flags").innerHTML = f.map(x => `<label class="li"><span class="grow"><b>${esc(x.label)}</b><small>${x.key}</small></span><span class="toggle"><input type="checkbox" data-flag="${x.key}" ${x.on ? "checked" : ""} aria-label="${esc(x.label)}"><span></span></span></label>`).join("");
    $("#commission").value = D.admin.commission;
    const paths = D.paths; $("#unfurl-edit [name=path]").innerHTML = paths.map(p => `<option>${esc(p)}</option>`).join("");
  }

  /* ---- social links editor: paste URL, toggle, drag (or ↑/↓ keys) to reorder, live preview ---- */
  let social = [];
  function renderSocial() {
    $("#ls-social").innerHTML = social.map((s, i) => `<li class="li soc-row" draggable="true" data-i="${i}">
      <button type="button" class="btn sm drag" aria-label="Reorder ${esc(s.label)} (use arrow keys)">${ico("grip")}</button>
      <span class="date" style="background:var(--ink);color:#fff">${ico(s.icon)}</span>
      <label class="field grow"><span>${esc(s.label)}</span><input type="url" value="${esc(s.url)}" placeholder="https://…" data-k="url"></label>
      <span class="toggle"><input type="checkbox" data-k="active" ${s.active ? "checked" : ""} aria-label="Show ${esc(s.label)}"><span></span></span></li>`).join("");
    $("#social-preview").innerHTML = window.CC_UI.socialRow(social) || `<small class="muted">No active links yet</small>`;
  }
  async function socialEditor() {
    const live = await API.fetchSocialLinks(); const draft = localStorage.getItem("cc_social_draft");
    social = live || (draft ? JSON.parse(draft) : JSON.parse(JSON.stringify(D.social)));
    renderSocial();
    const list = $("#ls-social"); let from = null;
    list.addEventListener("input", e => { const row = e.target.closest(".soc-row"); if (!row) return; const s = social[row.dataset.i]; if (e.target.dataset.k === "url") s.url = e.target.value.trim(); if (e.target.dataset.k === "active") s.active = e.target.checked; $("#social-preview").innerHTML = window.CC_UI.socialRow(social); });
    list.addEventListener("change", e => { if (e.target.dataset.k === "active") { social[e.target.closest(".soc-row").dataset.i].active = e.target.checked; renderSocial(); } });
    list.addEventListener("dragstart", e => { from = +e.target.closest(".soc-row").dataset.i; e.dataTransfer.effectAllowed = "move"; });
    list.addEventListener("dragover", e => e.preventDefault());
    list.addEventListener("drop", e => { e.preventDefault(); const to = +e.target.closest(".soc-row").dataset.i; const [m] = social.splice(from, 1); social.splice(to, 0, m); renderSocial(); });
    list.addEventListener("keydown", e => { const b = e.target.closest(".drag"); if (!b || !["ArrowUp", "ArrowDown"].includes(e.key)) return; e.preventDefault(); const i = +b.closest(".soc-row").dataset.i, j = i + (e.key === "ArrowUp" ? -1 : 1); if (j < 0 || j >= social.length) return; [social[i], social[j]] = [social[j], social[i]]; renderSocial(); $$(".drag", list)[j].focus(); });
    $("#social-save").onclick = async () => { const bad = social.find(s => s.url && !/^https:\/\//.test(s.url)); if (bad) { $("#social-msg").textContent = `${bad.label}: links must start with https://`; return; } const r = await API.saveSocialLinks(social); $("#social-msg").textContent = r ? "Saved. Every footer now uses these links." : "Saved locally as a draft (backend /api/social not connected yet)."; };
  }

  /* ---- actions (event delegation) ---- */
  document.addEventListener("click", async e => {
    const b = e.target.closest("[data-act]"); if (!b || b.tagName === "SELECT") return;
    const id = b.closest("[data-id]") && b.closest("[data-id]").dataset.id, act = b.dataset.act;
    const r = act === "moderate" ? await API.adminAction.moderate(id, b.dataset.v) : await API.adminAction[act](id);
    toast(`${act.replace(/([A-Z])/g, " $1").toLowerCase()}: ${r ? "done" : "queued (backend not connected)"}`);
    const row = b.closest("tr, .li"); if (row && /approve|reject|refund|moderate|Payout/.test(act)) { row.style.opacity = .45; b.disabled = true; }
  });
  document.addEventListener("change", async e => {
    if (e.target.dataset.act === "changeRole") { const id = e.target.closest("[data-id]").dataset.id; await API.adminAction.changeRole(id, e.target.value); toast("Role changed to " + e.target.value); }
    if (e.target.dataset.flag) { await API.adminAction.setFlag(e.target.dataset.flag, e.target.checked); toast(`Flag ${e.target.dataset.flag}: ${e.target.checked ? "on" : "off"}`); }
  });
  $$("[data-role-f]").forEach(c => c.onclick = () => { $$("[data-role-f]").forEach(x => x.setAttribute("aria-pressed", x === c)); users(c.dataset.roleF); });
  $$("[data-csv]").forEach(b => b.onclick = () => { const k = b.dataset.csv; const rows = k === "analytics" ? cache.analytics.signups.labels.map((m, i) => ({ month: m, learners: cache.analytics.signups.learners[i], tutors: cache.analytics.signups.tutors[i], revenue_ugx_m: cache.analytics.revenue.ugx[i] })) : cache[k]; API.downloadCSV(`101-${k}-${new Date().toISOString().slice(0, 10)}.csv`, rows || []); });
  $$("[data-qa]").forEach(b => b.onclick = () => { const k = b.dataset.qa; if (k === "announce") { $("#announce-form [name=title]").focus(); return; } toast({ course: "New course draft opened", event: "New event form opened", invite: "Invite sent form opened" }[k]); });
  $("#commission-form").onsubmit = async e => { e.preventDefault(); const v = +$("#commission").value; await API.adminAction.setCommission(v); toast(`Commission set to ${v}%`); };
  $("#announce-form").onsubmit = async e => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); await API.adminAction.broadcast(f); toast("Announcement queued for " + f.aud); e.target.reset(); };
  $("#flw-test").onclick = () => API.flutterwaveCheckout({ amount: 150000, email: "test@101codecrafts.org", name: "Test Learner", title: "Software Engineering Path (test)" });

  /* ---- add resource by link ---- */
  let draft = null;
  const preview = () => { $("#unfurl-card").innerHTML = window.CC_UI.resourceCard({ ...draft, id: draft.id || "preview" }); };
  $("#unfurl-form").onsubmit = async e => {
    e.preventDefault(); const url = $("#unfurl-url").value.trim(); $("#unfurl-msg").textContent = "";
    draft = { ...(await API.fetchUnfurl(url)), url }; draft.path = draft.path || D.paths[0];
    const f = $("#unfurl-edit"); ["title", "type", "site", "desc", "path", "thumb"].forEach(k => f[k].value = draft[k] || ""); f.tags.value = (draft.tags || []).join(", ");
    $("#unfurl-out").hidden = false; preview();
  };
  $("#unfurl-edit").addEventListener("input", e => { const f = e.currentTarget; Object.assign(draft, { title: f.title.value, type: f.type.value, site: f.site.value, desc: f.desc.value, path: f.path.value, thumb: f.thumb.value, tags: f.tags.value.split(",").map(s => s.trim()).filter(Boolean) }); preview(); });
  $("#unfurl-edit").onsubmit = async e => { e.preventDefault(); const r = await API.publishResource(draft); $("#unfurl-msg").textContent = r ? "Published to the Library." : "Saved as draft — POST /api/resources is not connected yet."; };

  kpis(); charts(); pending(); users(); courses(); payments(); moderation(); audit(); settings(); socialEditor();
})();
