/* 101 Codecrafts: every public member / impact number on the site. ONE place to set them.
   TODO(founder): EVERY value below is a PLACEHOLDER, not a checked claim. Replace each with a real number and set that
   entry's real:true. r12 QA: the live site shows a stat ONLY when its entry is real:true; every element (or its tile /
   section) marked data-stat-gate="<key> [<key>…]" stays hidden until one of its keys is real (css/era.css). ?static=1
   design shots still show the mockup as drawn. Loaded on every page (tools/build.py SCRIPTS). It writes the values into:
     - [data-site-stat="<key>"]  hero "10,000+ members", the community tiles (10K+ / 50+ / 100+ / 500+), the dashboard tile
     - [data-stat="<key>"]       the landing "Our impact" band (js/era.js counts up to these)
     - the launch tile once the free month ends (js/ads.js reads members from here)
   The numbers printed in the HTML are only the no-JS fallback. One place it cannot reach, update it by hand too:
     - the meta description in src/index.html ("Join 10,000+ learners…") */
window.CC_SITE_STATS = {
  todo: true, // TODO(founder): set to false once every value is real
  items: {
    // community size (hero line, community tiles, dashboard tile, launch tile after the offer ends)
    members:    { value: 10000, suffix: "+", label: "Active members", real: false },           // TODO(founder): real number
    resources:  { value: 50,    suffix: "+", label: "Learning resources", real: false },       // TODO(founder): real number
    workshops:  { value: 100,   suffix: "+", label: "Online workshops", real: false },         // TODO(founder): real number
    hackathons: { value: 500,   suffix: "+", label: "Projects & hackathons", real: false },    // TODO(founder): real number
    // "Our impact" band
    learners:   { value: 1000,  suffix: "+", label: "Learners trained", real: false },         // TODO(founder): real number
    hours:      { value: 5000,  suffix: "+", label: "Hours of hands-on labs", real: false },   // TODO(founder): real number
    projects:   { value: 120,   suffix: "+", label: "Projects shipped", real: false },         // TODO(founder): real number
    schools:    { value: 10,    suffix: "+", label: "Partner schools", real: false }           // TODO(founder): real number
  }
};
/* a stat may be shown only when its entry is marked real:true (no placeholder numbers on the live site) */
window.CC_SITE_STATS.isReal = function (key) { const c = window.CC_SITE_STATS.items[key]; return !!(c && c.real === true && typeof c.value === "number"); };
/* short form for tight tiles: 10000 -> "10K+", 1500 -> "1.5K+", 500 -> "500+"; "" for a stat that is not real */
window.CC_SITE_STATS.short = function (key) {
  const c = window.CC_SITE_STATS.items[key]; if (!c || !window.CC_SITE_STATS.isReal(key)) return "";
  const v = c.value, s = c.suffix || "";
  return v >= 1000 ? (Math.round(v / 100) / 10).toString().replace(/\.0$/, "") + "K" + s : v + s;
};
/* write the values into [data-site-stat] before js/motion.js reads data-count (it runs at DOMContentLoaded, after every
   deferred script). Never under ?static=1: that mode keeps the mockup exactly as drawn. */
(function () {
  if (/[?&]static/.test(location.search) || document.documentElement.classList.contains("static")) return;
  const S = window.CC_SITE_STATS;
  const apply = () => { document.querySelectorAll("[data-stat-gate]").forEach(el => {
    el.classList.toggle("stat-real", el.dataset.statGate.split(/\s+/).some(k => S.isReal(k))); });
  document.querySelectorAll("[data-site-stat]").forEach(el => {
    const c = S.items[el.dataset.siteStat]; if (!c || !S.isReal(el.dataset.siteStat)) return;
    if (el.dataset.fmt === "short") {
      const v = c.value >= 1000 ? Math.round(c.value / 1000) : c.value;
      el.dataset.count = v; el.dataset.suffix = (c.value >= 1000 ? "K" : "") + (c.suffix || ""); delete el.dataset.sep;
      el.textContent = S.short(el.dataset.siteStat);
    } else {
      el.dataset.count = c.value; el.dataset.suffix = c.suffix || ""; el.dataset.sep = "1";
      el.textContent = c.value.toLocaleString("en-US") + (c.suffix || "");
    }
  }); };
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", apply, { once: true }) : apply();
})();
