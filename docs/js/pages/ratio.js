/* Copper vs aluminium page. Every number comes from window.CMA_DATA.ratio (derived result files from notebook 02 and 04). */
(function () {
  var CMA = window.CMA, h = CMA.h, svg = CMA.svg;
  var T = function (key, vars) { return CMA.t("ratio." + key, vars); };

  function ym(s) { return CMA.monthLong(String(s).slice(0, 7) + "-01"); }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function range(lo, hi, f) { f = f || CMA.f1; return " (" + f(lo) + " to " + f(hi) + ")"; }
  function sum(a, f) { return a.reduce(function (t, x) { return t + f(x); }, 0); }

  CMA.pages.ratio = function (root) {
    var D = window.CMA_DATA.ratio, Q = window.CMA_DATA.quality;
    var TH = CMA.rows(D.threshold), EP = CMA.rows(D.episodes), SL = CMA.rows(D.slopes), SC = CMA.rows(D.scenario_today), SR = CMA.rows(D.series);
    var F = {};
    CMA.rows(D.facts).forEach(function (r) { F[r.fact_id] = r; });

    // ---- facts for the text
    var nAll = TH.length;
    var nRules = Object.keys(TH.reduce(function (o, r) { o[r.rule_id] = 1; return o; }, {})).length;
    var nNeg = TH.filter(function (r) { return r.diff_logpts < 0; }).length;
    var nExcl = TH.filter(function (r) { return r.diff_ci_high < 0 || r.diff_ci_low > 0; }).length;
    var nHolm = TH.filter(function (r) { return r.p_holm < 0.05; }).length;
    var eps = TH.map(function (r) { return r.episodes; });
    var fixedRows = TH.filter(function (r) { return r.rule_type === "fixed_ratio"; });
    var topT = Math.max.apply(null, fixedRows.map(function (r) { return r.threshold; }));
    var topEps = fixedRows.filter(function (r) { return r.threshold === topT; }).map(function (r) { return r.episodes; });
    if (F.months_below_latest.value !== F.series_months.value - 1) { throw new Error("the latest ratio is no longer the highest: the wording must change"); }

    var vars = {
      latest_month: ym(F.ratio_latest.month), ratio_latest: CMA.f2(F.ratio_latest.value),
      n_all: nAll, n_rules: nRules, n_neg: nNeg, n_excl: nExcl, n_holm: nHolm,
      ep_min: Math.min.apply(null, eps), ep_max: Math.max.apply(null, eps),
      prev_high: CMA.f2(F.ratio_highest_before_last_24m.value), prev_month: ym(F.ratio_highest_before_last_24m.month),
      top_threshold: CMA.n1(topT), top_ep_min: Math.min.apply(null, topEps), top_ep_max: Math.max.apply(null, topEps)
    };

    root.textContent = "";
    var wrap = h("div", { class: "wrap" });
    root.appendChild(wrap);
    wrap.appendChild(h("header", { class: "page-head" },
      h("p", { class: "eyebrow", text: CMA.t("pages.ratio.eyebrow") }),
      h("h2", { id: "ratio-title", tabindex: "-1", text: CMA.t("pages.ratio.title") }),
      h("p", { class: "intro", text: T("intro", vars) })));
    wrap.appendChild(h("section", { class: "findings", "aria-label": "Findings" },
      h("p", { class: "finding", text: T("finding_1", vars) }),
      h("p", { class: "finding", text: T("finding_2", vars) }),
      h("p", { class: "finding", text: T("finding_3", vars) })));

    // =============================== the picker and the dot-and-whisker chart
    var state = { horizon: 12, family: "fixed", sel: {} };
    var families = ["fixed_ratio", "pctile_all_past", "pctile_past_10y"];
    var famKey = { fixed_ratio: "fam_fixed", pctile_all_past: "fam_pctile_all_past", pctile_past_10y: "fam_pctile_past_10y" };
    state.family = "fixed_ratio";
    var lo = Math.min.apply(null, TH.map(function (r) { return r.diff_ci_low; })), hi = Math.max.apply(null, TH.map(function (r) { return r.diff_ci_high; }));
    var xMin = Math.floor(lo / 5) * 5, xMax = Math.ceil(hi / 5) * 5;

    function rowsFor(fam, hz) {
      return TH.filter(function (r) { return r.rule_type === fam && r.horizon_m === hz; }).sort(function (a, b) { return a.threshold - b.threshold; });
    }
    families.forEach(function (f) { var rs = rowsFor(f, 12); state.sel[f] = rs[Math.floor(rs.length / 2)].rule_id; });
    function rowLabel(r) { return r.rule_type === "fixed_ratio" ? T("row_fixed", { value: CMA.n1(r.threshold) }) : T("row_pctile", { value: CMA.n0(r.threshold) }); }
    function epText(n) { return n === 1 ? T("ep_one") : T("ep_many", { n: n }); }

    var card = h("div", { class: "card chart-card", id: "ratio-picker" });
    card.appendChild(h("h3", { class: "qtitle", text: T("chart_title") }));

    function radios(name, legend, opts, current, onchange) {
      var row = h("div", { class: "opts-row" }, opts.map(function (o) {
        var inp = h("input", { type: "radio", name: name, value: o.value });
        if (o.value === current) { inp.checked = true; }
        inp.addEventListener("change", function () { onchange(o.value); });
        return h("label", {}, inp, h("span", { text: o.text }));
      }));
      return h("fieldset", { class: "seg" }, h("legend", { text: legend }), row);
    }
    card.appendChild(radios("hz", T("horizon_legend"), [{ value: "6", text: T("h_6") }, { value: "12", text: T("h_12") }], String(state.horizon),
      function (v) { state.horizon = +v; render(); }));
    card.appendChild(radios("fam", T("family_legend"), families.map(function (f) { return { value: f, text: T(famKey[f]) }; }), state.family,
      function (v) { state.family = v; render(); }));
    var famHint = h("p", { class: "hint" });
    card.appendChild(famHint);
    card.appendChild(h("div", { class: "key" },
      h("span", { style: "color:var(--green)" }, h("span", { class: "sw dot" }), h("span", { style: "color:var(--forest)", text: T("key_filled") })),
      h("span", { style: "color:var(--green)" }, h("span", { class: "sw dot hollow" }), h("span", { style: "color:var(--forest)", text: T("key_hollow") }))));
    var host = h("div", { class: "dots" });
    card.appendChild(host);
    var xnote = h("p", { class: "small muted", style: "margin-top:6px" });
    card.appendChild(xnote);
    card.appendChild(h("p", { class: "small muted", text: T("left_hint") }));
    card.appendChild(h("p", { class: "small muted", text: T("pick_hint") }));
    var detail = h("div", { class: "detail", "aria-live": "polite" });
    card.appendChild(detail);
    var allTable = h("details", { class: "tableview" });
    card.appendChild(allTable);
    wrap.appendChild(card);

    var lastW = 0;
    function drawChart() {
      var rows = rowsFor(state.family, state.horizon);
      var W = Math.max(300, Math.round(host.clientWidth || 600));
      lastW = W;
      var narrow = W < 560;
      var ml = narrow ? 112 : 190, mr = 18, top = 34, rowH = 52, bottom = 34;
      var pw = W - ml - mr, H = top + rowH * rows.length + bottom;
      var X = function (v) { return ml + ((v - xMin) / (xMax - xMin)) * pw; };
      var s = svg("svg", { viewBox: "0 0 " + W + " " + H, role: "group", "aria-label": T("chart_aria", { h: state.horizon }) });
      var step = narrow ? 10 : 5;
      for (var v = xMin; v <= xMax; v += step) {
        s.appendChild(svg("line", { x1: X(v), x2: X(v), y1: top, y2: top + rowH * rows.length, class: v === 0 ? "zeroline" : "gridline" }));
        var tt = svg("text", { x: X(v), y: top + rowH * rows.length + 20, "text-anchor": "middle", class: "ax" }); tt.textContent = CMA.minus(String(v)); s.appendChild(tt);
      }
      var zl = svg("text", { x: X(0) + 4, y: 16, "text-anchor": "end", class: "ax" }); zl.textContent = T("zero_label"); s.appendChild(zl);
      rows.forEach(function (r, i) {
        var y0 = top + i * rowH, cy = y0 + rowH / 2 + 6, selected = r.rule_id === state.sel[state.family];
        var d = CMA.s1(r.diff_logpts), rl = CMA.s1(r.diff_ci_low).replace("+", ""), rh = CMA.s1(r.diff_ci_high);
        var g = svg("g", { class: "rowg" + (selected ? " row-sel" : ""), role: "button", tabindex: "0", "aria-pressed": selected ? "true" : "false",
          "aria-label": T("row_aria", { row: rowLabel(r), d: d, lo: rl, hi: rh, eps: epText(r.episodes) }) });
        g.appendChild(svg("rect", { x: 0, y: y0, width: W, height: rowH, class: "rowbg", rx: 4 }));
        var l1 = svg("text", { x: 10, y: cy - 4, class: "rowlab" }); l1.textContent = rowLabel(r); g.appendChild(l1);
        var l2 = svg("text", { x: 10, y: cy + 13, class: "rowsub" }); l2.textContent = epText(r.episodes); g.appendChild(l2);
        var color = getComputedStyle(document.documentElement).getPropertyValue("--green").trim();
        var card_ = getComputedStyle(document.documentElement).getPropertyValue("--card").trim();
        g.appendChild(svg("line", { x1: X(r.diff_ci_low), x2: X(r.diff_ci_high), y1: cy, y2: cy, stroke: color, "stroke-width": 2.5, "stroke-linecap": "round" }));
        [r.diff_ci_low, r.diff_ci_high].forEach(function (e) { g.appendChild(svg("line", { x1: X(e), x2: X(e), y1: cy - 6, y2: cy + 6, stroke: color, "stroke-width": 2.5, "stroke-linecap": "round" })); });
        g.appendChild(svg("circle", { cx: X(r.diff_logpts), cy: cy, r: 6.5, fill: r.episodes < 5 ? card_ : color, stroke: color, "stroke-width": 2.5 }));
        var vt = svg("text", { x: X(r.diff_logpts), y: cy - 12, "text-anchor": "middle", class: "val" }); vt.textContent = d; g.appendChild(vt);
        var pick = function () { state.sel[state.family] = r.rule_id; render(true, r.rule_id); };
        g.addEventListener("click", pick);
        g.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
        s.appendChild(g);
      });
      host.textContent = "";
      host.appendChild(s);
    }

    function renderDetail() {
      var rows = rowsFor(state.family, state.horizon);
      var r = rows.filter(function (x) { return x.rule_id === state.sel[state.family]; })[0];
      var hz = state.horizon;
      detail.textContent = "";
      detail.appendChild(h("h4", { text: T("detail_title", { label: cap(r.label), h: hz }) }));
      detail.appendChild(h("p", { text: T("d_months", { months_on: r.months_on, months_all: r.months_on + r.months_off, share: CMA.n0(r.share_on_pct) }) }));
      detail.appendChild(h("p", { text: T("d_change", { on: CMA.pctChange(r.avg_ratio_change_on_pct), off: CMA.pctChange(r.avg_ratio_change_off_pct), h: hz }) }));
      detail.appendChild(h("p", { text: T("d_episodes", { episodes: r.episodes, falling: r.episodes_falling, h: hz, lo: CMA.n0(r.episodes_falling_ci_low_pct), hi: CMA.n0(r.episodes_falling_ci_high_pct) }) }));
      if (r.episodes < 5) { detail.appendChild(h("p", { class: "muted", text: T("d_few") })); }
      detail.appendChild(h("p", { text: T("d_p", { p: CMA.f2(r.p_holm) }) }));

      var list = EP.filter(function (e) { return e.rule_id === r.rule_id && e.horizon_m === hz; }).sort(function (a, b) { return a.first_month < b.first_month ? -1 : 1; });
      var thead = h("thead", {}, h("tr", {},
        h("th", { scope: "col", text: T("ep_col_first") }), h("th", { scope: "col", text: T("ep_col_months") }),
        h("th", { scope: "col", text: T("ep_col_ratio", { h: hz }) }), h("th", { scope: "col", text: T("ep_col_cu") }), h("th", { scope: "col", text: T("ep_col_al") })));
      var tbody = h("tbody");
      list.forEach(function (e) {
        tbody.appendChild(h("tr", {}, h("td", { text: CMA.monthShort(e.first_month + "-01") }), h("td", { text: String(e.months_on) }),
          h("td", { text: CMA.pctChange(e.ratio_change_pct) }), h("td", { text: CMA.pctChange(e.copper_change_pct) }), h("td", { text: CMA.pctChange(e.aluminium_change_pct) })));
      });
      detail.appendChild(h("h4", { style: "margin-top:16px", text: T("ep_title") }));
      detail.appendChild(h("div", { class: "tablewrap" }, h("table", { class: "eptable" }, thead, tbody)));
      detail.appendChild(h("p", { class: "small muted", text: T("ep_note") }));
    }

    function renderAll() {
      var hz = state.horizon;
      allTable.textContent = "";
      allTable.appendChild(h("summary", { text: T("all_summary", { h: hz }) }));
      var head = h("thead", {}, h("tr", {}, ["all_col_rule", "all_col_months", "all_col_eps", "all_col_on", "all_col_off", "all_col_diff", "all_col_p"].map(function (k) { return h("th", { scope: "col", text: T(k) }); })));
      var body = h("tbody");
      families.forEach(function (f) {
        rowsFor(f, hz).forEach(function (r) {
          body.appendChild(h("tr", {}, h("td", { text: cap(r.label) }), h("td", { text: r.months_on + " of " + (r.months_on + r.months_off) }), h("td", { text: String(r.episodes) }),
            h("td", { text: CMA.pctChange(r.avg_ratio_change_on_pct) }), h("td", { text: CMA.pctChange(r.avg_ratio_change_off_pct) }),
            h("td", { text: CMA.s1(r.diff_logpts) + range(r.diff_ci_low, r.diff_ci_high) }), h("td", { text: CMA.f2(r.p_holm) })));
        });
      });
      allTable.appendChild(h("div", { class: "tablewrap" }, h("table", {}, head, body)));
    }

    function render(keepFocus, focusId) {
      famHint.textContent = T(famKey[state.family] + "_hint");
      xnote.textContent = T("x_label", { h: state.horizon });
      drawChart();
      renderDetail();
      renderAll();
      if (keepFocus) {
        var rows = rowsFor(state.family, state.horizon), i = rows.map(function (r) { return r.rule_id; }).indexOf(focusId);
        var gs = host.querySelectorAll("g.rowg");
        if (gs[i]) { gs[i].focus(); }
      }
    }
    render();
    if (window.ResizeObserver) {
      var raf = 0;
      new ResizeObserver(function () {
        if (Math.abs(host.clientWidth - lastW) < 2) { return; }
        cancelAnimationFrame(raf); raf = requestAnimationFrame(drawChart);
      }).observe(host);
    }

    // =============================== context: how unusual is today?
    var cx = h("div", { class: "card chart-card" });
    cx.appendChild(h("h3", { class: "qtitle", text: T("ctx_title") }));
    cx.appendChild(h("p", { class: "hint", text: T("ctx_hint") }));
    var chost = h("div", { class: "chart-host" });
    cx.appendChild(chost);
    var n = SR.length, vals = SR.map(function (r) { return r.ratio; });
    var iLast = n - 1, iPrev = SR.findIndex(function (r) { return r.month === F.ratio_highest_before_last_24m.month; });
    var marks = [
      { series: "ratio", i: iPrev, lines: [CMA.monthLong(SR[iPrev].month), T("m_prev", { value: CMA.f2(vals[iPrev]) })], dx: -10, dy: -36, anchor: "end" },
      { series: "ratio", i: iLast, lines: [CMA.monthLong(SR[iLast].month), T("m_latest", { value: CMA.f2(vals[iLast]) })], dx: -16, dy: -30, anchor: "end" }
    ];
    cx.appendChild(h("ol", { class: "marklist" }, marks.map(function (m) { return h("li", { text: m.lines[0] + ": " + m.lines[1] }); })));
    var xTicks = [];
    SR.forEach(function (r, i) { var y = +r.month.slice(0, 4); if (r.month.slice(5, 7) === "01" && y % 10 === 0) { xTicks.push({ i: i, label: String(y) }); } });
    wrap.appendChild(cx);
    CMA.lineChart(chost, {
      n: n, yMax: 5, yTicks: [0, 1, 2, 3, 4, 5], yFormat: CMA.n0, yLabel: T("ctx_y"), xTicks: xTicks, marginRight: 24,
      series: [{ id: "ratio", color: "--green", values: vals, label: { text: T("ctx_label"), short: T("ctx_label_short") } }],
      marks: marks,
      tip: function (i) {
        var r = SR[i];
        return { title: CMA.monthLong(r.month), lines: [T("tip_ratio", { value: CMA.f2(r.ratio) }), T("tip_cu", { value: CMA.usd0(r.copper_usd_t) }), T("tip_al", { value: CMA.usd0(r.aluminium_usd_t) })] };
      },
      aria: T("ctx_aria", { from: CMA.monthLong(SR[0].month), to: CMA.monthLong(SR[n - 1].month) })
    });
    var cthead = h("thead", {}, h("tr", {}, ["ctx_col_month", "ctx_col_ratio", "ctx_col_cu", "ctx_col_al"].map(function (k) { return h("th", { scope: "col", text: T(k) }); })));
    var ctbody = h("tbody");
    SR.forEach(function (r) {
      ctbody.appendChild(h("tr", {}, h("td", { text: r.month.slice(0, 7) }), h("td", { text: CMA.f2(r.ratio) }), h("td", { text: CMA.usd0(r.copper_usd_t) }), h("td", { text: CMA.usd0(r.aluminium_usd_t) })));
    });
    cx.appendChild(h("details", { class: "tableview" }, h("summary", { text: T("ctx_table") }), h("div", { class: "tablewrap" }, h("table", {}, cthead, ctbody))));

    // =============================== scenario arithmetic
    var scBody = h("tbody");
    SC.forEach(function (r) {
      scBody.appendChild(h("tr", {}, h("td", { text: cap(r.reference) }), h("td", { class: "res num", text: CMA.n1(r.reference_ratio) }),
        h("td", { class: "res num", text: CMA.pctChange(r.copper_change_needed_pct) }), h("td", { class: "res num", text: CMA.pctChange(r.aluminium_change_needed_pct) })));
    });
    wrap.appendChild(h("section", { class: "numbers", "aria-labelledby": "ratio-sc" },
      h("h3", { id: "ratio-sc", text: T("sc_title") }),
      h("p", { class: "hint", text: T("sc_hint", vars) }),
      h("div", { class: "numwrap" }, h("table", { class: "numtable" },
        h("thead", {}, h("tr", {}, h("th", { scope: "col", text: T("sc_col_ref") }), h("th", { class: "res", scope: "col", text: T("sc_col_ratio") }),
          h("th", { class: "res", scope: "col", text: T("sc_col_cu") }), h("th", { class: "res", scope: "col", text: T("sc_col_al") }))),
        scBody))));

    // =============================== the level alone: slopes
    var recent = SL.filter(function (r) { return r.period.slice(0, 4) === "2000"; });
    var recentStart = recent[0].period.slice(0, 7);
    var sVars = { split: ym(recentStart), r2_recent_max: CMA.n0(Math.max.apply(null, recent.map(function (r) { return r.r_squared; })) * 100) };
    var slBody = h("tbody");
    [6, 12].forEach(function (hz) {
      slBody.appendChild(h("tr", {}, h("th", { class: "group", colspan: "4", scope: "colgroup", text: T("slope_group", { h: hz }) })));
      SL.filter(function (r) { return r.horizon_m === hz; }).forEach(function (r) {
        var period = r.period.replace(/\d{4}-\d{2}/g, function (m) { return ym(m); });
        slBody.appendChild(h("tr", {}, h("td", { text: cap(r.predictor) + ", " + period }),
          h("td", { class: "res num", text: CMA.f2(r.slope) + range(r.slope_ci_low, r.slope_ci_high, CMA.f2) }),
          h("td", { class: "res num", text: CMA.n0(r.r_squared * 100) + "%" }), h("td", { class: "mon num", text: String(r.months) })));
      });
    });
    wrap.appendChild(h("section", { class: "numbers", "aria-labelledby": "ratio-sl" },
      h("h3", { id: "ratio-sl", text: T("slope_title") }),
      h("p", { class: "hint", text: T("slope_hint", sVars) }),
      h("div", { class: "numwrap" }, h("table", { class: "numtable" },
        h("thead", {}, h("tr", {}, h("th", { scope: "col", text: T("slope_col_what") }), h("th", { class: "res", scope: "col", text: T("slope_col_slope") }),
          h("th", { class: "res", scope: "col", text: T("slope_col_r2") }), h("th", { class: "mon", scope: "col", text: T("slope_col_months") }))),
        slBody))));

    // =============================== what this does not show, sources, next
    wrap.appendChild(h("aside", { class: "note", "aria-labelledby": "ratio-ns" },
      h("h3", { id: "ratio-ns", text: T("notshow.title") }), h("ul", {}, window.CMA_STRINGS.ratio.notshow.items.map(function (s) { return h("li", { text: s }); }))));
    var srcRows = {};
    CMA.rows(Q.sources).forEach(function (r) { srcRows[r.source_id] = r; });
    var chips = Object.keys(window.CMA_STRINGS.ratio.sources.names).map(function (id) {
      var r = srcRows[id];
      return h("li", { class: "chip" }, h("b", { text: id }), " " + T("sources.names." + id) + ", " + CMA.t("story.sources.reliability", { reliability: r ? r.reliability : "unrated" }));
    });
    wrap.appendChild(h("section", { class: "sources", "aria-labelledby": "ratio-src" },
      h("h3", { id: "ratio-src", text: CMA.t("story.sources.title") }), h("ul", { class: "chips" }, chips),
      h("p", { class: "attrib", text: T("sources.attribution") })));
    wrap.appendChild(h("nav", { class: "next", "aria-label": "Next page" },
      h("a", { class: "btn secondary", href: "#dollar", text: CMA.t("nav.dollar") }),
      h("a", { class: "btn", href: "#demand", text: T("next", { title: CMA.t("pages.demand.title") }) })));
  };
})();
