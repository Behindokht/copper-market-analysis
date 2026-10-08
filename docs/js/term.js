/* A small "term" control: a word with a dotted underline that explains itself in a short bubble. Used for "metric ton" and for the symbol "/t".
   Opens on hover, on keyboard focus and on tap; closes when the pointer leaves, when focus moves away, on a tap elsewhere and on Escape. The bubble has role="tooltip" and the control points to it with aria-describedby.
   It uses the glass look of the site, is placed inside the viewport (also at 390 px wide) and does not animate when reduced motion is on.
   CMA.term(text, key)            a button for the term whose explanation is the string "term.<key>"
   CMA.termIn(text, phrase, key)  the nodes of text with the first occurrence of phrase turned into a term control */
(function () {
  var CMA = window.CMA, h = CMA.h;
  var tip = null, open = null, hideTimer = 0, uid = 0;

  function ensure() {
    if (tip) { return tip; }
    tip = h("div", { class: "termtip glass", role: "tooltip", id: "term-tip", hidden: true });
    document.body.appendChild(tip);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && open) { hide(); } });
    document.addEventListener("pointerdown", function (e) { if (open && !(e.target.closest && e.target.closest(".term"))) { hide(); } }, true);
    window.addEventListener("scroll", function () { if (open) { place(open); } }, { passive: true });
    window.addEventListener("resize", function () { if (open) { place(open); } });
    return tip;
  }
  function place(btn) {
    var r = btn.getBoundingClientRect(), vw = document.documentElement.clientWidth, vh = window.innerHeight;
    tip.style.maxWidth = Math.min(280, vw - 24) + "px";
    var w = tip.offsetWidth, hh = tip.offsetHeight;
    var left = Math.min(Math.max(12, r.left + r.width / 2 - w / 2), vw - w - 12);
    var top = r.bottom + 8;
    if (top + hh > vh - 8) { top = Math.max(8, r.top - hh - 8); }          // above the word when there is no room below
    tip.style.left = left + "px"; tip.style.top = top + "px";
  }
  function show(btn) {
    clearTimeout(hideTimer);
    ensure();
    var host = btn.closest("dialog") || document.body;          // inside an open dialog the bubble must live in it, or the dialog (in the top layer) would cover it
    if (tip.parentNode !== host) { host.appendChild(tip); }
    tip.textContent = CMA.t("term." + btn.getAttribute("data-term"));
    tip.hidden = false;
    open = btn;
    btn.setAttribute("aria-expanded", "true");
    place(btn);
  }
  function hide() {
    if (!tip || !open) { return; }
    open.setAttribute("aria-expanded", "false");
    tip.hidden = true;
    open = null;
  }

  CMA.term = function (text, key) {
    var b = h("button", { type: "button", class: "term", "data-term": key || "metric_ton", "aria-describedby": "term-tip", "aria-expanded": "false", id: "term-" + (++uid), text: text });
    b.addEventListener("mouseenter", function () { show(b); });
    b.addEventListener("mouseleave", function () { hideTimer = setTimeout(hide, 120); });
    b.addEventListener("focus", function () { show(b); });
    b.addEventListener("blur", function () { hide(); });
    b.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); if (open === b && b.getAttribute("data-tapped") === "1") { b.removeAttribute("data-tapped"); hide(); } else { b.setAttribute("data-tapped", "1"); show(b); } });
    return b;
  };
  CMA.termIn = function (text, phrase, key) {
    var i = text.indexOf(phrase);
    if (i < 0) { return [text]; }
    return [text.slice(0, i), CMA.term(phrase, key), text.slice(i + phrase.length)].filter(function (x) { return x !== ""; });
  };
})();
