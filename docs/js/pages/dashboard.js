/* The Dashboard: the landing page. A sticky filter bar (period, currency, prices), a KPI band, five panels, a data-health panel and a CSV download of the current view.
   The browser only filters, rebases and measures period changes; every number it starts from comes from window.CMA_DATA.dash (notebook 07) and the other data files.
   tools/parity_test.py compares CMA.dash.snapshot() with the Python table res_dash_changes. State lives in the hash: #dashboard?p=5y&c=usd&v=nominal&e=1. */
(function () {
  var CMA = window.CMA, h = CMA.h, svg = CMA.svg;
  var T = function (key, vars) { return CMA.t("dashboard." + key, vars); };

  var DEFAULTS = { p: "20y", c: "usd", v: "nominal", e: "0" };
  var VALID = { p: ["1y", "5y", "20y", "all"], c: ["usd", "eur"], v: ["nominal", "real"], e: ["0", "1"] };
  var MONTHS_BACK = { "1y": 12, "5y": 60, "20y": 240, "all": null };
  var COLS = { cu_usd: "usd", cu_eur: "eur", cu_real: "real" };

  var D = null, months = [], col = {}, K = {}, state = { p: DEFAULTS.p, c: DEFAULTS.c, v: DEFAULTS.v, e: DEFAULTS.e };
  var ui = {}, charts = {}, crossMonth = null, keyboardMove = false, rafRead = 0, built = false;

  // ------------------------------------------------------------ state in the URL
  function normalise(q) {
    var out = {};
    Object.keys(DEFAULTS).forEach(function (k) { out[k] = VALID[k].indexOf(q[k]) >= 0 ? q[k] : DEFAULTS[k]; });
    if (out.c === "eur" && out.v === "real") { out.v = "nominal"; }          // today's money is US inflation: dollars only
    return out;
  }
  function parseQuery(qs) {
    var q = {};
    String(qs || "").replace(/^\?/, "").split("&").forEach(function (kv) { if (kv) { var a = kv.split("="); q[decodeURIComponent(a[0])] = decodeURIComponent(a[1] || ""); } });
    return q;
  }
  function writeUrl() {
    var qs = Object.keys(DEFAULTS).map(function (k) { return k + "=" + state[k]; }).join("&");
    try { history.replaceState(null, "", "#dashboard?" + qs); } catch (e) { /* ignore */ }
  }

  // ------------------------------------------------------------ data
  function prepare() {
    D = CMA.rows(window.CMA_DATA.dash.series);
    months = D.map(function (r) { return r.month; });
    Object.keys(D[0]).forEach(function (k) { if (k !== "month") { col[k] = D.map(function (r) { return r[k]; }); } });
    CMA.rows(window.CMA_DATA.dash.kpis).forEach(function (r) { K[r.fact_id] = r.value; });
  }
  function firstValid(a) { for (var i = 0; i < a.length; i++) { if (a[i] != null) { return i; } } return a.length - 1; }
  // the window of a period for one series: the same rules as notebook 07
  function startFor(p, series) {
    var last = months.length - 1, back = MONTHS_BACK[p], s = back == null ? 0 : Math.max(0, last - back);
    s = Math.max(s, firstValid(series));
    while (series[s] == null && s < last) { s++; }
    return s;
  }
  function copperCol(st) { return st.c === "eur" ? "cu_eur" : (st.v === "real" ? "cu_real" : "cu_usd"); }
  function pct(a, b) { return 100 * (a / b - 1); }

  function compute(st) {
    var last = months.length - 1, cc = copperCol(st), cs = col[cc], s = startFor(st.p, cs);
    var usdCol = st.v === "real" ? "cu_real" : "cu_usd", su = startFor(st.p, col[usdCol]);       // the metals, dollar and ratio panels are always in dollars
    var ds = Math.max(su, firstValid(col.dxy));
    var snap = { start_month: months[s], copper_change_pct: pct(cs[last], cs[s]), usd_start_month: months[su], dxy_start_month: months[ds], dxy_change_pct: pct(col.dxy[last], col.dxy[ds]), ratio_start: col.ratio[su] };
    ["al", "gold", "tin", "brent"].forEach(function (k) {
      var a = col[k + (st.v === "real" ? "_real" : "_usd")];
      snap[k + "_rebased_latest"] = 100 * a[last] / a[su];
    });
    snap.cu_rebased_latest = 100 * col[usdCol][last] / col[usdCol][su];
    return { s: s, su: su, ds: ds, last: last, cc: cc, snap: snap };
  }

  // ------------------------------------------------------------ small helpers
  function money(v, cur) { return (cur === "eur" ? "€" : "$") + CMA.n0(v); }
  function monthLong(m) { return CMA.monthLong(m + "-01"); }
  function slice(a, from) { return a.slice(from); }
  function spark(values) {
    var pts = values.filter(function (v) { return v != null; }), W = 96, H = 26;
    var lo = Math.min.apply(null, pts), hi = Math.max.apply(null, pts), d = "", pen = false;
    values.forEach(function (v, i) {
      if (v == null) { pen = false; return; }
      var x = 1 + (i / (values.length - 1)) * (W - 2), y = H - 3 - ((v - lo) / ((hi - lo) || 1)) * (H - 6);
      d += (pen ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1); pen = true;
    });
    var s = svg("svg", { class: "kspark", viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": T("spark_aria"), focusable: "false" });
    s.appendChild(svg("path", { d: d, fill: "none", stroke: "var(--copper)", "stroke-width": 1.5, "stroke-linejoin": "round", "stroke-linecap": "round" }));
    return s;
  }
  function seg(groupKey, options, labelKey) {
    var wrap = h("div", { class: "dgroup", role: "group", "aria-label": T(labelKey) }), btns = {};
    wrap.appendChild(h("span", { class: "dlab mono", text: T(labelKey) }));
    var row = h("span", { class: "dseg-row" });
    options.forEach(function (o) {
      var b = h("button", { type: "button", class: "dseg", "data-v": o, text: T(groupKey + "_" + o), "aria-pressed": "false" });
      b.addEventListener("click", function () { var n = {}; Object.keys(state).forEach(function (k) { n[k] = state[k]; }); n[groupKey] = o; setState(n); });
      row.appendChild(b); btns[o] = b;
    });
    wrap.appendChild(row);
    return { el: wrap, btns: btns };
  }

  // ------------------------------------------------------------ the synced crosshair and the shared readout
  function setCross(month, fromKeyboard) {
    crossMonth = month; keyboardMove = !!fromKeyboard;
    Object.keys(charts).forEach(function (k) { charts[k].setMonth(month); });
    if (!rafRead) { rafRead = requestAnimationFrame(function () { rafRead = 0; renderReadout(); }); }
  }
  function moveCross(delta, chartMonths) {
    var list = chartMonths, i = crossMonth ? list.indexOf(crossMonth) : -1;
    if (i < 0) { i = delta < 0 ? list.length - 1 : 0; if (Math.abs(delta) === 1 || Math.abs(delta) === 12) { delta = 0; } }
    var n = Math.max(0, Math.min(list.length - 1, i + delta));
    setCross(list[n], true);
  }
  function renderReadout() {
    var r = ui.readout;
    r.setAttribute("aria-live", keyboardMove ? "polite" : "off");
    if (!crossMonth) { r.textContent = T("readout_idle"); r.classList.add("idle"); return; }
    r.classList.remove("idle");
    var i = months.indexOf(crossMonth), c = compute(state), na = T("readout_none");
    var priceV = col[c.cc][i], parts = [h("b", { text: monthLong(crossMonth) })];
    parts.push(T("readout_copper", { value: priceV == null ? na : money(priceV, state.c) }));
    var uc = state.v === "real" ? "cu_real" : "cu_usd", list = [["metals_copper", uc], ["metals_gold", "gold"], ["metals_tin", "tin"], ["metals_aluminium", "al"], ["metals_brent", "brent"]].map(function (m) {
      var key = m[1] === uc ? uc : m[1] + (state.v === "real" ? "_real" : "_usd"), a = col[key], base = a[c.su];
      return T(m[0]).toLowerCase() + " " + (a[i] == null || base == null ? na : CMA.n0(100 * a[i] / base));
    });
    parts.push(T("readout_metals", { list: list.join(", ") }));
    parts.push(T("readout_corr", { value: col.corr36[i] == null ? na : CMA.f2(col.corr36[i]) }));
    parts.push(T("readout_ratio", { value: col.ratio[i] == null ? na : CMA.f2(col.ratio[i]) }));
    r.textContent = "";
    parts.forEach(function (p, k) { if (k) { r.appendChild(h("span", { class: "sep", "aria-hidden": "true", text: " · " })); } r.appendChild(typeof p === "string" ? document.createTextNode(p) : p); });
  }

  // ------------------------------------------------------------ chart configs
  function common(slot) {
    return { onMonth: setCross, onKey: moveCross, getMonth: function () { return crossMonth; }, height: slot.height };
  }
  function priceCfg(c) {
    var cs = col[c.cc], ms = months.slice(c.s), vals = cs.slice(c.s), unit = T("price_unit_" + state.c);
    var cfg = common({ height: 300 });
    var recIdx = 0; cs.forEach(function (v, i) { if (v != null && v > (cs[recIdx] == null ? -1 : cs[recIdx])) { recIdx = i; } });
    cfg.months = ms; cfg.series = [{ id: "cu", color: "--copper", values: vals, width: 2 }]; cfg.yMin = 0; cfg.scale = "linear";
    cfg.yFormat = function (v) { return CMA.n0(v); }; cfg.marginRight = 22;
    var inWin = recIdx >= c.s, ri = recIdx - c.s;
    cfg.marks = inWin ? [{ series: "cu", i: ri, lines: [T("mark_record", { month: CMA.monthShort(months[recIdx] + "-01"), value: money(cs[recIdx], state.c) })], side: ri > ms.length * 0.55 ? "left" : "right", up: state.e === "1" }] : [];
    cfg.endLabels = (inWin && ri === ms.length - 1) ? [] : [{ series: "cu", text: T("mark_latest", { value: money(cs[c.last], state.c) }), ink: "--ink" }];
    if (state.e === "1") {
      cfg.events = EVENTS.filter(function (e) { var i = months.indexOf(e.month); return i >= c.s && cs[i] != null; }).map(function (e) {
        return { i: months.indexOf(e.month) - c.s, n: e.n, tip: [monthLong(e.month), e.label, T("event_source", { source: e.source_name })] };
      });
    }
    cfg.aria = T("price_aria", { from: monthLong(ms[0]), to: monthLong(ms[ms.length - 1]), unit: unit, prices: T("prices_" + state.v + "_text") });
    return cfg;
  }
  function metalsCfg(c) {
    var ms = months.slice(c.su), sfx = state.v === "real" ? "_real" : "_usd", cfg = common({ height: 300 });
    var defs = [["cu", state.v === "real" ? "cu_real" : "cu_usd", "metals_copper", "--copper"], ["gold", "gold" + sfx, "metals_gold", "--muted"], ["tin", "tin" + sfx, "metals_tin", "--muted"],
      ["al", "al" + sfx, "metals_aluminium", "--muted"], ["brent", "brent" + sfx, "metals_brent", "--muted"]];
    cfg.months = ms; cfg.scale = "log"; cfg.yFormat = function (v) { return CMA.n0(v); }; cfg.marginRight = 96;
    cfg.series = defs.map(function (d) {
      var a = col[d[1]], base = a[c.su];
      return { id: d[0], color: d[3], values: a.slice(c.su).map(function (v) { return v == null ? null : 100 * v / base; }), width: d[0] === "cu" ? 2.2 : 1.4 };
    });
    cfg.endLabels = defs.map(function (d, k) {
      var v = cfg.series[k].values; return { series: d[0], text: T(d[2]) + " " + CMA.n0(v[v.length - 1]), ink: d[0] === "cu" ? "--copper-text" : "--ink" };
    });
    cfg.aria = T("metals_aria", { from: monthLong(ms[0]), to: monthLong(ms[ms.length - 1]) });
    return cfg;
  }
  function dollarCfg(c) {
    var from = Math.max(c.su, firstValid(col.corr36)), ms = months.slice(from), cfg = common({ height: 240 });
    cfg.months = ms; cfg.series = [{ id: "corr", color: "--copper", values: col.corr36.slice(from), width: 2 }];
    cfg.yMin = -1; cfg.yMax = 1; cfg.yTicks = [-1, -0.5, 0, 0.5, 1]; cfg.yFormat = function (v) { return CMA.f1(v); }; cfg.marginRight = 22;
    cfg.refLines = [{ v: 0, label: T("dollar_zero"), dashed: false }];
    var vv = cfg.series[0].values; cfg.endLabels = [{ series: "corr", text: CMA.f2(vv[vv.length - 1]), ink: "--ink" }];
    cfg.aria = T("dollar_aria", { from: monthLong(ms[0]), to: monthLong(ms[ms.length - 1]) });
    ui.dollarNote.textContent = from > c.su ? T("dollar_start", { month: monthLong(months[from]) }) : "";
    return cfg;
  }
  function ratioCfg(c) {
    var ms = months.slice(c.su), cfg = common({ height: 240 }), be = K.breakeven_ratio;
    cfg.months = ms; cfg.series = [{ id: "ratio", color: "--copper", values: col.ratio.slice(c.su), width: 2 }];
    cfg.yMin = 0; cfg.yFormat = function (v) { return CMA.n0(v); }; cfg.marginRight = 30;
    cfg.refLines = [{ v: be, label: T("ratio_breakeven"), dashed: true }];
    var vv = cfg.series[0].values; cfg.endLabels = [{ series: "ratio", text: CMA.f2(vv[vv.length - 1]), ink: "--ink" }];
    cfg.aria = T("ratio_aria", { from: monthLong(ms[0]), to: monthLong(ms[ms.length - 1]), be: CMA.f2(be) });
    return cfg;
  }

  // ------------------------------------------------------------ tables (built when a fold is opened)
  function tableFor(kind) {
    var c = compute(state), rows = [], head = [];
    if (kind === "price") {
      head = [T("col_month"), T("price_unit_" + state.c)];
      for (var i = c.s; i <= c.last; i++) { rows.push([months[i], col[c.cc][i] == null ? "" : CMA.n0(col[c.cc][i])]); }
    } else if (kind === "metals") {
      var sfx = state.v === "real" ? "_real" : "_usd";
      head = [T("col_month"), T("metals_copper"), T("metals_gold"), T("metals_tin"), T("metals_aluminium"), T("metals_brent")];
      var keys = [state.v === "real" ? "cu_real" : "cu_usd", "gold" + sfx, "tin" + sfx, "al" + sfx, "brent" + sfx];
      for (var j = c.su; j <= c.last; j++) { rows.push([months[j]].concat(keys.map(function (k) { return col[k][j] == null ? "" : CMA.n0(100 * col[k][j] / col[k][c.su]); }))); }
    } else if (kind === "dollar") {
      head = [T("col_month"), T("col_corr")];
      for (var k = Math.max(c.su, firstValid(col.corr36)); k <= c.last; k++) { rows.push([months[k], col.corr36[k] == null ? "" : CMA.f2(col.corr36[k])]); }
    } else if (kind === "ratio") {
      head = [T("col_month"), T("col_ratio")];
      for (var m = c.su; m <= c.last; m++) { rows.push([months[m], col.ratio[m] == null ? "" : CMA.f2(col.ratio[m])]); }
    }
    return h("div", { class: "tablewrap tall" }, h("table", {}, h("thead", {}, h("tr", {}, head.map(function (x) { return h("th", { scope: "col", text: x }); }))),
      h("tbody", {}, rows.map(function (r) { return h("tr", {}, r.map(function (x) { return h("td", { text: x }); })); }))));
  }
  function tableFold(kind) {
    var body = h("div", { class: "fold-body" }), d = h("details", { class: "tableview" }, h("summary", { text: T("table_summary") }), body);
    d.addEventListener("toggle", function () { if (d.open) { body.textContent = ""; body.appendChild(tableFor(kind)); } });
    d.dataset.kind = kind; ui.folds.push({ d: d, body: body, kind: kind });
    return d;
  }

  // ------------------------------------------------------------ panels
  function panel(cls, id, titleKey, hintKey, chapter, inner) {
    var why = chapter ? h("a", { class: "why", href: "#" + chapter.id, text: T("why", { n: CMA.CHAPTER_NO[chapter.key] }) }) : null;
    return h("section", { class: "dpanel " + cls, "aria-labelledby": id }, h("header", { class: "dhead" }, h("h2", { id: id, text: T(titleKey) }), why),
      hintKey ? h("p", { class: "dhint", text: T(hintKey) }) : null, inner);
  }
  var EVENTS = [];

  function supplyPanel() {
    var RM = CMA.rows(window.CMA_DATA.supply.refined), sc = 50;
    var pctTxt = function (v) { return CMA.n1(v) + "%"; };
    var rows = RM.map(function (r) {
      return h("li", { class: "mrrow", "aria-hidden": "true" }, h("div", { class: "mrname", text: r.display_name }),
        h("div", { class: "mrbars" },
          h("div", { class: "mrbar mine" }, h("div", { class: "mrtrack" }, r.mine_listed ? h("span", { class: "mrfill", style: "width:" + (r.mine_share_pct / sc * 100) + "%" }) : null), h("span", { class: "mrval", text: r.mine_listed ? pctTxt(r.mine_share_pct) : T("supply_none") })),
          h("div", { class: "mrbar ref" }, h("div", { class: "mrtrack" }, h("span", { class: "mrfill", style: "width:" + (r.refinery_share_pct / sc * 100) + "%" })), h("span", { class: "mrval", text: pctTxt(r.refinery_share_pct) }))));
    });
    var aria = T("supply_aria", { list: RM.map(function (r) { return r.display_name + ": " + (r.mine_listed ? pctTxt(r.mine_share_pct) : T("supply_none")) + ", " + pctTxt(r.refinery_share_pct); }).join("; ") });
    var thead = h("thead", {}, h("tr", {}, ["col_country", "col_mine", "col_refinery"].map(function (k) { return h("th", { scope: "col", text: T(k) }); })));
    var tbody = h("tbody", {}, RM.map(function (r) { return h("tr", {}, h("td", { text: r.display_name }), h("td", { text: r.mine_listed ? pctTxt(r.mine_share_pct) : T("supply_none") }), h("td", { text: pctTxt(r.refinery_share_pct) })); }));
    return h("div", { class: "mr dmr" },
      h("ul", { class: "bars", style: "list-style:none;margin:0;padding:0", role: "img", "aria-label": aria }, rows),
      h("p", { class: "mrkey" }, h("span", { class: "mine" }, h("i"), T("supply_mine")), h("span", { class: "ref" }, h("i"), T("supply_refinery"))),
      h("details", { class: "tableview" }, h("summary", { text: T("table_summary") }), h("div", { class: "tablewrap" }, h("table", {}, thead, tbody))));
  }

  function healthPanel() {
    var Q = window.CMA_DATA.quality, checks = CMA.rows(Q.checks), count = function (s) { return checks.filter(function (r) { return r.status === s; }).length; };
    var KI = CMA.rows(Q.known_issues).filter(function (r) { return r.status !== "limitation" && r.status !== "resolved"; });
    var run = checks[0].run_date;
    ui.health = { passed: count("PASS"), warn: count("WARN"), fail: count("FAIL") };
    ui.csvLink = h("button", { type: "button", class: "btn secondary small", text: T("link_download") });
    ui.csvLink.addEventListener("click", downloadCsv);
    return h("div", { class: "dhealth" },
      h("ul", { class: "dfacts" },
        h("li", {}, h("b", { class: "num", text: String(ui.health.passed) }), h("span", { text: T("health_passed") })),
        h("li", {}, h("b", { class: "num", text: String(ui.health.warn) }), h("span", { text: T("health_warn") })),
        h("li", {}, h("b", { class: "num", text: String(ui.health.fail) }), h("span", { text: T("health_fail") })),
        h("li", {}, h("b", { class: "num", text: String(Q.sources.rows.length) }), h("span", { text: T("health_sources") })),
        h("li", {}, h("b", { class: "num", text: String(KI.length) }), h("span", { text: T("health_issues") }))),
      h("p", { class: "dline" }, T("health_through", { month: monthLong(K.latest_month) }) + " " + T("health_checked", { date: parseInt(run.slice(8, 10), 10) + " " + CMA.monthLong(run) })),
      h("div", { class: "row" }, h("a", { class: "btn small", href: "#quality", text: T("link_appendix") }), ui.csvLink, CMA.chip(["dash.series"])));
  }

  // ------------------------------------------------------------ CSV of the current view (World Bank and FRED-derived series only)
  function downloadCsv() {
    var c = compute(state), L = [], q = function (x) { return /[",\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; };
    window.CMA_STRINGS.dashboard.csv_header.forEach(function (x) { L.push("# " + CMA.fill(x, { period: T("period_" + state.p), currency: state.c.toUpperCase(), prices: T("prices_" + state.v + "_text"), start: monthLong(months[c.s]), latest: monthLong(K.latest_month) })); });
    var sfx = state.v === "real" ? "_real" : "_usd", names = window.CMA_STRINGS.dashboard.csv_columns;
    L.push(names.join(","));
    for (var i = c.s; i <= c.last; i++) {
      var cu = col[c.cc][i], u = state.v === "real" ? "cu_real" : "cu_usd";
      var row = [months[i], cu == null ? "" : cu, col["al" + sfx][i], col["gold" + sfx][i], col["tin" + sfx][i], col["brent" + sfx][i],
        col[u][i] == null || col[u][c.su] == null || i < c.su ? "" : (100 * col[u][i] / col[u][c.su]).toFixed(2),
        col.dxy[i] == null ? "" : col.dxy[i], col.ratio[i], col.corr36[i] == null ? "" : col.corr36[i]];
      L.push(row.map(function (x) { return x == null ? "" : q(String(x)); }).join(","));
    }
    var blob = new Blob([L.join("\n") + "\n"], { type: "text/csv;charset=utf-8" }), a = h("a", { href: URL.createObjectURL(blob), download: "copper-dashboard-" + state.p + "-" + state.c + "-" + state.v + ".csv" });
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  // ------------------------------------------------------------ the page
  CMA.pages.dashboard = function (root) {
    prepare();
    var ev = CMA.rows(window.CMA_DATA.chapters.events).sort(function (a, b) { return a.month < b.month ? -1 : 1; });
    EVENTS = ev.map(function (e, k) { return { n: k + 1, month: e.month, label: e.label, description: e.description, source_id: e.source_id, source_name: e.source_name, url: e.source_url }; });
    ui.folds = [];
    root.textContent = "";
    var wrap = h("div", { class: "wrap dash" });
    root.appendChild(wrap);
    wrap.appendChild(h("h1", { class: "sr", id: "dashboard-title", tabindex: "-1", text: T("page_title") }));

    // filter bar
    var gP = seg("p", VALID.p, "period_label"), gC = seg("c", VALID.c, "currency_label"), gV = seg("v", VALID.v, "prices_label");
    ui.btns = { p: gP.btns, c: gC.btns, v: gV.btns };
    ui.noteEuro = h("span", { class: "dnote", id: "note-euro" }); ui.noteReal = h("span", { class: "dnote", id: "note-real" });
    ui.readout = h("p", { class: "dreadout idle", id: "dreadout", "aria-live": "off" });
    gV.btns.real.setAttribute("aria-describedby", "note-real");
    var bar = h("div", { class: "dashbar glass", role: "region", "aria-label": T("filter_aria") },
      h("div", { class: "dbar-row" }, gP.el, gC.el, gV.el), h("p", { class: "dnotes" }, ui.noteEuro, ui.noteReal), ui.readout);
    wrap.appendChild(bar);

    // KPI band
    var items = ["copper", "change", "real", "ratio", "dxy", "health"];
    ui.kpi = {};
    var band = h("section", { class: "kpiband", "aria-label": T("kpi_aria") });
    items.forEach(function (k) {
      ui.kpi[k] = { label: h("p", { class: "mono klabel" }), figure: h("p", { class: "kfig num" }), ctx: h("p", { class: "kctx" }), spark: h("div", { class: "kspark-host" }) };
      var it = h("div", { class: "kpi", "data-k": k }, ui.kpi[k].label, ui.kpi[k].figure, ui.kpi[k].ctx, ui.kpi[k].spark);
      if (k === "health") { ui.kpi[k].link = h("a", { class: "klink", href: "#quality", text: T("kpi_health_link") }); it.appendChild(ui.kpi[k].link); }
      band.appendChild(it);
    });
    wrap.appendChild(band);

    // panels
    var grid = h("div", { class: "dgrid" });
    wrap.appendChild(grid);
    ui.priceHost = h("div", { class: "dchart-host" }); ui.metalsHost = h("div", { class: "dchart-host" }); ui.dollarHost = h("div", { class: "dchart-host" }); ui.ratioHost = h("div", { class: "dchart-host" });
    ui.dollarNote = h("p", { class: "small muted dnote2" });
    ui.eventsToggle = h("label", { class: "dtoggle" }, h("input", { type: "checkbox", id: "ev-toggle" }), h("span", { text: T("events_toggle") }));
    ui.eventsToggle.querySelector("input").addEventListener("change", function (e) { var n = {}; Object.keys(state).forEach(function (k) { n[k] = state[k]; }); n.e = e.target.checked ? "1" : "0"; setState(n); });
    var evFold = h("details", { class: "tableview" }, h("summary", { text: T("events_list") }), h("div", { class: "fold-body" },
      h("ol", { class: "eventlist" }, EVENTS.map(function (e) {
        return h("li", {}, h("span", { class: "evdate mono", text: CMA.monthShort(e.month + "-01") }), " ", h("b", { text: e.n + ". " + e.label + ". " }), e.description + " ",
          h("a", { href: e.url, target: "_blank", rel: "noopener noreferrer", text: T("event_source", { source: e.source_id }) }));
      }))));
    grid.appendChild(panel("p-price", "dp-price", "price_title", "price_hint", { id: "record", key: "record" },
      h("div", {}, h("div", { class: "dtools" }, ui.eventsToggle), ui.priceHost, tableFold("price"), evFold, h("p", { class: "dsrc" }, CMA.chip(["dash.series"])))));
    grid.appendChild(panel("p-metals", "dp-metals", "metals_title", "metals_hint", { id: "just-copper", key: "just" },
      h("div", {}, ui.metalsHost, tableFold("metals"), h("p", { class: "dsrc" }, CMA.chip(["dash.series"])))));
    grid.appendChild(panel("p-dollar", "dp-dollar", "dollar_title", "dollar_hint", { id: "dollar", key: "dollar" }, h("div", {}, ui.dollarHost, ui.dollarNote, tableFold("dollar"), h("p", { class: "dsrc" }, CMA.chip(["dash.series"])))));
    grid.appendChild(panel("p-ratio", "dp-ratio", "ratio_title", "ratio_hint", { id: "aluminium", key: "aluminium" }, h("div", {}, ui.ratioHost, tableFold("ratio"), h("p", { class: "dsrc" }, CMA.chip(["dash.series"])))));
    grid.appendChild(panel("p-supply", "dp-supply", "supply_title", "supply_hint", { id: "supply", key: "supply" }, supplyPanel()));
    grid.appendChild(panel("p-health", "dp-health", "health_title", null, null, healthPanel()));

    CMA.pageFoot(wrap, window.CMA_STRINGS.dashboard.sources.names, window.CMA_STRINGS.dashboard.sources.attribution);
    built = true;
    render(true);
  };

  function setState(next) {
    state = normalise(next);
    writeUrl();
    render(false);
  }

  function render(first) {
    var c = compute(state), cur = state.c, last = c.last;
    // controls
    Object.keys(ui.btns).forEach(function (g) { Object.keys(ui.btns[g]).forEach(function (o) { ui.btns[g][o].setAttribute("aria-pressed", state[g] === o ? "true" : "false"); }); });
    ui.btns.v.real.disabled = state.c === "eur";
    ui.noteReal.textContent = state.c === "eur" ? T("note_real") : "";
    var euroStart = startFor(state.p, col.cu_eur), usdStart = startFor(state.p, col.cu_usd);
    ui.noteEuro.textContent = state.c === "eur" && euroStart > usdStart ? T("note_euro") : "";
    ui.eventsToggle.querySelector("input").checked = state.e === "1";

    // KPI band
    var k = ui.kpi, cs = col[c.cc], uc = col[state.v === "real" ? "cu_real" : "cu_usd"], nMon = cur === "eur" ? K.eur_months_total : K.months_total;
    var recordIs = cur === "eur" ? K.eur_is_record === 1 : K.copper_is_nominal_record === 1;
    if (!recordIs) { throw new Error("the copper KPI sentence needs the latest month to be the highest as quoted"); }
    k.copper.label.textContent = T("kpi_copper_label", { month: monthLong(K.latest_month) });
    k.copper.figure.textContent = money(cur === "eur" ? K.copper_eur_t : K.copper_usd_t, cur);
    k.copper.ctx.textContent = T("kpi_copper_ctx", { n: nMon });
    k.change.label.textContent = T("kpi_change_label", { period: T("period_" + state.p) });
    k.change.figure.textContent = CMA.pctChange(c.snap.copper_change_pct);
    k.change.ctx.textContent = T("kpi_change_ctx", { month: monthLong(c.snap.start_month), currency: T("currency_" + cur + "_text"), prices: T("prices_" + state.v + "_text") });
    k.real.label.textContent = T("kpi_real_label");
    k.real.figure.textContent = CMA.n0(K.real_share_of_record_pct) + "%";
    k.real.ctx.textContent = T("kpi_real_ctx", { month: monthLong(K.real_peak_month) });
    k.ratio.label.textContent = T("kpi_ratio_label");
    k.ratio.figure.textContent = T("kpi_ratio_value", { ratio: CMA.f2(K.ratio_latest) });
    k.ratio.ctx.textContent = T("kpi_ratio_ctx");
    var dClamp = c.ds > c.su;
    k.dxy.label.textContent = dClamp ? T("kpi_dxy_label_since", { month: monthLong(months[c.ds]) }) : T("kpi_dxy_label", { period: T("period_" + state.p) });
    k.dxy.figure.textContent = CMA.pctChange(c.snap.dxy_change_pct);
    k.dxy.ctx.textContent = T("kpi_dxy_ctx");
    k.health.label.textContent = T("kpi_health_label");
    k.health.figure.textContent = String(ui.health.passed);
    k.health.ctx.textContent = T("kpi_health_ctx", { fail: ui.health.fail, warn: ui.health.warn });
    var n12 = Math.max(0, last - 11);
    [["copper", cs], ["change", cs], ["real", col.cu_real], ["ratio", col.ratio], ["dxy", col.dxy]].forEach(function (p) { k[p[0]].spark.textContent = ""; k[p[0]].spark.appendChild(spark(p[1].slice(n12))); });

    // charts
    var cfgs = { price: priceCfg(c), metals: metalsCfg(c), dollar: dollarCfg(c), ratio: ratioCfg(c) };
    var hosts = { price: ui.priceHost, metals: ui.metalsHost, dollar: ui.dollarHost, ratio: ui.ratioHost };
    Object.keys(cfgs).forEach(function (key) {
      if (charts[key]) { charts[key].update(cfgs[key]); } else { charts[key] = CMA.dashChart(hosts[key], cfgs[key]); }
    });
    ui.folds.forEach(function (f) { if (f.d.open) { f.body.textContent = ""; f.body.appendChild(tableFor(f.kind)); } });
    if (crossMonth) { setCross(crossMonth, keyboardMove); } else { renderReadout(); }
  }

  CMA.dash = {
    apply: function (qs) {
      var q = normalise(parseQuery(qs));
      if (!built) { state = q; return; }
      state = q; render(false);
    },
    snapshot: function () { var c = compute(state); return { state: JSON.parse(JSON.stringify(state)), snap: c.snap, months: months.length, kpis: K, health: ui.health }; },
    setState: function (o) { setState(o); },
    initialState: function (qs) { state = normalise(parseQuery(qs)); }
  };
})();
