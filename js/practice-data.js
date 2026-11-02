/* 101 Practice & Learn — PLACEHOLDER data (mock). Shapes match /api/v1/practice/* and /api/v1/articles/* (see js/practice-api.js).
   Replace by wiring the backend; nothing here is real user data. */
(function () {
  const LEVELS = ["Beginner", "Intermediate", "Advanced"];
  const EDU = ["Secondary (S1–S6)", "University / Diploma", "Professional"];
  const TOPICS = [
    { id: "dsa", name: "DSA", icon: "bars", sub: ["Arrays", "Strings", "Linked List", "Stack & Queue", "Trees", "Graphs", "Dynamic Programming", "Sorting & Searching", "Greedy", "Recursion"] },
    { id: "python", name: "Python", icon: "code", sub: ["Basics", "Data types", "Functions", "OOP", "File handling", "Libraries"] },
    { id: "javascript", name: "JavaScript", icon: "code", sub: ["Basics", "DOM", "Async & Promises", "ES6+", "Node.js"] },
    { id: "web", name: "Web", icon: "codebox", sub: ["HTML", "CSS", "Responsive design", "Accessibility", "HTTP & APIs"] },
    { id: "databases", name: "Databases", icon: "list", sub: ["SQL basics", "Joins", "Normalization", "Indexes", "PostgreSQL", "MongoDB"] },
    { id: "ml", name: "ML / AI", icon: "brain", sub: ["Python for ML", "Regression", "Classification", "Neural networks", "LLMs & prompting"] },
    { id: "networking", name: "Networking", icon: "network", sub: ["OSI model", "TCP/IP", "Subnetting", "DNS", "Routing"] },
    { id: "security", name: "Cyber security", icon: "shield", sub: ["Basics", "Cryptography", "Web security (OWASP)", "Linux hardening", "CTF practice"] },
    { id: "mobile", name: "Mobile", icon: "grid", sub: ["Android (Kotlin)", "Flutter", "React Native", "Mobile money APIs"] }
  ];

  const A = (id, title, topic, sub, level, edu, mins, desc, extra = {}) => ({ id, slug: id, title, topic, sub, level, edu, mins, desc, author: extra.author || "101 Editorial", updated: extra.updated || "2026-10-28", views: extra.views || 0, ...extra });
  const articles = [
    A("two-pointer-technique", "Two Pointer Technique", "dsa", "Arrays", "Beginner", "University / Diploma", 8, "Solve pair-sum, reverse and partition problems in O(n) by walking two indices toward each other.", { views: 18420 }),
    A("binary-search", "Binary Search: Iterative and Recursive", "dsa", "Sorting & Searching", "Beginner", "Secondary (S1–S6)", 10, "Halve the search space every step. Templates for lower bound, upper bound and answer-search.", { views: 25110 }),
    A("kadanes-algorithm", "Kadane's Algorithm — Maximum Subarray Sum", "dsa", "Dynamic Programming", "Intermediate", "University / Diploma", 9, "The classic O(n) DP for the largest contiguous sum, with the all-negative edge case.", { views: 14230 }),
    A("bfs-dfs-graphs", "BFS vs DFS on Graphs", "dsa", "Graphs", "Intermediate", "University / Diploma", 14, "Adjacency lists, visited sets, shortest paths on unweighted graphs and cycle detection.", { views: 11007 }),
    A("linked-list-reverse", "Reverse a Linked List", "dsa", "Linked List", "Beginner", "University / Diploma", 7, "Three-pointer iterative reversal and the recursive version, with diagrams.", { views: 9930 }),
    A("python-list-comprehensions", "Python List Comprehensions", "python", "Basics", "Beginner", "Secondary (S1–S6)", 6, "Write loops in one readable line, plus dict and set comprehensions.", { views: 8120 }),
    A("python-oop", "Object-Oriented Python: Classes and Objects", "python", "OOP", "Intermediate", "University / Diploma", 12, "Classes, __init__, inheritance and dunder methods with a mobile-money wallet example.", { views: 7040 }),
    A("js-promises-async", "Promises and async/await in JavaScript", "javascript", "Async & Promises", "Intermediate", "University / Diploma", 11, "From callbacks to promises to async/await, with fetch() and error handling.", { views: 10220 }),
    A("css-flexbox-grid", "CSS Flexbox vs Grid", "web", "CSS", "Beginner", "Secondary (S1–S6)", 9, "When to reach for each, with responsive layouts that work from 360px phones up.", { views: 12890 }),
    A("web-accessibility-basics", "Web Accessibility Basics", "web", "Accessibility", "Beginner", "Professional", 10, "Contrast, focus order, labels and ARIA: the checks that matter most.", { views: 4210 }),
    A("sql-joins", "SQL Joins Explained", "databases", "Joins", "Beginner", "University / Diploma", 8, "INNER, LEFT, RIGHT and FULL joins with a student–course example database.", { views: 15660 }),
    A("db-normalization", "Database Normalization (1NF–3NF)", "databases", "Normalization", "Intermediate", "University / Diploma", 12, "Remove redundancy step by step — exam favourite for BCS and BIT students.", { views: 9870 }),
    A("linear-regression", "Linear Regression from Scratch", "ml", "Regression", "Intermediate", "University / Diploma", 15, "Gradient descent in NumPy, then the same model in scikit-learn.", { views: 6650 }),
    A("prompting-llms", "Prompting LLMs for Code", "ml", "LLMs & prompting", "Beginner", "Professional", 7, "Patterns that get reliable code from AI assistants — and how to check it.", { views: 5530 }),
    A("subnetting", "IPv4 Subnetting Made Simple", "networking", "Subnetting", "Intermediate", "University / Diploma", 13, "CIDR, masks and the magic-number method for CCNA-style questions.", { views: 8800 }),
    A("osi-model", "The OSI Model in 7 Layers", "networking", "OSI model", "Beginner", "Secondary (S1–S6)", 6, "What each layer does, with a WhatsApp message travelling through them.", { views: 7300 }),
    A("owasp-top-10", "OWASP Top 10 for Beginners", "security", "Web security (OWASP)", "Intermediate", "Professional", 14, "Injection, broken auth, XSS and the rest, with safe-coding fixes.", { views: 6120 }),
    A("hashing-vs-encryption", "Hashing vs Encryption", "security", "Cryptography", "Beginner", "University / Diploma", 7, "Why passwords are hashed (bcrypt/argon2) and data is encrypted.", { views: 5010 }),
    A("flutter-first-app", "Your First Flutter App", "mobile", "Flutter", "Beginner", "University / Diploma", 12, "Widgets, state and hot reload — build a tip calculator.", { views: 4480 }),
    A("mobile-money-api", "Integrating Mobile Money APIs", "mobile", "Mobile money APIs", "Advanced", "Professional", 16, "Collections and disbursements with MTN MoMo / Airtel sandbox flows.", { views: 3900 })
  ];

  /* full body for the article page demo (two-pointer); others render a short placeholder body */
  const articleBody = {
    "two-pointer-technique": {
      sections: [
        { id: "intro", h: "Introduction", p: ["The two pointer technique uses two indices that move through a sequence — usually from both ends toward the middle, or both forward at different speeds. It turns many O(n²) brute-force checks into a single O(n) pass.", "It works best on <b>sorted</b> arrays or when you need to compare elements at different positions."] },
        { id: "problem", h: "Problem: Pair with given sum", p: ["Given a sorted array <code>arr</code> and a target <code>x</code>, return <b>true</b> if any two elements add up to <code>x</code>."], example: "Input:  arr = [2, 4, 7, 11, 15], x = 18\nOutput: true   (7 + 11 = 18)" },
        { id: "naive", h: "Naive approach — O(n²)", p: ["Check every pair with two nested loops. Correct but slow for large inputs (n = 10⁵ means 10¹⁰ checks)."] },
        { id: "approach", h: "Two pointer approach — O(n)", p: ["Put <code>left</code> at the start and <code>right</code> at the end. If the sum is too small, move <code>left</code> forward; if too big, move <code>right</code> back; if equal, you are done."],
          code: {
            cpp: "bool hasPair(vector<int>& arr, int x) {\n    int left = 0, right = arr.size() - 1;\n    while (left < right) {\n        int sum = arr[left] + arr[right];\n        if (sum == x) return true;\n        if (sum < x) left++;\n        else right--;\n    }\n    return false;\n}",
            python: "def has_pair(arr, x):\n    left, right = 0, len(arr) - 1\n    while left < right:\n        s = arr[left] + arr[right]\n        if s == x:\n            return True\n        if s < x:\n            left += 1\n        else:\n            right -= 1\n    return False\n\nprint(has_pair([2, 4, 7, 11, 15], 18))  # True",
            java: "static boolean hasPair(int[] arr, int x) {\n    int left = 0, right = arr.length - 1;\n    while (left < right) {\n        int sum = arr[left] + arr[right];\n        if (sum == x) return true;\n        if (sum < x) left++; else right--;\n    }\n    return false;\n}",
            javascript: "function hasPair(arr, x) {\n  let left = 0, right = arr.length - 1;\n  while (left < right) {\n    const sum = arr[left] + arr[right];\n    if (sum === x) return true;\n    sum < x ? left++ : right--;\n  }\n  return false;\n}\nconsole.log(hasPair([2, 4, 7, 11, 15], 18)); // true"
          } },
        { id: "complexity", h: "Complexity", p: ["<b>Time:</b> O(n) — each pointer moves at most n times.", "<b>Space:</b> O(1) — only two indices."] },
        { id: "variations", h: "Common variations", list: ["Reverse an array in place", "Remove duplicates from a sorted array", "Container with most water", "Fast & slow pointers: detect a cycle in a linked list", "Three-sum (sort + two pointers)"] },
        { id: "practice", h: "Practice problems", p: ["Try these next on 101 Practice: <a href=\"problem.html?id=pair-sum-sorted\">Pair Sum in Sorted Array</a>, <a href=\"problem.html?id=remove-duplicates\">Remove Duplicates</a>, <a href=\"problem.html?id=container-water\">Container With Most Water</a>."] }
      ]
    }
  };

  const comments = [
    { id: 1, user: "Nakato Sharon", av: "NS", ago: "2 days", text: "The diagram of left/right moving finally made this click for me. Thanks!", likes: 14 },
    { id: 2, user: "Okello Brian", av: "OB", ago: "5 days", text: "For the unsorted version you can use a hash set in O(n) too — maybe add that as a note?", likes: 9, reply: { user: "101 Editorial", av: "101", text: "Good shout — added under Variations soon.", ago: "4 days" } },
    { id: 3, user: "Atim Grace", av: "AG", ago: "1 week", text: "Solved Pair Sum on first try after reading this 🔥", likes: 6 }
  ];

  const COMPANIES = ["Google", "Amazon", "Microsoft", "MTN", "Airtel", "Safaricom", "Andela", "Flutterwave", "Stanbic", "Jumia"];
  const P = (id, title, difficulty, topic, companies, accuracy, submissions, status, extra = {}) => ({ id, title, difficulty, topic, companies, accuracy, submissions, status, score: { Easy: 2, Medium: 4, Hard: 8 }[difficulty], ...extra });
  const problems = [
    P("pair-sum-sorted", "Pair Sum in Sorted Array", "Easy", "Arrays", ["Amazon", "MTN"], 52.4, 48210, "solved"),
    P("reverse-array", "Reverse an Array", "Easy", "Arrays", ["Andela"], 71.2, 90220, "solved"),
    P("remove-duplicates", "Remove Duplicates from Sorted Array", "Easy", "Arrays", ["Microsoft", "Jumia"], 48.9, 37510, "attempted"),
    P("kadane", "Maximum Subarray Sum", "Medium", "Dynamic Programming", ["Google", "Amazon", "Flutterwave"], 36.8, 61300, "attempted"),
    P("container-water", "Container With Most Water", "Medium", "Arrays", ["Google", "Amazon"], 41.0, 29400, ""),
    P("valid-parentheses", "Valid Parentheses", "Easy", "Stack & Queue", ["Microsoft", "Airtel", "Safaricom"], 44.7, 55020, "solved"),
    P("lru-cache", "LRU Cache", "Hard", "Linked List", ["Amazon", "Microsoft"], 24.1, 18090, ""),
    P("bfs-shortest", "Shortest Path in Unweighted Graph", "Medium", "Graphs", ["Google", "Safaricom"], 33.5, 14400, ""),
    P("mobile-money-balance", "Mobile Money Daily Balance", "Easy", "Arrays", ["MTN", "Airtel"], 58.3, 6210, "", { local: true }),
    P("longest-substring", "Longest Substring Without Repeating Characters", "Medium", "Strings", ["Amazon", "Flutterwave", "Andela"], 31.9, 40120, "attempted"),
    P("edit-distance", "Edit Distance", "Hard", "Dynamic Programming", ["Google", "Microsoft"], 27.6, 12030, ""),
    P("level-order", "Level Order Traversal", "Easy", "Trees", ["Stanbic", "Amazon"], 55.0, 22870, ""),
    P("boda-routes", "Boda Routes (Count Paths in DAG)", "Medium", "Graphs", ["Safaricom", "Jumia"], 29.4, 3110, "", { local: true }),
    P("n-queens", "N-Queens", "Hard", "Recursion", ["Google"], 22.2, 9800, "")
  ];

  const problemDetail = {
    "pair-sum-sorted": {
      id: "pair-sum-sorted", title: "Pair Sum in Sorted Array", difficulty: "Easy", topic: "Arrays", companies: ["Amazon", "MTN"], accuracy: 52.4, submissions: 48210, score: 2,
      timeLimit: "1 s", memoryLimit: "256 MB",
      statement: "<p>You are given a <b>sorted</b> array <code>arr</code> of <code>n</code> integers and an integer <code>x</code>. Print <code>true</code> if there exist two different indices <code>i &lt; j</code> such that <code>arr[i] + arr[j] = x</code>, otherwise print <code>false</code>.</p><p><b>Input:</b> the first line has <code>n</code> and <code>x</code>. The second line has <code>n</code> integers.</p><p><b>Output:</b> <code>true</code> or <code>false</code>.</p>",
      examples: [
        { input: "5 18\n2 4 7 11 15", output: "true", explain: "7 + 11 = 18" },
        { input: "4 10\n1 2 3 4", output: "false", explain: "The largest pair sum is 3 + 4 = 7." }
      ],
      constraints: ["2 ≤ n ≤ 10⁵", "-10⁹ ≤ arr[i], x ≤ 10⁹", "arr is sorted in non-decreasing order"],
      hints: ["The array is sorted. What happens to the sum if you move the left index right?", "Start one pointer at each end. Compare the sum with x to decide which pointer to move.", "Stop when the pointers meet. Each step discards one element, so it is O(n)."],
      editorial: "<p><b>Idea.</b> Keep <code>left = 0</code> and <code>right = n − 1</code>. If <code>arr[left] + arr[right]</code> is smaller than <code>x</code>, no pair using <code>arr[left]</code> can reach x (everything to its right with <code>right</code> is at most <code>arr[right]</code>), so increment <code>left</code>. If larger, decrement <code>right</code>. If equal, answer true.</p><p><b>Complexity:</b> O(n) time, O(1) extra space.</p><p>Read the full tutorial: <a href=\"article.html?slug=two-pointer-technique\">Two Pointer Technique</a>.</p>",
      starter: {
        cpp: "#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    int n; long long x;\n    cin >> n >> x;\n    vector<long long> a(n);\n    for (auto &v : a) cin >> v;\n    // TODO: two pointers\n    cout << \"false\" << endl;\n    return 0;\n}\n",
        java: "import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        int n = sc.nextInt(); long x = sc.nextLong();\n        long[] a = new long[n];\n        for (int i = 0; i < n; i++) a[i] = sc.nextLong();\n        // TODO: two pointers\n        System.out.println(\"false\");\n    }\n}\n",
        python: "def solve():\n    n, x = map(int, input().split())\n    arr = list(map(int, input().split()))\n    # TODO: two pointers\n    print(\"false\")\n\nsolve()\n",
        javascript: "const lines = require('fs').readFileSync(0, 'utf8').trim().split('\\n');\nconst [n, x] = lines[0].split(' ').map(Number);\nconst arr = lines[1].split(' ').map(Number);\n// TODO: two pointers\nconsole.log('false');\n",
        c: "#include <stdio.h>\n\nint main(void) {\n    int n; long long x;\n    scanf(\"%d %lld\", &n, &x);\n    long long a[100000];\n    for (int i = 0; i < n; i++) scanf(\"%lld\", &a[i]);\n    /* TODO: two pointers */\n    printf(\"false\\n\");\n    return 0;\n}\n"
      }
    }
  };

  const potd = { date: "2026-11-02", problemId: "kadane", title: "Maximum Subarray Sum", difficulty: "Medium", topic: "Dynamic Programming", endsAt: "2026-11-02T23:59:59+03:00", streak: 12, bestStreak: 21, solvedToday: false };

  const progress = {
    codingScore: 486, solved: 74, attempted: 19, rank: 312, institute: { name: "Cavendish University Uganda", rank: 4 },
    byDifficulty: { Easy: { solved: 41, total: 220 }, Medium: { solved: 27, total: 310 }, Hard: { solved: 6, total: 140 } },
    byTopic: [ { topic: "Arrays", solved: 22, total: 60 }, { topic: "Strings", solved: 11, total: 45 }, { topic: "Linked List", solved: 6, total: 30 }, { topic: "Trees", solved: 9, total: 40 }, { topic: "Graphs", solved: 4, total: 35 }, { topic: "Dynamic Programming", solved: 8, total: 50 } ]
  };

  const now = Date.parse("2026-11-02T17:30:00+03:00");
  const contests = [
    { id: "weekly-48", name: "101 Weekly Contest 48", status: "live", start: "2026-11-02T16:00:00+03:00", end: "2026-11-02T18:00:00+03:00", problems: 4, participants: 1284, rated: true },
    { id: "uni-cup-nov", name: "Uganda Uni Code Cup — November", status: "upcoming", start: "2026-11-08T14:00:00+03:00", end: "2026-11-08T17:00:00+03:00", problems: 6, registered: 642, rated: true, prize: "UGX 1,500,000 + internships" },
    { id: "weekly-49", name: "101 Weekly Contest 49", status: "upcoming", start: "2026-11-09T16:00:00+03:00", end: "2026-11-09T18:00:00+03:00", problems: 4, registered: 211, rated: true },
    { id: "beginner-sprint-7", name: "Beginner Sprint #7 (S4–S6 & Year 1)", status: "upcoming", start: "2026-11-15T10:00:00+03:00", end: "2026-11-15T11:30:00+03:00", problems: 5, registered: 388, rated: false },
    { id: "weekly-47", name: "101 Weekly Contest 47", status: "past", start: "2026-10-26T16:00:00+03:00", end: "2026-10-26T18:00:00+03:00", problems: 4, participants: 1190, rated: true, myRank: 214 },
    { id: "hacktober-ug", name: "Hacktober UG Algorithms Night", status: "past", start: "2026-10-18T19:00:00+03:00", end: "2026-10-18T22:00:00+03:00", problems: 7, participants: 2033, rated: true, myRank: 501 }
  ];
  const leaderboard = [
    ["Kato Ivan", "Makerere", 400, 4, "01:02:11", [1, 1, 1, 1]], ["Achieng Mercy", "Strathmore", 400, 4, "01:10:45", [1, 1, 1, 2]], ["Ssali Joel", "Cavendish", 300, 3, "00:48:09", [1, 1, 1, 0]],
    ["Wanjiru Faith", "JKUAT", 300, 3, "00:55:30", [1, 2, 1, 0]], ["Mugisha Alan", "MUST", 300, 3, "01:04:02", [1, 1, 3, 0]], ["Nansubuga Ritah", "Kyambogo", 200, 2, "00:31:15", [1, 1, 0, -2]],
    ["Okot Denis", "Gulu Univ", 200, 2, "00:39:50", [1, 2, 0, 0]], ["Cavendish Cuu", "Cavendish", 200, 2, "00:44:12", [1, 1, -1, 0]], ["Tumusiime Paul", "UCU", 100, 1, "00:12:40", [1, 0, 0, 0]], ["Akello Joan", "Makerere", 100, 1, "00:20:05", [1, -3, 0, 0]]
  ].map(([user, org, score, solved, penalty, cells], i) => ({ rank: i + 1, user, org, score, solved, penalty, cells, me: user === "Cavendish Cuu" }));
  const contestProblems = [{ code: "A", title: "Boda Fare Splitter", pts: 100 }, { code: "B", title: "Matatu Queue", pts: 100 }, { code: "C", title: "Rolex Stand Profits", pts: 100 }, { code: "D", title: "Lake Victoria Islands", pts: 100 }];

  const interview = {
    companies: [
      { id: "google", name: "Google", sets: 48, mcq: 30, tags: ["DSA", "System design"] },
      { id: "amazon", name: "Amazon", sets: 62, mcq: 40, tags: ["DSA", "Leadership principles"] },
      { id: "microsoft", name: "Microsoft", sets: 41, mcq: 25, tags: ["DSA", "OOP"] },
      { id: "mtn", name: "MTN", sets: 18, mcq: 30, tags: ["Networking", "SQL", "Telecom"] },
      { id: "airtel", name: "Airtel", sets: 14, mcq: 20, tags: ["Networking", "Linux"] },
      { id: "safaricom", name: "Safaricom", sets: 21, mcq: 25, tags: ["DSA", "M-Pesa APIs"] },
      { id: "andela", name: "Andela", sets: 26, mcq: 30, tags: ["JavaScript", "Python", "Git"] },
      { id: "flutterwave", name: "Flutterwave", sets: 17, mcq: 20, tags: ["Payments", "Node.js", "Security"] },
      { id: "stanbic", name: "Stanbic Bank", sets: 9, mcq: 20, tags: ["SQL", "Java", "Security"] }
    ],
    quiz: {
      id: "dsa-basics-1", title: "DSA Basics — Quick Quiz", company: "Mixed", questions: [
        { q: "What is the time complexity of binary search on a sorted array of n elements?", options: ["O(n)", "O(log n)", "O(n log n)", "O(1)"], answer: 1, why: "Each step halves the search space, so it takes about log₂ n steps." },
        { q: "Which data structure follows LIFO (last in, first out)?", options: ["Queue", "Stack", "Heap", "Graph"], answer: 1, why: "A stack pushes and pops from the same end." },
        { q: "Which traversal of a binary search tree prints keys in sorted order?", options: ["Pre-order", "Post-order", "In-order", "Level-order"], answer: 2, why: "In-order visits left subtree, node, then right subtree." },
        { q: "BFS on an unweighted graph finds…", options: ["A minimum spanning tree", "Shortest paths by edge count", "Strongly connected components", "A topological order"], answer: 1, why: "BFS explores in layers of distance 1, 2, 3…" },
        { q: "In SQL, which join keeps every row from the left table?", options: ["INNER JOIN", "LEFT JOIN", "CROSS JOIN", "SELF JOIN"], answer: 1, why: "LEFT JOIN keeps all left rows and fills NULLs where no match exists." }
      ]
    },
    sets: [
      { company: "amazon", title: "Amazon SDE-1 — Arrays & Strings", problems: 12, mins: 90, level: "Medium" },
      { company: "google", title: "Google L3 — Graphs warm-up", problems: 8, mins: 75, level: "Medium" },
      { company: "mtn", title: "MTN Graduate Trainee — Networking MCQ", problems: 30, mins: 30, level: "Easy" },
      { company: "andela", title: "Andela — JavaScript fundamentals", problems: 10, mins: 60, level: "Easy" },
      { company: "flutterwave", title: "Flutterwave — Backend & payments", problems: 9, mins: 70, level: "Hard" },
      { company: "microsoft", title: "Microsoft — Trees & recursion", problems: 10, mins: 80, level: "Medium" }
    ]
  };

  window.CC_PRACTICE = { LEVELS, EDU, TOPICS, COMPANIES, articles, articleBody, comments, problems, problemDetail, potd, progress, contests, leaderboard, contestProblems, interview, NOW: now,
    LANGS: [{ id: "cpp", name: "C++ 17" }, { id: "java", name: "Java 17" }, { id: "python", name: "Python 3.12" }, { id: "javascript", name: "JavaScript (Node 20)" }, { id: "c", name: "C (GCC 13)" }] };
})();
