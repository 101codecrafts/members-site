/* 101 Codecrafts — one share helper for the whole site (window.CC_SHARE).
   share({ title, text, url, file, filename, caption, status })
     file    a File/Blob (e.g. a generated PNG). Shared with navigator.share({files}) where navigator.canShare({files}) says yes;
             otherwise it is downloaded.
     caption copied to the clipboard at the same time, so it can be pasted into the post (apps often drop shared text).
     status  optional element that receives the plain-word result (it should be aria-live); else the site toast is used.
   Cancelling the share sheet (AbortError) is silent. Returns "shared" | "aborted" | "fallback".
   copy(text) -> Promise<boolean> (Clipboard API, then a hidden-textarea fallback). download(blob, filename). */
(function () {
  "use strict";
  function say(msg, status) {
    if (status) { status.textContent = ""; setTimeout(function () { status.textContent = msg; }, 30); return; }
    if (window.CC_UI && window.CC_UI.toast) window.CC_UI.toast(msg);
  }
  async function copy(text) {
    if (!text) return false;
    try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* not allowed / not secure: fall back */ }
    var t = document.createElement("textarea"); t.value = text; t.setAttribute("readonly", "");
    t.style.position = "fixed"; t.style.top = "0"; t.style.left = "0"; t.style.opacity = "0"; t.style.pointerEvents = "none";
    document.body.appendChild(t); t.select(); var ok = false;
    try { ok = document.execCommand("copy"); } catch (x) { ok = false; }
    t.remove(); return ok;
  }
  function download(blob, filename) {
    var u = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = u; a.download = filename || "101-codecrafts.png"; a.rel = "noopener"; a.style.display = "none";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(u); }, 4000);
  }
  function asFile(blob, filename) {
    if (!blob) return null;
    if (typeof File !== "undefined" && blob instanceof File) return blob;
    try { return new File([blob], filename || "101-codecrafts.png", { type: blob.type || "image/png" }); } catch (e) { return null; }
  }
  async function share(o) {
    o = o || {};
    var caption = o.caption || "", status = o.status || null, file = asFile(o.file, o.filename);
    var coarse = window.matchMedia && matchMedia("(pointer:coarse)").matches;
    if (file && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      var copied = caption ? copy(caption) : Promise.resolve(false);   // start now, keep the user gesture for share()
      try {
        await navigator.share({ files: [file], title: o.title || "", text: caption || o.text || "" });
        say((await copied) ? "Shared. Your caption is copied too, paste it into your post." : "Shared.", status);
        return "shared";
      } catch (e) {
        if (e && e.name === "AbortError") return "aborted";             // the person closed the share sheet: say nothing
      }
    } else if (!file && navigator.share && coarse) {
      try { await navigator.share({ title: o.title || "", text: o.text || caption || "", url: o.url || location.href }); return "shared"; }
      catch (e) { if (e && e.name === "AbortError") return "aborted"; }
    }
    /* fallback: save the file, copy the caption (or the link) */
    if (file) download(file, o.filename || file.name);
    var what = caption || o.url || "";
    var ok = what ? await copy(what) : false;
    if (file) say(ok ? "Image saved. Caption copied, paste it into your post." : "Image saved. Copy the caption below and paste it into your post.", status);
    else say(ok ? (caption ? "Caption copied, paste it into your post." : "Link copied, paste it into your post.") : "Copy this link: " + what, status);
    return "fallback";
  }
  window.CC_SHARE = { share: share, copy: copy, download: download };
})();
