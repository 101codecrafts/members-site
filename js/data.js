/* Placeholder data. Every value here is a fallback used when the backend (or a public API) is not reachable.
   The backend plugs in by answering the endpoints named in js/api.js; nothing here is real user data. */
window.CC_DATA = {
  /* ---------------- Library (resources) ---------------- */
  resources: [
    { id: "fcc-rwd", type: "Course", title: "Responsive Web Design Certification", site: "freeCodeCamp", url: "https://www.freecodecamp.org/learn/2022/responsive-web-design/", favicon: "https://www.freecodecamp.org/favicon.ico", thumb: "", desc: "Learn HTML and CSS by building 20 projects, then earn a free certification.", tags: ["HTML", "CSS", "Beginner"], path: "Software Engineering" },
    { id: "cs50x", type: "Course", title: "CS50: Introduction to Computer Science", site: "edX", url: "https://www.edx.org/learn/computer-science/harvard-university-cs50-s-introduction-to-computer-science", favicon: "https://www.edx.org/favicon.ico", thumb: "", desc: "Harvard's legendary intro to CS: C, Python, SQL, algorithms and web basics.", tags: ["C", "Python", "Algorithms"], path: "Software Engineering" },
    { id: "yt-ml-crash", type: "Video", title: "Machine Learning for Everybody – Full Course", site: "YouTube", url: "https://www.youtube.com/watch?v=i_LwzRVP7bg", favicon: "https://www.youtube.com/favicon.ico", thumb: "https://i.ytimg.com/vi/i_LwzRVP7bg/hqdefault.jpg", desc: "freeCodeCamp's beginner-friendly ML course with hands-on Python notebooks.", tags: ["ML", "Python"], path: "AI & Machine Learning" },
    { id: "ol-sicp", type: "Book", title: "Structure and Interpretation of Computer Programs", site: "Open Library", url: "https://openlibrary.org/works/OL1832493W", favicon: "https://openlibrary.org/favicon.ico", thumb: "https://covers.openlibrary.org/b/isbn/0262510871-M.jpg", desc: "The classic MIT text on abstraction, recursion and how programs are built.", tags: ["Theory", "Lisp"], path: "Software Engineering" },
    { id: "gh-system-design", type: "Repo", title: "donnemartin/system-design-primer", site: "GitHub", url: "https://github.com/donnemartin/system-design-primer", favicon: "https://github.com/favicon.ico", thumb: "", desc: "Learn how to design large-scale systems; prep for the system design interview.", tags: ["Architecture", "Interviews"], path: "Cloud & DevOps" },
    { id: "owasp-top10", type: "Article", title: "OWASP Top 10 Web Application Security Risks", site: "OWASP", url: "https://owasp.org/www-project-top-ten/", favicon: "https://owasp.org/favicon.ico", thumb: "", desc: "The standard awareness document for the most critical web app security risks.", tags: ["AppSec", "Web"], path: "Cybersecurity & Ethical Hacking" },
    { id: "kaggle-pandas", type: "Course", title: "Kaggle Learn: Pandas", site: "Kaggle", url: "https://www.kaggle.com/learn/pandas", favicon: "https://www.kaggle.com/static/images/favicon.ico", thumb: "", desc: "Short hands-on course: create, read, index, group and clean data with pandas.", tags: ["Data", "Python"], path: "Data Science & Analytics" },
    { id: "cisco-netacad", type: "Course", title: "Networking Basics", site: "Cisco NetAcad", url: "https://www.netacad.com/courses/networking-basics", favicon: "https://www.netacad.com/favicon.ico", thumb: "", desc: "Free intro to how networks work: IP addressing, Ethernet, wireless and routing.", tags: ["Networking", "CCNA"], path: "IT Infrastructure & Networking" },
    { id: "mdn-js", type: "Article", title: "JavaScript Guide", site: "MDN Web Docs", url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide", favicon: "https://developer.mozilla.org/favicon.ico", thumb: "", desc: "Mozilla's reference guide to the JavaScript language, from grammar to modules.", tags: ["JavaScript", "Reference"], path: "Software Engineering" }
  ],
  paths: ["Software Engineering", "Data Science & Analytics", "Cybersecurity & Ethical Hacking", "AI & Machine Learning", "Cloud & DevOps", "IT Infrastructure & Networking"],

  /* ---------------- Daily news (placeholders; live data comes from fetchNews) ---------------- */
  news: [
    { id: "n1", cat: "AI", title: "Open-weight models keep closing the gap on frontier benchmarks", source: "Hacker News", url: "https://news.ycombinator.com/", ago: "1h", summary: "Developers are shipping more on-device and self-hosted AI as small models improve." },
    { id: "n2", cat: "Africa Tech", title: "Uganda's startup scene grows as fintech and agritech lead funding", source: "TechCabal", url: "https://techcabal.com/", ago: "2h", summary: "Mobile money rails keep powering new consumer and B2B products across East Africa." },
    { id: "n3", cat: "Dev", title: "What's new for web developers this month", source: "web.dev", url: "https://web.dev/blog", ago: "3h", summary: "New baseline CSS and JavaScript features you can use across browsers today." },
    { id: "n4", cat: "Security", title: "Patch now: critical bugs fixed in widely used open-source libraries", source: "The Hacker News", url: "https://thehackernews.com/", ago: "4h", summary: "Maintainers urge teams to update dependencies and audit their supply chain." },
    { id: "n5", cat: "Cloud", title: "Serverless costs: when to move workloads back to containers", source: "Dev.to", url: "https://dev.to/", ago: "5h", summary: "A practical look at pricing, cold starts and the break-even point." },
    { id: "n6", cat: "Startups", title: "Five lessons from African founders who bootstrapped to profit", source: "Disrupt Africa", url: "https://disrupt-africa.com/", ago: "6h", summary: "Distribution, pricing in local currency and lean teams come up again and again." },
    { id: "n7", cat: "Jobs", title: "Remote junior developer roles open to East African applicants", source: "101 Jobs Board", url: "https://news.ycombinator.com/jobs", ago: "8h", summary: "Entry-level openings in frontend, QA and data analysis this week." }
  ],

  /* ---------------- Admin ---------------- */
  admin: {
    kpis: [
      { k: "total_users", label: "Total Users", value: 10482, delta: "+3.2%" },
      { k: "learners", label: "Learners", value: 9874, delta: "+3.0%" },
      { k: "tutors", label: "Tutors", value: 576, delta: "+5.1%" },
      { k: "pending_tutors", label: "Pending Tutor Verifications", value: 14, delta: "6 new" },
      { k: "mau", label: "Monthly Active Users", value: 6215, delta: "+8.4%" },
      { k: "revenue", label: "Revenue (UGX, Nov)", value: 18450000, money: true, delta: "via Flutterwave" },
      { k: "commission", label: "Commission (UGX)", value: 2767500, money: true, delta: "15% rate" },
      { k: "payouts", label: "Pending Payouts (UGX)", value: 4120000, money: true, delta: "9 requests" }
    ],
    signups: { labels: ["Jun", "Jul", "Aug", "Sep", "Oct", "Nov"], learners: [610, 720, 840, 990, 1180, 1320], tutors: [22, 31, 35, 48, 57, 64] },
    revenue: { labels: ["Jun", "Jul", "Aug", "Sep", "Oct", "Nov"], ugx: [7.2, 8.9, 10.4, 12.8, 15.9, 18.45] },
    enrolments: { labels: ["Software Eng.", "Data Science", "Cybersecurity", "AI & ML", "Cloud & DevOps", "IT & Networking"], values: [3120, 2280, 1640, 1910, 1170, 860] },
    completion: { labels: ["Software Eng.", "Data Science", "Cybersecurity", "AI & ML", "Cloud & DevOps", "IT & Networking"], values: [62, 58, 47, 51, 55, 66] },
    funnel: { labels: ["Visits", "Sign-ups", "Enrolments", "Paid"], values: [48200, 10482, 6930, 2140] },
    users: [
      { id: "u1", name: "Sarah Namubiru", email: "sarah.n@example.com", role: "learner", status: "active", joined: "2025-11-01" },
      { id: "u2", name: "David Kato", email: "david.k@example.com", role: "tutor", status: "verified", joined: "2025-10-28" },
      { id: "u3", name: "Grace Mutesi", email: "grace.m@example.com", role: "learner", status: "active", joined: "2025-10-30" },
      { id: "u4", name: "Brian Ochieng", email: "brian.o@example.com", role: "tutor", status: "pending", joined: "2025-11-02" },
      { id: "u5", name: "Aisha Nalwoga", email: "aisha.n@example.com", role: "admin", status: "active", joined: "2025-03-14" },
      { id: "u6", name: "Joseph Ssempala", email: "joseph.s@example.com", role: "learner", status: "suspended", joined: "2025-08-09" },
      { id: "u7", name: "Ruth Atim", email: "ruth.a@example.com", role: "tutor", status: "pending", joined: "2025-11-01" }
    ],
    pendingMembers: [
      { id: "p1", name: "Ivan Mugisha", email: "ivan.m@example.com", wants: "Learner", applied: "2h ago" },
      { id: "p2", name: "Ruth Atim", email: "ruth.a@example.com", wants: "Tutor · Data Science", applied: "5h ago" },
      { id: "p3", name: "Brian Ochieng", email: "brian.o@example.com", wants: "Tutor · Cybersecurity", applied: "1d ago" }
    ],
    recentSignups: [
      { name: "Ivan Mugisha", role: "Learner", when: "2h ago" }, { name: "Esther Akello", role: "Learner", when: "3h ago" },
      { name: "Ruth Atim", role: "Tutor", when: "5h ago" }, { name: "Paul Wasswa", role: "Learner", when: "7h ago" }
    ],
    courseApprovals: [
      { id: "c1", title: "Intro to Ethical Hacking with Kali", tutor: "Brian Ochieng", path: "Cybersecurity", price: 120000 },
      { id: "c2", title: "Pandas for Mobile Money Data", tutor: "Ruth Atim", path: "Data Science", price: 90000 },
      { id: "c3", title: "Deploying Next.js on Vercel", tutor: "David Kato", path: "Cloud & DevOps", price: 0 }
    ],
    payouts: [
      { id: "po1", tutor: "David Kato", amount: 850000, method: "MTN Mobile Money", account: "+256 77• ••• 214", requested: "Nov 01" },
      { id: "po2", tutor: "Ruth Atim", amount: 420000, method: "Airtel Money", account: "+256 70• ••• 908", requested: "Nov 01" },
      { id: "po3", tutor: "Moses Byaruhanga", amount: 1250000, method: "Bank (Stanbic)", account: "••••4471", requested: "Oct 31" }
    ],
    transactions: [
      { id: "tx-9012", type: "Course", item: "Software Engineering Path", user: "Sarah Namubiru", amount: 150000, status: "paid", when: "Nov 02 09:14" },
      { id: "tx-9011", type: "Subscription", item: "101 Pro (monthly)", user: "Paul Wasswa", amount: 25000, status: "paid", when: "Nov 02 08:40" },
      { id: "tx-9010", type: "Event ticket", item: "Hackathon 2025", user: "Grace Mutesi", amount: 30000, status: "paid", when: "Nov 01 19:02" },
      { id: "tx-9009", type: "Marketplace", item: "UI Kit — Brutal 101", user: "Esther Akello", amount: 45000, status: "paid", when: "Nov 01 15:27" },
      { id: "tx-9008", type: "Tutor session", item: "1:1 with David Kato (60 min)", user: "Ivan Mugisha", amount: 60000, status: "paid", when: "Nov 01 11:05" },
      { id: "tx-9007", type: "Refund", item: "Duplicate charge", user: "Joseph Ssempala", amount: -25000, status: "refunded", when: "Oct 31 16:48" }
    ],
    moderation: [
      { id: "m1", who: "anon_dev", text: "Selling exam answers, DM me…", reason: "Spam / academic dishonesty", reports: 7 },
      { id: "m2", who: "kampala_coder", text: "This tutor is useless, total scam!!", reason: "Harassment", reports: 3 },
      { id: "m3", who: "quickcash", text: "Earn 1M UGX daily, click this link", reason: "Phishing link", reports: 11 }
    ],
    events: [
      { d: "16", m: "NOV", title: "Web Development Workshop", meta: "Online · 10:00 AM – 12:00 PM", rsvps: 214 },
      { d: "18", m: "NOV", title: "Ethical Hacking Webinar", meta: "Online · 6:00 PM – 8:00 PM", rsvps: 167 },
      { d: "22", m: "NOV", title: "Hackathon 2025", meta: "Online · All day", rsvps: 402 }
    ],
    audit: [
      { when: "Nov 02 10:21", who: "aisha.n (admin)", what: "Approved tutor David Kato" },
      { when: "Nov 02 09:58", who: "aisha.n (admin)", what: "Set commission to 15%" },
      { when: "Nov 01 18:12", who: "system", what: "Payout po-0007 sent via MTN MoMo" },
      { when: "Nov 01 16:40", who: "aisha.n (admin)", what: "Suspended user joseph.s (chargeback)" }
    ],
    flags: [
      { key: "marketplace", label: "Marketplace", on: true }, { key: "tutor_sessions", label: "Paid tutor sessions", on: true },
      { key: "ai_mentor", label: "AI mentor (beta)", on: false }, { key: "events_tickets", label: "Paid event tickets", on: true }
    ],
    commission: 15
  },

  /* ---------------- Social links (edited in admin → Social Links; GET/PUT /api/social) ---------------- */
  social: [
    { key: "youtube", label: "YouTube", icon: "yt", url: "", active: true },
    { key: "instagram", label: "Instagram", icon: "ig", url: "", active: true },
    { key: "tiktok", label: "TikTok", icon: "tt", url: "", active: true },
    { key: "x", label: "X", icon: "x", url: "", active: true },
    { key: "linkedin", label: "LinkedIn", icon: "in", url: "", active: true },
    { key: "discord", label: "Discord", icon: "discord", url: "", active: true },
    { key: "facebook", label: "Facebook", icon: "fb", url: "", active: false },
    { key: "whatsapp", label: "WhatsApp Channel / Group", icon: "wa", url: "", active: false },
    { key: "telegram", label: "Telegram", icon: "tg", url: "", active: false },
    { key: "github", label: "GitHub", icon: "gh", url: "https://github.com/101codecrafts", active: false }
  ],

  /* ---------------- Tutor ---------------- */
  tutor: {
    name: "David Kato",
    kpis: [
      { label: "Active Learners", value: 312 }, { label: "Courses", value: 4 },
      { label: "Earnings (UGX, Nov)", value: 1920000, money: true }, { label: "Avg. Rating", value: "4.8 ★" }
    ],
    courses: [
      { title: "Deploying Next.js on Vercel", learners: 128, status: "Pending approval", completion: 0 },
      { title: "Log Analysis with Python", learners: 96, status: "Published", completion: 54 },
      { title: "Git & GitHub for Teams", learners: 64, status: "Published", completion: 71 },
      { title: "REST APIs in Node.js", learners: 24, status: "Draft", completion: 0 }
    ],
    learners: [
      { name: "Sarah Namubiru", course: "Log Analysis with Python", progress: 82, last: "2h ago" },
      { name: "Ivan Mugisha", course: "Git & GitHub for Teams", progress: 45, last: "1d ago" },
      { name: "Esther Akello", course: "Log Analysis with Python", progress: 23, last: "3d ago" },
      { name: "Paul Wasswa", course: "Git & GitHub for Teams", progress: 100, last: "5h ago" }
    ],
    payouts: [
      { id: "po1", amount: 850000, method: "MTN Mobile Money", status: "Pending", requested: "Nov 01" },
      { id: "po-0007", amount: 640000, method: "MTN Mobile Money", status: "Paid", requested: "Oct 15" }
    ],
    sessions: [
      { d: "04", m: "NOV", title: "1:1 — Ivan Mugisha", meta: "Git branching · 4:00 PM EAT" },
      { d: "06", m: "NOV", title: "Group Q&A — Log Analysis", meta: "12 learners · 7:00 PM EAT" },
      { d: "16", m: "NOV", title: "Web Development Workshop (co-host)", meta: "Online · 10:00 AM EAT" }
    ]
  }
};
