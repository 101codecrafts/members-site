/* 101 Codecrafts — Events & Meetups (events.html).
   List / calendar month / map (Leaflet + OpenStreetMap, loaded only when the map view is opened, never in Lite mode).
   101-hosted events: RSVP form → QR ticket (qrcode-generator, lazy) → organiser check-in view. Others: RSVP on source via go.html.
   All times are shown in East Africa Time (Africa/Kampala). Data only through CC_FEED_API. */
(function () {
  const F = window.CC_FEED_API, ED = window.CC_EVENTS_DATA, API = window.CC_API;
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ico = (id, cls = "i") => `<svg class="${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;
  const go = id => API ? API.goHref(id) : "go.html?id=" + encodeURIComponent(id);
  const html = document.documentElement, LITE = () => html.classList.contains("lite");
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const TZ = "Africa/Kampala";
  const LIBS = {
    leafletJs: ["https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js", "sha384-cxOPjt7s7Iz04uaHJceBmS+qpjv2JkIHNVcuOrM+YHwZOmJGBXI00mdUXEq65HTH"],
    leafletCss: ["https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css", "sha384-sHL9NAb7lN7rfvG5lfHpm643Xkcjzp4jFvuavGOndn6pjVqS6ny56CAt3nsEVT4H"],
    qr: ["https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js", "sha384-8FWZA6BGMXhsfO+BLtrJK0We6gg5o1JyO8xQm6peWDEUs17ACA5ziE/NIAkl9z2k"]
  };
  const loaded = {};
  const load = (k, css) => loaded[k] || (loaded[k] = new Promise((ok, no) => { const [u, h] = LIBS[k]; const el = document.createElement(css ? "link" : "script");
    if (css) { el.rel = "stylesheet"; el.href = u; } else { el.src = u; } el.integrity = h; el.crossOrigin = "anonymous"; el.onload = ok; el.onerror = no; document.head.appendChild(el); }));
  const toast = m => { let t = $("#cc-toast"); if (!t) { t = document.createElement("div"); t.id = "cc-toast"; t.setAttribute("role", "status"); document.body.appendChild(t); } t.textContent = m; t.className = "show"; clearTimeout(t._h); t._h = setTimeout(() => t.className = "", 2600); };

  const fmtD = (iso, o) => new Date(iso).toLocaleString("en-GB", { timeZone: TZ, ...o });
  const when = e => { const sameDay = fmtD(e.start, { dateStyle: "short" }) === fmtD(e.end, { dateStyle: "short" });
    return `${fmtD(e.start, { weekday: "short", day: "numeric", month: "short" })}, ${fmtD(e.start, { hour: "2-digit", minute: "2-digit", hour12: false })}–${sameDay ? "" : fmtD(e.end, { weekday: "short", day: "numeric", month: "short" }) + ", "}${fmtD(e.end, { hour: "2-digit", minute: "2-digit", hour12: false })} EAT`; };
  const ymd = iso => fmtD(iso, { year: "numeric", month: "2-digit", day: "2-digit" }).split("/").reverse().join("-"); // EAT calendar day
  const mapsUrl = e => "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(e.lat != null ? `${e.lat},${e.lng}` : e.venue);
  const org = k => ED.organisers[k] || ED.organisers.community;
  const isOnline = e => e.region === "online";
  const price = e => !e.price ? "Free" : (e.currency === "UGX" ? "UGX " + e.price.toLocaleString("en-US") : e.currency + " " + e.price);
  const inRegion = (e, r) => !r || e.region === r || (r === "uganda" && e.region === "kampala") || (r === "africa" && ["kampala", "uganda"].includes(e.region));

  /* ---------- .ics ---------- */
  function ics(e) {
    const z = iso => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const t = s => String(s).replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
    const body = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//101 Codecrafts//Events//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "BEGIN:VEVENT",
      `UID:${e.id}@101codecrafts`, `DTSTAMP:${z(new Date().toISOString())}`, `DTSTART:${z(e.start)}`, `DTEND:${z(e.end)}`, `SUMMARY:${t(e.title)}`,
      `DESCRIPTION:${t(e.desc + "\n\n" + (e.host101 ? location.href.split("#")[0] + "#" + e.id : e.url))}`, `LOCATION:${t(e.venue)}`, `URL:${e.host101 ? location.href.split("#")[0] : e.url}`,
      "BEGIN:VALARM", "TRIGGER:-PT2H", "ACTION:DISPLAY", `DESCRIPTION:${t(e.title)}`, "END:VALARM", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([body], { type: "text/calendar" })); a.download = e.id + ".ics"; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /* ---------- card ---------- */
  function card(e, sv, rem) {
    const o = org(e.org), on = sv.has(e.id), r = !!rem[e.id], full = e.capacity && e.going >= e.capacity;
    return `<article class="fcard ev-c ck${e.host101 ? " host101" : ""}" id="${esc(e.id)}" data-id="${esc(e.id)}">
      <div class="fc-meta"><span class="obadge" style="--ob:${o.bg};--of:${o.fg}" title="${esc(o.name)}">${esc(o.short)}</span><span class="fbadge">${esc(cap(e.type))}</span>${e.host101 ? '<span class="fbadge h101">Hosted by 101</span>' : ""}<span class="ev-price ${e.price ? "paid" : ""}">${price(e)}</span><button type="button" class="isave" data-save aria-pressed="${on}" aria-label="${on ? "Saved" : "Save"}" title="${on ? "Saved" : "Save"}">${ico("heart")}</button></div>
      <h3 class="ck-title">${esc(e.title)}</h3>
      <div class="org">${esc(o.name)}</div>
      <dl class="facts"><div><dt>${ico("calendar")}<span class="sr-only">When</span></dt><dd><time datetime="${esc(e.start)}">${when(e)}</time></dd></div>
        <div><dt>${ico("flag")}<span class="sr-only">Where</span></dt><dd>${esc(e.venue)}${isOnline(e) ? "" : ` · <a href="${mapsUrl(e)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${esc(e.venue)} in Google Maps (new tab)">Map ↗</a>`}</dd></div></dl>
      <p class="elig">${esc(e.desc)}</p>
      <div class="going"><button type="button" class="chip" data-going aria-pressed="${e.me}">${ico("check")}<span>${e.me ? "You're going" : "I'm going"}</span></button><span><b data-gn>${e.going.toLocaleString("en-US")}</b> going${e.capacity ? ` · ${Math.max(0, e.capacity - e.going)} seats left` : ""}</span></div>
      <div class="fc-act ck-foot">${e.host101 ? `<button type="button" class="btn or sm" data-rsvp ${full ? "disabled" : ""}>${full ? "Full — waitlist soon" : "RSVP on 101"}</button>` : `<a class="btn or sm" href="${go(e.id)}" target="_blank" rel="noopener noreferrer" aria-label="RSVP for ${esc(e.title)} on the organiser's site (opens in a new tab)">RSVP on source ↗</a>`}
        <button type="button" class="btn sm" data-ics>${ico("calendar")}Add to calendar</button>
        <button type="button" class="btn sm" data-remind aria-pressed="${r}">${ico("bell")}<span>${r ? "Reminder set" : "Remind me"}</span></button></div>
    </article>`;
  }

  /* ---------- dialog helper ---------- */
  function dlg(id, title) {
    let d = $("#" + id); if (!d) { d = document.createElement("dialog"); d.id = id; d.className = "fdlg"; d.setAttribute("aria-labelledby", id + "-h"); document.body.appendChild(d); d.addEventListener("click", e => { if (e.target === d || e.target.closest("[data-close]")) d.close(); }); }
    d.innerHTML = `<div class="fdlg-h"><h2 id="${id}-h">${title}</h2><button type="button" class="btn sm" data-close aria-label="Close">✕</button></div><div class="fdlg-b"></div>`;
    d.showModal ? d.showModal() : d.setAttribute("open", ""); return $(".fdlg-b", d);
  }
  async function qrInto(el, text) {
    el.innerHTML = `<p class="qr-code-txt">${esc(text)}</p>`;
    try { await load("qr"); const q = window.qrcode(0, "M"); q.addData(text); q.make(); el.insertAdjacentHTML("afterbegin", q.createSvgTag({ cellSize: 5, margin: 2, scalable: true }).replace("<svg", '<svg role="img" aria-label="Ticket QR code"')); }
    catch (e) { el.insertAdjacentHTML("afterbegin", `<p class="muted">QR needs a connection — show this code at the door instead.</p>`); }
  }
  function ticketView(host, t, e) {
    host.innerHTML = `<div class="ticket"><div class="tk-h"><span class="obadge" style="--ob:#fc8c0c;--of:#0B1236">101</span><b>${esc(e.title)}</b></div><div class="tk-qr"></div>
      <dl class="facts"><div><dt>Name</dt><dd>${esc(t.name)}</dd></div><div><dt>When</dt><dd>${when(e)}</dd></div><div><dt>Where</dt><dd>${esc(e.venue)}</dd></div></dl>
      <p class="muted">Show this QR at the door for check-in. A copy is in “My tickets”.${t.offline ? " (Preview ticket: 101 didn't issue it, so it won't work at the door.)" : ""}</p></div>`;
    qrInto($(".tk-qr", host), t.code);
  }

  async function init() {
    let all = await F.fetchEvents();
    const st = { region: "", type: "", org: "", from: "", to: "", price: "", saved: false, view: "list" };
    const now = new Date(); let month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    $("#ef-type").innerHTML = `<option value="">All types</option>` + ED.types.map(t => `<option value="${t}">${cap(t)}</option>`).join("");
    $("#ef-org").innerHTML = `<option value="">All organisers</option>` + Object.entries(ED.organisers).map(([k, o]) => `<option value="${k}">${esc(o.name)}</option>`).join("");
    $("#es-type").innerHTML = ED.types.map(t => `<option value="${t}">${cap(t)}</option>`).join("");
    $("#es-org").innerHTML = Object.entries(ED.organisers).filter(([k]) => k !== "101").map(([k, o]) => `<option value="${k}">${esc(o.name)}</option>`).join("");
    const regions = [["", "All"], ["kampala", "Kampala"], ["uganda", "Uganda"], ["africa", "Africa"], ["online", "Online"], ["worldwide", "Worldwide"]];
    $("#ef-region").innerHTML = regions.map(([k, l]) => `<button type="button" class="chip" aria-pressed="${!k}" data-r="${k}">${l}</button>`).join("");

    const filtered = () => { const sv = F.saved("event");
      return all.filter(e => inRegion(e, st.region) && (!st.type || e.type === st.type) && (!st.org || e.org === st.org) &&
        (!st.from || ymd(e.end) >= st.from) && (!st.to || ymd(e.start) <= st.to) &&
        (!st.price || (st.price === "free" ? !e.price : !!e.price)) && (!st.saved || sv.has(e.id))); };
    let map, layer;
    const draw = async () => {
      const r = filtered(), sv = F.saved("event"), rem = F.reminders();
      $("#ev-count").textContent = r.length + (r.length === 1 ? " event" : " events");
      $("#ev-list").innerHTML = r.map(e => card(e, sv, rem)).join("") || `<p class="muted">No events match — try a wider date range or region.</p>`;
      /* calendar */
      const y = month.getUTCFullYear(), m = month.getUTCMonth(), first = (new Date(Date.UTC(y, m, 1)).getUTCDay() + 6) % 7, days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      $("#cal-title").textContent = month.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
      const today = ymd(new Date().toISOString()); let cells = "";
      for (let i = 0; i < first; i++) cells += `<div class="cal-d out" aria-hidden="true"></div>`;
      for (let d = 1; d <= days; d++) { const key = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`; const evs = r.filter(e => ymd(e.start) <= key && ymd(e.end) >= key);
        cells += `<div class="cal-d${key === today ? " today" : ""}${evs.length ? " has" : ""}" role="gridcell" aria-label="${d} ${$("#cal-title").textContent}${evs.length ? ", " + evs.length + " events" : ""}"><span class="cal-n">${d}</span>${evs.slice(0, 3).map(e => `<button type="button" class="cal-ev" data-open="${esc(e.id)}" style="--ob:${org(e.org).bg};--of:${org(e.org).fg}">${esc(fmtD(e.start, { hour: "2-digit", minute: "2-digit", hour12: false }))} ${esc(e.title)}</button>`).join("")}${evs.length > 3 ? `<small>+${evs.length - 3} more</small>` : ""}</div>`; }
      $("#cal-grid").innerHTML = cells;
      /* map */
      if (st.view === "map") {
        if (LITE()) { $("#ev-map").innerHTML = `<p class="muted map-off">Map is off in Lite mode to save data. Use the “Map ↗” links on each event.</p>`; return; }
        try { await Promise.all([load("leafletCss", true), load("leafletJs")]); } catch (e) { $("#ev-map").innerHTML = `<p class="muted map-off">Couldn't load the map (offline?). Each event still has a “Map ↗” link.</p>`; return; }
        const L = window.L; if (!map) { map = L.map("ev-map", { scrollWheelZoom: false }).setView([0.3476, 32.5825], 6); L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map); }
        if (layer) layer.remove(); layer = L.layerGroup().addTo(map);
        const pts = r.filter(e => e.lat != null);
        pts.forEach(e => L.marker([e.lat, e.lng], { title: e.title, alt: e.title }).addTo(layer).bindPopup(`<b>${esc(e.title)}</b><br>${when(e)}<br>${esc(e.venue)}<br><a href="#${esc(e.id)}" data-open="${esc(e.id)}">Details</a>`));
        if (pts.length) map.fitBounds(L.latLngBounds(pts.map(e => [e.lat, e.lng])).pad(0.3), { maxZoom: 12 }); map.invalidateSize();
        $("#map-online").textContent = r.filter(isOnline).length ? `${r.filter(isOnline).length} online events aren't on the map — see the list view.` : "";
      }
    };
    const setView = v => { st.view = v; $$("[data-view]").forEach(b => b.setAttribute("aria-pressed", b.dataset.view === v)); $("#ev-list").hidden = v !== "list"; $("#ev-cal").hidden = v !== "cal"; $("#ev-mapwrap").hidden = v !== "map"; draw(); };
    $("#ev-views").onclick = e => { const b = e.target.closest("[data-view]"); if (b) setView(b.dataset.view); };
    $("#ef-region").onclick = e => { const b = e.target.closest("[data-r]"); if (!b) return; $$("[data-r]").forEach(x => x.setAttribute("aria-pressed", x === b)); st.region = b.dataset.r; draw(); };
    $("#ef-type").onchange = e => { st.type = e.target.value; draw(); };
    $("#ef-org").onchange = e => { st.org = e.target.value; draw(); };
    $("#ef-from").onchange = e => { st.from = e.target.value; draw(); };
    $("#ef-to").onchange = e => { st.to = e.target.value; draw(); };
    $("#ef-price").onchange = e => { st.price = e.target.value; draw(); };
    $("#ef-saved").onclick = e => { st.saved = !st.saved; e.currentTarget.setAttribute("aria-pressed", st.saved); draw(); };
    $("#cal-prev").onclick = () => { month = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() - 1, 1)); draw(); };
    $("#cal-next").onclick = () => { month = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1)); draw(); };

    const openEvent = id => { const e = all.find(x => x.id === id); if (!e) return; const b = dlg("ev-dlg", esc(e.title)); b.innerHTML = card(e, F.saved("event"), F.reminders()); bindCard(b); };
    document.addEventListener("click", e => { const o = e.target.closest("[data-open]"); if (o) { e.preventDefault(); openEvent(o.dataset.open); } });

    function bindCard(host) {
      host.addEventListener("click", async ev => {
        const c = ev.target.closest("[data-id]"); if (!c) return; const e = all.find(x => x.id === c.dataset.id); if (!e) return;
        const sBtn = ev.target.closest("[data-save]"); if (sBtn) { const on = F.toggleSave("event", e.id); sBtn.setAttribute("aria-pressed", on); sBtn.setAttribute("aria-label", on ? "Saved" : "Save"); toast(on ? "Saved to your events" : "Removed from saved"); }
        const rBtn = ev.target.closest("[data-remind]"); if (rBtn) { const on = F.remind(e.id, 1); rBtn.setAttribute("aria-pressed", on); rBtn.querySelector("span").textContent = on ? "Reminder set" : "Remind me"; toast(on ? "Reminder saved in this browser" : "Reminder removed"); }
        if (ev.target.closest("[data-ics]")) { ics(e); toast("Calendar file downloaded"); }
        const gBtn = ev.target.closest("[data-going]"); if (gBtn) { const on = F.toggleGoing(e.id); e.me = on; e.going += on ? 1 : -1; gBtn.setAttribute("aria-pressed", on); gBtn.querySelector("span").textContent = on ? "You're going" : "I'm going"; $("[data-gn]", c).textContent = e.going.toLocaleString("en-US"); }
        if (ev.target.closest("[data-rsvp]")) rsvpForm(e);
      });
    }
    function rsvpForm(e) {
      const b = dlg("rsvp-dlg", "RSVP · " + esc(e.title));
      b.innerHTML = `<p class="muted">${when(e)} · ${esc(e.venue)} · ${price(e)}</p>
        <form class="grid" id="rsvp-form" style="gap:10px;margin-top:10px">
          <label class="field">Full name<input name="name" required autocomplete="name" maxlength="80"></label>
          <label class="field">Email (ticket is sent here)<input name="email" type="email" required autocomplete="email"></label>
          <label class="field">Phone / WhatsApp (optional)<input name="phone" type="tel" autocomplete="tel" inputmode="tel" placeholder="+256…"></label>
          <label class="field">Education level<select name="level"><option>University</option><option>A-Level</option><option>O-Level</option><option>Professional</option></select></label>
          <label class="row"><input type="checkbox" name="photo" checked> OK to appear in event photos</label>
          <div class="row"><button class="btn ink" type="submit">Get my ticket</button></div></form>`;
      $("#rsvp-form").onsubmit = async ev => { ev.preventDefault(); const f = ev.target; if (!f.checkValidity()) { f.reportValidity(); return; }
        let t; try { t = await F.rsvp(e.id, Object.fromEntries(new FormData(f))); } catch (err) { let m = f.querySelector(".rsvp-err"); if (!m) { m = document.createElement("p"); m.className = "rsvp-err"; m.setAttribute("role", "alert"); f.appendChild(m); } m.textContent = err.message; return; } if (!e.me) { e.me = true; e.going++; } ticketView(b, t, e); drawTickets(); draw(); };
    }
    function drawTickets() {
      const ts = F.tickets(); $("#my-tickets").hidden = !ts.length;
      $("#tk-list").innerHTML = ts.map(t => { const e = all.find(x => x.id === t.eventId); return e ? `<li class="li"><div class="grow"><b>${esc(e.title)}</b><small>${when(e)} · ${esc(t.code)}${t.checkedIn ? " · checked in ✓" : ""}</small></div><button type="button" class="btn sm or" data-tk="${esc(t.code)}">Show QR</button></li>` : ""; }).join("");
    }
    $("#tk-list").onclick = e => { const b = e.target.closest("[data-tk]"); if (!b) return; const t = F.tickets().find(x => x.code === b.dataset.tk); const ev = all.find(x => x.id === t.eventId); ticketView(dlg("tk-dlg", "YOUR TICKET"), t, ev); };

    /* organiser view (101-hosted) */
    if (window.CCAccess && !CCAccess.resolved && CCAccess.ready) await Promise.race([CCAccess.ready, new Promise(r => setTimeout(r, 2500))]);
    const hosted = F.organiserEvents(all, window.CCAccess && CCAccess.resolved ? CCAccess.role : "visitor");
    $("#organiser").hidden = !hosted.length; { const ob = $("#org-btn"); if (ob) ob.hidden = !hosted.length; }
    $("#org-ev").innerHTML = hosted.map(e => `<option value="${esc(e.id)}">${esc(e.title)}</option>`).join("");
    const drawOrg = async () => { const id = $("#org-ev").value; const e = all.find(x => x.id === id); if (!e) return; const list = await F.attendees(id);
      const inN = list.filter(a => a.checkedIn).length;
      $("#org-stats").innerHTML = `<div class="kpi ck-skin"><b>${list.length}</b><small>RSVPs (preview)</small></div><div class="kpi ck-skin"><b>${inN}</b><small>Checked in</small></div><div class="kpi ck-skin"><b>${e.capacity ? Math.max(0, e.capacity - e.going) : "—"}</b><small>Seats left</small></div>`;
      $("#org-tb tbody").innerHTML = list.map(a => `<tr><td>${esc(a.name)}</td><td>${esc(a.level || "")}</td><td><code>${esc(a.code)}</code></td><td>${a.checkedIn ? '<span class="ok-t">✓ In</span>' : "—"}</td></tr>`).join(""); };
    $("#org-ev").onchange = drawOrg;
    $("#org-check").onsubmit = e => { e.preventDefault(); const code = $("#org-code").value; const t = F.checkIn(code); $("#org-msg").textContent = t ? `✓ Checked in: ${t.name} (${t.code})` : "No ticket with that code for this browser's preview data."; $("#org-code").value = ""; drawOrg(); drawTickets(); };
    $("#org-csv").onclick = async () => { const list = await F.attendees($("#org-ev").value); const csv = "name,level,code,checked_in\n" + list.map(a => [a.name, a.level || "", a.code, a.checkedIn ? "yes" : "no"].map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = "attendees.csv"; a.click(); };

    /* submit an event: signed-in members only (r12 QA fix 3). Visitors see "Sign in to submit an event" (→ auth, back here).
       CCAccess.onChange also fires when the server's answer arrives late, so a member never stays on the sign-in prompt.
       ?static=1 design shots keep the form as drawn. */
    /* r13 guest-leaks: guests may browse events but not submit them (community.post: learners, tutors, staff; the server
       refuses them too). A guest sees "Become a learner to submit an event" instead of the form. */
    const evGate = () => { const f = $("#ev-form"), p = $("#ev-signin"); if (!f || !p) return;
      const A = window.CCAccess, resolved = !!(A && A.resolved);
      const inn = document.documentElement.classList.contains("static") || (resolved && A.can("community.post"));
      f.hidden = !inn; p.hidden = inn;
      const a = p.querySelector("a"); if (!a || inn) return;
      if (resolved && A.role === "guest") { a.textContent = "Become a learner to submit an event"; a.setAttribute("href", A.authUrl("/events.html", "upgrade=1")); }
      else { a.textContent = "Sign in to submit an event"; a.setAttribute("href", "/auth.html?next=/events.html"); } };
    evGate(); if (window.CCAccess && CCAccess.onChange) CCAccess.onChange(evGate);
    $("#ev-form").onsubmit = async e => { e.preventDefault(); const f = e.target; if (!f.checkValidity()) { f.reportValidity(); return; }
      const o = Object.fromEntries(new FormData(f)); o.start = new Date(o.start + ":00+03:00").toISOString(); o.end = new Date((o.end || f.start.value) + ":00+03:00").toISOString(); o.price = Number(o.price || 0);
      const r = await F.submitEvent(o); $("#ev-msg").textContent = r.notSent ? r.message : r.offline ? "Saved in this browser only: this preview has no 101 server, so nothing was sent. Submit it again on the live site." : "Sent. An admin reviews it before it appears."; if (!r.notSent) f.reset(); };

    bindCard($("#ev-list")); draw(); drawTickets(); if (hosted.length) drawOrg();
    if (location.hash && all.some(e => e.id === location.hash.slice(1))) setTimeout(() => { const el = document.getElementById(location.hash.slice(1)); if (el) el.scrollIntoView(); }, 50);
  }
  if (document.body.dataset.page === "events") init();
})();
