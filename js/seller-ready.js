/* 101 Codecrafts — seller readiness (round 13, flows). FLOWS.md dead ends D2 + D3:
   - a listing can only go public from a KYC-verified shop, but nothing told a seller that, and there was no way to open
     a shop from the seller centre (POST /api/v1/marketplace/stores existed with no screen);
   - learners can list and sell but cannot withdraw (request_payout = verified tutors only), yet the payout form looked live.
   Shows a task list at the top of "Add a product" from the server session (GET /auth/session -> store, tutor; r13 API),
   offers a "Name your shop" form when there is no shop, and locks the payout form for accounts that can't withdraw.
   An API from before r13 (no `store` field): does nothing, claims nothing. ?static=1: does nothing. */
(function () {
  "use strict";
  if (/[?&]static/.test(location.search)) return;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  async function headers() {
    var h = { Accept: "application/json", "Content-Type": "application/json" };
    try { var c = window.CC_AUTH && window.CC_AUTH.clerk; var t = c && c.session && await c.session.getToken(); if (t) h.Authorization = "Bearer " + t; } catch (e) {}
    return h;
  }
  var slugify = function (n) { return String(n || "").toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "shop"; };   // API: ^[a-z0-9][a-z0-9-]{2,60}$

  function render(sess, A) {
    var F = window.CCFirstSteps, box = $("#add"); if (!F || !box || !sess || !("store" in sess)) return;
    var st = sess.store, kyc = st ? String(st.kyc_status || "pending") : null;
    var canWithdraw = !!(sess.tutor && sess.tutor.status === "verified");
    var html = F.html({ key: "seller", title: "Before your listings go live", dismissable: !!(st && kyc === "verified"),
      intro: "Every listing is reviewed by an admin, and only verified shops appear in the marketplace.",
      items: [
        { label: st ? "Open your shop: " + st.name : "Open your shop", status: st ? "done" : "todo", href: "#sl-shop", cta: "Name your shop" },
        { label: "Identity check (KYC)", hint: !st ? "Starts when your shop is open." : kyc === "verified" ? "" : kyc === "rejected" ? "Not approved. An admin will tell you what to fix by email." : "An admin checks who runs the shop. Until then your listings stay private.",
          status: !st ? "blocked" : kyc === "verified" ? "done" : "waiting" },
        { label: "List your first product", hint: "Goes live after a quick review.", status: st ? "todo" : "blocked", href: "#sl-form", cta: "Add a product" },
        { label: "Withdraw your earnings", hint: canWithdraw ? "To your Mobile Money number, after buyers confirm delivery." : "Not open to learner shops yet. Sales stay with our licensed payment provider (Flutterwave) until it is.",
          status: canWithdraw ? "optional" : "blocked" }
      ] });
    if (!html) return;
    var host = document.createElement("div"); host.className = "sl-ready"; host.innerHTML = html +
      (st ? "" : '<form class="row sl-shop" id="sl-shop" novalidate style="margin-top:12px;align-items:flex-end"><label class="field" style="flex:1;min-width:220px">Shop name<input name="name" required minlength="2" maxlength="80" autocomplete="organization" aria-describedby="sl-shop-msg"></label><button class="btn or" type="submit">Open my shop</button><p class="muted" id="sl-shop-msg" role="status" style="flex-basis:100%;margin:0"></p></form>');
    var form = $("#sl-form", box); box.insertBefore(host, form || null);
    var shop = $("#sl-shop", host);
    if (shop) shop.addEventListener("submit", async function (e) {
      e.preventDefault();
      var msg = $("#sl-shop-msg"), name = shop.name.value.trim(), btn = $("button", shop);
      if (name.length < 2) { msg.textContent = "Enter a shop name (2 to 80 characters)."; shop.name.setAttribute("aria-invalid", "true"); shop.name.focus(); return; }
      shop.name.removeAttribute("aria-invalid"); btn.disabled = true; msg.textContent = "Opening your shop…";
      try {
        var r = await fetch("/api/v1/marketplace/stores", { method: "POST", credentials: "include", headers: await headers(), body: JSON.stringify({ name: name, slug: slugify(name) + "-" + Math.random().toString(36).slice(2, 6) }) });
        var j = null; try { j = await r.json(); } catch (x) {}
        if (!r.ok) throw new Error((j && j.error && j.error.message) || (r.status === 403 ? "This account can't open a shop (shops are for members aged 18 and over)." : r.status === 409 ? "You already have a shop." : "Couldn't open your shop. Check your connection and try again."));
        msg.textContent = "Shop opened. An admin will check it before your listings go public.";
        setTimeout(function () { location.reload(); }, 1200);
      } catch (x) { btn.disabled = false; msg.textContent = x.message; }
    });
    /* the payout form can't succeed for an account that can't withdraw: lock it and say why (no fake "requested") */
    var pf = $("#sl-payout");
    if (pf && !canWithdraw) {
      [].forEach.call(pf.querySelectorAll("input,select,button"), function (el) { el.disabled = true; });
      var note = document.createElement("p"); note.className = "fl-note"; note.setAttribute("role", "status");
      note.innerHTML = "<b>Withdrawals aren't open to learner shops yet.</b> Your sales stay with our licensed payment provider (Flutterwave) until they are. Verified tutors can withdraw to Mobile Money.";
      pf.parentNode.insertBefore(note, pf);
    }
  }
  function start() {
    var A = window.CCAccess; if (!A || !A.ready) return;
    A.ready.then(function () {
      if (!(A.role === "learner" || A.role === "tutor")) return;
      var sess = window.CC_AUTH && window.CC_AUTH.session;
      if (sess) render(sess, A); else document.addEventListener("cc:session", function (e) { render(e.detail, A); }, { once: true });
    });
  }
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", start) : start();
})();
