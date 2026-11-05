/* DEMO DATA — NOT REAL. Loaded only by js/dash-common.js when the URL has ?demo=1 AND the signed-in role may view demos
   (CCAccess.can("demo.view") → admin / root_admin). Every screen that shows it carries a "DEMO DATA" banner.
   Shapes match GET /api/v1/tutor/dashboard and GET /api/v1/learner/dashboard. */
window.CC_DASH_DEMO = {
  tutor: {
    kpis: { active_learners: 312, courses: 4, earnings_month_ugx: 1920000, rating_avg: 4.8, rating_count: 57 },
    wallet: { available_ugx: 1070000 },
    courses: [
      { id: "demo-1", title: "Deploying Next.js on Vercel", status: "pending_review", enrollments: 128, avg_progress: null, modules: 4, lessons: 18, pending_submission: true },
      { id: "demo-2", title: "Log Analysis with Python", status: "published", enrollments: 96, avg_progress: 54, modules: 6, lessons: 24 },
      { id: "demo-3", title: "Git & GitHub for Teams", status: "published", enrollments: 64, avg_progress: 71, modules: 5, lessons: 20 },
      { id: "demo-4", title: "REST APIs in Node.js", status: "rejected", review_note: "Lesson 3 links to a shortened URL; paste the full link.", enrollments: 0, avg_progress: null, modules: 3, lessons: 9 }
    ],
    learners: [
      { name: "Sarah Namubiru", course: "Log Analysis with Python", progress: 82, last_activity_at: new Date(Date.now() - 2 * 3600e3).toISOString() },
      { name: "Ivan Mugisha", course: "Git & GitHub for Teams", progress: 45, last_activity_at: new Date(Date.now() - 26 * 3600e3).toISOString() },
      { name: "Esther Akello", course: "Log Analysis with Python", progress: 23, last_activity_at: new Date(Date.now() - 72 * 3600e3).toISOString() }
    ],
    payouts: [
      { id: "po-demo-1", amount_ugx: 850000, status: "requested", created_at: "2026-11-01T09:00:00+03:00" },
      { id: "po-demo-2", amount_ugx: 640000, status: "paid", created_at: "2026-10-15T09:00:00+03:00" }
    ],
    upcoming_sessions: [
      { id: "s-demo-1", title: "1:1 — Git branching", starts_at: new Date(Date.now() + 2 * 864e5).toISOString(), duration_minutes: 60, kind: "one_on_one" },
      { id: "s-demo-2", title: "Group Q&A — Log Analysis", starts_at: new Date(Date.now() + 5 * 864e5).toISOString(), duration_minutes: 60, kind: "group" }
    ]
  },
  learner: {
    plan: "free",
    counts: { enrolled: 1, completed: 0, certificates: 1, saved: 3 },
    streak: { current: 4, longest: 9 }, active_days_7: 4,
    enrollments: [
      { course_id: "demo-c1", slug: "web-basics", title: "Web Development Basics", progress_pct: 40, status: "active", lessons_total: 10, lessons_done: 4,
        last_activity_at: new Date(Date.now() - 3 * 3600e3).toISOString(), next_lesson: { id: "l5", title: "CSS layout with Flexbox" } }
    ],
    certificates: [{ id: "cert-demo", title: "Python Basics", verify_code: "DEMO-0000-0000", issued_at: "2026-10-30T10:00:00+03:00" }],
    saved: [{ kind: "article", ref_id: "a1", created_at: "2026-11-02T10:00:00+03:00", title: "Big-O in plain English" }],
    sessions: [{ id: "s1", title: "1:1 with a tutor — Git basics", starts_at: new Date(Date.now() + 3 * 864e5).toISOString(), duration_minutes: 45, booking_status: "confirmed" }]
  }
};
