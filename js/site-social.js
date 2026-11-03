/* 101 Codecrafts: every social / community link on the site. ONE place to set them.
   Read by:
     - tools/build.py   the no-JS footer icons ({{FOOTER}}), Organization JSON-LD "sameAs", the about page socials block
     - js/ui.js         the footer social row on every page when no backend list is available
     - about.html       "Find us" section ([data-social-list])
   An entry with a real https url renders as a normal link. An entry with an empty url and "todo": true is a PLANNED network: it renders
   as a visible "Coming soon" placeholder (no href, aria-disabled, dashed outline, no hover) and stays OUT of the JSON-LD sameAs.
   Filling in the url turns it into a normal link everywhere automatically (re-run tools/build.py for the no-JS HTML and JSON-LD).
   The block between the JSON markers must stay valid JSON (tools/build.py parses it). Icons are ids in src/icons.svg (#i-<icon>).
   TODO(founder): add the url for each planned network once the account exists, then re-run tools/build.py. */
window.CC_SOCIAL = /*JSON*/[
  { "key": "whatsapp",  "label": "WhatsApp community", "icon": "wa",      "url": "https://chat.whatsapp.com/LwXmmJK0ujN6hp4Zh6lhzh", "name": "Join the 101 Codecrafts WhatsApp community" },
  { "key": "github",    "label": "GitHub",             "icon": "gh",      "url": "https://github.com/101codecrafts",    "handle": "@101codecrafts",    "name": "101 Codecrafts on GitHub" },
  { "key": "github-ug", "label": "GitHub (team account)", "icon": "gh",   "url": "https://github.com/101codecrafts-ug", "handle": "@101codecrafts-ug", "name": "101 Codecrafts team account on GitHub (101codecrafts-ug)" },
  { "key": "youtube",   "label": "YouTube",   "icon": "yt",      "url": "", "todo": true, "name": "101 Codecrafts on YouTube" },
  { "key": "tiktok",    "label": "TikTok",    "icon": "tt",      "url": "", "todo": true, "name": "101 Codecrafts on TikTok" },
  { "key": "instagram", "label": "Instagram", "icon": "ig",      "url": "", "todo": true, "name": "101 Codecrafts on Instagram" },
  { "key": "facebook",  "label": "Facebook",  "icon": "fb",      "url": "", "todo": true, "name": "101 Codecrafts on Facebook" },
  { "key": "x",         "label": "X",         "icon": "x",       "url": "", "todo": true, "name": "101 Codecrafts on X" },
  { "key": "linkedin",  "label": "LinkedIn",  "icon": "in",      "url": "", "todo": true, "name": "101 Codecrafts on LinkedIn" },
  { "key": "telegram",  "label": "Telegram",  "icon": "tg",      "url": "", "todo": true, "name": "101 Codecrafts on Telegram" },
  { "key": "discord",   "label": "Discord",   "icon": "discord", "url": "", "todo": true, "name": "101 Codecrafts on Discord" }
]/*END*/;
/* entries with a real https url (links, JSON-LD sameAs) */
window.CC_SOCIAL.live = function () { return window.CC_SOCIAL.filter(function (s) { return /^https:\/\/\S+$/.test(s.url || ""); }); };
/* everything that renders: real links first, then the planned "Coming soon" placeholders (todo:true, no url) */
window.CC_SOCIAL.shown = function () { var L = window.CC_SOCIAL.live(); return L.concat(window.CC_SOCIAL.filter(function (s) { return s.todo && L.indexOf(s) < 0; })); };
