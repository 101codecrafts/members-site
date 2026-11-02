/* 101 Codecrafts — PLACEHOLDER data for Announcements, Daily Tech News and Opportunities.
   Used only when the backend (/api/v1/announcements, /api/v1/news, /api/v1/opportunities) is not reachable.
   Dates are relative to "now" so countdowns stay meaningful in previews. Links point at the source sites' home or
   listing pages; replace with real items from the backend. Nothing here is a real, verified deadline. */
(function () {
  const now = Date.now(), day = 864e5, hr = 36e5;
  const inDays = (d, h = 23, m = 59) => { const t = new Date(now + d * day); t.setHours(h, m, 0, 0); return t.toISOString(); };
  const ago = ms => new Date(now - ms).toISOString();

  window.CC_FEED_DATA = {
    /* audience: roles (learner|tutor|admin), levels (Primary|O-Level|A-Level|University|Professional), groups (group names). Empty = everyone. */
    announcements: [
      { id: "a1", title: "101 Hackathon registration is open", body: "Teams of 2–4. Build for Kampala's transport, health or farming. Register by Friday to get a mentor slot.",
        audience: { roles: [], levels: [], groups: [] }, pinned: true, publishedAt: ago(3 * hr), expiresAt: inDays(5), author: "101 Team", email: true, link: "competitions.html" },
      { id: "a2", title: "New: Daily Tech News and Opportunities", body: "Scholarships, internships, hackathons and grants, checked by the 101 team. Save one and we remind you before it closes.",
        audience: { roles: ["learner", "tutor"], levels: [], groups: [] }, pinned: false, publishedAt: ago(20 * hr), expiresAt: inDays(14), author: "101 Team", email: false, link: "opportunities.html" },
      { id: "a3", title: "Python Foundations: live session moved to Thursday 6 PM EAT", body: "Same Google Meet link. The recording will be in the course player by Friday morning.",
        audience: { roles: ["learner"], levels: ["University", "A-Level"], groups: ["Python Foundations"] }, pinned: false, publishedAt: ago(2 * day), expiresAt: inDays(3), author: "Tutor · Amooti", email: true },
      { id: "a4", title: "Tutors: payout window closes on the 25th", body: "Submit your session logs before the 25th to be paid this month via Mobile Money or bank.",
        audience: { roles: ["tutor"], levels: [], groups: [] }, pinned: false, publishedAt: ago(3 * day), expiresAt: inDays(10), author: "Finance", email: true },
      { id: "a5", title: "O-Level coding club meets Saturday", body: "Scratch and micro:bit projects. Guardians are welcome to sit in.",
        audience: { roles: ["learner"], levels: ["O-Level"], groups: ["Junior Coders"] }, pinned: false, publishedAt: ago(4 * day), expiresAt: inDays(4), author: "Community", email: false }
    ],

    /* tab: africa | ai | dev | startups (All shows everything). summary = 1–2 lines written by 101 AI from the source. */
    news: [
      { id: "fn1", tab: "africa", title: "Ugandan fintechs push Mobile Money APIs to more small developers", source: "TechCabal", url: "https://techcabal.com/", at: ago(1.2 * hr), summary: "Payment providers are opening sandbox access, so student projects can take real Mobile Money test payments." },
      { id: "fn2", tab: "ai", title: "Small open-weight models now run well on mid-range laptops", source: "Hacker News", url: "https://news.ycombinator.com/", at: ago(2 * hr), summary: "Quantised 3–8B models make offline AI tutors and chatbots realistic without paid cloud credits." },
      { id: "fn3", tab: "dev", title: "Node.js and Python both ship security releases this week", source: "The Hacker News", url: "https://thehackernews.com/", at: ago(3 * hr), summary: "Update your runtimes and lockfiles; the fixes cover request handling and package installs." },
      { id: "fn4", tab: "startups", title: "East African startup funding: seed rounds hold steady", source: "Disrupt Africa", url: "https://disrupt-africa.com/", at: ago(4 * hr), summary: "Investors are still writing small first cheques, mostly to fintech, agritech and logistics teams." },
      { id: "fn5", tab: "africa", title: "Kampala innovation hubs open more free evening bootcamps", source: "Daily Monitor", url: "https://www.monitor.co.ug/", at: ago(5 * hr), summary: "Short web and data courses aimed at students and recent graduates, most with certificates." },
      { id: "fn6", tab: "ai", title: "Speech models add better support for African languages", source: "Hugging Face", url: "https://huggingface.co/blog", at: ago(6 * hr), summary: "New datasets and fine-tunes improve Luganda and Swahili speech recognition for local apps." },
      { id: "fn7", tab: "dev", title: "GitHub Student Pack adds more free cloud and AI credits", source: "GitHub Blog", url: "https://github.blog/", at: ago(7 * hr), summary: "Verified students get extra free tools; worth checking if you build portfolio projects." },
      { id: "fn8", tab: "startups", title: "What accelerators look for in a first-time founder pitch", source: "TechCrunch", url: "https://techcrunch.com/", at: ago(9 * hr), summary: "A clear problem, early users and a working demo beat a long slide deck." },
      { id: "fn9", tab: "africa", title: "Nairobi and Lagos devs share tips on landing remote roles", source: "TechCabal", url: "https://techcabal.com/", at: ago(11 * hr), summary: "Open-source contributions and a public portfolio are the most cited ways in." },
      { id: "fn10", tab: "ai", title: "How to write prompts that give reproducible code answers", source: "Dev.to", url: "https://dev.to/", at: ago(13 * hr), summary: "Give context, constraints and a test case; ask the model to explain before it writes code." },
      { id: "fn11", tab: "dev", title: "Web performance: the cheapest wins for slow mobile networks", source: "web.dev", url: "https://web.dev/", at: ago(15 * hr), summary: "Compress images, lazy-load, and ship less JavaScript; matters a lot on 3G data bundles." },
      { id: "fn12", tab: "startups", title: "Bootstrapped SaaS from Africa: pricing in local currency", source: "Indie Hackers", url: "https://www.indiehackers.com/", at: ago(18 * hr), summary: "Founders report better conversion when they price in UGX/KES and accept Mobile Money." }
    ],

    /* type: scholarship|internship|job|hackathon|grant|fellowship|competition|bootcamp; level: High school|Undergraduate|Graduate|Any;
       location: "Remote" or a place; remote: true/false. status: approved (submitted ones go to admin review first). */
    opportunities: [
      { id: "op1", type: "hackathon", title: "101 Codecrafts Kampala Hackathon", org: "101 Codecrafts", url: "https://github.com/101codecrafts", deadline: inDays(2), level: "Any", location: "Kampala, Uganda", remote: false, eligibility: "Teams of 2–4, any school or university in Uganda.", value: "Prizes + mentorship" },
      { id: "op2", type: "scholarship", title: "Mastercard Foundation Scholars Program", org: "Mastercard Foundation", url: "https://mastercardfdn.org/", deadline: inDays(5), level: "Undergraduate", location: "Africa (partner universities)", remote: false, eligibility: "African students with financial need and leadership record.", value: "Full scholarship" },
      { id: "op3", type: "internship", title: "Software Engineering Intern (Remote, Africa)", org: "Andela", url: "https://andela.com/", deadline: inDays(6), level: "Undergraduate", location: "Remote", remote: true, eligibility: "Final-year CS/IT students; JavaScript or Python.", value: "Paid" },
      { id: "op4", type: "fellowship", title: "Google for Startups Accelerator: Africa", org: "Google", url: "https://startup.google.com/", deadline: inDays(12), level: "Any", location: "Remote + Lagos", remote: true, eligibility: "Seed to Series A startups using tech to solve African problems.", value: "Equity-free support" },
      { id: "op5", type: "grant", title: "Mozilla Technology Fund (open call)", org: "Mozilla Foundation", url: "https://foundation.mozilla.org/", deadline: inDays(18), level: "Any", location: "Remote", remote: true, eligibility: "Open-source projects with public-interest impact.", value: "Up to USD 50,000" },
      { id: "op6", type: "competition", title: "Zindi data science challenge", org: "Zindi", url: "https://zindi.africa/competitions", deadline: inDays(4), level: "Any", location: "Remote", remote: true, eligibility: "Anyone with a Zindi account; solo or teams.", value: "Cash prizes" },
      { id: "op7", type: "bootcamp", title: "ALX Software Engineering (free)", org: "ALX Africa", url: "https://www.alxafrica.com/", deadline: inDays(9), level: "High school", location: "Remote", remote: true, eligibility: "18+, African resident, laptop and internet.", value: "Free, 12 months" },
      { id: "op8", type: "job", title: "Junior Frontend Developer", org: "Kampala fintech (via 101 Jobs)", url: "https://github.com/101codecrafts", deadline: inDays(21), level: "Undergraduate", location: "Kampala, Uganda", remote: false, eligibility: "React basics, a portfolio with 2+ projects.", value: "Full-time" },
      { id: "op9", type: "scholarship", title: "DAAD In-Country/In-Region Scholarships", org: "DAAD", url: "https://www.daad.de/en/", deadline: inDays(30), level: "Graduate", location: "East Africa", remote: false, eligibility: "Graduates applying to Master's programmes in the region.", value: "Tuition + stipend" },
      { id: "op10", type: "competition", title: "Huawei ICT Competition", org: "Huawei", url: "https://e.huawei.com/", deadline: inDays(3), level: "Undergraduate", location: "Uganda → regional", remote: false, eligibility: "University students in ICT fields.", value: "Training + trip" }
    ],
    oppTypes: ["scholarship", "internship", "job", "hackathon", "grant", "fellowship", "competition", "bootcamp"],
    oppLevels: ["High school", "Undergraduate", "Graduate", "Any"],
    annRoles: ["learner", "tutor", "admin"],
    annLevels: ["Primary", "O-Level", "A-Level", "University", "Professional"],
    annGroups: ["Python Foundations", "Junior Coders", "Web Dev Cohort", "AI Club", "Women in Tech"]
  };
})();
