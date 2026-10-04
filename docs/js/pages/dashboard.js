/* The Dashboard: the landing page, built to match design_reference/dashboard-study.html. A headline plate with the filters on it, a band of five key figures, six chart panels that each
   expand into a dialog. The header (brand, views, status line) and the slim footer belong to the app shell (app.js).
   The browser only filters, rebases and measures period changes and counts; every number it starts from comes from window.CMA_DATA (notebook 07 and the result tables).
   tools/parity_test.py compares CMA.dash.snapshot() with the Python table res_dash_changes. State lives in the hash: #dashboard?p=5y&c=usd&v=nominal&e=1. */
(function () {
  var CMA = window.CMA, h = CMA.h, svg = CMA.svg;
  var T = function (key, vars) { return CMA.t("dashboard." + key, vars); };

  var DEFAULTS = { p: "20y", c: "usd", v: "nominal", e: "1" };
  var VALID = { p: ["1y", "5y", "20y", "all"], c: ["usd", "eur"], v: ["nominal", "real"], e: ["0", "1"] };
  var MONTHS_BACK = { "1y": 12, "5y": 60, "20y": 240, "all": null };
  var METALS = [["cu", "metals_copper"], ["al", "metals_aluminium"], ["gold", "metals_gold"], ["tin", "metals_tin"], ["brent", "metals_brent"]];

  var DOLLAR_LIM = 12;                       // the beeswarm clips moves beyond plus or minus this many percent to the edge
  var months = [], col = {}, K = {}, state = { p: DEFAULTS.p, c: DEFAULTS.c, v: DEFAULTS.v, e: DEFAULTS.e };
  var SC = [], SUP = [], USE = [], FACT = {}, EVENTS = [], RC = {};
  var ui = {}, built = false, pageBus = null, dlg = null, dlgState = null;

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
    var D = CMA.rows(window.CMA_DATA.dash.series);
    months = D.map(function (r) { return r.month; });
    Object.keys(D[0]).forEach(function (k) { if (k !== "month") { col[k] = D.map(function (r) { return r[k]; }); } });
    CMA.rows(window.CMA_DATA.dash.kpis).forEach(function (r) { K[r.fact_id] = r.value; });
    CMA.rows(window.CMA_DATA.ratio.case).forEach(function (r) { RC[r.fact_id] = r.value; });
    SC = CMA.rows(window.CMA_DATA.dollar.scatter).map(function (r) { return { month: r.month.slice(0, 7), dx: r.dollar_pct, cu: r.copper_pct }; });
    SUP = CMA.rows(window.CMA_DATA.supply.refined);
    USE = CMA.rows(window.CMA_DATA.uses.end_use).sort(function (a, b) { return a.rank - b.rank; });
    CMA.rows(window.CMA_DATA.uses.facts).forEach(function (r) { FACT[r.fact_id] = r; });
    var ev = CMA.rows(window.CMA_DATA.chapters.events).sort(function (a, b) { return a.month < b.month ? -1 : 1; });
    EVENTS = ev.map(function (e, k) { return { n: k + 1, id: e.event_id, month: e.month, label: e.label, description: e.description, source_id: e.source_id, source_name: e.source_name, url: e.source_url }; });
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
    var usdCol = st.v === "real" ? "cu_real" : "cu_usd", su = startFor(st.p, col[usdCol]);       // the other panels do not depend on the currency
    var ds = Math.max(su, firstValid(col.dxy));
    var snap = { start_month: months[s], copper_change_pct: pct(cs[last], cs[s]), dxy_start_month: months[ds], dxy_change_pct: pct(col.dxy[last], col.dxy[ds]), ratio_start: col.ratio[su] };
    var w = SC.filter(function (r) { return r.month > months[ds]; }), up = w.filter(function (r) { return r.dx > 0; }), dn = w.filter(function (r) { return r.dx < 0; });
    snap.dollar_rose_n = up.length; snap.copper_fell_when_rose_n = up.filter(function (r) { return r.cu < 0; }).length;
    snap.dollar_fell_n = dn.length; snap.copper_rose_when_fell_n = dn.filter(function (r) { return r.cu > 0; }).length;
    snap.rec_latest = {};
    METALS.forEach(function (m) { snap.rec_latest[m[0]] = col[m[0] + "_rec_pct"][last]; });
    return { s: s, su: su, ds: ds, rs: startFor(st.p, col.cu_real), last: last, cc: cc, snap: snap, window: w };
  }

  // ------------------------------------------------------------ small helpers
  function money(v, cur) { return (cur === "eur" ? "€" : "$") + CMA.n0(v); }
  function monthLong(m) { return CMA.monthLong(m + "-01"); }
  function monthShort(m) { return CMA.monthShort(m + "-01"); }
  function signedPct(v) { return (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(1) + "%"; }
  function spark(host, values) {
    var pts = values.filter(function (v) { return v != null; }), W = Math.max(120, host.clientWidth || 160), H = 26;
    var lo = Math.min.apply(null, pts), hi = Math.max.apply(null, pts), k = 0, d = "";
    var X = function (i) { return 2 + i / (pts.length - 1) * (W - 8); }, Y = function (v) { return 3 + (1 - (v - lo) / ((hi - lo) || 1)) * (H - 6); };
    pts.forEach(function (v, i) { d += (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(v).toFixed(1); });
    var s = svg("svg", { class: "spark2", viewBox: "0 0 " + W + " " + H, height: H, "aria-hidden": "true", focusable: "false" });
    s.appendChild(svg("path", { d: d + "L" + X(pts.length - 1) + " " + H + "L" + X(0) + " " + H + "Z", fill: "var(--fill)" }));
    s.appendChild(svg("path", { d: d, fill: "none", stroke: "var(--copper)", "stroke-width": 1.5, "stroke-linejoin": "round" }));
    s.appendChild(svg("circle", { cx: X(pts.length - 1), cy: Y(pts[pts.length - 1]), r: 2.5, fill: "var(--copper)" }));
    host.textContent = ""; host.appendChild(s);
  }
  function segGroup(groupKey, options) {
    var lid = "fl-" + groupKey, btns = {};
    var row = h("div", { class: "fseg", "aria-labelledby": lid });
    options.forEach(function (o) {
      var b = h("button", { type: "button", "data-v": o, text: T(groupKey + "_" + o), "aria-pressed": "false" });
      b.addEventListener("click", function () { if (b.disabled) { return; } var n = {}; Object.keys(state).forEach(function (k) { n[k] = state[k]; }); n[groupKey] = o; setState(n); });
      row.appendChild(b); btns[o] = b;
    });
    return { el: h("div", { class: "fg" }, h("span", { id: lid, text: T(({ p: "period", c: "currency", v: "prices" })[groupKey] + "_label") }), row), btns: btns };
  }
  function yearsOf(from, to) {
    var out = [];
    for (var i = from; i <= to; i++) { var y = months[i].slice(0, 4); if (!out.length || out[out.length - 1].y !== y) { out.push({ y: y, i0: i, i1: i }); } else { out[out.length - 1].i1 = i; } }
    return out;
  }
  function avg(a, i0, i1) { var s = 0, n = 0; for (var i = i0; i <= i1; i++) { if (a[i] != null) { s += a[i]; n++; } } return n ? s / n : null; }

  // ------------------------------------------------------------ the synced crosshair: one bus per place (the page, the open dialog); each bus also refreshes its readouts
  function makeBus() {
    var b = { month: null, kb: false, charts: [], readouts: [], raf: 0 };
    function paint() {
      b.readouts.forEach(function (r) {
        r.el.textContent = "";
        r.fn(b.month).forEach(function (n) { r.el.appendChild(typeof n === "string" ? document.createTextNode(n) : n); });
        r.el.setAttribute("aria-live", b.kb ? "polite" : "off");
      });
    }
    b.paint = paint;
    b.set = function (month, kb) {
      b.month = month; b.kb = !!kb;
      b.charts.forEach(function (c) { c.setMonth(month); });
      if (!b.raf) { b.raf = requestAnimationFrame(function () { b.raf = 0; paint(); }); }
    };
    b.move = function (delta, list) {
      var i = b.month ? list.indexOf(b.month) : -1;
      if (i < 0) { i = list.length - 1; }          // the first key press starts at the latest month and moves from there
      b.set(list[Math.max(0, Math.min(list.length - 1, i + delta))], true);
    };
    b.add = function (c) { if (c && c.setMonth) { b.charts.push(c); } return c; };
    b.clearCharts = function () { b.charts = []; };
    return b;
  }
  // a readout: the month and one value; with no month it shows the latest month
  function roFn(valueOf) {
    return function (month) {
      var i = month ? months.indexOf(month) : months.length - 1, v = valueOf(i);
      return [monthShort(months[i]) + " ", h("b", { text: v == null ? T("readout_none") : v })];
    };
  }
  var RO = {
    price: roFn(function (i) { var v = col[copperCol(state)][i]; return v == null ? null : money(v, state.c); }),
    ratio: roFn(function (i) { var v = col.ratio[i]; return v == null ? null : CMA.f2(v) + "×"; })
  };
  function common(bus, ex) {
    return { onMonth: bus.set, onKey: bus.move, getMonth: function () { return bus.month; }, height: ex ? 430 : 290 };
  }

  // ------------------------------------------------------------ chart 1: the copper price
  function priceCfg(c, bus, ex) {
    var cs = col[c.cc], ms = months.slice(c.s), vals = cs.slice(c.s), unit = T("price_unit_" + state.c), cfg = common(bus, ex);
    var recIdx = 0; cs.forEach(function (v, i) { if (v != null && v > (cs[recIdx] == null ? -1 : cs[recIdx])) { recIdx = i; } });
    cfg.months = ms; cfg.series = [{ id: "cu", color: "--copper", values: vals, width: 2, area: true }]; cfg.yMin = 0; cfg.scale = "linear";
    cfg.yFormat = function (v) { return CMA.n0(v); }; cfg.marginRight = 22;
    var inWin = recIdx >= c.s, ri = recIdx - c.s;
    cfg.marks = inWin ? [{ series: "cu", i: ri, lines: [T("mark_record", { month: monthShort(months[recIdx]), value: money(cs[recIdx], state.c) })], side: ri > ms.length * 0.55 ? "left" : "right", up: state.e === "1" }] : [];
    cfg.endLabels = (inWin && ri === ms.length - 1) ? [] : [{ series: "cu", text: T("mark_latest", { value: money(cs[c.last], state.c) }), ink: "--ink" }];
    if (state.e === "1") {
      // the record has its own label on the chart, so an event in the record month (the new record as quoted) is not drawn again; the expanded view lists every event
      cfg.events = EVENTS.filter(function (e) { var i = months.indexOf(e.month); return i >= c.s && cs[i] != null && i !== recIdx; }).map(function (e) {
        return { i: months.indexOf(e.month) - c.s, label: window.CMA_STRINGS.dashboard.event_short[e.id] || e.label, tip: [monthLong(e.month), e.label, T("event_source", { source: e.source_name })] };
      });
    }
    cfg.aria = T("price_aria", { from: monthLong(ms[0]), to: monthLong(ms[ms.length - 1]), unit: unit, prices: T("prices_" + state.v + "_text") });
    return cfg;
  }
  function drawPrice(host, ex, bus, prev) {
    var cfg = priceCfg(compute(state), bus, ex);
    if (prev && prev.update) { prev.update(cfg); return prev; }
    return bus.add(CMA.dashChart(host, cfg));
  }

  // ------------------------------------------------------------ chart 3: the copper-to-aluminium ratio as dots and a 12-month average, with the break-even line
  function ratioCfg(c, bus, ex) {
    var ms = months.slice(c.su), cfg = common(bus, ex), be = K.breakeven_ratio, dots = col.ratio.slice(c.su), ma = col.ratio_ma12.slice(c.su);
    cfg.months = ms; cfg.series = [{ id: "ratio", color: "--copper", dots: true, values: dots, r: ex ? 2.4 : 1.8 }, { id: "ma", color: "--copper", values: ma, width: 2.2 }];
    cfg.yMin = 0; cfg.yFormat = function (v) { return CMA.n0(v) + "×"; }; cfg.marginRight = 52;
    cfg.refLines = [{ v: be, label: T("ratio_breakeven"), dashed: true, below: true, zones: [T("zone_top"), T("zone_bottom")] }];
    cfg.endLabels = [{ series: "ratio", text: CMA.f2(dots[dots.length - 1]) + "×", ink: "--ink" }];
    cfg.lineLabels = [{ series: "ma", text: T("ratio_avg"), ink: "--copper-text" }];
    cfg.aria = T("ratio_aria", { from: monthLong(ms[0]), to: monthLong(ms[ms.length - 1]), be: CMA.f2(be) });
    cfg.height = (ex ? 430 : 250) + (cfg.extra || 0);
    return cfg;
  }
  function drawRatio(host, ex, bus, prev, extra) {
    var cfg = ratioCfg(compute(state), bus, ex);
    cfg.height += extra || 0;
    if (prev && prev.update) { prev.update(cfg); return prev; }
    return bus.add(CMA.dashChart(host, cfg));
  }

  // ------------------------------------------------------------ chart 2: five small multiples on one scale (share of each metal's own record, today's money)
  function drawMetals(host, ex, bus) {
    var c = compute(state), last = c.last, a0 = c.rs, rows = METALS.map(function (m) {
      var a = col[m[0] + "_rec_pct"], peak = 0; a.forEach(function (v, i) { if (v != null && v > (a[peak] == null ? -1 : a[peak])) { peak = i; } });
      return { k: m[0], name: T(m[1]), a: a, v: a[last], peak: peak };
    }).sort(function (p, q) { return q.v - p.v; });
    if (rows.some(function (r) { return r.v >= 100; })) { throw new Error("the title says no metal is at its record, but the data says one is"); }
    host.textContent = "";
    var box = h("div", { class: "sm" });
    host.appendChild(box);
    var H = ex ? 84 : 46, w = Math.max(200, (host.clientWidth || 340) - 110), pl = 2, pr = 38, pt = 4, pb = 4, list = months.slice(a0);
    rows.forEach(function (r) {
      var line = h("div", { class: "sm-row" + (r.k === "cu" ? " cu" : "") });
      line.appendChild(h("span", { class: "sm-n" }, r.name, h("small", { text: T("metals_sub", { pct: CMA.n0(r.v), month: monthShort(months[r.peak]) }) })));
      var s = svg("svg", { class: "chart", viewBox: "0 0 " + w + " " + H, height: H, role: "img", tabindex: "0", "aria-label": T("metals_row_aria", { name: r.name, pct: CMA.n0(r.v), month: monthLong(months[r.peak]) }) });
      line.appendChild(s); box.appendChild(line);
      var X = function (i) { return pl + (i - a0) / Math.max(1, last - a0) * (w - pl - pr); }, Y = function (v) { return pt + (1 - v / 100) * (H - pt - pb); };
      s.appendChild(svg("line", { x1: pl, x2: w - pr, y1: Y(100), y2: Y(100), stroke: "var(--rule)", "stroke-dasharray": "3 3" }));
      s.appendChild(svg("line", { x1: pl, x2: w - pr, y1: Y(0), y2: Y(0), stroke: "var(--rule)" }));
      var d = ""; for (var i = a0; i <= last; i++) { if (r.a[i] != null) { d += (d ? "L" : "M") + X(i).toFixed(1) + " " + Y(r.a[i]).toFixed(1); } }
      var colr = r.k === "cu" ? "var(--copper)" : "var(--grey)";
      s.appendChild(svg("path", { d: d + "L" + X(last).toFixed(1) + " " + Y(0) + "L" + X(a0).toFixed(1) + " " + Y(0) + "Z", fill: colr, "fill-opacity": r.k === "cu" ? 0.16 : 0.12 }));
      s.appendChild(svg("path", { d: d, fill: "none", stroke: colr, "stroke-width": 1.4, "stroke-linejoin": "round" }));
      if (r.peak >= a0) { s.appendChild(svg("circle", { cx: X(r.peak), cy: Y(100), r: 2.6, fill: "var(--ink)" })); }
      s.appendChild(svg("circle", { cx: X(last), cy: Y(r.v), r: 3, fill: colr }));
      var t = svg("text", { x: X(last) + 6, y: Y(r.v) + 4, class: "lbl" }); t.textContent = CMA.n0(r.v) + "%"; s.appendChild(t);
      var xh = svg("line", { y1: pt, y2: H - pb, stroke: "var(--ink)", "stroke-width": 1, "stroke-dasharray": "2 2", visibility: "hidden", "pointer-events": "none" }); s.appendChild(xh);
      var hit = svg("rect", { x: pl, y: 0, width: w - pl - pr, height: H, fill: "transparent" }); s.appendChild(hit);
      hit.addEventListener("pointermove", function (e) {
        if (e.pointerType === "touch") { return; }
        var b = s.getBoundingClientRect(), x = (e.clientX - b.left) * (w / b.width);
        bus.set(months[Math.max(a0, Math.min(last, Math.round(a0 + (x - pl) / (w - pl - pr) * (last - a0))))], false);
      });
      hit.addEventListener("pointerleave", function (e) { if (e.pointerType !== "touch") { bus.set(null, false); } });
      s.addEventListener("keydown", function (e) {
        var dd = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
        if (e.key === "Escape") { bus.set(null, true); } else if (dd) { e.preventDefault(); bus.move(dd * (e.shiftKey ? 12 : 1), list); }
      });
      s.addEventListener("blur", function () { bus.set(null, true); });
      bus.add({ setMonth: function (m) {
        var k = m ? months.indexOf(m) : -1;
        if (k < a0 || k < 0) { xh.setAttribute("visibility", "hidden"); return; }
        xh.setAttribute("x1", X(k)); xh.setAttribute("x2", X(k)); xh.setAttribute("visibility", "visible");
      } });
    });
    box.appendChild(h("div", { class: "sm-row sm-axis" }, h("span"), h("span", { class: "ro" }, h("span", { text: monthShort(months[a0]) }), h("span", { text: T("metals_key") }), h("span", { text: monthShort(months[last]) }))));
    return { destroy: function () { } };
  }

  // ------------------------------------------------------------ chart 4: the dollar, one dot per month in two lanes
  function drawDollar(host, ex, bus, prev, extra) {
    var c = compute(state), s = c.snap, W = Math.max(260, host.clientWidth || 360), lane = (ex ? 150 : 96) + Math.round((extra || 0) / 2), top = 4, lab = 22, H = top + 2 * (lane + lab) + 22;
    host.textContent = "";
    var sv = svg("svg", { class: "chart", viewBox: "0 0 " + W + " " + H, height: H, role: "img", tabindex: "0",
      "aria-label": T("dollar_aria", { n: s.dollar_rose_n + s.dollar_fell_n, up: s.copper_fell_when_rose_n, upn: s.dollar_rose_n, dn: s.copper_rose_when_fell_n, dnn: s.dollar_fell_n }) });
    host.appendChild(sv);
    var lim = DOLLAR_LIM, X = function (v) { return 8 + (Math.max(-lim, Math.min(lim, v)) + lim) / (2 * lim) * (W - 16); }, r = ex ? 3.4 : 2.3;
    [[T("dollar_lane_up", { k: s.copper_fell_when_rose_n, n: s.dollar_rose_n }), c.window.filter(function (q) { return q.dx > 0; })],
      [T("dollar_lane_down", { k: s.copper_rose_when_fell_n, n: s.dollar_fell_n }), c.window.filter(function (q) { return q.dx < 0; })]].forEach(function (g, gi) {
      var y0 = top + gi * (lane + lab), cy = y0 + lab + lane / 2;
      var t = svg("text", { x: 0, y: y0 + 11, class: "lbl" }); t.textContent = g[0]; sv.appendChild(t);
      sv.appendChild(svg("line", { x1: X(0), x2: X(0), y1: y0 + lab, y2: y0 + lab + lane, stroke: "var(--rule)" }));
      var placed = [];
      g[1].slice().sort(function (p, q) { return Math.abs(p.cu) - Math.abs(q.cu); }).forEach(function (q) {
        var x = X(q.cu), dy = 0, k = 0;
        while (placed.some(function (p) { return Math.abs(p[0] - x) < 2 * r + 0.4 && Math.abs(p[1] - dy) < 2 * r + 0.4; }) && k < 120) { k++; dy = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (r * 1.05); }
        if (Math.abs(dy) > lane / 2 - r) { dy = (dy < 0 ? -1 : 1) * (lane / 2 - r); }
        placed.push([x, dy]);
        var dot = svg("circle", { cx: x.toFixed(1), cy: (cy + dy).toFixed(1), r: r, fill: q.cu >= 0 ? "var(--copper)" : "var(--verdigris)", "data-series": q.cu >= 0 ? "--copper" : "--verdigris", "fill-opacity": 0.85 });
        var ti = svg("title"); ti.textContent = T("dollar_dot", { month: monthLong(q.month), cu: CMA.pctChange(q.cu), dx: CMA.pctChange(q.dx) }); dot.appendChild(ti);
        sv.appendChild(dot);
      });
    });
    [-10, -5, 0, 5, 10].forEach(function (v) { var t = svg("text", { x: X(v), y: H - 6, "text-anchor": "middle" }); t.textContent = (v > 0 ? "+" : "") + v + "%"; sv.appendChild(t); });
    return { destroy: function () { } };
  }

  // ------------------------------------------------------------ chart 5: mined versus refined, a dumbbell per country
  function drawSupply(host, ex, bus, prev, extra) {
    var W = Math.max(260, host.clientWidth || 360), rowH = (ex ? 44 : 27) + Math.round((extra || 0) / SUP.length), top = 6, H = top + SUP.length * rowH + 20, nameW = ex ? 120 : 76, pr = ex ? 170 : 100, sc = 50;
    host.textContent = "";
    var sv = svg("svg", { class: "chart", viewBox: "0 0 " + W + " " + H, height: H, role: "img", tabindex: "0",
      "aria-label": T("supply_aria", { list: SUP.map(function (r) { return r.display_name + ": " + (r.mine_listed ? CMA.n1(r.mine_share_pct) + "%" : T("supply_none")) + ", " + CMA.n1(r.refinery_share_pct) + "%"; }).join("; ") }) });
    host.appendChild(sv);
    var X = function (v) { return nameW + (v / sc) * (W - nameW - pr); };
    [0, 10, 20, 30, 40, 50].forEach(function (v) {
      sv.appendChild(svg("line", { x1: X(v), x2: X(v), y1: top, y2: H - 18, stroke: "var(--rule)" }));
      var t = svg("text", { x: X(v), y: H - 5, "text-anchor": "middle" }); t.textContent = v + "%"; sv.appendChild(t);
    });
    SUP.forEach(function (r, i) {
      var y = top + i * rowH + rowH / 2, xr = X(r.refinery_share_pct), xm = r.mine_listed ? X(r.mine_share_pct) : null, rad = ex ? 6 : 5;
      var n = svg("text", { x: 0, y: y + 4, class: "lbl" }); n.textContent = r.display_name; sv.appendChild(n);
      if (r.mine_listed) {
        sv.appendChild(svg("line", { x1: Math.min(xm, xr), x2: Math.max(xm, xr), y1: y, y2: y, stroke: "var(--grey)", "stroke-width": 1.5 }));
        sv.appendChild(svg("circle", { cx: xm, cy: y, r: rad, fill: "var(--verdigris)", "data-series": "--verdigris" }));
      }
      sv.appendChild(svg("circle", { cx: xr, cy: y, r: rad, fill: "var(--copper)", "data-series": "--copper" }));
      var v = svg("text", { x: W, y: y + 3.5, "text-anchor": "end" });
      v.textContent = r.mine_listed ? CMA.n1(r.mine_share_pct) + "% / " + CMA.n1(r.refinery_share_pct) + "%" : T("supply_none") + " / " + CMA.n1(r.refinery_share_pct) + "%"; sv.appendChild(v);
      var ti = svg("title"); ti.textContent = r.display_name + ": " + (r.mine_listed ? CMA.n1(r.mine_share_pct) + "% " + T("supply_legend_mine").toLowerCase() : T("supply_none")) + ", " + CMA.n1(r.refinery_share_pct) + "% " + T("supply_legend_ref").toLowerCase(); sv.appendChild(ti);
    });
    return { destroy: function () { } };
  }

  // ------------------------------------------------------------ chart 6: the copper donut and the three facts
  function drawUses(host, ex, bus, prev, extra) {
    host.textContent = "";
    var year = USE[0].year, data = USE.map(function (r) { return { name: window.CMA_STRINGS.uses.sectors[r.sector], pct: r.share_pct }; });
    var left = h("div"), leg = h("ul", { class: "eu-leg" }), facts = h("div", { class: "facts" });
    host.appendChild(h("div", { class: "eu-wrap" }, h("div", {}, left, leg), facts));
    var ctl = CMA.donut(left, { data: data, idle: [String(year), T("donut_idle")], aria: T("donut_aria", { list: data.map(function (d) { return d.name + " " + d.pct + "%"; }).join(", "), year: year }), height: ex ? 440 : 340, legend: leg });
    [["F06", "fact_wire", CMA.n0(FACT.F06.value) + "%"], ["F01", "fact_china", CMA.n0(FACT.F01.value) + "%"], ["F02", "fact_recycled", T("fact_third")]].forEach(function (f) {
      var v = FACT[f[0]].value;
      facts.appendChild(h("div", { class: "fact" }, h("b", { text: f[2] }), h("span", { text: T(f[1]) }), h("i", { style: "--w:" + v + "%", role: "img", "aria-label": T("fact_aria", { text: T(f[1]), pct: CMA.n0(v) }) })));
    });
    return ctl;
  }

  // ------------------------------------------------------------ the numbers behind each chart (a real table; the same data the chart draws)
  function mkTable(head, rows) {
    return h("table", {}, h("thead", {}, h("tr", {}, head.map(function (x) { return h("th", { scope: "col", text: x }); }))),
      h("tbody", {}, rows.map(function (r) { return h("tr", {}, r.map(function (x) { return h("td", { text: x == null ? "" : String(x) }); })); })));
  }
  var TABLES = {
    price: function () {
      var c = compute(state), cs = col[c.cc];
      return mkTable([T("col_year"), T("col_months"), T("price_unit_" + state.c)], yearsOf(c.s, c.last).map(function (y) { return [y.y, y.i1 - y.i0 + 1, CMA.n0(avg(cs, y.i0, y.i1))]; }));
    },
    metals: function () {
      var c = compute(state);
      return mkTable([T("col_year")].concat(METALS.map(function (m) { return T(m[1]); })), yearsOf(c.rs, c.last).map(function (y) { return [y.y].concat(METALS.map(function (m) { return CMA.n0(avg(col[m[0] + "_rec_pct"], y.i0, y.i1)) + "%"; })); }));
    },
    ratio: function () {
      var c = compute(state);
      return mkTable([T("col_year"), T("col_months"), T("col_ratio_avg"), T("col_ratio_ma")], yearsOf(c.su, c.last).map(function (y) { return [y.y, y.i1 - y.i0 + 1, CMA.f2(avg(col.ratio, y.i0, y.i1)) + "×", col.ratio_ma12[y.i1] == null ? "" : CMA.f2(col.ratio_ma12[y.i1]) + "×"]; }));
    },
    dollar: function () {
      var s = compute(state).snap;
      return mkTable([T("col_lane"), T("col_months"), T("col_copper_opposite"), T("col_copper_same")],
        [[T("lane_up"), s.dollar_rose_n, s.copper_fell_when_rose_n, s.dollar_rose_n - s.copper_fell_when_rose_n], [T("lane_down"), s.dollar_fell_n, s.copper_rose_when_fell_n, s.dollar_fell_n - s.copper_rose_when_fell_n]]);
    },
    supply: function () {
      return mkTable([T("col_country"), T("col_mine"), T("col_refinery")], SUP.map(function (r) { return [r.display_name, r.mine_listed ? CMA.n1(r.mine_share_pct) + "%" : T("supply_none"), CMA.n1(r.refinery_share_pct) + "%"]; }));
    },
    uses: function () {
      return mkTable([T("col_sector"), T("col_share")], USE.map(function (r) { return [window.CMA_STRINGS.uses.sectors[r.sector], r.share_pct + "%"]; }));
    }
  };

  // ------------------------------------------------------------ panels
  var PANELS = [
    { key: "price", span: "s8", line: true, draw: drawPrice, why: { id: "record", key: "record" }, src: ["S02", "S16"], chip: ["dash.series"], foot: "foot_source_price", ro: "price" },
    { key: "metals", span: "s4", draw: drawMetals, why: { id: "just-copper", key: "just" }, src: ["S02", "S04"], chip: ["dash.series"], foot: "foot_source_metals", sync: true },
    { key: "ratio", span: "s4 third", line: true, draw: drawRatio, why: { id: "aluminium", key: "aluminium" }, src: ["S02", "S32"], chip: ["dash.series"], foot: "foot_source_ratio", ro: "ratio", fit: true },
    { key: "dollar", span: "s4 third", draw: drawDollar, why: { id: "dollar", key: "dollar" }, src: ["S02", "S17"], chip: ["story.guess_dollar", "dash.series"], foot: "foot_source_dollar", fit: true },
    { key: "supply", span: "s4 third", draw: drawSupply, why: { id: "supply", key: "supply" }, src: ["S06"], chip: ["supply.refined"], foot: "foot_source_supply", fit: true },
    { key: "uses", span: "wide", draw: drawUses, why: { id: "uses", key: "uses" }, src: ["S31"], chip: ["uses.end_use"], foot: "foot_source_uses" }
  ];
  function icon() {
    var s = svg("svg", { viewBox: "0 0 10 10", "aria-hidden": "true", focusable: "false" });
    s.appendChild(svg("path", { d: "M6 1h3v3M9 1 5.5 4.5M4 9H1V6M1 9l3.5-3.5" }));
    return s;
  }
  function srcFull(ids) {
    var names = window.CMA_STRINGS.dashboard.sources.names;
    return T("src_full", { names: ids.map(function (id) { return names[id]; }).join("; ") });
  }
  function panelTitle(p) { return p.key === "price" ? T(state.v === "real" && state.c !== "eur" ? "price_title_real" : "price_title_nominal") : T(p.key + "_title"); }
  // the subtitle of a panel, as nodes: some carry a legend (coloured dots), as in the study
  // each swatch carries the colour token of the series it names (tools/dashboard_test.py compares it with the colour the chart draws)
  function legend(a, ca, b, cb) {
    return h("span", { class: "legend" }, h("span", {}, h("i", { class: "sw", "data-series": ca, style: "background:var(" + ca + ")" }), a), h("span", {}, h("i", { class: "sw", "data-series": cb, style: "background:var(" + cb + ")" }), b));
  }
  function panelSub(p) {
    if (p.key === "price") {
      var c = compute(state), euroStart = state.c === "eur" && startFor(state.p, col.cu_eur) > startFor(state.p, col.cu_usd);
      return [T("price_sub", { unit: T("price_unit_" + state.c), change: CMA.pctChange(c.snap.copper_change_pct), month: monthShort(c.snap.start_month) }) +
        (state.c === "eur" && euroStart ? " " + T("price_sub_euro_start") : "") + (state.c === "eur" ? " " + T("price_sub_euro_real") : "")];
    }
    if (p.key === "ratio") { return [T("ratio_hint", { be: CMA.n1(K.breakeven_ratio), since: monthShort(String(RC.first_month_of_run)) })]; }
    if (p.key === "dollar") { return [T("dollar_hint_a") + " ", legend(T("legend_rose"), "--copper", T("legend_fell"), "--verdigris"), h("br"), T("dollar_hint_b", { lim: DOLLAR_LIM })]; }
    if (p.key === "supply") { return [legend(T("supply_legend_mine"), "--verdigris", T("supply_legend_ref"), "--copper")]; }
    return [T(p.key + "_hint")];
  }
  function fillSub(el, p) { el.textContent = ""; panelSub(p).forEach(function (n) { el.appendChild(typeof n === "string" ? document.createTextNode(n) : n); }); }
  function buildPanel(p) {
    var host = h("div", { class: "d2-host", "data-panel": p.key }), titleId = "dp-" + p.key;
    p.title = h("h2", { id: titleId }); p.subEl = h("p", { class: "sub" });
    var btn = h("button", { type: "button", class: "xb", "aria-haspopup": "dialog", "aria-label": T("expand_aria", { title: T(p.key === "price" ? "price_title_nominal" : p.key + "_title") }) }, h("span", { text: T("expand") }), icon());
    btn.addEventListener("click", function () { openDialog(p, btn); });
    var head = h("div", { class: "ph" }, p.title);
    if (p.ro) { p.roEl = h("span", { class: "ro", id: "ro-" + p.key }); head.appendChild(p.roEl); }
    head.appendChild(btn);
    var left = p.key === "price" ? ui.eventsToggle : h("span", { text: T(p.foot) });
    var why = h("a", { href: "#" + p.why.id, text: T("why", { n: CMA.CHAPTER_NO[p.why.key] }) });
    var sec = h("section", { class: "panel glass " + p.span + " p-" + p.key, "aria-labelledby": titleId }, head, p.subEl, host, h("div", { class: "pf" }, left, why));
    p.host = host; p.el = sec; p.btn = btn;
    return sec;
  }

  // ------------------------------------------------------------ the dialog: one native <dialog>, the same chart redrawn at the larger size
  function buildDialog() {
    var title = h("h2", { id: "dlg-t" }), ro = h("span", { class: "ro", id: "x-ro" }), close = h("button", { type: "button", class: "xb", id: "dlg-x", text: T("dlg_close") });
    var sub = h("p", { class: "sub" }), chart = h("div", { class: "dlg-chart", id: "dlg-b" }), tab = h("div", { class: "tw" }), evs = h("div", { class: "evlist", hidden: true });
    var det = h("details", { class: "dd", id: "dlg-d" }, h("summary", { text: T("dlg_numbers") }), tab), pf = h("div", { class: "pf" });
    var el = h("dialog", { id: "dlg", "aria-labelledby": "dlg-t", class: "glass" }, h("div", { class: "dh" }, title, ro, close), sub, chart, det, evs, pf);
    close.addEventListener("click", function () { el.close(); });
    el.addEventListener("click", function (e) { if (e.target === el) { el.close(); } });          // a click on the backdrop
    el.addEventListener("close", function () {
      if (!dlgState) { return; }
      if (dlgState.ctl && dlgState.ctl.destroy) { dlgState.ctl.destroy(); }
      var t = dlgState.trigger; dlgState = null; chart.textContent = "";
      document.documentElement.classList.remove("dlg-open");
      if (t) { t.focus(); }
    });
    window.addEventListener("resize", function () { if (dlgState && el.open) { redrawDialog(); } });
    dlg = { el: el, title: title, ro: ro, sub: sub, chart: chart, det: det, tab: tab, evs: evs, pf: pf };
    return el;
  }
  function redrawDialog() {
    if (dlgState.ctl && dlgState.ctl.destroy) { dlgState.ctl.destroy(); }
    dlg.chart.textContent = "";
    dlgState.bus.clearCharts();
    dlgState.ctl = dlgState.p.draw(dlg.chart, true, dlgState.bus, null, 0);
  }
  function openDialog(p, trigger) {
    var bus = makeBus();
    dlgState = { p: p, trigger: trigger, bus: bus, ctl: null };
    dlg.title.textContent = panelTitle(p); fillSub(dlg.sub, p);
    dlg.ro.textContent = "";
    if (p.ro) { bus.readouts.push({ el: dlg.ro, fn: RO[p.ro] }); bus.paint(); }
    dlg.det.open = false;
    dlg.tab.textContent = ""; dlg.tab.appendChild(TABLES[p.key]());
    dlg.evs.textContent = "";
    dlg.evs.hidden = p.key !== "price";
    if (p.key === "price") {
      dlg.evs.appendChild(h("details", { class: "dd" }, h("summary", { text: T("events_in_dialog") }), h("ol", { class: "eventlist" }, EVENTS.map(function (e) {
        return h("li", {}, h("span", { class: "evdate mono", text: monthShort(e.month) }), " ", h("b", { text: e.label + ". " }), e.description + " ",
          h("a", { href: e.url, target: "_blank", rel: "noopener noreferrer", text: T("event_source", { source: e.source_id }) }));
      }))));
    }
    dlg.pf.textContent = ""; dlg.pf.appendChild(h("span", {}, srcFull(p.src) + " ", CMA.chip(p.chip)));
    dlg.pf.appendChild(h("a", { href: "#" + p.why.id, text: T("why", { n: CMA.CHAPTER_NO[p.why.key] }), onclick: function () { dlg.el.close(); } }));
    document.documentElement.classList.add("dlg-open");
    dlg.el.showModal();
    redrawDialog();
  }

  // ------------------------------------------------------------ the page
  CMA.pages.dashboard = function (root) {
    prepare();
    root.textContent = "";
    var wrap = h("div", { class: "dash" });
    root.appendChild(wrap);
    // headline plate: the sentence is built from the data and the page stops if the data no longer supports it; the filters sit on the same plate
    var pctBelow = 100 - K.real_share_of_record_pct;
    if (K.copper_is_nominal_record !== 1 || !(pctBelow > 0)) { throw new Error("the headline needs a record as quoted and a price below the real record"); }
    var gP = segGroup("p", VALID.p), gC = segGroup("c", VALID.c), gV = segGroup("v", VALID.v);
    ui.btns = { p: gP.btns, c: gC.btns, v: gV.btns };
    wrap.appendChild(h("section", { class: "head glass", "aria-labelledby": "dashboard-title" },
      h("div", {},
        h("h1", { id: "dashboard-title", tabindex: "-1" }, h("em", { text: T("head_em") }), " " + T("head_rest", { price: money(K.copper_usd_t, "usd") })),
        h("p", { text: T("head_lede", { change: CMA.n0(K.copper_12m_change_pct), n: K.months_total, since: monthShort(months[0]), pct: CMA.n0(pctBelow), month: monthLong(K.real_peak_month) }) })),
      h("div", { class: "filters", role: "group", "aria-label": T("filter_aria") }, gP.el, gC.el, gV.el)));
    pageBus = makeBus();

    // the band of five key figures (as in the study: the latest month, not following the filters)
    var recordEur = K.eur_is_record === 1;
    if (!recordEur) { throw new Error("the euro key figure says the price is a record in euros, and it is not"); }
    var ago = months[months.length - 13], kp = {};
    var items = [
      { id: "cu", l: T("kpi_copper_label", { month: monthShort(K.latest_month) }), v: money(K.copper_usd_t, "usd"), u: "/t", c: [h("span", { class: "chip2 up", text: signedPct(K.copper_12m_change_pct) }), " " + T("kpi_vs", { month: monthShort(ago) })], s: col.cu_usd },
      { id: "eur", l: T("kpi_euro_label"), v: money(K.copper_eur_t, "eur"), u: "/t", c: [T("kpi_euro_ctx")], s: col.cu_eur },
      { id: "real", l: T("kpi_real_label"), v: CMA.n0(K.real_share_of_record_pct) + "%", c: [T("kpi_real_ctx", { month: monthShort(K.real_peak_month), rank: CMA.ordinal(K.real_rank_latest), n: K.real_months_valid })], s: col.cu_real },
      { id: "ratio", l: T("kpi_ratio_label"), v: T("kpi_ratio_value", { ratio: CMA.f2(K.ratio_latest) }), c: [T("kpi_ratio_ctx", { be: CMA.n1(K.breakeven_ratio) })], s: col.ratio },
      { id: "dxy", l: T("kpi_dxy_label"), v: CMA.n1(K.dxy_latest), c: [h("span", { class: "chip2", text: signedPct(K.dxy_12m_change_pct).replace("-", "−") }), " " + T("kpi_vs", { month: monthShort(ago) })], s: col.dxy }
    ];
    var band = h("section", { class: "kpis glass", "aria-label": T("kpi_aria", { month: monthLong(K.latest_month) }) });
    items.forEach(function (it) {
      var sp = h("div", { class: "kspark" });
      band.appendChild(h("div", { class: "kpi", "data-k": it.id }, h("div", { class: "k-l", text: it.l }), h("div", { class: "k-v num" }, it.v, it.u ? h("small", { text: it.u }) : null), h("div", { class: "k-c" }, it.c), sp));
      kp[it.id] = { host: sp, s: it.s };
    });
    ui.kpiSparks = kp;
    wrap.appendChild(band);

    // the six chart panels
    ui.eventsToggle = h("label", { class: "toggle" }, h("input", { type: "checkbox", id: "ev-toggle" }), h("span", { text: T("events_toggle") }));
    ui.eventsToggle.querySelector("input").addEventListener("change", function (e) { var n = {}; Object.keys(state).forEach(function (k) { n[k] = state[k]; }); n.e = e.target.checked ? "1" : "0"; setState(n); });
    var grid = h("div", { class: "grid" });
    wrap.appendChild(grid);
    PANELS.forEach(function (p) { grid.appendChild(buildPanel(p)); });
    ui.grid = grid;
    ui.btns.v.real.setAttribute("aria-describedby", "dsub-price");
    PANELS[0].subEl.id = "dsub-price";

    // the CSV of the current view goes into the slim footer
    var csv = h("button", { type: "button", class: "btn secondary small", text: T("link_download") });
    csv.addEventListener("click", downloadCsv);
    var slot = document.getElementById("foot-slot"); if (slot) { slot.appendChild(csv); }
    root.appendChild(buildDialog());
    built = true;
    render(true);
    if (document.fonts && document.fonts.ready) { document.fonts.ready.then(function () { if (!document.getElementById("dashboard").hidden) { fitRow(); sparks(); } }); }
    window.addEventListener("resize", function () { if (!document.getElementById("dashboard").hidden) { clearTimeout(ui.rt); ui.rt = setTimeout(function () { fitRow(); sparks(); }, 140); } });
  };

  // ------------------------------------------------------------ CSV of the current view (World Bank and FRED-derived series only)
  function downloadCsv() {
    var c = compute(state), L = [], q = function (x) { return /[",\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; };
    window.CMA_STRINGS.dashboard.csv_header.forEach(function (x) { L.push("# " + CMA.fill(x, { period: T("period_" + state.p), currency: state.c.toUpperCase(), prices: T("prices_" + state.v + "_text"), start: monthLong(months[c.s]), latest: monthLong(K.latest_month) })); });
    var sfx = state.v === "real" ? "_real" : "_usd";
    L.push(window.CMA_STRINGS.dashboard.csv_columns.join(","));
    for (var i = c.s; i <= c.last; i++) {
      var cu = col[c.cc][i], u = state.v === "real" ? "cu_real" : "cu_usd";
      var row = [months[i], cu == null ? "" : cu, col["al" + sfx][i], col["gold" + sfx][i], col["tin" + sfx][i], col["brent" + sfx][i],
        col[u][i] == null || col[u][c.su] == null || i < c.su ? "" : (100 * col[u][i] / col[u][c.su]).toFixed(2),
        col.dxy[i] == null ? "" : col.dxy[i], col.ratio[i], col.ratio_ma12[i] == null ? "" : col.ratio_ma12[i], col.cu_rec_pct[i] == null ? "" : col.cu_rec_pct[i]];
      L.push(row.map(function (x) { return x == null ? "" : q(String(x)); }).join(","));
    }
    var blob = new Blob([L.join("\n") + "\n"], { type: "text/csv;charset=utf-8" }), a = h("a", { href: URL.createObjectURL(blob), download: "copper-dashboard-" + state.p + "-" + state.c + "-" + state.v + ".csv" });
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  function setState(next) {
    state = normalise(next);
    writeUrl();
    render(false);
  }
  function sparks() {
    var last = months.length - 1, n12 = Math.max(0, last - 12);
    Object.keys(ui.kpiSparks).forEach(function (k) { spark(ui.kpiSparks[k].host, ui.kpiSparks[k].s.slice(n12)); });
  }

  // row 2: the three panels have the same height and their content starts at the top; the shorter charts grow instead of leaving empty space inside the panel
  function fitRow() {
    var row = PANELS.filter(function (p) { return p.fit; });
    var wide = row.length && row[0].el.offsetWidth < (ui.grid.clientWidth * 0.5) && window.matchMedia("(min-width: 1101px)").matches;
    row.forEach(function (p) { p.extra = 0; });
    if (!wide) { row.forEach(function (p) { p.ctl = redraw(p, 0); }); return; }
    row.forEach(function (p) { p.ctl = redraw(p, 0); });
    var gap = row.map(function (p) { var pf = p.el.querySelector(".pf"); return pf.offsetTop - (p.host.offsetTop + p.host.offsetHeight); });
    row.forEach(function (p, i) { if (gap[i] > 4) { p.extra = gap[i] - 2; p.ctl = redraw(p, p.extra); } });
    for (var pass = 0; pass < 3; pass++) {          // rounding in the redraw can leave a few pixels: measure again and grow what is still short
      var again = false;
      row.forEach(function (p) {
        var pf = p.el.querySelector(".pf"), g = pf.offsetTop - (p.host.offsetTop + p.host.offsetHeight);
        if (g > 6) { p.extra = (p.extra || 0) + g - 2; p.ctl = redraw(p, p.extra); again = true; }
      });
      if (!again) { break; }
    }
  }
  function redraw(p, extra) {
    if (p.line && p.ctl) { if (pageBus.charts.indexOf(p.ctl) < 0) { pageBus.add(p.ctl); } return p.draw(p.host, false, pageBus, p.ctl, extra); }
    if (p.ctl && p.ctl.destroy) { p.ctl.destroy(); }
    return p.draw(p.host, false, pageBus, null, extra);
  }

  function render(first) {
    var c = compute(state);
    Object.keys(ui.btns).forEach(function (g) { Object.keys(ui.btns[g]).forEach(function (o) { ui.btns[g][o].setAttribute("aria-pressed", state[g] === o ? "true" : "false"); }); });
    ui.btns.v.real.disabled = state.c === "eur";
    ui.eventsToggle.querySelector("input").checked = state.e === "1";
    PANELS.forEach(function (p) { p.title.textContent = panelTitle(p); fillSub(p.subEl, p); });
    pageBus.clearCharts();
    pageBus.readouts = PANELS.filter(function (p) { return p.roEl; }).map(function (p) { return { el: p.roEl, fn: RO[p.ro] }; });
    PANELS.forEach(function (p) {
      if (p.line) {
        if (p.ctl) { pageBus.add(p.ctl); }
        p.ctl = p.draw(p.host, false, pageBus, p.ctl, 0);
      } else {
        if (p.ctl && p.ctl.destroy) { p.ctl.destroy(); }
        p.ctl = p.draw(p.host, false, pageBus, null, 0);
        if (!first && !CMA.reduce) { p.host.classList.remove("d2-fade"); void p.host.offsetWidth; p.host.classList.add("d2-fade"); }
      }
    });
    sparks();
    fitRow();
    pageBus.paint();
    if (pageBus.month) { pageBus.set(pageBus.month, pageBus.kb); }
  }

  CMA.dash = {
    apply: function (qs) { state = normalise(parseQuery(qs)); if (built) { render(false); } },
    snapshot: function () { var c = compute(state); return { state: JSON.parse(JSON.stringify(state)), snap: c.snap, months: months.length, kpis: K }; },
    setState: function (o) { setState(o); },
    initialState: function (qs) { state = normalise(parseQuery(qs)); }
  };
})();
