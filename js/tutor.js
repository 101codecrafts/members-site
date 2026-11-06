/* Tutor dashboard (round 11): real data only.
   Sources: GET /api/v1/tutor/dashboard (kpis, courses, learners, wallet, payouts, upcoming_sessions);
   the course list comes from CCCourses when the builder runs in local mode (no backend / QA), so a tutor always sees
   the courses they built. Fresh account → zeros + empty states. ?demo=1 → labelled demo, admins only. */
(async function () {
  const D = window.CCDash, C = window.CCCourses; if (!D) return;
  const { $, esc, ico, ugx, num, empty, bar, kpi, fmtDate, ago } = D;
  const A = await D.access();
  if (!(await D.staffGuard())) return;
  const first = ((A.user && (A.user.name || A.user.firstName)) || "").trim().split(/\s+/)[0];
  $("#t-hello").textContent = first ? "WELCOME, " + first.toUpperCase() : "WELCOME";

  const blank = () => ({ kpis: { active_learners: 0, courses: 0, earnings_month_ugx: 0, rating_avg: 0, rating_count: 0 }, wallet: { available_ugx: 0 }, courses: [], learners: [], payouts: [], upcoming_sessions: [] });
  /* older tutor_dashboard() (before the r11 migration) has no kpis/learners/payouts: derive what we can, zero the rest */
  function normalise(d) {
    const out = Object.assign(blank(), d || {});
    out.courses = (out.courses || []).map(c => ({ id: c.id, title: c.title, status: c.status, review_note: c.review_note, learners: c.enrollments || 0,
      lessons: c.lessons, modules: c.modules, pending: !!c.pending_submission, avg: c.avg_progress }));
    if (!d || !d.kpis) out.kpis = { active_learners: out.courses.reduce((a, c) => a + (c.learners || 0), 0), courses: out.courses.length, earnings_month_ugx: 0,
      rating_avg: (d && d.rating && +d.rating.avg) || 0, rating_count: (d && d.rating && +d.rating.count) || 0 };
    out.wallet = out.wallet || { available_ugx: 0 };
    return out;
  }
  const fromLocal = list => list.map(c => ({ id: c.id, title: c.title, status: c.status, review_note: c.review_note, learners: 0, lessons: c._lessons, modules: c._modules, pending: c._pending, subs: c._subs }));

  let data, source = "api", note = "";
  const demo = await D.demo("tutor");
  if (demo) { data = normalise(demo); source = "demo"; }
  else {
    const r = await D.getJSON("/tutor/dashboard");
    if (r.state === "ok") data = normalise(r.data);
    else { data = blank(); source = r.state; note = r.message || ""; }
    // the builder's own store decides where courses live (api or this device)
    try {
      await C.adapter();
      if (C.mode === "local") { const list = await C.list(); data.courses = fromLocal(list); data.kpis.courses = list.length; if (source === "api") source = "api+local"; }
    } catch (e) { if (e.status === 401 || e.status === 403) { source = "auth"; note = e.message; } }
  }

  /* ---------- banners ---------- */
  const bars = [];
  if (source === "demo") bars.push(D.demoBar());
  if (source === "offline") bars.push(bar("local", `${ico("info")}<span>Live data isn't connected on this page yet, so the numbers below show nothing. Courses you build are saved on this device until the server is connected.</span>`));
  else if (source === "api+local") bars.push(bar("local", `${ico("info")}<span>Your numbers are live. Courses you build are saved on this device until the course server is connected.</span>`));
  if (source === "error") bars.push(bar("err", `${ico("info")}<span>We couldn't load your dashboard (${esc(note)}). The numbers below are not your real totals.</span><span class="sp"></span><button class="btn sm" data-retry type="button">Try again</button>`));
  if (source === "auth") bars.push(bar("err", `${ico("lock")}<span>Your tutor account couldn't be verified: ${esc(note || "sign in again")}.</span><span class="sp"></span><a class="btn sm" href="${esc(A.authUrl ? A.authUrl(location.pathname) : "auth.html")}">Sign in</a>`));
  $("#t-bars").innerHTML = bars.join("");
  const known = source === "api" || source === "api+local" || source === "demo";   // KPI values are real (or labelled demo)
  const val = v => known ? v : "—";

  /* ---------- KPIs ---------- */
  const k = data.kpis, cap = A.limit ? A.limit("students.max") : null;
  const inReview = data.courses.filter(c => c.status === "pending_review" || c.pending).length;
  $("#t-kpis").innerHTML = [
    kpi("Active learners", val(num(k.active_learners)), cap != null ? `Plan limit: ${cap} learners` : (known ? "" : "Not connected"), "or"),
    kpi("Courses", num(data.courses.length), inReview ? `${inReview} in review` : (data.courses.length ? "" : "None yet")),
    kpi("Earnings this month", val(ugx(k.earnings_month_ugx)), known ? `Available: ${ugx(data.wallet.available_ugx || 0)}` : "Not connected", "ink"),
    kpi("Rating", val((+k.rating_avg || 0).toFixed(1)), known ? (k.rating_count ? `${num(k.rating_count)} ratings` : "No ratings yet") : "Not connected", "cy")
  ].join("");
  $("#t-kpis").removeAttribute("aria-busy");

  /* ---------- courses ---------- */
  const chip = c => { const s = C.statusOf(c, c.subs || (c.pending ? [{ status: "pending" }] : [])); return `<span class="st ${s.key}">${esc(s.label)}</span>${s.key === "rejected" && s.reason ? `<span class="st-reason">Reason: ${esc(s.reason)}</span>` : ""}`; };
  const isDemo = source === "demo";
  const acts = c => isDemo ? `<span class="muted">Demo</span>` : `<div class="row-acts"><a class="btn sm" href="builder.html?id=${encodeURIComponent(c.id)}">Edit</a><a class="btn sm" href="course.html?preview=${encodeURIComponent(c.id)}">Preview</a>${["draft", "rejected"].indexOf(c.status) >= 0 && !c.pending ? `<a class="btn sm or" href="builder.html?id=${encodeURIComponent(c.id)}&tab=review">Submit</a>` : ""}</div>`;
  /* r13 flows: new tutors can't build until an admin verifies them (app.is_tutor()). Say so, show where they are, and
     lock the builder buttons instead of sending them into a builder that answers 403 (FLOWS.md dead end D1). */
  const F = window.CCFirstSteps, sess = F && F.session(), tv = sess && sess.tutor ? sess.tutor : null;
  const tStatus = isDemo ? "verified" : tv ? tv.status : null;   // null = an API from before r13: status unknown, nothing claimed
  if (tStatus && tStatus !== "verified") {
    document.querySelectorAll('#t-create-course, #t-create-lesson, #courses .viewall').forEach(a => {
      a.removeAttribute("data-can"); a.setAttribute("aria-disabled", "true"); a.classList.add("fl-locked");   // data-can off: CCAccess.refresh would re-enable it a.dataset.lockedHref = a.getAttribute("href"); a.setAttribute("href", "#courses");
      a.title = tStatus === "rejected" ? "Your tutor application wasn't approved" : "Opens when an admin verifies you";
      if (a.classList.contains("viewall")) a.hidden = true; });
  }
  const verifyFirst = () => {
    if (!F || F.static || !tStatus || tStatus === "verified") return "";
    const when = tv && tv.applied_at ? fmtDate(tv.applied_at, { day: "numeric", month: "short", year: "numeric" }) : "";
    if (tStatus === "rejected") return `<p class="fl-note err" role="status"><b>Your tutor application wasn't approved.</b> ${tv.note ? "Reason: " + esc(tv.note) + ". " : ""}You can still learn on 101 with this account.</p>`;
    return F.html({ key: "tutor", title: F.welcome() ? "Application sent" : "Before you can teach", label: "Tutor verification", welcome: F.welcome(), dismissable: false,
      intro: "An admin checks every new tutor's credentials before their courses can go live. We'll email you when it's done.",
      items: [
        { label: "Send your tutor application", hint: when ? "Sent " + when : "", status: "done" },
        { label: "Admin verifies your credentials", hint: "No action needed from you.", status: "waiting" },
        { label: "Build your first course", hint: "Opens when you're verified.", status: "blocked" },
        { label: "Send it for review", hint: "An admin approves each course before learners see it.", status: "blocked" }
      ] });
  };
  const gate = verifyFirst();
  $("#t-courses").innerHTML = gate ? gate : data.courses.length
    ? `<div class="tbl-wrap"><table class="t dash-t"><thead><tr><th>Course</th><th>Lessons</th><th>Learners</th><th>Actions</th></tr></thead><tbody>${data.courses.map(c =>
        `<tr><td><b>${esc(c.title)}</b><br>${chip(c)}</td><td>${c.lessons != null ? num(c.lessons) : "—"}</td><td>${num(c.learners || 0)}</td><td>${acts(c)}</td></tr>`).join("")}</tbody></table></div>`
    : empty({ key: "courses", examples: [["Intro to Python · 3 modules", "Draft"], ["Git basics · 5 lessons", "In review"]],
        title: "No courses yet", body: "Build a course from modules and lessons (YouTube videos, books, text, files and quizzes), then send it for review. Approved courses go live in the catalogue.",
        action: { href: "builder.html", label: "Create your first course", icon: "plusc", id: "t-first-course" } });

  /* ---------- sessions ---------- */
  const ss = data.upcoming_sessions || [];
  $("#t-sessions").innerHTML = ss.length
    ? `<div class="dash-list">${ss.map(s => `<div class="dash-li"><span class="date"><span>${esc(fmtDate(s.starts_at, { month: "short" }))}<br><b>${esc(fmtDate(s.starts_at, { day: "2-digit" }))}</b></span></span><div><b>${esc(s.title)}</b><small>${esc(fmtDate(s.starts_at, { hour: "numeric", minute: "2-digit" }))} EAT · ${num(s.duration_minutes || 60)} min${s.kind === "group" ? " · group" : ""}</small></div><a class="btn sm" href="sessions.html">Open</a></div>`).join("")}</div>`
    : empty({ key: "sessions", examples: [["1:1 · Git branching", "Thu 4 PM"], ["Group Q&A", "Sat 10 AM"]], title: "No sessions scheduled",
        body: "Offer 1:1 or group sessions. Booked sessions show here with their time in EAT.", action: { href: "sessions.html", label: "Schedule a session", icon: "calendar" } });

  /* ---------- learners ---------- */
  const ls = data.learners || [];
  if (cap != null) $("#t-cap").innerHTML = `Plan limit: ${cap} learners · <a href="${esc((A.policy && A.policy.plans_route) || "pricing.html")}">Upgrade</a>`;
  $("#t-learners").innerHTML = ls.length
    ? `<div class="tbl-wrap"><table class="t"><thead><tr><th>Learner</th><th>Course</th><th style="width:34%">Progress</th><th>Last active</th></tr></thead><tbody>${ls.map(l => { const p = Math.round(+l.progress || 0);
        return `<tr><td><b>${esc(l.name)}</b></td><td>${esc(l.course)}</td><td><div class="row" style="flex-wrap:nowrap"><div class="prog" style="flex:1" role="progressbar" aria-valuenow="${p}" aria-valuemin="0" aria-valuemax="100" aria-label="${esc(l.name)} progress"><i style="width:${p}%"></i></div><b>${p}%</b></div></td><td>${esc(ago(l.last_activity_at))}</td></tr>`; }).join("")}</tbody></table></div>`
    : empty({ key: "learners", examples: [["Learner name · Your course", "40%"], ["Learner name · Your course", "85%"]], title: "No learners yet",
        body: "Learners appear here when they enrol in one of your approved courses, with their progress and when they were last active.",
        action: tStatus && tStatus !== "verified" ? null : data.courses.length ? { href: "builder.html", label: "Finish and submit a course" } : { href: "builder.html", label: "Create your first course" } });

  /* ---------- wallet + payouts ---------- */
  const avail = +(data.wallet && data.wallet.available_ugx) || 0;
  $("#t-wallet").innerHTML = `<div class="dash-list"><div class="dash-li" style="grid-template-columns:1fr auto"><div><small>Available to withdraw</small><b style="font:400 var(--step-2) var(--disp)">${val(ugx(avail))}</b><small>Earnings from paid courses and sessions, after the refund window.</small></div>
    ${avail > 0 && !isDemo ? `<a class="btn or" href="settings-apps.html" data-can="payout.manage">Request payout</a>` : `<button class="btn" type="button" disabled aria-disabled="true" title="Nothing to pay out yet">Request payout</button>`}</div>
    ${avail > 0 ? "" : `<p class="muted">${known ? "Nothing to pay out yet. Payouts go to the Mobile Money number in your payout settings." : "Your balance shows here once live data is connected."}</p>`}</div>`;
  const ps = data.payouts || [];
  $("#t-payouts").innerHTML = ps.length
    ? `<div class="dash-list">${ps.map(p => `<div class="dash-li" style="grid-template-columns:1fr auto"><div><b>${ugx(p.amount_ugx)}</b><small>Requested ${esc(fmtDate(p.created_at, { day: "numeric", month: "short", year: "numeric" }))}</small></div><span class="st ${p.status === "paid" ? "approved" : "review"}">${esc(p.status)}</span></div>`).join("")}</div>`
    : empty({ key: "payouts", examples: [["UGX —", "Requested"], ["UGX —", "Paid"]], title: "No payouts yet", body: "Each payout you request shows here with its status." });

  if (window.CCAccess && window.CCAccess.refresh) window.CCAccess.refresh();   // gate any data-can links just rendered
})();
