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

  /* ---------------- Free AI tools & APIs (ai-tools.html) ----------------
     Every free-tier limit below is TODO-CONFIRM: providers change quotas often, so an admin must re-check before launch.
     keyUrl/docsUrl are official pages; the key button goes through go.html?id=ai-<id>. No keys are stored in this repo. */
  aiCategories: ["LLM APIs", "Coding assistants", "Image/Video", "Speech", "Hosting/GPUs", "Datasets"],
  aiTools: [
    { id: "huggingface", name: "Hugging Face", mono: "HF", bg: "#FFD21E", fg: "#0B1236", cats: ["LLM APIs", "Image/Video", "Speech", "Hosting/GPUs", "Datasets"], what: "The open-source AI hub: models, datasets, Inference Providers (one token for many hosted models), Spaces demo apps and ZeroGPU.", free: "Free account with monthly Inference Providers credits; free CPU Spaces; ZeroGPU Spaces with a daily GPU quota.", limits: "TODO-CONFIRM", keyUrl: "https://huggingface.co/settings/tokens", docsUrl: "https://huggingface.co/docs", steps: ["Create a free account at huggingface.co and verify your email.", "Open Settings → Access Tokens and click New token.", "Pick a fine-grained token with only the permissions you need (e.g. 'Make calls to Inference Providers').", "Copy it once and keep it in a password manager or a .env file — never in code you push."] },
    { id: "openrouter", name: "OpenRouter", mono: "OR", bg: "#1F2937", fg: "#ffffff", cats: ["LLM APIs"], what: "One OpenAI-compatible API for hundreds of models from many labs. Models ending in ':free' cost nothing.", free: "':free' models at no cost with daily request limits; a small one-time credit top-up raises the free daily cap.", limits: "TODO-CONFIRM", keyUrl: "https://openrouter.ai/keys", docsUrl: "https://openrouter.ai/docs", steps: ["Sign in at openrouter.ai (Google or GitHub works).", "Go to Keys and click Create Key; give it a name and an optional credit limit.", "Use model ids ending in ':free' to stay at zero cost.", "Store the key in an environment variable such as OPENROUTER_API_KEY."] },
    { id: "groq", name: "Groq", mono: "GQ", bg: "#F55036", fg: "#ffffff", cats: ["LLM APIs", "Speech"], what: "Very fast inference for open models (Llama, Qwen and more) plus Whisper speech-to-text, OpenAI-compatible.", free: "Free tier with per-model requests-per-minute and tokens-per-day limits; no card needed.", limits: "TODO-CONFIRM", keyUrl: "https://console.groq.com/keys", docsUrl: "https://console.groq.com/docs", steps: ["Sign up at console.groq.com.", "Open API Keys and click Create API Key.", "Copy the key (it is shown once).", "Check the Limits page in the console for your current free quota."] },
    { id: "ai-studio", name: "Google AI Studio", mono: "AI", bg: "#0B57D0", fg: "#ffffff", cats: ["LLM APIs", "Image/Video"], what: "Prototype with Gemini models in the browser and get a Gemini API key for your apps.", free: "Free tier for Gemini API with rate limits on selected models; free use of the AI Studio web app.", limits: "TODO-CONFIRM", keyUrl: "https://aistudio.google.com/apikey", docsUrl: "https://ai.google.dev/gemini-api/docs", steps: ["Sign in at aistudio.google.com with a Google account.", "Click Get API key → Create API key (it creates or uses a Google Cloud project).", "Copy the key and store it as GEMINI_API_KEY.", "Note: free-tier prompts may be used to improve Google products — don't send private data."] },
    { id: "mistral", name: "Mistral (La Plateforme)", mono: "MI", bg: "#FA520F", fg: "#0B1236", cats: ["LLM APIs", "Coding assistants"], what: "Mistral's own models via API, including Codestral for code completion.", free: "Free 'Experiment' plan for testing with rate limits (phone verification may be required).", limits: "TODO-CONFIRM", keyUrl: "https://console.mistral.ai/api-keys", docsUrl: "https://docs.mistral.ai", steps: ["Create an account at console.mistral.ai.", "Choose the free Experiment plan under Billing/Subscription.", "Open API Keys → Create new key.", "Copy and store it as MISTRAL_API_KEY."] },
    { id: "nvidia-nim", name: "NVIDIA NIM", mono: "NV", bg: "#76B900", fg: "#0B1236", cats: ["LLM APIs", "Image/Video", "Speech"], what: "Try and call NVIDIA-hosted model endpoints (LLMs, vision, speech) at build.nvidia.com.", free: "Free credits / free API access for development with the NVIDIA Developer Program.", limits: "TODO-CONFIRM", keyUrl: "https://build.nvidia.com", docsUrl: "https://docs.api.nvidia.com", steps: ["Sign in at build.nvidia.com with an NVIDIA account.", "Open any model page and click Get API Key (or your profile → API Keys).", "Copy the key (starts with nvapi-).", "Use it with the OpenAI-compatible endpoint shown on the model page."] },
    { id: "cerebras", name: "Cerebras", mono: "CB", bg: "#F05A28", fg: "#0B1236", cats: ["LLM APIs"], what: "Extremely fast inference for open models on Cerebras hardware, OpenAI-compatible.", free: "Free tier with daily token and per-minute request limits.", limits: "TODO-CONFIRM", keyUrl: "https://cloud.cerebras.ai", docsUrl: "https://inference-docs.cerebras.ai", steps: ["Sign up at cloud.cerebras.ai.", "Open API Keys in the left menu and generate a key.", "Copy and store it as CEREBRAS_API_KEY.", "Check the usage page for your current limits."] },
    { id: "cf-workers-ai", name: "Cloudflare Workers AI", mono: "CF", bg: "#F38020", fg: "#0B1236", cats: ["LLM APIs", "Image/Video", "Speech", "Hosting/GPUs"], what: "Run models (text, image, speech, embeddings) on Cloudflare's network from Workers or a REST API.", free: "Free daily allocation of 'neurons' on the Workers Free plan.", limits: "TODO-CONFIRM", keyUrl: "https://dash.cloudflare.com", docsUrl: "https://developers.cloudflare.com/workers-ai/", steps: ["Create a free Cloudflare account at dash.cloudflare.com.", "Go to My Profile → API Tokens → Create Token and use the 'Workers AI' template.", "Note your Account ID from the dashboard sidebar.", "Call the REST API with the token, or bind AI in a Worker (no token needed inside Workers)."] },
    { id: "copilot", name: "GitHub Copilot", mono: "CP", bg: "#0D1117", fg: "#ffffff", cats: ["Coding assistants"], student: true, what: "AI pair programmer in VS Code, JetBrains, the CLI and github.com. Copilot Free for everyone; verified students get Copilot Pro free.", free: "Copilot Free: a monthly allowance of completions and chat. Students: Copilot Pro free via GitHub Education / Student Developer Pack.", limits: "TODO-CONFIRM", keyUrl: "https://github.com/features/copilot", docsUrl: "https://docs.github.com/en/copilot", steps: ["Students: apply at education.github.com with your school email or student ID (Cavendish/Makerere/etc.).", "Once verified, open github.com/settings/copilot and activate Copilot Pro (free while you're a student).", "Everyone else: enable Copilot Free from the same settings page.", "Install the Copilot extension in VS Code and sign in with GitHub — no API key to copy."] },
    { id: "github-models", name: "GitHub Models", mono: "GM", bg: "#24292F", fg: "#ffffff", cats: ["LLM APIs", "Coding assistants"], what: "Try and compare leading models in a playground and call them with your GitHub token.", free: "Free, rate-limited usage for prototyping with a GitHub personal access token.", limits: "TODO-CONFIRM", keyUrl: "https://github.com/settings/tokens", docsUrl: "https://docs.github.com/en/github-models", steps: ["Browse models at github.com/marketplace/models and open the playground.", "Create a fine-grained personal access token at github.com/settings/tokens with the 'Models' read permission.", "Use the token as the API key with the endpoint shown in 'Use this model'.", "Keep the token secret — it is tied to your GitHub account."] },
    { id: "vercel-ai-gateway", name: "Vercel AI Gateway", mono: "▲", bg: "#000000", fg: "#ffffff", cats: ["LLM APIs", "Hosting/GPUs"], what: "One endpoint for many model providers with fallbacks and spend tracking; works with the AI SDK.", free: "Monthly free credit on Vercel accounts (Hobby plan).", limits: "TODO-CONFIRM", keyUrl: "https://vercel.com/ai-gateway", docsUrl: "https://vercel.com/docs/ai-gateway", steps: ["Sign in at vercel.com (free Hobby plan).", "Open AI Gateway in your team dashboard.", "Create an API key (or use OIDC automatically when deployed on Vercel).", "Store it as AI_GATEWAY_API_KEY in your project's environment variables."] },
    { id: "kaggle", name: "Kaggle", mono: "K", bg: "#20BEFF", fg: "#0B1236", cats: ["Hosting/GPUs", "Datasets"], what: "Free notebooks with GPU/TPU time, thousands of public datasets, competitions and short courses.", free: "Weekly free GPU and TPU hours in notebooks (phone verification required).", limits: "TODO-CONFIRM", keyUrl: "https://www.kaggle.com/settings", docsUrl: "https://www.kaggle.com/docs", steps: ["Create a free account at kaggle.com and verify your phone number (unlocks GPUs and internet in notebooks).", "For the API: open Settings → API → Create New Token; it downloads kaggle.json.", "Put kaggle.json in ~/.kaggle/ (chmod 600) — never commit it.", "In a notebook, pick Accelerator → GPU in the side panel."] },
    { id: "colab", name: "Google Colab", mono: "CO", bg: "#F9AB00", fg: "#0B1236", cats: ["Hosting/GPUs"], what: "Jupyter notebooks in the browser with free access to GPUs, saved to Google Drive.", free: "Free GPU/TPU runtimes when available, with usage limits that vary.", limits: "TODO-CONFIRM", keyUrl: "https://colab.research.google.com", docsUrl: "https://research.google.com/colaboratory/faq.html", steps: ["Open colab.research.google.com and sign in with Google.", "Runtime → Change runtime type → choose a GPU.", "Store secrets (API keys) in the 🔑 Secrets panel, not in notebook cells.", "Save a copy to Drive so your work persists."] },
    { id: "sunbird", name: "Sunbird AI", mono: "SB", bg: "#0B6E4F", fg: "#ffffff", cats: ["Speech", "LLM APIs"], what: "Ugandan AI lab: translation, speech-to-text and text-to-speech for Luganda, Acholi, Ateso, Lugbara, Runyankole and English.", free: "Free API access for developers after sign-up (fair-use limits).", limits: "TODO-CONFIRM", keyUrl: "https://api.sunbird.ai", docsUrl: "https://sunbird.ai", steps: ["Register at api.sunbird.ai.", "Sign in and open your account / tokens page to generate an access token.", "Use the token as a Bearer token with the endpoints listed in the API docs.", "Respect the fair-use limits — it's a public-good service."] }
  ],

  /* ---------------- Courses catalog (courses.html) ----------------
     courses101: taught by 101 tutors on the platform (open course.html?id=…).
     externalCourses: free courses elsewhere; every button goes through go.html?id=<id> (→ /go/<id>).
     URLs are real public pages, or the provider homepage where we were not sure of a deep link.
     free_until dates are PLACEHOLDERS — each carries free_until_status:"TODO-CONFIRM" until an admin checks the offer. */
  categories: ["Web Development", "Data & AI", "Cybersecurity", "Networking", "Cloud", "Computer Science", "Study Skills"],
  providers: {
    coursera: { name: "Coursera", short: "Co", bg: "#0056D2", fg: "#ffffff" },
    edx: { name: "edX", short: "eX", bg: "#02262B", fg: "#ffffff" },
    freecodecamp: { name: "freeCodeCamp", short: "fC", bg: "#0A0A23", fg: "#ffffff" },
    google: { name: "Google", short: "G", bg: "#0B57D0", fg: "#ffffff" },
    microsoft: { name: "Microsoft Learn", short: "MS", bg: "#0067B8", fg: "#ffffff" },
    cisco: { name: "Cisco NetAcad", short: "Ci", bg: "#005073", fg: "#ffffff" },
    khan: { name: "Khan Academy", short: "KA", bg: "#0B3D35", fg: "#ffffff" },
    alison: { name: "Alison", short: "Al", bg: "#8F1020", fg: "#ffffff" }
  },
  courses101: [
    { id: "web-basics", title: "Web Development Basics", tutor: "101 Codecrafts Team", level: "University", category: "Web Development", rating: 4.8, reviews: 212, price: 0, lessons: 6, cover: "assets/img/courses/101-web.svg" },
    { id: "log-python", title: "Log Analysis with Python", tutor: "101 Codecrafts Team", level: "Professional", category: "Data & AI", rating: 4.7, reviews: 96, price: 45000, lessons: 12, cover: "assets/img/courses/101-python.svg" },
    { id: "git-teams", title: "Git & GitHub for Teams", tutor: "101 Codecrafts Team", level: "University", category: "Web Development", rating: 4.9, reviews: 64, price: 25000, lessons: 8, cover: "assets/img/courses/101-cloud.svg" },
    { id: "ethical-hacking-101", title: "Ethical Hacking Foundations", tutor: "Ruth Atim", level: "A-Level", category: "Cybersecurity", rating: 4.6, reviews: 141, price: 60000, lessons: 14, cover: "assets/img/courses/101-security.svg" },
    { id: "scratch-kids", title: "Coding with Scratch for Kids", tutor: "Grace Mutesi", level: "Primary", category: "Computer Science", rating: 4.9, reviews: 88, price: 0, lessons: 10, cover: "assets/img/courses/101-kids.svg" },
    { id: "ict-olevel", title: "O-Level ICT: Networks & the Internet", tutor: "Brian Ochieng", level: "O-Level", category: "Networking", rating: 4.5, reviews: 57, price: 15000, lessons: 9, cover: "assets/img/courses/101-network.svg" },
    { id: "data-uganda", title: "Data Analysis with Ugandan Open Data", tutor: "Aisha Nalwoga", level: "University", category: "Data & AI", rating: 4.7, reviews: 73, price: 50000, lessons: 11, cover: "assets/img/courses/101-data.svg" }
  ],
  externalCourses: [
    { id: "x-fcc-rwd", provider: "freecodecamp", title: "Responsive Web Design Certification", url: "https://www.freecodecamp.org/learn/2022/responsive-web-design/", level: "O-Level", category: "Web Development", access: "Free", certFree: true, hours: 300, desc: "HTML & CSS through 20 projects, with a free certification at the end." },
    { id: "x-fcc-learn", provider: "freecodecamp", title: "JavaScript, Python & more: full curriculum", url: "https://www.freecodecamp.org/learn", level: "University", category: "Computer Science", access: "Free", certFree: true, hours: 3000, desc: "The whole freeCodeCamp curriculum: JavaScript, Python, data analysis, ML and more." },
    { id: "x-coursera-ml", provider: "coursera", title: "Machine Learning (Andrew Ng)", url: "https://www.coursera.org/learn/machine-learning", level: "University", category: "Data & AI", access: "Free audit", aid: true, certFree: false, hours: 33, desc: "Stanford & DeepLearning.AI's classic intro. Audit for free; the certificate is paid or via financial aid." },
    { id: "x-coursera-lhtl", provider: "coursera", title: "Learning How to Learn", url: "https://www.coursera.org/learn/learning-how-to-learn", level: "A-Level", category: "Study Skills", access: "Free audit", aid: true, certFree: false, hours: 15, desc: "Practical techniques for studying smarter — great before exams." },
    { id: "x-coursera-gits", provider: "coursera", title: "Google IT Support Professional Certificate", url: "https://www.coursera.org/professional-certificates/google-it-support", level: "Professional", category: "Networking", access: "Financial aid", aid: true, certFree: false, hours: 180, desc: "Entry-level IT support: troubleshooting, networking, OS, admin and security." },
    { id: "x-coursera-aiess", provider: "coursera", title: "Google AI Essentials", url: "https://www.coursera.org/learn/google-ai-essentials", level: "Professional", category: "Data & AI", access: "Free until", free_until: "2026-11-16T23:59:00+03:00", free_until_status: "TODO-CONFIRM", certFree: true, hours: 10, desc: "Use generative AI tools at work. Limited-time free certificate offer (placeholder date)." },
    { id: "x-edx-cs50", provider: "edx", title: "CS50: Introduction to Computer Science", url: "https://www.edx.org/learn/computer-science/harvard-university-cs50-s-introduction-to-computer-science", level: "University", category: "Computer Science", access: "Free audit", certFree: false, hours: 120, desc: "Harvard's famous intro: C, Python, SQL, algorithms and the web." },
    { id: "x-edx-cs", provider: "edx", title: "Computer Science courses on edX", url: "https://www.edx.org/learn/computer-science", level: "University", category: "Computer Science", access: "Free trial", certFree: false, hours: 0, desc: "Browse university CS courses; most can be audited, some offer a free trial of paid tracks." },
    { id: "x-google-mlcc", provider: "google", title: "Machine Learning Crash Course", url: "https://developers.google.com/machine-learning/crash-course", level: "University", category: "Data & AI", access: "Free", certFree: false, hours: 15, desc: "Google's fast-paced, practical intro to ML with interactive visualisations." },
    { id: "x-google-grow", provider: "google", title: "Grow with Google: digital skills", url: "https://grow.google/", level: "A-Level", category: "Study Skills", access: "Free", certFree: false, hours: 0, desc: "Free digital-skills training and career resources from Google." },
    { id: "x-ms-training", provider: "microsoft", title: "Microsoft Learn: Azure & cloud training", url: "https://learn.microsoft.com/en-us/training/", level: "Professional", category: "Cloud", access: "Free until", free_until: "2026-11-30T23:59:00+03:00", free_until_status: "TODO-CONFIRM", certFree: true, hours: 0, desc: "Free self-paced learning paths. Placeholder for a limited-time free exam voucher offer." },
    { id: "x-ms-browse", provider: "microsoft", title: "Microsoft Learn: browse all modules", url: "https://learn.microsoft.com/en-us/training/browse/", level: "University", category: "Cloud", access: "Free", certFree: false, hours: 0, desc: "Thousands of free modules on Azure, Power Platform, GitHub, security and more." },
    { id: "x-cisco-netbasics", provider: "cisco", title: "Networking Basics", url: "https://www.netacad.com/courses/networking-basics", level: "O-Level", category: "Networking", access: "Free", certFree: true, hours: 22, desc: "How networks work: IP addressing, Ethernet, wireless and routing. Free badge on completion." },
    { id: "x-cisco-cyber", provider: "cisco", title: "Introduction to Cybersecurity", url: "https://www.netacad.com/courses/introduction-to-cybersecurity", level: "A-Level", category: "Cybersecurity", access: "Free until", free_until: "2026-12-20T23:59:00+03:00", free_until_status: "TODO-CONFIRM", certFree: true, hours: 6, desc: "Threats, attacks and how to protect yourself online. Placeholder free-until date." },
    { id: "x-khan-prog", provider: "khan", title: "Computer Programming: JS & ProcessingJS", url: "https://www.khanacademy.org/computing/computer-programming", level: "Primary", category: "Computer Science", access: "Free", certFree: false, hours: 0, desc: "Draw, animate and make games with code in the browser — perfect for beginners." },
    { id: "x-khan-apcsp", provider: "khan", title: "AP Computer Science Principles", url: "https://www.khanacademy.org/computing/ap-computer-science-principles", level: "A-Level", category: "Computer Science", access: "Free", certFree: false, hours: 0, desc: "Data, the internet, algorithms and programming at secondary-school level." },
    { id: "x-alison", provider: "alison", title: "Free IT & programming courses", url: "https://alison.com/", level: "Professional", category: "Web Development", access: "Free", certFree: false, hours: 0, desc: "Free CPD-style courses; learning is free, certificates are paid." }
  ],

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
      { id: "u2", name: "Demo Tutor", email: "tutor@example.com", role: "tutor", status: "verified", joined: "2025-10-28" },
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
      { id: "c3", title: "Deploying Next.js on Vercel", tutor: "101 Codecrafts Team", path: "Cloud & DevOps", price: 0 }
    ],
    payouts: [
      { id: "po1", tutor: "101 Codecrafts Team", amount: 850000, method: "MTN Mobile Money", account: "+256 77• ••• 214", requested: "Nov 01" },
      { id: "po2", tutor: "Ruth Atim", amount: 420000, method: "Airtel Money", account: "+256 70• ••• 908", requested: "Nov 01" },
      { id: "po3", tutor: "Moses Byaruhanga", amount: 1250000, method: "Bank (Stanbic)", account: "••••4471", requested: "Oct 31" }
    ],
    transactions: [
      { id: "tx-9012", type: "Course", item: "Software Engineering Path", user: "Sarah Namubiru", amount: 150000, status: "paid", when: "Nov 02 09:14" },
      { id: "tx-9011", type: "Subscription", item: "101 Pro (monthly)", user: "Paul Wasswa", amount: 25000, status: "paid", when: "Nov 02 08:40" },
      { id: "tx-9010", type: "Event ticket", item: "Hackathon 2025", user: "Grace Mutesi", amount: 30000, status: "paid", when: "Nov 01 19:02" },
      { id: "tx-9009", type: "Marketplace", item: "UI Kit — Brutal 101", user: "Esther Akello", amount: 45000, status: "paid", when: "Nov 01 15:27" },
      { id: "tx-9008", type: "Tutor session", item: "1:1 tutor session (60 min)", user: "Ivan Mugisha", amount: 60000, status: "paid", when: "Nov 01 11:05" },
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
      { when: "Nov 02 10:21", who: "aisha.n (admin)", what: "Approved a tutor application" },
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
    { id: "t1", product: "BodaSafe", what: "Test live trip sharing on 10 real rides", level: "University", slots: 25, taken: 18, reward: "UGX 10,000 airtime", ends: "2026-11-12T18:00:00+03:00" },
    { id: "t2", product: "Scratch Quest", what: "Play levels 1–5 with a P6 pupil and report confusing steps", level: "Primary", slots: 15, taken: 6, reward: "Certificate + badge", ends: "2026-11-15T18:00:00+03:00" },
    { id: "t3", product: "UNEB Buddy", what: "Check 20 AI explanations for A-Level Maths accuracy", level: "A-Level", slots: 40, taken: 37, reward: "1 month Pro", ends: "2026-11-09T23:59:00+03:00" }
  ],
  triage: {
    New: [{ id: "b31", t: "Map freezes on Android 8", sev: "High", who: "tester_amos" }, { id: "b32", t: "Typo on sign-up screen", sev: "Low", who: "grace_m" }],
    Confirmed: [{ id: "b27", t: "SMS fallback sends twice", sev: "Medium", who: "brian_o" }],
    "In progress": [{ id: "b22", t: "Battery drain during long rides", sev: "High", who: "ruth_a" }],
    Fixed: [{ id: "b18", t: "Dark map tiles unreadable", sev: "Medium", who: "paul_w" }]
  },

  /* ---------------- Competitions ---------------- */
  competitions: [
    { id: "hack25", name: "Hackathon 2025", track: "Open innovation", level: "University", team: "1–4", prize: "UGX 5,000,000", starts: "2026-11-22T09:00:00+03:00", registered: 402 },
    { id: "ctf-ol", name: "Junior CTF: Capture the Flag", track: "Cybersecurity", level: "O-Level", team: "1–3", prize: "Laptops + mentorship", starts: "2026-12-06T10:00:00+03:00", registered: 156 },
    { id: "ai-alevel", name: "AI for Exams Challenge", track: "AI & ML", level: "A-Level", team: "1–2", prize: "UGX 2,000,000", starts: "2026-12-13T09:00:00+03:00", registered: 98 },
    { id: "scratch-p7", name: "Scratch Story Jam", track: "Creative coding", level: "Primary", team: "1–2", prize: "Tablets for the school", starts: "2026-11-29T09:00:00+03:00", registered: 74 },
    { id: "cloud-pro", name: "Serverless Speedrun", track: "Cloud & DevOps", level: "Professional", team: "1", prize: "AWS credits", starts: "2026-12-20T18:00:00+03:00", registered: 61 }
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
    id: "web-basics", title: "Web Development Basics", level: "University", path: "Software Engineering", tutor: "101 Codecrafts Team",
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
    name: "Demo Tutor",
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
