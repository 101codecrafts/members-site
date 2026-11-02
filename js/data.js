/* Placeholder data. Every value here is a fallback used when the backend (or a public API) is not reachable.
   The backend plugs in by answering the endpoints named in js/api.js; nothing here is real user data. */
window.CC_DATA = {
  /* ---------------- Library (resources) ---------------- */
  resources: [
    { id: "fcc-rwd", level: "University", type: "Course", title: "Responsive Web Design Certification", site: "freeCodeCamp", url: "https://www.freecodecamp.org/learn/2022/responsive-web-design/", favicon: "https://www.freecodecamp.org/favicon.ico", thumb: "", desc: "Learn HTML and CSS by building 20 projects, then earn a free certification.", tags: ["HTML", "CSS", "Beginner"], path: "Software Engineering" },
    { id: "cs50x", level: "University", type: "Course", title: "CS50: Introduction to Computer Science", site: "edX", url: "https://www.edx.org/learn/computer-science/harvard-university-cs50-s-introduction-to-computer-science", favicon: "https://www.edx.org/favicon.ico", thumb: "", desc: "Harvard's legendary intro to CS: C, Python, SQL, algorithms and web basics.", tags: ["C", "Python", "Algorithms"], path: "Software Engineering" },
    { id: "yt-ml-crash", level: "Professional", type: "Video", title: "Machine Learning for Everybody – Full Course", site: "YouTube", url: "https://www.youtube.com/watch?v=i_LwzRVP7bg", favicon: "https://www.youtube.com/favicon.ico", thumb: "https://i.ytimg.com/vi/i_LwzRVP7bg/hqdefault.jpg", desc: "freeCodeCamp's beginner-friendly ML course with hands-on Python notebooks.", tags: ["ML", "Python"], path: "AI & Machine Learning" },
    { id: "ol-sicp", level: "University", type: "Book", title: "Structure and Interpretation of Computer Programs", site: "Open Library", url: "https://openlibrary.org/works/OL1832493W", favicon: "https://openlibrary.org/favicon.ico", thumb: "https://covers.openlibrary.org/b/isbn/0262510871-M.jpg", desc: "The classic MIT text on abstraction, recursion and how programs are built.", tags: ["Theory", "Lisp"], path: "Software Engineering" },
    { id: "gh-system-design", level: "Professional", type: "Repo", title: "donnemartin/system-design-primer", site: "GitHub", url: "https://github.com/donnemartin/system-design-primer", favicon: "https://github.com/favicon.ico", thumb: "", desc: "Learn how to design large-scale systems; prep for the system design interview.", tags: ["Architecture", "Interviews"], path: "Cloud & DevOps" },
    { id: "owasp-top10", level: "Professional", type: "Article", title: "OWASP Top 10 Web Application Security Risks", site: "OWASP", url: "https://owasp.org/www-project-top-ten/", favicon: "https://owasp.org/favicon.ico", thumb: "", desc: "The standard awareness document for the most critical web app security risks.", tags: ["AppSec", "Web"], path: "Cybersecurity & Ethical Hacking" },
    { id: "kaggle-pandas", level: "A-Level", type: "Course", title: "Kaggle Learn: Pandas", site: "Kaggle", url: "https://www.kaggle.com/learn/pandas", favicon: "https://www.kaggle.com/static/images/favicon.ico", thumb: "", desc: "Short hands-on course: create, read, index, group and clean data with pandas.", tags: ["Data", "Python"], path: "Data Science & Analytics" },
    { id: "cisco-netacad", level: "O-Level", type: "Course", title: "Networking Basics", site: "Cisco NetAcad", url: "https://www.netacad.com/courses/networking-basics", favicon: "https://www.netacad.com/favicon.ico", thumb: "", desc: "Free intro to how networks work: IP addressing, Ethernet, wireless and routing.", tags: ["Networking", "CCNA"], path: "IT Infrastructure & Networking" },
    { id: "mdn-js", level: "A-Level", type: "Article", title: "JavaScript Guide", site: "MDN Web Docs", url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide", favicon: "https://developer.mozilla.org/favicon.ico", thumb: "", desc: "Mozilla's reference guide to the JavaScript language, from grammar to modules.", tags: ["JavaScript", "Reference"], path: "Software Engineering" }
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
    byLevel: { labels: ["Primary", "O-Level", "A-Level", "University", "Professional"], learners: [640, 1820, 2210, 3980, 1224], under18: [640, 1820, 1610, 0, 0] },
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
      { id: "m3", who: "quickcash", text: "Earn 1M UGX daily, click this link", reason: "Phishing link", reports: 11 },
      { id: "m4", who: "launchpad", text: "New product “Free Data Hack” submitted to Launchpad", reason: "Launchpad review", reports: 0 },
      { id: "m5", who: "kcb_coding_club", text: "Under-18 member messaged an adult outside the group", reason: "Child safety (O-Level)", reports: 1 }
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

  levels: ["Primary", "O-Level", "A-Level", "University", "Professional"],

  /* ---------------- Launchpad (member-built products) ---------------- */
  products: [
    { id: "boda-safe", name: "BodaSafe", tagline: "Share your boda ride live with family in one tap", stage: "Beta", level: "University", votes: 214, comments: 38, makers: ["SN", "DK"], tags: ["Mobile", "Safety"], featured: false, demo: "https://example.com/bodasafe", repo: "https://github.com/101codecrafts" },
    { id: "uneb-buddy", name: "UNEB Buddy", tagline: "Past papers + AI explanations for O-Level and A-Level", stage: "Launched", level: "A-Level", votes: 187, comments: 41, makers: ["GM"], tags: ["EdTech", "AI"], featured: true, demo: "https://example.com/unebbuddy", repo: "" },
    { id: "matooke-market", name: "Matooke Market", tagline: "Farm-gate prices from 40 Ugandan markets by SMS", stage: "Building", level: "Professional", votes: 129, comments: 17, makers: ["BO", "RA", "PW"], tags: ["Agritech", "SMS"], featured: false, demo: "", repo: "https://github.com/101codecrafts" },
    { id: "scratch-quest", name: "Scratch Quest", tagline: "Coding adventures for P5–P7 pupils, works offline", stage: "Beta", level: "Primary", votes: 96, comments: 12, makers: ["EA"], tags: ["Kids", "Offline"], featured: false, demo: "https://example.com/scratchquest", repo: "" },
    { id: "logsight", name: "LogSight", tagline: "Open-source log analysis for small teams", stage: "Launched", level: "Professional", votes: 88, comments: 9, makers: ["DK"], tags: ["DevTools", "Open source"], featured: false, demo: "", repo: "https://github.com/101codecrafts" },
    { id: "lab-booker", name: "Lab Booker", tagline: "Book school computer-lab slots without the queue", stage: "Idea", level: "O-Level", votes: 41, comments: 6, makers: ["IM"], tags: ["Schools"], featured: false, demo: "", repo: "" }
  ],
  changelog: [
    { v: "0.9.0", d: "Nov 01", t: "Live trip sharing over SMS when data is off" },
    { v: "0.8.2", d: "Oct 24", t: "Fixed GPS drift on low-end Android phones" },
    { v: "0.8.0", d: "Oct 12", t: "Family circle invites via WhatsApp" }
  ],
  productComments: [
    { who: "Grace M.", t: "Tested on a Tecno Spark — works great even on 2G.", ago: "2h" },
    { who: "Brian O.", t: "Would love an Airtel USSD fallback.", ago: "5h" }
  ],

  /* ---------------- Beta testing ---------------- */
  campaigns: [
    { id: "t1", product: "BodaSafe", what: "Test live trip sharing on 10 real rides", level: "University", slots: 25, taken: 18, reward: "UGX 10,000 airtime", ends: "2025-11-12T18:00:00+03:00" },
    { id: "t2", product: "Scratch Quest", what: "Play levels 1–5 with a P6 pupil and report confusing steps", level: "Primary", slots: 15, taken: 6, reward: "Certificate + badge", ends: "2025-11-15T18:00:00+03:00" },
    { id: "t3", product: "UNEB Buddy", what: "Check 20 AI explanations for A-Level Maths accuracy", level: "A-Level", slots: 40, taken: 37, reward: "1 month Pro", ends: "2025-11-09T23:59:00+03:00" }
  ],
  triage: {
    New: [{ id: "b31", t: "Map freezes on Android 8", sev: "High", who: "tester_amos" }, { id: "b32", t: "Typo on sign-up screen", sev: "Low", who: "grace_m" }],
    Confirmed: [{ id: "b27", t: "SMS fallback sends twice", sev: "Medium", who: "brian_o" }],
    "In progress": [{ id: "b22", t: "Battery drain during long rides", sev: "High", who: "ruth_a" }],
    Fixed: [{ id: "b18", t: "Dark map tiles unreadable", sev: "Medium", who: "paul_w" }]
  },

  /* ---------------- Competitions ---------------- */
  competitions: [
    { id: "hack25", name: "Hackathon 2025", track: "Open innovation", level: "University", team: "1–4", prize: "UGX 5,000,000", starts: "2025-11-22T09:00:00+03:00", registered: 402 },
    { id: "ctf-ol", name: "Junior CTF: Capture the Flag", track: "Cybersecurity", level: "O-Level", team: "1–3", prize: "Laptops + mentorship", starts: "2025-12-06T10:00:00+03:00", registered: 156 },
    { id: "ai-alevel", name: "AI for Exams Challenge", track: "AI & ML", level: "A-Level", team: "1–2", prize: "UGX 2,000,000", starts: "2025-12-13T09:00:00+03:00", registered: 98 },
    { id: "scratch-p7", name: "Scratch Story Jam", track: "Creative coding", level: "Primary", team: "1–2", prize: "Tablets for the school", starts: "2025-11-29T09:00:00+03:00", registered: 74 },
    { id: "cloud-pro", name: "Serverless Speedrun", track: "Cloud & DevOps", level: "Professional", team: "1", prize: "AWS credits", starts: "2025-12-20T18:00:00+03:00", registered: 61 }
  ],
  leaderboard: [
    { team: "Kampala Kernel", pts: 980, members: 4 }, { team: "Nile Byte", pts: 940, members: 3 },
    { team: "Gulu Gophers", pts: 875, members: 4 }, { team: "Mbarara Makers", pts: 820, members: 2 }, { team: "Solo: Ruth A.", pts: 790, members: 1 }
  ],

  /* ---------------- Groups ---------------- */
  groups: [
    { id: "g1", kind: "Study group", name: "Python Night Owls", level: "University", members: 48, open: true, desc: "Weeknight Python practice, 8–10 PM EAT." },
    { id: "g2", kind: "Project team", name: "BodaSafe Core Team", level: "University", members: 6, open: false, desc: "Building BodaSafe — request to join with your GitHub." },
    { id: "g3", kind: "School chapter", name: "Cavendish University Chapter", level: "University", members: 212, open: true, desc: "Official 101 chapter at Cavendish University Uganda." },
    { id: "g4", kind: "School chapter", name: "Kings College Budo Coding Club", level: "A-Level", members: 64, open: false, desc: "Teacher-approved club. Guardian consent required." },
    { id: "g5", kind: "Study group", name: "Scratch Starters", level: "Primary", members: 31, open: true, desc: "Guided Scratch sessions for P4–P7, with parents." },
    { id: "g6", kind: "Study group", name: "CCNA Study Circle", level: "Professional", members: 27, open: true, desc: "Cisco CCNA prep, mock labs every Saturday." }
  ],
  groupFeed: [
    { who: "Sarah N.", t: "Uploaded notes for week 6: decorators and generators.", ago: "1h" },
    { who: "Ivan M.", t: "Anyone free to pair on the scraping exercise tonight?", ago: "3h" }
  ],

  /* ---------------- Projects ---------------- */
  projects: [
    { id: "pr1", name: "BodaSafe", kind: "Group", level: "University", progress: 72, team: ["SN", "DK", "GM"],
      milestones: [{ t: "MVP ride sharing", done: true }, { t: "SMS fallback", done: true }, { t: "Beta with 25 riders", done: false }, { t: "Play Store launch", done: false }] },
    { id: "pr2", name: "Portfolio site", kind: "Individual", level: "A-Level", progress: 40, team: ["CC"],
      milestones: [{ t: "Design in Figma", done: true }, { t: "HTML/CSS build", done: false }, { t: "Deploy on Vercel", done: false }] },
    { id: "pr3", name: "Lab Booker", kind: "Group", level: "O-Level", progress: 15, team: ["IM", "EA"],
      milestones: [{ t: "Interview 10 teachers", done: true }, { t: "Paper prototype", done: false }, { t: "Clickable prototype", done: false }] }
  ],

  /* ---------------- Course player ---------------- */
  course: {
    id: "web-basics", title: "Web Development Basics", level: "University", path: "Software Engineering", tutor: "David Kato",
    overview: "Build and publish your first website. You'll learn how the web works, write semantic HTML, style it with CSS, add interactivity with JavaScript and deploy it for free.",
    lessons: [
      { id: "l1", title: "How the web works", yt: "hJHvdBlSxug", done: true },
      { id: "l2", title: "HTML crash course", yt: "qz0aGYrrlhU", done: true },
      { id: "l3", title: "CSS: zero to hero", yt: "1Rs2ND1ryYc", done: false },
      { id: "l4", title: "JavaScript in 100 seconds", yt: "DHjqpvDnNGE", done: false },
      { id: "l5", title: "Git & GitHub for beginners", yt: "RGOj5yH7evk", done: false },
      { id: "l6", title: "Deploy your site", yt: "", done: false, quiz: true }
    ],
    books: [
      { id: "bk-eloquent", title: "Eloquent JavaScript (4th ed.)", author: "Marijn Haverbeke", cover: "https://covers.openlibrary.org/b/isbn/9781593279509-M.jpg", url: "https://eloquentjavascript.net/", site: "eloquentjavascript.net", open: true },
      { id: "bk-html", title: "HTML & CSS: Design and Build Websites", author: "Jon Duckett", cover: "https://covers.openlibrary.org/b/isbn/9781118008188-M.jpg", url: "https://openlibrary.org/isbn/9781118008188", site: "Open Library", open: false },
      { id: "bk-git", title: "Pro Git", author: "Scott Chacon & Ben Straub", cover: "https://covers.openlibrary.org/b/isbn/9781484200773-M.jpg", url: "https://git-scm.com/book/en/v2", site: "git-scm.com", open: true }
    ],
    discussion: [
      { who: "Grace M.", t: "In lesson 3, why does margin collapse between the two paragraphs?", ago: "3h", replies: 4 },
      { who: "Ivan M.", t: "Tip: use the browser dev tools 'Computed' tab to see final box sizes.", ago: "1d", replies: 2 }
    ]
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
