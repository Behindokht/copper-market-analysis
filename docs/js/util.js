/* Small helpers: text lookup, DOM building, number and date formatting, data decoding, local storage. No dependencies. */
(function () {
  var CMA = (window.CMA = window.CMA || {});
  var S = window.CMA_STRINGS;

  // text lookup with {placeholders}; a missing key throws, so a typo cannot reach a visitor silently
  CMA.t = function (path, vars) {
    var v = path.split(".").reduce(function (o, k) { return o == null ? o : o[k]; }, S);
    if (v == null) { throw new Error("missing text: " + path); }
    return CMA.fill(v, vars);
  };
  CMA.fill = function (v, vars) {
    if (typeof v !== "string" || !vars) { return v; }
    return v.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? vars[k] : m; });
  };

  // DOM: h("div", {class: "card", text: "hi"}, child, "text", ...)
  CMA.h = function (tag, attrs) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) { return; }
      if (k === "text") { el.textContent = v; }
      else if (k === "class") { el.className = v; }
      else if (k.slice(0, 2) === "on") { el.addEventListener(k.slice(2), v); }
      else { el.setAttribute(k, v === true ? "" : v); }
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c == null || c === false) { continue; }
      if (Array.isArray(c)) { c.forEach(function (cc) { el.appendChild(typeof cc === "string" ? document.createTextNode(cc) : cc); }); }
      else { el.appendChild(typeof c === "string" ? document.createTextNode(c) : c); }
    }
    return el;
  };
  CMA.svg = function (tag, attrs) {
    var el = document.createElementNS("http://www.w3.org/2000/svg", tag);
    Object.keys(attrs || {}).forEach(function (k) { if (attrs[k] != null) { el.setAttribute(k, attrs[k]); } });
    return el;
  };

  // numbers (written by hand so the output never depends on the visitor's locale)
  CMA.n0 = function (x) { return String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ","); };
  CMA.n1 = function (x) { return (Math.round(x * 10) / 10).toFixed(1); };
  CMA.usd0 = function (x) { return "$" + CMA.n0(x); };
  // negative numbers use a real minus sign
  CMA.minus = function (s) { return String(s).replace("-", "\u2212"); };
  CMA.f1 = function (x) { return CMA.minus((Math.round(x * 10) / 10).toFixed(1)); };
  CMA.f2 = function (x) { return CMA.minus((Math.round(x * 100) / 100).toFixed(2)); };
  CMA.s1 = function (x) { return (x >= 0 ? "+" : "") + CMA.f1(x); };
  CMA.s2 = function (x) { return (x >= 0 ? "+" : "") + CMA.f2(x); };
  CMA.ordinal = function (n) { var v = n % 100, sfx = (v >= 11 && v <= 13) ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th"); return n + sfx; };
  // a quantity in thousand tonnes as million tonnes with one decimal (two when it is under 0.1), for the story and the dashboard; thousand tonnes stay in the appendix
  CMA.mt = function (kt) {
    var v = Math.abs(kt) / 1000, txt = v >= 100 ? CMA.n0(v) : (v >= 0.1 ? v.toFixed(1) : v.toFixed(2));
    return (kt < 0 ? "−" : "") + txt;
  };
  CMA.pctChange = function (x) { return (x >= 0 ? "+" : "") + CMA.minus(Math.abs(x) >= 100 ? CMA.n0(x) : (Math.round(x * 10) / 10).toFixed(1)) + "%"; };
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  CMA.monthLong = function (iso) { return MONTHS[parseInt(iso.slice(5, 7), 10) - 1] + " " + iso.slice(0, 4); };
  CMA.monthShort = function (iso) { return MONTHS[parseInt(iso.slice(5, 7), 10) - 1].slice(0, 3) + " " + iso.slice(0, 4); };

  // a dataset {columns, rows} as a list of objects
  CMA.rows = function (ds) {
    return ds.rows.map(function (r) { var o = {}; ds.columns.forEach(function (c, i) { o[c] = r[i]; }); return o; });
  };

  // local storage, wrapped: it can be blocked (private windows, previews), and the page works without it
  CMA.store = {
    get: function (k) { try { return window.localStorage.getItem("cma." + k); } catch (e) { return null; } },
    set: function (k, v) { try { window.localStorage.setItem("cma." + k, v); } catch (e) { /* ignore */ } },
    clear: function (keys) { try { keys.forEach(function (k) { window.localStorage.removeItem("cma." + k); }); } catch (e) { /* ignore */ } }
  };
  CMA.say = function (text) { var l = document.getElementById("live"); if (l) { l.textContent = text; } };
  // a closed fold for the technical layer: <details class="fold"><summary>Show the details</summary> ... </details>
  CMA.fold = function (lead, children) {
    return CMA.h("details", { class: "fold" }, CMA.h("summary", { text: CMA.t("foot.details") }),
      CMA.h("div", { class: "fold-body" }, lead ? CMA.h("p", { class: "hint", text: lead }) : null, children));
  };
  // the end of every page: one "Sources" line that opens the list, and one short line saying this is not a forecast
  CMA.pageFoot = function (wrap, names, attribution) {
    var reg = {};
    if (names) {
      CMA.rows(window.CMA_DATA.quality.sources).forEach(function (r) { reg[r.source_id] = r; });
      var chips = Object.keys(names).map(function (id) {
        return CMA.h("li", { class: "chip" }, CMA.h("b", { text: id }), " " + names[id] + ", " + CMA.t("story.sources.reliability", { reliability: reg[id] ? reg[id].reliability : "unrated" }));
      });
      wrap.appendChild(CMA.h("details", { class: "srcfold" }, CMA.h("summary", { text: CMA.t("foot.sources") }),
        CMA.h("ul", { class: "chips" }, chips), CMA.h("p", { class: "attrib", text: attribution })));
    }
    wrap.appendChild(CMA.h("p", { class: "small muted notadvice", text: CMA.t("foot.not_advice") }));
  };
  // motion plays once and never loops; with reduced motion there is none, and everything is visible at rest
  CMA.reduce = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  var RAYS = [[-78, 22, 0], [-56, 30, 30], [-38, 18, 10], [-18, 28, 55], [4, 20, 20], [26, 26, 45], [50, 16, 70], [-100, 14, 25], [72, 12, 60]];
  CMA.spark = {
    build: function (el) {
      RAYS.forEach(function (r) {
        var a = r[0] * Math.PI / 180, len = r[1], r0 = 8;
        var l = CMA.svg("line", { x1: (Math.cos(a) * r0).toFixed(2), y1: (Math.sin(a) * r0).toFixed(2), x2: (Math.cos(a) * (r0 + len)).toFixed(2), y2: (Math.sin(a) * (r0 + len)).toFixed(2) });
        l.style.setProperty("--len", len); l.style.setProperty("--neg", -len); l.style.setProperty("--d", r[2] + "ms");
        el.appendChild(l);
      });
      el.appendChild(CMA.svg("circle", { cx: 0, cy: 0, r: 2.6 }));
    },
    fire: function (el) { if (CMA.reduce) { return; } el.classList.remove("go"); void el.getBoundingClientRect(); el.classList.add("go"); }
  };
  // chapters of the story page: each one fills the box it is given; the sources of all chapters end up in one list at the foot of the page
  CMA.chapters = CMA.chapters || {};
  CMA.sources = {
    names: {}, notes: [], box: null,
    reset: function () { CMA.sources.names = {}; CMA.sources.notes = []; CMA.sources.box = null; },
    add: function (names, attribution) {
      Object.keys(names || {}).forEach(function (id) { CMA.sources.names[id] = names[id]; });
      if (attribution && CMA.sources.notes.indexOf(attribution) < 0) { CMA.sources.notes.push(attribution); }
      CMA.sources.refresh();                      // chapters can be built after the list is on the page (a guess opens its chapter later)
    },
    refresh: function () {
      var bx = CMA.sources.box;
      if (!bx) { return; }
      var reg = {};
      CMA.rows(window.CMA_DATA.quality.sources).forEach(function (r) { reg[r.source_id] = r; });
      bx.textContent = "";
      bx.appendChild(CMA.h("ul", { class: "chips" }, Object.keys(CMA.sources.names).sort().map(function (id) {
        return CMA.h("li", { class: "chip" }, CMA.h("b", { text: id }), " " + CMA.sources.names[id] + ", " + CMA.t("story.sources.reliability", { reliability: reg[id] ? reg[id].reliability : "unrated" }));
      })));
      CMA.sources.notes.forEach(function (n) { bx.appendChild(CMA.h("p", { class: "attrib", text: n })); });
    },
    render: function (wrap) {
      CMA.sources.box = CMA.h("div", {});
      wrap.appendChild(CMA.h("details", { class: "srcfold", id: "sources" }, CMA.h("summary", { text: CMA.t("foot.sources") }), CMA.sources.box));
      wrap.appendChild(CMA.h("p", { class: "small muted notadvice", text: CMA.t("foot.not_advice") }));
      CMA.sources.refresh();
    }
  };
  // the real (inflation-adjusted) record, read once: the plaque, chapter 1 and the summary all use this, and it must agree in both result tables
  CMA.realRecord = function () {
    var R = {};
    CMA.rows(window.CMA_DATA.story.record_facts).forEach(function (r) { R[r.fact_id] = r; });
    var cu = CMA.rows(window.CMA_DATA.chapters.records).filter(function (r) { return r.commodity === "copper"; })[0];
    var month = R.real_peak_all.month.slice(0, 7);
    var belowFromStory = (1 - 1 / (1 + R.real_peak_vs_latest_pct.value / 100)) * 100;
    if (cu.real_peak_month !== month || Math.abs(cu.real_peak - R.real_peak_all.value) > 0.5 || Math.abs((100 - cu.latest_pct_of_real_peak) - belowFromStory) > 0.1) {
      throw new Error("the real record differs between the story facts and the interlude records");
    }
    return { month: R.real_peak_all.month, value: R.real_peak_all.value, abovePct: R.real_peak_vs_latest_pct.value, belowPct: 100 - cu.latest_pct_of_real_peak, sharePct: cu.latest_pct_of_real_peak };
  };
  // a small source chip: the source IDs, and on open the result table, the notebook and the checks on that table (all from provenance.js)
  CMA.chip = function (keys) {
    var P = window.CMA_DATA.provenance.datasets, reg = {};
    CMA.rows(window.CMA_DATA.quality.sources).forEach(function (r) { reg[r.source_id] = r; });
    var srcs = [];
    keys.forEach(function (k) {
      if (!P[k]) { throw new Error("no provenance for " + k); }
      P[k].sources.forEach(function (sid) { if (srcs.indexOf(sid) < 0 && reg[sid]) { srcs.push(sid); } });
    });
    var panel = CMA.h("div", { class: "chip-panel" });
    srcs.forEach(function (sid) { panel.appendChild(CMA.h("p", {}, CMA.h("b", { text: CMA.t("story.chip_source") + " " + sid + ": " }), reg[sid].name)); });
    keys.forEach(function (k) {
      var e = P[k];
      panel.appendChild(CMA.h("p", {}, CMA.h("b", { text: CMA.t("story.chip_table") + ": " }), CMA.h("code", { text: e.table }), e.notebook ? " (" + CMA.t("story.chip_notebook").toLowerCase() + " " + e.notebook + ")" : ""));
      var real = e.checks.filter(function (c) { return c.status !== "INFO"; });
      if (!real.length) { panel.appendChild(CMA.h("p", { class: "muted", text: CMA.t("story.chip_none") })); }
      real.forEach(function (c) { panel.appendChild(CMA.h("p", { class: "small" }, CMA.t("story.chip_check", { no: c.no, description: c.description }) + " ", CMA.h("span", { class: "pill " + c.status.toLowerCase(), text: c.status }))); });
    });
    return CMA.h("details", { class: "chipx", "data-src": srcs.map(function (sid) { return (window.CMA_STRINGS.story.src_short || {})[sid] || (reg[sid] && reg[sid].publisher) || sid; }).filter(function (x, i, a) { return a.indexOf(x) === i; }).join(", ") }, CMA.h("summary", { "aria-label": CMA.t("story.chip_source") + ": " + CMA.t("story.chip_label").toLowerCase() + " " + srcs.join(" "), text: CMA.t("story.chip_source") }), panel);
  };
  // "Limits": a mono label over a hairline and the first two limits as plain sentences. The full list goes in the chapter's fold (limits.full).
  CMA.limits = function (items, fullTitle) {
    var h = CMA.h;
    return {
      short: h("div", { class: "limits" }, h("h4", { text: CMA.t("foot.limits") }), h("div", {}, items.slice(0, 2).map(function (x) { return h("p", { text: x }); }))),
      full: h("section", { class: "limits-full" }, h("h3", { text: fullTitle }), h("ul", {}, items.map(function (x) { return h("li", { text: x }); })))
    };
  };
  // a bridge sentence sits on smoked glass between two chapters: it is moved out of the chapter's sheet, and stays hidden while the reveal it was built in is closed
  CMA.bridge = function (box, text) {
    var el = CMA.h("p", { class: "bridge smoke", text: text }), sec = box.closest ? box.closest(".chapter") : null;
    if (sec && sec.parentNode) { sec.parentNode.insertBefore(el, sec.nextSibling); } else { box.appendChild(el); }
    el._rev = box.closest ? box.closest(".reveal") : null;
    el.hidden = !!(el._rev && el._rev.hidden);
  };
  CMA.syncBridges = function () {
    Array.prototype.forEach.call(document.querySelectorAll(".bridge"), function (el) { if (el._rev) { el.hidden = el._rev.hidden; } });
    var st = document.getElementById("story"); if (st && CMA.figify) { CMA.figify(st); }
  };
  // every chart card inside a chapter sheet ends like a figure of the study: a rule, a short source line, the "Source" link (the chip, moved down)
  CMA.figify = function (root) {
    Array.prototype.forEach.call(root.querySelectorAll(".chart-card"), function (card) {
      if (card.querySelector(".fig-foot")) { return; }
      var chip = card.querySelector("details.chipx");
      if (!chip) { return; }
      var foot = CMA.h("div", { class: "fig-foot" }, CMA.h("span", { text: chip.getAttribute("data-src") || "" }));
      chip.parentNode.removeChild(chip);
      foot.appendChild(chip);
      card.appendChild(foot);
    });
  };
  // the same foot with the source line read from the chip itself (the short publisher names of the sources behind the keys)
  CMA.figFootAuto = function (keys) { var chip = CMA.chip(keys); return CMA.h("div", { class: "fig-foot" }, CMA.h("span", { text: chip.getAttribute("data-src") || "" }), chip); };
  // the foot of a figure: a rule, a short source line, the "Source" link
  CMA.figFoot = function (text, keys) { return CMA.h("div", { class: "fig-foot" }, CMA.h("span", { text: text }), keys && keys.length ? CMA.chip(keys) : null); };

  // ---- the Story's two layers. The short read of a chapter is always shown; everything else sits in one <details class="fullx"> per chapter.
  // A module writes its short parts into its box and its full parts into box.F (the body of the fold). A chart inside the fold is drawn on the first open
  // (CMA.lazy), because a closed fold has no width to draw into.
  var WPM = 200;
  function proseWords(root) {
    var n = 0, w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) {
      var el = w.currentNode.parentElement;
      if (!el || (el.closest && el.closest("table, svg, script, style, .sr, summary"))) { continue; }
      n += (w.currentNode.textContent.match(/\S+/g) || []).length;
    }
    return n;
  }
  CMA.fullLayer = function (id) {
    var h = CMA.h, body = h("div", { class: "fullbody" }), sub = h("span", { class: "fx-s" });
    var det = h("details", { class: "fullx", id: id + "-full" }, h("summary", {}, h("span", { class: "fx-t", text: CMA.t("story.full_label") }), sub), body);
    det._body = body; body._det = det; body._lazy = [];
    // minutes: prose words only (no tables, no chart text) at 200 words a minute, rounded up, at least one
    det.refresh = function () { sub.textContent = CMA.t("story.full_sub", { n: Math.max(1, Math.ceil(proseWords(body) / WPM)) }); };
    det.runLazy = function () { var q = body._lazy; body._lazy = []; q.forEach(function (f) { f(); }); };
    det.openNow = function () { if (!det.open) { det.open = true; } det.runLazy(); det.refresh(); CMA.syncBridges(); };
    det.addEventListener("toggle", function () {
      if (det.open) { det.runLazy(); det.refresh(); }
      CMA.syncBridges();
      if (CMA.layersChanged) { CMA.layersChanged(); }
    });
    // some engines send the toggle event late: a click on the summary checks as well, after the browser has changed the state
    det.firstChild.addEventListener("click", function () { setTimeout(function () { if (det.open) { det.runLazy(); det.refresh(); } }, 0); });
    return det;
  };
  CMA.lazy = function (body, fn) {
    if (body && body._det && !body._det.open) { body._lazy.push(fn); } else { fn(); }
  };
  // open the folds that hold an element (a deep link, a find): the layer first, then any small fold inside it
  CMA.openAround = function (el) {
    var ds = [];
    for (var d = el.parentElement && el.parentElement.closest("details"); d; d = d.parentElement && d.parentElement.closest("details")) { ds.push(d); }
    ds.reverse().forEach(function (d) { if (d.openNow) { d.openNow(); } else { d.open = true; } });
    return ds.length > 0;
  };

  CMA.pages = CMA.pages || {};
})();
