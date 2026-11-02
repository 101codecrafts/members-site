/**
 * Static site knowledge used as (a) the fallback data for assistant tools when the
 * backend tables are empty/unavailable, and (b) part of the RAG corpus.
 *
 * Paths come from the public landing page. The module outlines are the team's
 * draft curriculum (status "draft") — the assistant presents them as outlines,
 * not as scheduled courses. Replace/extend from the backend `courses` table.
 */

export type PathId = "software-engineering" | "data-science" | "cybersecurity" | "ai-ml" | "cloud-devops" | "it-networking";

export type LearningPath = {
  id: PathId;
  name: string;
  summary: string;
  goodFor: string[];
  prerequisites: string;
  interests: string[];
  careers: string[];
  certifications: string[];
};

export type Course = {
  id: string;
  title: string;
  pathId: PathId;
  level: "beginner" | "intermediate" | "advanced";
  summary: string;
  topics: string[];
  status: "draft" | "published";
  url?: string;
};

export type CommunityTool = { name: string; category: string; url: string; why: string };

export const SITE_URL_PATHS = {
  join: "/sign-up",
  dashboard: "/dashboard",
  assistant: "/assistant",
  faq: "/assistant/faq",
  whiteboard: "/whiteboard",
  playground: "/whiteboard/playground",
} as const;

export const WHATSAPP_INVITE = "https://chat.whatsapp.com/LwXmmJK0ujN6hp4Zh6lhzh";

export const LEARNING_PATHS: LearningPath[] = [
  {
    id: "software-engineering",
    name: "Software Engineering",
    summary: "Build web and mobile apps: programming fundamentals, Git, the web, back-end APIs, databases, testing and shipping real products.",
    goodFor: ["building apps and websites", "problem solving", "creating products"],
    prerequisites: "None — starts from your first line of code.",
    interests: ["apps", "websites", "web", "mobile", "frontend", "backend", "javascript", "react", "build", "startup", "product"],
    careers: ["Software Engineer", "Web Developer", "Mobile Developer", "Full-stack Developer"],
    certifications: [],
  },
  {
    id: "data-science",
    name: "Data Science & Analytics",
    summary: "Turn data into decisions: spreadsheets, SQL, Python (pandas), statistics, visualisation and dashboards.",
    goodFor: ["numbers and patterns", "business insight", "research"],
    prerequisites: "Comfort with basic maths; no coding needed to start.",
    interests: ["data", "numbers", "excel", "spreadsheets", "statistics", "sql", "dashboards", "analysis", "charts", "business"],
    careers: ["Data Analyst", "Business Intelligence Analyst", "Data Scientist"],
    certifications: [],
  },
  {
    id: "cybersecurity",
    name: "Cybersecurity & Ethical Hacking",
    summary: "Defend systems legally and ethically: networking basics, Linux, security fundamentals, web security, CTFs and incident response.",
    goodFor: ["puzzles", "how systems break", "protecting people"],
    prerequisites: "Basic computer skills; networking basics help.",
    interests: ["security", "hacking", "ethical hacking", "ctf", "linux", "privacy", "forensics", "pentest", "defence", "defense"],
    careers: ["SOC Analyst", "Penetration Tester", "Security Engineer"],
    certifications: ["CompTIA Security+", "CEH"],
  },
  {
    id: "ai-ml",
    name: "AI & Machine Learning",
    summary: "Understand and build AI: Python, maths for ML, classic machine learning, deep learning, LLMs and responsible AI.",
    goodFor: ["curiosity about how AI works", "maths", "research"],
    prerequisites: "Some Python is recommended (start with Software Engineering or Data Science basics if new).",
    interests: ["ai", "machine learning", "ml", "chatgpt", "llm", "deep learning", "neural", "models", "python", "robots"],
    careers: ["ML Engineer", "AI Engineer", "Data Scientist"],
    certifications: [],
  },
  {
    id: "cloud-devops",
    name: "Cloud & DevOps",
    summary: "Ship and run software at scale: Linux, Git, CI/CD, containers (Docker), cloud platforms (AWS) and infrastructure as code.",
    goodFor: ["automation", "servers", "reliability"],
    prerequisites: "Basic command line; some programming helps.",
    interests: ["cloud", "aws", "devops", "docker", "kubernetes", "servers", "automation", "deploy", "ci/cd", "linux"],
    careers: ["DevOps Engineer", "Cloud Engineer", "Site Reliability Engineer"],
    certifications: ["AWS Certified Cloud Practitioner"],
  },
  {
    id: "it-networking",
    name: "IT Infrastructure & Networking",
    summary: "Keep organisations running: hardware, operating systems, networking (TCP/IP, routing, switching), systems administration and support.",
    goodFor: ["hardware", "networks", "helping people with tech"],
    prerequisites: "None.",
    interests: ["networks", "networking", "hardware", "routers", "cisco", "it support", "sysadmin", "systems", "windows", "infrastructure"],
    careers: ["IT Support Specialist", "Network Engineer", "Systems Administrator"],
    certifications: ["CompTIA A+", "CompTIA Network+", "Cisco CCNA"],
  },
];

export const COURSES: Course[] = [
  { id: "se-101", title: "Programming 101 with Python", pathId: "software-engineering", level: "beginner", status: "draft", summary: "Variables, control flow, functions and problem solving.", topics: ["python", "programming basics", "problem solving"] },
  { id: "se-102", title: "Git & GitHub Essentials", pathId: "software-engineering", level: "beginner", status: "draft", summary: "Version control, branches, pull requests and open-source etiquette.", topics: ["git", "github", "version control", "open source"] },
  { id: "se-201", title: "Web Development: HTML, CSS & JavaScript", pathId: "software-engineering", level: "beginner", status: "draft", summary: "Build responsive web pages and interactive front ends.", topics: ["html", "css", "javascript", "web", "frontend"] },
  { id: "se-301", title: "Full-stack Apps with Next.js & Supabase", pathId: "software-engineering", level: "intermediate", status: "draft", summary: "APIs, databases, auth and deploying to the cloud.", topics: ["react", "next.js", "supabase", "postgres", "backend", "api"] },
  { id: "ds-101", title: "Data Analysis with Spreadsheets", pathId: "data-science", level: "beginner", status: "draft", summary: "Cleaning data, formulas, pivot tables and charts.", topics: ["excel", "google sheets", "spreadsheets", "charts"] },
  { id: "ds-201", title: "SQL for Data Analysis", pathId: "data-science", level: "beginner", status: "draft", summary: "Query, join and aggregate data in relational databases.", topics: ["sql", "databases", "queries"] },
  { id: "ds-301", title: "Python for Data Science (pandas, visualisation)", pathId: "data-science", level: "intermediate", status: "draft", summary: "Analyse and visualise real datasets in notebooks.", topics: ["python", "pandas", "jupyter", "visualisation", "statistics"] },
  { id: "cy-101", title: "Cybersecurity Foundations", pathId: "cybersecurity", level: "beginner", status: "draft", summary: "The CIA triad, threats, passwords, phishing and staying safe online.", topics: ["security basics", "phishing", "passwords", "threats"] },
  { id: "cy-201", title: "Linux & Networking for Security", pathId: "cybersecurity", level: "beginner", status: "draft", summary: "Command line, permissions, TCP/IP and packet analysis with Wireshark.", topics: ["linux", "networking", "wireshark", "tcp/ip"] },
  { id: "cy-301", title: "Ethical Hacking & Web Security", pathId: "cybersecurity", level: "intermediate", status: "draft", summary: "Legal, scoped testing; OWASP Top 10; capture-the-flag practice.", topics: ["ethical hacking", "owasp", "web security", "ctf", "penetration testing"] },
  { id: "ai-101", title: "AI Literacy: How Modern AI Works", pathId: "ai-ml", level: "beginner", status: "draft", summary: "What AI and LLMs are, what they can and cannot do, and using them responsibly.", topics: ["ai basics", "llm", "chatgpt", "prompting", "ethics"] },
  { id: "ai-201", title: "Machine Learning with scikit-learn", pathId: "ai-ml", level: "intermediate", status: "draft", summary: "Regression, classification, evaluation and feature engineering.", topics: ["machine learning", "scikit-learn", "python", "classification"] },
  { id: "ai-301", title: "Deep Learning & LLM Apps", pathId: "ai-ml", level: "advanced", status: "draft", summary: "Neural networks, transformers, embeddings, RAG and building AI apps.", topics: ["deep learning", "transformers", "rag", "embeddings", "pytorch"] },
  { id: "cd-101", title: "Linux Command Line & Shell Scripting", pathId: "cloud-devops", level: "beginner", status: "draft", summary: "Navigate, automate and manage Linux systems.", topics: ["linux", "bash", "shell", "automation"] },
  { id: "cd-201", title: "Docker & CI/CD", pathId: "cloud-devops", level: "intermediate", status: "draft", summary: "Containers, pipelines with GitHub Actions and automated deploys.", topics: ["docker", "ci/cd", "github actions", "containers"] },
  { id: "cd-301", title: "AWS Cloud Fundamentals", pathId: "cloud-devops", level: "intermediate", status: "draft", summary: "Core AWS services, IAM, networking and cost control; Cloud Practitioner prep.", topics: ["aws", "cloud", "iam", "ec2", "s3"] },
  { id: "it-101", title: "Computer Hardware & Operating Systems", pathId: "it-networking", level: "beginner", status: "draft", summary: "PC components, troubleshooting and installing Windows/Linux; CompTIA A+ prep.", topics: ["hardware", "windows", "troubleshooting", "comptia a+"] },
  { id: "it-201", title: "Networking Fundamentals", pathId: "it-networking", level: "beginner", status: "draft", summary: "OSI/TCP-IP, IP addressing, subnetting, switching and routing with Packet Tracer.", topics: ["networking", "subnetting", "routing", "packet tracer", "ccna"] },
  { id: "it-301", title: "Systems Administration", pathId: "it-networking", level: "intermediate", status: "draft", summary: "Users, services, backups, monitoring and directory services.", topics: ["sysadmin", "active directory", "backups", "monitoring"] },
];

export const COMMUNITY_TOOLS: CommunityTool[] = [
  { name: "Visual Studio Code", category: "Editor", url: "https://code.visualstudio.com", why: "Free code editor used across all paths." },
  { name: "GitHub", category: "Collaboration", url: "https://github.com/101codecrafts", why: "Host code, collaborate and contribute to 101 Codecrafts projects." },
  { name: "Google Colab", category: "Notebooks", url: "https://colab.research.google.com", why: "Free Python notebooks with GPUs for data science and AI." },
  { name: "Kaggle", category: "Data & AI", url: "https://www.kaggle.com", why: "Datasets, notebooks and competitions." },
  { name: "Wireshark", category: "Networking & Security", url: "https://www.wireshark.org", why: "Packet analysis for networking and security labs." },
  { name: "Cisco Packet Tracer", category: "Networking", url: "https://www.netacad.com", why: "Network simulation for CCNA practice." },
  { name: "AWS Free Tier", category: "Cloud", url: "https://aws.amazon.com/free", why: "Practise cloud skills within free limits." },
  { name: "101 Whiteboard", category: "Collaboration", url: "/whiteboard", why: "Sketch system designs with your team in real time and ask AI about the board." },
];

/** Flatten paths, courses and tools into RAG documents. */
export function siteDocuments(): { source: string; title: string; url: string; content: string }[] {
  const docs: { source: string; title: string; url: string; content: string }[] = [];
  for (const p of LEARNING_PATHS) {
    docs.push({
      source: `path:${p.id}`,
      title: `Learning path: ${p.name}`,
      url: `/learn#${p.id}`,
      content: `${p.name}. ${p.summary} Good for: ${p.goodFor.join(", ")}. Prerequisites: ${p.prerequisites} Careers: ${p.careers.join(", ")}.${
        p.certifications.length ? ` Certification support: ${p.certifications.join(", ")}.` : ""
      }`,
    });
  }
  for (const c of COURSES) {
    const path = LEARNING_PATHS.find((p) => p.id === c.pathId)!;
    docs.push({
      source: `course:${c.id}`,
      title: `Course outline: ${c.title}`,
      url: c.url ?? `/learn#${c.pathId}`,
      content: `${c.title} (${c.level}, ${path.name} path, ${c.status === "draft" ? "draft outline" : "published"}). ${c.summary} Topics: ${c.topics.join(", ")}.`,
    });
  }
  for (const t of COMMUNITY_TOOLS) {
    docs.push({ source: `tool:${t.name}`, title: `Tool: ${t.name}`, url: t.url, content: `${t.name} (${t.category}): ${t.why}` });
  }
  return docs;
}
