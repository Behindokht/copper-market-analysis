/* The Dashboard: the landing page. Glass plates over a photo background (a CSS variable; plain paper when the file is missing), a headline plate, a sticky filter bar,
   a KPI band, six chart panels that each expand into a dialog, and a footer plate.
   The browser only filters, rebases and measures period changes and counts; every number it starts from comes from window.CMA_DATA (notebook 07 and the result tables).
   tools/parity_test.py compares CMA.dash.snapshot() with the Python table res_dash_changes. State lives in the hash: #dashboard?p=5y&c=usd&v=nominal&e=1. */
(function () {
  var CMA = window.CMA, h = CMA.h, svg = CMA.svg;
  var T = function (key, vars) { return CMA.t("dashboard." + key, vars); };

  var DEFAULTS = { p: "20y", c: "usd", v: "nominal", e: "0" };
  var VALID = { p: ["1y", "5y", "20y", "all"], c: ["usd", "eur"], v: ["nominal", "real"], e: ["0", "1"] };
  var MONTHS_BACK = { "1y": 12, "5y": 60, "20y": 240, "all": null };
  var METALS = [["cu", "metals_copper"], ["al", "metals_aluminium"], ["gold", "metals_gold"], ["tin", "metals_tin"], ["brent", "metals_brent"]];

  var months = [], col = {}, K = {}, state = { p: DEFAULTS.p, c: DEFAULTS.c, v: DEFAULTS.v, e: DEFAULTS.e };
  var SC = [], SUP = [], USE = [], FACT = {}, EVENTS = [], UFIG = {};
  var ui = { folds: [] }, built = false, pageBus = null, dlg = null, dlgState = null;

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
    CMA.rows(window.CMA_DATA.uses.figures).forEach(function (r) { UFIG[r.fact_id] = r.value; });
    SC = CMA.rows(window.CMA_DATA.dollar.scatter).map(function (r) { return { month: r.month.slice(0, 7), dx: r.dollar_pct, cu: r.copper_pct }; });
    SUP = CMA.rows(window.CMA_DATA.supply.refined);
    USE = CMA.rows(window.CMA_DATA.uses.end_use).sort(function (a, b) { return a.rank - b.rank; });
    CMA.rows(window.CMA_DATA.uses.facts).forEach(function (r) { FACT[r.fact_id] = r; });
    var ev = CMA.rows(window.CMA_DATA.chapters.events).sort(function (a, b) { return a.month < b.month ? -1 : 1; });
    EVENTS = ev.map(function (e, k) { return { n: k + 1, month: e.month, label: e.label, description: e.description, source_id: e.source_id, source_name: e.source_name, url: e.source_url }; });
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
  function segGroup(groupKey, options, labelKey) {
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
  function yearsOf(from, to) {
    var out = [];
    for (var i = from; i <= to; i++) { var y = months[i].slice(0, 4); if (!out.length || out[out.length - 1].y !== y) { out.push({ y: y, i0: i, i1: i }); } else { out[out.length - 1].i1 = i; } }
    return out;
  }
  function avg(a, i0, i1) { var s = 0, n = 0; for (var i = i0; i <= i1; i++) { if (a[i] != null) { s += a[i]; n++; } } return n ? s / n : null; }

  // ------------------------------------------------------------ the synced crosshair: one bus per place (the page, the open dialog)
  function makeBus(readoutEl) {
    var b = { month: null, kb: false, charts: [], raf: 0 };
    b.set = function (month, kb) {
      b.month = month; b.kb = !!kb;
      b.charts.forEach(function (c) { c.setMonth(month); });
      if (!b.raf) { b.raf = requestAnimationFrame(function () { b.raf = 0; renderReadout(readoutEl, b); }); }
    };
    b.move = function (delta, list) {
      var i = b.month ? list.indexOf(b.month) : -1;
      if (i < 0) { i = delta < 0 ? list.length - 1 : 0; if (Math.abs(delta) === 1 || Math.abs(delta) === 12) { delta = 0; } }
      b.set(list[Math.max(0, Math.min(list.length - 1, i + delta))], true);
    };
    b.add = function (c) { if (c && c.setMonth) { b.charts.push(c); } return c; };
    b.clearCharts = function () { b.charts = []; };
    return b;
  }
  function renderReadout(el, bus) {
    if (!el) { return; }
    el.setAttribute("aria-live", bus.kb ? "polite" : "off");
    if (!bus.month) { el.textContent = T("readout_idle"); el.classList.add("idle"); return; }
    el.classList.remove("idle");
    var i = months.indexOf(bus.month), c = compute(state), na = T("readout_none"), v = col[c.cc][i];
    var parts = [h("b", { text: monthLong(bus.month) }), T("readout_copper", { value: v == null ? na : money(v, state.c) }),
      T("readout_record", { value: col.cu_rec_pct[i] == null ? na : CMA.n0(col.cu_rec_pct[i]) }),
      T("readout_ratio", { value: col.ratio[i] == null ? na : CMA.f2(col.ratio[i]) })];
    el.textContent = "";
    parts.forEach(function (p, k) { if (k) { el.appendChild(h("span", { class: "sep", "aria-hidden": "true", text: " · " })); } el.appendChild(typeof p === "string" ? document.createTextNode(p) : p); });
  }
  function common(bus, ex) {
    return { onMonth: bus.set, onKey: bus.move, getMonth: function () { return bus.month; }, height: ex ? 430 : 340 };
  }

  // ------------------------------------------------------------ chart 1: the copper price
  function priceCfg(c, bus, ex) {
    var cs = col[c.cc], ms = months.slice(c.s), vals = cs.slice(c.s), unit = T("price_unit_" + state.c), cfg = common(bus, ex);
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
  function drawPrice(host, ex, bus, prev) {
    var cfg = priceCfg(compute(state), bus, ex);
    if (prev && prev.update) { prev.update(cfg); return prev; }
    var ctl = CMA.dashChart(host, cfg);
    bus.add(ctl);
    return ctl;
  }

  // ------------------------------------------------------------ chart 3: the copper-to-aluminium ratio as dots and a 12-month average, with the break-even line
  function ratioCfg(c, bus, ex) {
    var ms = months.slice(c.su), cfg = common(bus, ex), be = K.breakeven_ratio, ma = col.ratio_ma12.slice(c.su);
    cfg.months = ms; cfg.series = [{ id: "ratio", color: "--copper", dots: true, values: col.ratio.slice(c.su), r: ex ? 2.4 : 1.8 }, { id: "ma", color: "--copper", values: ma, width: 2.2 }];
    cfg.yMin = 0; cfg.yFormat = function (v) { return CMA.n0(v); }; cfg.marginRight = 40;
    cfg.refLines = [{ v: be, label: T("ratio_breakeven"), dashed: true }];
    cfg.endLabels = [{ series: "ma", text: CMA.f2(ma[ma.length - 1]), ink: "--ink" }];
    cfg.aria = T("ratio_aria", { from: monthLong(ms[0]), to: monthLong(ms[ms.length - 1]), be: CMA.f2(be) });
    cfg.height = ex ? 430 : 270;
    return cfg;
  }
  function drawRatio(host, ex, bus, prev) {
    var cfg = ratioCfg(compute(state), bus, ex);
    if (prev && prev.update) { prev.update(cfg); return prev; }
    var ctl = CMA.dashChart(host, cfg);
    bus.add(ctl);
    return ctl;
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
    var H = ex ? 84 : 46, w = Math.max(200, (host.clientWidth || 340) - 96), pl = 2, pr = 38, pt = 4, pb = 4, list = months.slice(a0);
    rows.forEach(function (r) {
      var line = h("div", { class: "sm-row" + (r.k === "cu" ? " cu" : "") });
      line.appendChild(h("span", { class: "sm-n" }, r.name, h("small", { text: T("metals_sub", { pct: CMA.n0(r.v), month: CMA.monthShort(months[r.peak] + "-01") }) })));
      var s = svg("svg", { class: "chart", viewBox: "0 0 " + w + " " + H, height: H, role: "img", tabindex: "0", "aria-label": T("metals_row_aria", { name: r.name, pct: CMA.n0(r.v), month: monthLong(months[r.peak]) }) });
      line.appendChild(s); box.appendChild(line);
      var X = function (i) { return pl + (i - a0) / Math.max(1, last - a0) * (w - pl - pr); }, Y = function (v) { return pt + (1 - v / 100) * (H - pt - pb); };
      s.appendChild(svg("line", { x1: pl, x2: w - pr, y1: Y(100), y2: Y(100), stroke: "var(--rule)", "stroke-dasharray": "3 3" }));
      s.appendChild(svg("line", { x1: pl, x2: w - pr, y1: Y(0), y2: Y(0), stroke: "var(--rule)" }));
      var d = ""; for (var i = a0; i <= last; i++) { if (r.a[i] != null) { d += (d ? "L" : "M") + X(i).toFixed(1) + " " + Y(r.a[i]).toFixed(1); } }
      var colr = r.k === "cu" ? "var(--copper)" : "var(--grey)";
      s.appendChild(svg("path", { d: d + "L" + X(last).toFixed(1) + " " + Y(0) + "L" + X(a0).toFixed(1) + " " + Y(0) + "Z", fill: colr, "fill-opacity": r.k === "cu" ? 0.16 : 0.12 }));
      s.appendChild(svg("path", { d: d, fill: "none", stroke: colr, "stroke-width": 1.5, "stroke-linejoin": "round" }));
      if (r.peak >= a0) { s.appendChild(svg("circle", { cx: X(r.peak), cy: Y(100), r: 2.8, fill: "var(--ink)" })); }
      s.appendChild(svg("circle", { cx: X(last), cy: Y(r.v), r: 3.2, fill: colr }));
      var t = svg("text", { x: X(last) + 6, y: Y(r.v) + 4, class: "lbl" }); t.textContent = CMA.n0(r.v) + "%"; s.appendChild(t);
      var xh = svg("line", { y1: pt, y2: H - pb, stroke: "var(--ink)", "stroke-width": 1, visibility: "hidden", "pointer-events": "none" }); s.appendChild(xh);
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
    box.appendChild(h("div", { class: "sm-row sm-axis" }, h("span"), h("span", { class: "ro" }, h("span", { text: monthLong(months[a0]) }), h("span", { text: T("metals_key") }), h("span", { text: monthLong(months[last]) }))));
    return { destroy: function () { } };
  }

  // ------------------------------------------------------------ chart 4: the dollar, one dot per month in two lanes
  function drawDollar(host, ex) {
    var c = compute(state), s = c.snap, W = Math.max(260, host.clientWidth || 360), lane = ex ? 150 : 96, top = 4, lab = 22, H = top + 2 * (lane + lab) + 26;
    host.textContent = "";
    var sv = svg("svg", { class: "chart", viewBox: "0 0 " + W + " " + H, height: H, role: "img", tabindex: "0",
      "aria-label": T("dollar_aria", { n: s.dollar_rose_n + s.dollar_fell_n, up: s.copper_fell_when_rose_n, upn: s.dollar_rose_n, dn: s.copper_rose_when_fell_n, dnn: s.dollar_fell_n }) });
    host.appendChild(sv);
    var lim = 12, X = function (v) { return 8 + (Math.max(-lim, Math.min(lim, v)) + lim) / (2 * lim) * (W - 16); }, r = ex ? 3.4 : 2.4;
    [[T("dollar_lane_up", { k: s.copper_fell_when_rose_n, n: s.dollar_rose_n }), c.window.filter(function (q) { return q.dx > 0; })],
      [T("dollar_lane_down", { k: s.copper_rose_when_fell_n, n: s.dollar_fell_n }), c.window.filter(function (q) { return q.dx < 0; })]].forEach(function (g, gi) {
      var y0 = top + gi * (lane + lab), cy = y0 + lab + lane / 2;
      var t = svg("text", { x: 0, y: y0 + 12, class: "lbl" }); t.textContent = g[0]; sv.appendChild(t);
      sv.appendChild(svg("line", { x1: X(0), x2: X(0), y1: y0 + lab, y2: y0 + lab + lane, stroke: "var(--rule)" }));
      var placed = [];
      g[1].slice().sort(function (p, q) { return p.cu - q.cu; }).forEach(function (q) {
        var x = X(q.cu), dy = 0, k = 0;
        while (placed.some(function (p) { return Math.hypot(p[0] - x, p[1] - (cy + dy)) < 2 * r + 0.6; }) && k < 80) { k++; dy = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (r * 1.05); }
        dy = Math.max(-lane / 2 + r, Math.min(lane / 2 - r, dy));
        placed.push([x, cy + dy]);
        var dot = svg("circle", { cx: x.toFixed(1), cy: (cy + dy).toFixed(1), r: r, fill: q.cu > 0 ? "var(--copper)" : "var(--verdigris)", "fill-opacity": 0.82 });
        var ti = svg("title"); ti.textContent = T("dollar_dot", { month: monthLong(q.month), cu: CMA.pctChange(q.cu), dx: CMA.pctChange(q.dx) }); dot.appendChild(ti);
        sv.appendChild(dot);
      });
    });
    var ay = top + 2 * (lane + lab) + 8;
    [-10, -5, 0, 5, 10].forEach(function (v) { var t = svg("text", { x: X(v), y: ay + 10, "text-anchor": "middle" }); t.textContent = (v > 0 ? "+" : "") + v + "%"; sv.appendChild(t); });
    return { destroy: function () { } };
  }

  // ------------------------------------------------------------ chart 5: mined versus refined, a dumbbell per country
  function drawSupply(host, ex) {
    var W = Math.max(260, host.clientWidth || 360), rowH = ex ? 44 : 29, top = 22, H = top + SUP.length * rowH + 22, nameW = ex ? 120 : 92, pr = ex ? 170 : 92, sc = 50;
    host.textContent = "";
    var sv = svg("svg", { class: "chart", viewBox: "0 0 " + W + " " + H, height: H, role: "img", tabindex: "0",
      "aria-label": T("supply_aria", { list: SUP.map(function (r) { return r.display_name + ": " + (r.mine_listed ? CMA.n1(r.mine_share_pct) + "%" : T("supply_none")) + ", " + CMA.n1(r.refinery_share_pct) + "%"; }).join("; ") }) });
    host.appendChild(sv);
    var X = function (v) { return nameW + (v / sc) * (W - nameW - pr); };
    var head = svg("text", { x: W - 2, y: 11, "text-anchor": "end" }); head.textContent = T("supply_cols"); sv.appendChild(head);
    [0, 10, 20, 30, 40, 50].forEach(function (v) {
      sv.appendChild(svg("line", { x1: X(v), x2: X(v), y1: top - 4, y2: H - 20, stroke: "var(--rule)" }));
      var t = svg("text", { x: X(v), y: H - 6, "text-anchor": "middle" }); t.textContent = v + "%"; sv.appendChild(t);
    });
    SUP.forEach(function (r, i) {
      var y = top + i * rowH + rowH / 2, xr = X(r.refinery_share_pct), xm = r.mine_listed ? X(r.mine_share_pct) : null, rad = ex ? 6 : 4.6;
      var n = svg("text", { x: 0, y: y + 4, class: "lbl" }); n.textContent = r.display_name; sv.appendChild(n);
      if (r.mine_listed) {
        sv.appendChild(svg("line", { x1: Math.min(xm, xr), x2: Math.max(xm, xr), y1: y, y2: y, stroke: "var(--muted)", "stroke-width": 2 }));
        sv.appendChild(svg("circle", { cx: xm, cy: y, r: rad, fill: "var(--verdigris)" }));
      }
      sv.appendChild(svg("circle", { cx: xr, cy: y, r: rad, fill: "var(--copper)" }));
      var v = svg("text", { x: W - 2, y: y + 4, "text-anchor": "end", class: "lbl" });
      v.textContent = (r.mine_listed ? CMA.n1(r.mine_share_pct) + "%" : T("supply_na")) + " / " + CMA.n1(r.refinery_share_pct) + "%"; sv.appendChild(v);
      if (!r.mine_listed) { var tn = svg("text", { x: xr + rad + 6, y: y + 4 }); tn.textContent = T("supply_none"); sv.appendChild(tn); }
    });
    return { destroy: function () { } };
  }

  // ------------------------------------------------------------ chart 6: the copper donut and the three facts
  function drawUses(host, ex) {
    host.textContent = "";
    var year = USE[0].year, other = USE.map(function (r) { return r.sector; }).indexOf("Other");
    var data = USE.map(function (r) { return { name: window.CMA_STRINGS.uses.sectors[r.sector], pct: r.share_pct }; });
    var left = h("div", { class: "d2-donut" }), list = h("div", { class: "d2-donut-list" }), right = h("div", { class: "d2-facts" });
    host.appendChild(h("div", { class: "d2-uses" }, h("div", {}, left, list), right));
    var ctl = CMA.donut(left, { data: data, other: other, year: year, idle: [String(year), T("donut_idle")], aria: T("donut_aria", { list: data.map(function (d) { return d.name + " " + d.pct + "%"; }).join(", "), year: year }), expanded: ex, listHost: list });
    [["F06", "fact_wire"], ["F01", "fact_china"], ["F02", "fact_recycled"]].forEach(function (f) {
      var v = FACT[f[0]].value;
      right.appendChild(h("div", { class: "d2-fact" }, h("p", { class: "d2-fig num" }, f[0] === "F02" ? T("fact_third") : CMA.n0(v) + "%"), h("p", { class: "d2-fact-t", text: T(f[1]) }),
        h("div", { class: "d2-track", role: "img", "aria-label": T("fact_aria", { text: T(f[1]), pct: CMA.n0(v) }) }, h("span", { style: "width:" + v + "%" })),
        h("p", { class: "small muted", text: T("fact_src", { id: FACT[f[0]].source_id }) })));
    });
    return ctl;
  }

  // ------------------------------------------------------------ the numbers behind each chart (a real table; the same data the chart draws)
  function mkTable(head, rows) {
    return h("div", { class: "tablewrap tall" }, h("table", {}, h("thead", {}, h("tr", {}, head.map(function (x) { return h("th", { scope: "col", text: x }); }))),
      h("tbody", {}, rows.map(function (r) { return h("tr", {}, r.map(function (x) { return h("td", { text: x == null ? "" : String(x) }); })); }))));
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
      return mkTable([T("col_year"), T("col_months"), T("col_ratio_avg"), T("col_ratio_ma")], yearsOf(c.su, c.last).map(function (y) { return [y.y, y.i1 - y.i0 + 1, CMA.f2(avg(col.ratio, y.i0, y.i1)), col.ratio_ma12[y.i1] == null ? "" : CMA.f2(col.ratio_ma12[y.i1])]; }));
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
    { key: "price", span: "s8", line: true, draw: drawPrice, why: { id: "record", key: "record" }, src: ["S02", "S16"], tools: true },
    { key: "metals", span: "s4", draw: drawMetals, why: { id: "just-copper", key: "just" }, src: ["S02", "S04"], line: false, sync: true },
    { key: "ratio", span: "s4", line: true, draw: drawRatio, why: { id: "aluminium", key: "aluminium" }, src: ["S02", "S32"] },
    { key: "dollar", span: "s4", draw: drawDollar, why: { id: "dollar", key: "dollar" }, src: ["S02", "S17"] },
    { key: "supply", span: "s4", draw: drawSupply, why: { id: "supply", key: "supply" }, src: ["S06"] },
    { key: "uses", span: "s12", draw: drawUses, why: { id: "uses", key: "uses" }, src: ["S31"] }
  ];
  function icon() {
    var s = svg("svg", { viewBox: "0 0 12 12", width: 11, height: 11, "aria-hidden": "true", focusable: "false" });
    s.appendChild(svg("path", { d: "M7.2 1.2h3.6v3.6M10.8 1.2 6.9 5.1M4.8 10.8H1.2V7.2M1.2 10.8l3.9-3.9", fill: "none", stroke: "currentColor", "stroke-width": 1.2 }));
    return s;
  }
  function srcLine(ids) {
    var names = window.CMA_STRINGS.dashboard.sources.names;
    return T("src_line", { names: ids.map(function (id) { return names[id]; }).join("; ") });
  }
  function buildPanel(p) {
    var host = h("div", { class: "d2-host", "data-panel": p.key }), titleId = "dp-" + p.key;
    var btn = h("button", { type: "button", class: "d2-expand mono", "aria-haspopup": "dialog", "aria-label": T("expand_aria", { title: T(p.key + "_title") }) }, icon(), h("span", { text: T("expand") }));
    btn.addEventListener("click", function () { openDialog(p, btn); });
    var why = h("a", { class: "why", href: "#" + p.why.id, text: T("why", { n: CMA.CHAPTER_NO[p.why.key] }) });
    var fold = h("details", { class: "tableview" }, h("summary", { text: T("table_summary") })), body = h("div", { class: "fold-body" });
    fold.appendChild(body);
    fold.addEventListener("toggle", function () { if (fold.open) { body.textContent = ""; body.appendChild(TABLES[p.key]()); } });
    ui.folds.push({ d: fold, body: body, key: p.key });
    var tools = p.tools ? h("div", { class: "dtools" }, ui.eventsToggle) : null;
    var sec = h("section", { class: "plate d2-panel " + p.span + " p-" + p.key, "aria-labelledby": titleId },
      h("header", { class: "dhead" }, h("h2", { id: titleId, text: T(p.key + "_title") }), h("span", { class: "d2-acts" }, why, btn)),
      h("p", { class: "dhint", text: T(p.key + "_hint") }), tools, host, fold, h("p", { class: "dsrc" }, srcLine(p.src), " ", CMA.chip(["dash.series"])));
    p.host = host; p.el = sec; p.btn = btn;
    return sec;
  }

  // ------------------------------------------------------------ the dialog: one native <dialog>, the same chart redrawn at the larger size
  function buildDialog() {
    var title = h("h2", { id: "dlg-title", class: "dlg-title" }), sub = h("p", { class: "dhint dlg-sub" }), ro = h("p", { class: "dreadout idle dlg-readout", hidden: true }),
      chart = h("div", { class: "dlg-chart" }), tbl = h("details", { class: "tableview dlg-table" }, h("summary", { text: T("dlg_numbers") })), tbody = h("div", { class: "fold-body" }),
      src = h("p", { class: "dsrc dlg-src" }), close = h("button", { type: "button", class: "btn secondary small dlg-close", text: T("dlg_close") });
    tbl.appendChild(tbody);
    var el = h("dialog", { class: "plate d2-dialog", "aria-labelledby": "dlg-title" }, h("div", { class: "dlg-in" }, h("div", { class: "dlg-head" }, title, close), sub, ro, chart, tbl, src));
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
    dlg = { el: el, title: title, sub: sub, ro: ro, chart: chart, tbl: tbl, tbody: tbody, src: src };
    return el;
  }
  function redrawDialog() {
    if (dlgState.ctl && dlgState.ctl.destroy) { dlgState.ctl.destroy(); }
    dlg.chart.textContent = "";
    dlgState.bus.clearCharts();
    dlgState.ctl = dlgState.p.draw(dlg.chart, true, dlgState.bus, null);
  }
  function openDialog(p, trigger) {
    var bus = makeBus(dlg.ro);
    dlgState = { p: p, trigger: trigger, bus: bus, ctl: null };
    dlg.title.textContent = T(p.key + "_title"); dlg.sub.textContent = T(p.key + "_hint");
    dlg.ro.hidden = !(p.line || p.sync);
    if (!dlg.ro.hidden) { renderReadout(dlg.ro, bus); }
    dlg.tbl.open = false; dlg.tbody.textContent = "";
    dlg.tbl.ontoggle = function () { if (dlg.tbl.open) { dlg.tbody.textContent = ""; dlg.tbody.appendChild(TABLES[p.key]()); } };
    dlg.src.textContent = srcLine(p.src);
    document.documentElement.classList.add("dlg-open");
    dlg.el.showModal();
    redrawDialog();
  }

  // ------------------------------------------------------------ the page
  CMA.pages.dashboard = function (root) {
    prepare();
    ui.folds = [];
    root.textContent = "";
    var wrap = h("div", { class: "d2 wrap" });
    root.appendChild(wrap);
    wrap.appendChild(h("h1", { class: "sr", id: "dashboard-title", tabindex: "-1", text: T("page_title") }));

    // headline plate: the sentence is built from the data and the page stops if the data no longer supports it
    var pctBelow = 100 - K.real_share_of_record_pct;
    if (K.copper_is_nominal_record !== 1 || !(pctBelow > 0)) { throw new Error("the headline needs a record as quoted and a price below the real record"); }
    wrap.appendChild(h("section", { class: "plate lens d2-head", "data-frost": "12", "aria-labelledby": "d2-h1" },
      h("p", { class: "d2-h1", id: "d2-h1" }, h("em", { text: T("head_em") }), " " + T("head_rest", { price: money(K.copper_usd_t, "usd") })),
      h("p", { class: "d2-lede", text: T("head_lede", { change: CMA.n0(UFIG.copper_12m_change_pct), n: K.months_total, pct: CMA.n0(pctBelow), month: monthLong(K.real_peak_month) }) })));

    // sticky filter bar
    var gP = segGroup("p", VALID.p, "period_label"), gC = segGroup("c", VALID.c, "currency_label"), gV = segGroup("v", VALID.v, "prices_label");
    ui.btns = { p: gP.btns, c: gC.btns, v: gV.btns };
    ui.noteEuro = h("span", { class: "dnote", id: "note-euro" }); ui.noteReal = h("span", { class: "dnote", id: "note-real" });
    ui.readout = h("p", { class: "dreadout idle", id: "dreadout", "aria-live": "off" });
    gV.btns.real.setAttribute("aria-describedby", "note-real");
    wrap.appendChild(h("div", { class: "plate lens d2-bar", "data-frost": "12", role: "region", "aria-label": T("filter_aria") },
      h("div", { class: "dbar-row" }, gP.el, gC.el, gV.el), h("p", { class: "dnotes" }, ui.noteEuro, ui.noteReal), ui.readout));
    pageBus = makeBus(ui.readout);

    // KPI band
    var items = ["copper", "change", "real", "ratio", "dxy", "health"];
    ui.kpi = {};
    var band = h("section", { class: "plate d2-kpis", "aria-label": T("kpi_aria") });
    items.forEach(function (k) {
      ui.kpi[k] = { label: h("p", { class: "mono klabel" }), figure: h("p", { class: "kfig num" }), ctx: h("p", { class: "kctx" }), spark: h("div", { class: "kspark-host" }) };
      var it = h("div", { class: "kpi", "data-k": k }, ui.kpi[k].label, ui.kpi[k].figure, ui.kpi[k].ctx, ui.kpi[k].spark);
      if (k === "health") { it.appendChild(h("a", { class: "klink", href: "#quality", text: T("kpi_health_link") })); }
      band.appendChild(it);
    });
    wrap.appendChild(band);

    // the six chart panels
    ui.eventsToggle = h("label", { class: "dtoggle" }, h("input", { type: "checkbox", id: "ev-toggle" }), h("span", { text: T("events_toggle") }));
    ui.eventsToggle.querySelector("input").addEventListener("change", function (e) { var n = {}; Object.keys(state).forEach(function (k) { n[k] = state[k]; }); n.e = e.target.checked ? "1" : "0"; setState(n); });
    var grid = h("div", { class: "d2-grid" });
    wrap.appendChild(grid);
    PANELS.forEach(function (p) { grid.appendChild(buildPanel(p)); });
    var evFold = h("details", { class: "tableview" }, h("summary", { text: T("events_list") }), h("div", { class: "fold-body" },
      h("ol", { class: "eventlist" }, EVENTS.map(function (e) {
        return h("li", {}, h("span", { class: "evdate mono", text: CMA.monthShort(e.month + "-01") }), " ", h("b", { text: e.n + ". " + e.label + ". " }), e.description + " ",
          h("a", { href: e.url, target: "_blank", rel: "noopener noreferrer", text: T("event_source", { source: e.source_id }) }));
      }))));
    PANELS[0].el.insertBefore(evFold, PANELS[0].el.querySelector(".dsrc"));

    // footer plate: the health of the data, the links and the CSV
    var Q = window.CMA_DATA.quality, checks = CMA.rows(Q.checks), count = function (s) { return checks.filter(function (r) { return r.status === s; }).length; };
    var KI = CMA.rows(Q.known_issues).filter(function (r) { return r.status !== "limitation" && r.status !== "resolved"; }), run = checks[0].run_date;
    ui.health = { passed: count("PASS"), warn: count("WARN"), fail: count("FAIL") };
    ui.csvLink = h("button", { type: "button", class: "btn secondary small", text: T("link_download") });
    ui.csvLink.addEventListener("click", downloadCsv);
    wrap.appendChild(h("footer", { class: "plate d2-foot" },
      h("ul", { class: "dfacts" },
        h("li", {}, h("b", { class: "num", text: String(ui.health.passed) }), h("span", { text: T("health_passed") })),
        h("li", {}, h("b", { class: "num", text: String(ui.health.warn) }), h("span", { text: T("health_warn") })),
        h("li", {}, h("b", { class: "num", text: String(ui.health.fail) }), h("span", { text: T("health_fail") })),
        h("li", {}, h("b", { class: "num", text: String(Q.sources.rows.length) }), h("span", { text: T("health_sources") })),
        h("li", {}, h("b", { class: "num", text: String(KI.length) }), h("span", { text: T("health_issues") }))),
      h("p", { class: "dline" }, T("health_through", { month: monthLong(K.latest_month) }) + " " + T("health_checked", { date: parseInt(run.slice(8, 10), 10) + " " + CMA.monthLong(run) })),
      h("div", { class: "row" }, h("a", { class: "btn small", href: "#quality", text: T("link_appendix") }), ui.csvLink, CMA.chip(["dash.series"])),
      h("p", { class: "small muted dfoot-note", text: window.CMA_STRINGS.dashboard.sources.attribution })));
    root.appendChild(buildDialog());
    built = true;
    render(true);
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

  function render(first) {
    var c = compute(state), cur = state.c, last = c.last;
    Object.keys(ui.btns).forEach(function (g) { Object.keys(ui.btns[g]).forEach(function (o) { ui.btns[g][o].setAttribute("aria-pressed", state[g] === o ? "true" : "false"); }); });
    ui.btns.v.real.disabled = state.c === "eur";
    ui.noteReal.textContent = state.c === "eur" ? T("note_real") : "";
    var euroStart = startFor(state.p, col.cu_eur), usdStart = startFor(state.p, col.cu_usd);
    ui.noteEuro.textContent = state.c === "eur" && euroStart > usdStart ? T("note_euro") : "";
    ui.eventsToggle.querySelector("input").checked = state.e === "1";

    // KPI band
    var k = ui.kpi, cs = col[c.cc], nMon = cur === "eur" ? K.eur_months_total : K.months_total;
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

    // panels: the line charts update in place (a 300 ms fade), the others are drawn again
    pageBus.clearCharts();
    PANELS.forEach(function (p) {
      if (p.line) {
        if (p.ctl) { pageBus.add(p.ctl); }
        p.ctl = p.draw(p.host, false, pageBus, p.ctl);
      } else {
        if (p.ctl && p.ctl.destroy) { p.ctl.destroy(); }
        p.ctl = p.draw(p.host, false, pageBus);
        if (!first && !CMA.reduce) { p.host.classList.remove("d2-fade"); void p.host.offsetWidth; p.host.classList.add("d2-fade"); }
      }
    });
    ui.folds.forEach(function (f) { if (f.d.open) { f.body.textContent = ""; f.body.appendChild(TABLES[f.key]()); } });
    if (pageBus.month) { pageBus.set(pageBus.month, pageBus.kb); } else { renderReadout(ui.readout, pageBus); }
  }

  CMA.dash = {
    apply: function (qs) { state = normalise(parseQuery(qs)); if (built) { render(false); } },
    snapshot: function () { var c = compute(state); return { state: JSON.parse(JSON.stringify(state)), snap: c.snap, months: months.length, kpis: K, health: ui.health }; },
    setState: function (o) { setState(o); },
    initialState: function (qs) { state = normalise(parseQuery(qs)); }
  };
})();
