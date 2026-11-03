/* 101 Codecrafts — PLACEHOLDER Events & Meetups. Used only when GET /api/v1/events is unreachable.
   Dates are relative to "now" (in EAT) so previews always show upcoming events. These are illustrative listings
   modelled on real organiser programmes; links go to each organiser's public events page, not to a verified
   specific event. Replace with backend data before launch.
   region: kampala | uganda | africa | online | worldwide (Kampala events are also Uganda + Africa).
   host101: true → RSVP form + QR ticket on 101 (no external link-out). */
(function () {
  const DAY = 864e5;
  /* a date N days from today at HH:MM East Africa Time (UTC+3, no DST) */
  const eat = (d, hh, mm = 0) => { const t = new Date(Date.now() + 3 * 36e5 + d * DAY); return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), hh - 3, mm)).toISOString(); };
  const ev = (o) => ({ price: 0, currency: "UGX", going: 0, ...o });
  window.CC_EVENTS_DATA = {
    organisers: {
      "101": { name: "101 Codecrafts", short: "101", bg: "#fc8c0c", fg: "#0B1236" },
      gdg: { name: "Google Developer Groups", short: "GDG", bg: "#1a73e8", fg: "#fff" },
      microsoft: { name: "Microsoft", short: "MS", bg: "#0067b8", fg: "#fff" },
      openai: { name: "OpenAI", short: "OAI", bg: "#0B1236", fg: "#fff" },
      anthropic: { name: "Anthropic", short: "ANT", bg: "#a24a2b", fg: "#fff" },
      huggingface: { name: "Hugging Face", short: "HF", bg: "#ffd21e", fg: "#0B1236" },
      alibaba: { name: "Alibaba Cloud", short: "ALI", bg: "#c94300", fg: "#fff" },
      aws: { name: "AWS Community", short: "AWS", bg: "#232f3e", fg: "#fff" },
      community: { name: "Community", short: "COM", bg: "#05e6f2", fg: "#0B1236" }
    },
    types: ["hackathon", "meetup", "conference", "workshop", "webinar", "study jam"],
    events: [
      ev({ id: "ev101-hack", host101: true, org: "101", type: "hackathon", title: "101 Kampala Hackathon: Build for Boda, Health & Farms", start: eat(4, 9), end: eat(5, 17), region: "kampala", venue: "Outbox Hub, Kampala", lat: 0.3349, lng: 32.5836, going: 86, capacity: 120, desc: "48 hours, teams of 2–4, mentors from the 101 tutor network. Laptops and Wi-Fi provided. Lunch and dinner included.", url: "https://github.com/101codecrafts" }),
      ev({ id: "ev101-jam", host101: true, org: "101", type: "study jam", title: "101 Python Study Jam (beginners)", start: eat(2, 17, 30), end: eat(2, 19, 30), region: "kampala", venue: "Cavendish University Uganda, Nsambya", lat: 0.2998, lng: 32.5835, going: 34, capacity: 60, desc: "Bring a laptop. We solve 5 beginner problems together in the 101 IDE.", url: "https://github.com/101codecrafts" }),
      ev({ id: "ev101-live", host101: true, org: "101", type: "webinar", title: "101 Live: How to win a scholarship in tech", start: eat(6, 19), end: eat(6, 20), region: "online", venue: "Online (Google Meet)", going: 152, desc: "Past scholars share their applications, essays and mistakes. Q&A at the end.", url: "https://github.com/101codecrafts" }),
      ev({ id: "ev-devfest", org: "gdg", type: "conference", title: "DevFest Kampala", start: eat(9, 9), end: eat(9, 17), region: "kampala", venue: "Kampala (venue on GDG page)", lat: 0.3163, lng: 32.5822, going: 410, desc: "Google Developer Groups' yearly community conference: Android, Web, Cloud, AI and Flutter tracks.", url: "https://gdg.community.dev/" }),
      ev({ id: "ev-ioext", org: "gdg", type: "meetup", title: "Google I/O Extended watch-party & talks", start: eat(16, 10), end: eat(16, 15), region: "uganda", venue: "Gulu (GDG Gulu)", lat: 2.7724, lng: 32.2881, going: 95, desc: "Local recap of Google I/O announcements with hands-on Gemini API demos.", url: "https://gdg.community.dev/" }),
      ev({ id: "ev-mlsa", org: "microsoft", type: "workshop", title: "Microsoft Learn Student Ambassadors: Azure AI Fundamentals Cloud Skills Challenge", start: eat(7, 14), end: eat(7, 17), region: "uganda", venue: "Makerere University, Kampala", lat: 0.3350, lng: 32.5680, going: 120, desc: "Hands-on Azure AI labs led by student ambassadors; earn a Microsoft Learn badge.", url: "https://mvp.microsoft.com/studentambassadors" }),
      ev({ id: "ev-reactor", org: "microsoft", type: "webinar", title: "Microsoft Reactor: Build your first AI agent", start: eat(3, 18), end: eat(3, 19, 30), region: "online", venue: "Online (Microsoft Reactor)", going: 640, desc: "Livestream with code-along. Recording available afterwards.", url: "https://developer.microsoft.com/en-us/reactor/" }),
      ev({ id: "ev-openai", org: "openai", type: "meetup", title: "OpenAI developer community meetup (Build Hour)", start: eat(11, 20), end: eat(11, 21), region: "online", venue: "Online", going: 900, desc: "Builders demo apps using the latest APIs; open Q&A with the developer relations team.", url: "https://openai.com/events" }),
      ev({ id: "ev-anthropic", org: "anthropic", type: "meetup", title: "Claude builders meetup", start: eat(19, 18), end: eat(19, 21), region: "worldwide", venue: "London, UK + livestream", lat: 51.5072, lng: -0.1276, going: 300, desc: "Community demos of agents and tool use. In-person in London; talks streamed online.", url: "https://www.anthropic.com/events" }),
      ev({ id: "ev-hf", org: "huggingface", type: "hackathon", title: "Hugging Face open-source AI sprint: African languages", start: eat(13, 12), end: eat(15, 12), region: "online", venue: "Online (Discord)", going: 520, desc: "Build datasets and fine-tunes for Luganda, Swahili, Yoruba and more. Free GPU credits for top teams.", url: "https://huggingface.co/events" }),
      ev({ id: "ev-alibaba", org: "alibaba", type: "webinar", title: "Alibaba Cloud Academy: Cloud computing for students", start: eat(8, 11), end: eat(8, 12, 30), region: "online", venue: "Online", going: 210, desc: "Intro to cloud servers, storage and databases, with free trial credits.", url: "https://www.alibabacloud.com/academy" }),
      ev({ id: "ev-awscd", org: "aws", type: "conference", title: "AWS Community Day East Africa", start: eat(23, 8, 30), end: eat(23, 17), region: "africa", venue: "Nairobi, Kenya", lat: -1.2921, lng: 36.8219, going: 380, price: 20, currency: "USD", desc: "Community-run day of cloud talks and workshops; student discount on request.", url: "https://aws.amazon.com/events/community-day/" }),
      ev({ id: "ev-kla-js", org: "community", type: "meetup", title: "Kampala JavaScript meetup", start: eat(5, 18), end: eat(5, 20, 30), region: "kampala", venue: "The Innovation Village, Ntinda", lat: 0.3536, lng: 32.6155, going: 58, desc: "Two short talks (React Server Components, Node security) and networking.", url: "https://www.meetup.com/" }),
      ev({ id: "ev-ai-conf", org: "community", type: "conference", title: "Africa AI & Data conference", start: eat(27, 9), end: eat(28, 17), region: "africa", venue: "Kigali, Rwanda", lat: -1.9441, lng: 30.0619, going: 760, price: 150000, desc: "Researchers, startups and governments on AI in Africa. Student tickets available.", url: "https://www.meetup.com/" })
    ]
  };
})();
