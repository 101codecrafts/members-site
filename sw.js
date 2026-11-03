/* 101 Codecrafts service worker — cached app shell + offline fallback.
   Strategy: HTML = network-first (falls back to cache, then offline.html); static assets = stale-while-revalidate;
   API and cross-origin requests are never cached here (except CDN libraries pinned by version). Small cache for mobile data. */
const VERSION = "cc-v14";
const SHELL = ["./", "index.html", "dashboard.html", "offline.html", "404.html", "courses.html", "resources.html", "news.html", "course.html",
  "css/bundle-app.css", "css/bundle-dashboard.css", "css/bundle-landing.css", "css/bundle-theme.css", "css/dashboard.fit.css", "css/landing.fit.css",
  "js/data.js", "js/api.js", "js/shell.js", "js/dash-layout.js", "js/activity.js", "js/share.js", "js/ui.js", "js/motion.js", "js/era.js", "js/site-stats.js", "js/site-social.js", "js/pages.js",
  "assets/fonts/archivo-black-400.woff2", "assets/fonts/russo-one-400.woff2", "assets/fonts/archivo-black-cc.woff2", "assets/fonts/ibm-plex-sans-var.woff2", "assets/fonts/jetbrains-mono-var.woff2",
  "assets/img/logo-101-sidebar.webp", "assets/img/logo-101-header.webp", "assets/icons/icon-192.png", "manifest.webmanifest"];
self.addEventListener("install", e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET") return;
  const sameOrigin = url.origin === location.origin;
  if (sameOrigin && url.pathname.startsWith("/api/")) return;                 // live data: never cached
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then(r => { const copy = r.clone(); caches.open(VERSION).then(c => c.put(req, copy)); return r; })
      .catch(() => caches.match(req).then(r => r || caches.match("offline.html"))));
    return;
  }
  const pinnedCdn = url.hostname === "cdn.jsdelivr.net" && /@\d/.test(url.pathname);
  if (!sameOrigin && !pinnedCdn) return;
  e.respondWith(caches.match(req).then(hit => {
    const net = fetch(req).then(r => { if (r.ok) { const copy = r.clone(); caches.open(VERSION).then(c => c.put(req, copy)); } return r; }).catch(() => hit);
    return hit || net;
  }));
});
