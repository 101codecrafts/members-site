/* Learner dashboard (round 11): real data only, empty-safe.
   Source: GET /api/v1/learner/dashboard (enrollments + progress + next lesson, counts, certificates, saved, sessions,
   streak, plan). Plan limits come from CCAccess.limit() (admin-set; defaults in the shared access policy):
   Free = 1 active course, lessons past lessons.free_per_course locked, no 1:1 sessions (sessions.per_month = 0). */
(async function () {
  const D = window.CCDash; if (!D) return;
  const { $, esc, ico, num, empty, bar, kpi, fmtDate, ago } = D;
  const A = await D.access();
  if (!(await D.staffGuard())) return;
  const first = ((A.user && (A.user.name || A.user.firstName)) || "").trim().split(/\s+/)[0];
  $("#l-hello").textContent = first ? "WELCOME, " + first.toUpperCase() : "WELCOME";

  const blank = () => ({ plan: A.plan || "free", counts: { enrolled: 0, completed: 0, certificates: 0, saved: 0 }, enrollments: [], certificates: [], saved: [], sessions: [], streak: null, active_days_7: 0 });
  let data, source = "api", note = "";
  const demo = await D.demo("learner");
  if (demo) { data = Object.assign(blank(), demo); source = "demo"; }
  else {
    const r = await D.getJSON("/learner/dashboard");
    if (r.state === "ok") data = Object.assign(blank(), r.data || {});
    else { data = blank(); source = r.state; note = r.message || ""; }
  }
  const known = source === "api" || source === "demo";
  const val = v => known ? v : "—";
  const plan = (source === "demo" ? data.plan : (A.plan || data.plan || "free")).toLowerCase();
  const planName = { free: "Free", standard: "Standard", plus: "Plus", pro: "Pro" }[plan] || plan;
  const lim = k => (A.limit ? A.limit(k) : null);
  const maxCourses = lim("courses.active"), freePerCourse = lim("lessons.free_per_course"), previewOnly = typeof freePerCourse === "number", sessionsCap = lim("sessions.per_month");
  const plansRoute = (A.policy && A.policy.plans_route) || "pricing.html";

  /* ---------- banners ---------- */
  const bars = [];
  if (source === "demo") bars.push(D.demoBar());
  if (source === "offline") bars.push(bar("local", `${ico("info")}<span>Live data isn't connected on this page yet, so nothing below is filled in. Your real courses and progress show here once it is.</span>`));
  if (source === "error") bars.push(bar("err", `${ico("info")}<span>We couldn't load your learning (${esc(note)}).</span><span class="sp"></span><button class="btn sm" data-retry type="button">Try again</button>`));
  if (source === "auth") bars.push(bar("err", `${ico("lock")}<span>Your account couldn't be verified: ${esc(note || "sign in again")}.</span><span class="sp"></span><a class="btn sm" href="${esc(A.authUrl ? A.authUrl(location.pathname) : "auth.html")}">Sign in</a>`));
  $("#l-bars").innerHTML = bars.join("");

  /* ---------- KPIs ---------- */
  const c = data.counts || {};
  const streak = data.streak && +data.streak.current || 0;
  $("#l-kpis").innerHTML = [
    kpi("Enrolled", val(num(c.enrolled)), maxCourses != null ? `${planName} plan: ${maxCourses} course${maxCourses === 1 ? "" : "s"}` : (known ? "" : "Not connected"), "or"),
    kpi("Completed", val(num(c.completed)), known ? (c.completed ? "" : "None yet") : "Not connected"),
    kpi("Certificates", val(num(c.certificates)), known ? (c.certificates ? "" : "Finish a course to earn one") : "Not connected", "ink"),
    kpi("Day streak", val(num(streak)), known ? `Active ${num(data.active_days_7 || 0)} of the last 7 days` : "Not connected", "cy")
  ].join("");
  $("#l-kpis").removeAttribute("aria-busy");

  /* ---------- continue learning ---------- */
  const active = (data.enrollments || []).filter(e => e.status !== "completed");
  const nextOf = e => e.next_lesson ? `course.html?id=${encodeURIComponent(e.slug || e.course_id)}&lesson=${encodeURIComponent(e.next_lesson.id)}` : `course.html?id=${encodeURIComponent(e.slug || e.course_id)}`;
  const pct = e => Math.round(+e.progress_pct || 0);
  if (active.length) {
    const e = active[0];
    $("#l-continue").innerHTML = `<div class="cont"><div><small class="muted">Last active ${esc(ago(e.last_activity_at))}</small><h3>${esc(e.title)}</h3>
        <p>${e.next_lesson ? `Next: <b>${esc(e.next_lesson.title)}</b>` : "You've opened every lesson. Finish the last ones to complete it."}</p>
        <div class="prog" role="progressbar" aria-valuenow="${pct(e)}" aria-valuemin="0" aria-valuemax="100" aria-label="${esc(e.title)} progress"><i style="width:${pct(e)}%"></i></div>
        <small class="muted">${pct(e)}% · ${num(e.lessons_done || 0)} of ${num(e.lessons_total || 0)} lessons</small></div>
      <a class="btn or lg" href="${nextOf(e)}">${ico("play")}Continue</a></div>`;
  } else {
    $("#l-continue").innerHTML = empty({ key: "continue", examples: [["Web Development Basics · Lesson 3", "40%"]], title: (c.completed ? "All caught up" : "Start your first course"),
      body: c.completed ? "You've finished everything you enrolled in. Pick something new." : "Free courses from 101 tutors and partners like freeCodeCamp and Cisco NetAcad are ready to start.",
      action: { href: "courses.html", label: c.completed ? "Find another course" : "Browse courses", icon: "cap" } });
  }

  /* ---------- plan ---------- */
  const used = +c.enrolled || 0;
  const meter = maxCourses != null ? `<div class="meter" aria-label="${used} of ${maxCourses} course${maxCourses === 1 ? "" : "s"} used">${Array.from({ length: Math.max(1, maxCourses) }, (_, i) => `<i class="${i < used ? "on" : ""}"></i>`).join("")}</div><small class="muted">${val(num(used))} of ${num(maxCourses)} course${maxCourses === 1 ? "" : "s"} used</small>` : "";
  const perks = [];
  perks.push(maxCourses != null ? `${num(maxCourses)} active course${maxCourses === 1 ? "" : "s"} at a time` : "Unlimited courses");
  perks.push(previewOnly ? `First ${freePerCourse} lessons of each course (plus previews); the rest are locked` : "Every lesson unlocked");
  perks.push(sessionsCap === 0 ? "No 1:1 sessions" : sessionsCap == null ? "1:1 sessions included" : `${num(sessionsCap)} 1:1 sessions a month`);
  perks.push("Free external courses (Coursera, freeCodeCamp…) always included");
  const isTop = plan === "pro";
  $("#l-plan").innerHTML = `<div class="plan-card"><div class="row" style="justify-content:space-between"><b style="font:400 var(--step-2) var(--disp)">${esc(planName)}</b>${plan === "free" ? `<span class="pill">Free</span>` : `<span class="pill paid">Active</span>`}</div>
    ${meter}<ul>${perks.map(p => `<li>${esc(p)}</li>`).join("")}</ul>
    <div class="row">${isTop ? `<a class="btn" href="${esc(plansRoute)}">Manage plan</a>` : `<a class="btn or" href="${esc(plansRoute)}" id="l-upgrade" data-can="plan.upgrade">${ico("star")}Upgrade plan</a><a class="btn sm" href="${esc(plansRoute)}">Compare plans</a>`}</div>
    <small class="muted">Prices and limits are set by 101 Codecrafts and can change; your plan page always shows the current ones.</small></div>`;

  /* ---------- my courses ---------- */
  const es = data.enrollments || [];
  $("#l-courses").innerHTML = es.length
    ? `<div class="dash-list">${es.map(e => `<div class="dash-li" style="grid-template-columns:1fr minmax(120px,30%) auto"><div><b>${esc(e.title)}</b><small>${e.status === "completed" ? "Completed " + esc(fmtDate(e.completed_at, { day: "numeric", month: "short", year: "numeric" })) : "Last active " + esc(ago(e.last_activity_at))}${previewOnly && e.status !== "completed" ? ` · <span class="lock">${ico("lock")}some lessons locked on ${esc(planName)}</span>` : ""}</small></div>
        <div class="prog" role="progressbar" aria-valuenow="${pct(e)}" aria-valuemin="0" aria-valuemax="100" aria-label="${esc(e.title)} progress"><i style="width:${pct(e)}%"></i></div>
        <a class="btn sm${e.status === "completed" ? "" : " or"}" href="${nextOf(e)}">${e.status === "completed" ? "Review" : "Continue"}</a></div>`).join("")}</div>
      ${maxCourses != null && used >= maxCourses ? `<p class="muted" style="margin-top:10px">${ico("lock")} You're using all ${num(maxCourses)} course slot${maxCourses === 1 ? "" : "s"} on ${esc(planName)}. <a href="${esc(plansRoute)}">Upgrade</a> to take more at once, or finish one first.</p>` : ""}`
    : empty({ key: "courses", examples: [["Intro to Python · 12 lessons", "0%"], ["Git basics · 8 lessons", "0%"]], title: "No courses yet",
        body: maxCourses != null ? `Your ${planName} plan includes ${num(maxCourses)} course at a time. Courses you enrol in show here with your progress.` : "Courses you enrol in show here with your progress.",
        action: { href: "courses.html", label: "Find a course", icon: "search" } });

  /* ---------- certificates ---------- */
  const cs = data.certificates || [];
  $("#l-certs").innerHTML = cs.length
    ? `<div class="dash-list">${cs.map(x => `<div class="dash-li" style="grid-template-columns:1fr auto"><div><b>${esc(x.title)}</b><small>Issued ${esc(fmtDate(x.issued_at, { day: "numeric", month: "short", year: "numeric" }))} · ${esc(x.verify_code)}</small></div><a class="btn sm" href="verify.html?code=${encodeURIComponent(x.verify_code)}">Verify</a></div>`).join("")}</div>`
    : empty({ key: "certs", examples: [["Python Basics", "Issued"]], title: "No certificates yet", body: "Finish a 101 course to earn a certificate anyone can verify.", action: { href: "courses.html", label: "Browse courses" } });

  /* ---------- saved ---------- */
  const sv = data.saved || [];
  const savedHref = s => ({ article: "article.html?id=", problem: "problem.html?id=", course: "course.html?id=" }[s.kind] || "learn.html?id=") + encodeURIComponent(s.ref_id);
  $("#l-saved").innerHTML = sv.length
    ? `<div class="dash-list">${sv.map(s => `<a class="dash-li" style="grid-template-columns:1fr auto;text-decoration:none" href="${savedHref(s)}"><div><b>${esc(s.title || (s.kind[0].toUpperCase() + s.kind.slice(1)))}</b><small>Saved ${esc(ago(s.created_at))}</small></div><span class="btn sm">Open</span></a>`).join("")}</div>`
    : empty({ key: "saved", examples: [["Article · Big-O basics", "Saved"]], title: "Nothing saved yet", body: "Save articles, problems and courses to come back to them here.", action: { href: "learn.html", label: "Explore Learn" } });

  /* ---------- sessions ---------- */
  const ss = data.sessions || [];
  const canBook = A.can ? A.can("session.book") : false;
  $("#l-sessions").innerHTML = ss.length
    ? `<div class="dash-list">${ss.map(s => `<div class="dash-li"><span class="date"><span>${esc(fmtDate(s.starts_at, { month: "short" }))}<br><b>${esc(fmtDate(s.starts_at, { day: "2-digit" }))}</b></span></span><div><b>${esc(s.title)}</b><small>${esc(fmtDate(s.starts_at, { hour: "numeric", minute: "2-digit" }))} EAT · ${num(s.duration_minutes || 60)} min${s.booking_status === "pending_payment" ? " · awaiting payment" : ""}</small></div><a class="btn sm" href="sessions.html">Open</a></div>`).join("")}</div>`
    : sessionsCap === 0
      ? empty({ key: "sessions", examples: [["1:1 · Git basics", "Thu 4 PM"]], title: "1:1 sessions aren't on your plan", body: `Live sessions with tutors come with paid plans. Group events stay free.`, action: { href: plansRoute, label: "See plans" }, secondary: { href: "events.html", label: "Free events" } })
      : empty({ key: "sessions", examples: [["1:1 · Git basics", "Thu 4 PM"]], title: "No sessions booked", body: "Book a live session with a tutor; it shows here with its time in EAT.", action: canBook ? { href: "sessions.html", label: "Book a session" } : { href: "events.html", label: "See events" } });

  if (window.CCAccess && window.CCAccess.refresh) window.CCAccess.refresh();
})();
