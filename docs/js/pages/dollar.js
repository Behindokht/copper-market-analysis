/* Dollar vs copper page. Every number comes from window.CMA_DATA.dollar (and the share of opposite months from window.CMA_DATA.story). */
(function () {
  var CMA = window.CMA, h = CMA.h;
  var T = function (key, vars) { return CMA.t("dollar." + key, vars); };

  function ym(s) { return CMA.monthLong(s.slice(0, 7) + "-01"); }
  // "Copper vs euros per dollar, 1999-02 to 2026-08" -> {from, to}
  function period(label) {
    var m = label.match(/(\d{4}-\d{2}) to (\d{4}-\d{2})/);
    return { from: ym(m[1]), to: ym(m[2]), fromIso: m[1], toIso: m[2] };
  }
  function find(rows, col, text) {
    var r = rows.filter(function (x) { return String(x[col]).indexOf(text) === 0; })[0];
    if (!r) { throw new Error("missing row: " + text); }
    return r;
  }
  function range(lo, hi) { return " (" + CMA.f2(lo) + " to " + CMA.f2(hi) + ")"; }

  CMA.pages.dollar = function (root) {
    var D = window.CMA_DATA.dollar, St = window.CMA_DATA.story;
    var corr = CMA.rows(D.correlations), reg = CMA.rows(D.regressions), stab = CMA.rows(D.stability), roll = CMA.rows(D.rolling), SER = CMA.rows(D.series);
    var lag = CMA.rows(D.lead_lag), cum = CMA.rows(D.eur_cumulative), vr = CMA.rows(D.eur_variance), cpi = CMA.rows(D.cpi_sensitivity), me = CMA.rows(D.month_end);

    var cIdx = find(corr, "comparison", "Copper vs broad dollar index");
    var cEur = find(corr, "comparison", "Copper vs euros per dollar, 1999");
    var cEur06 = find(corr, "comparison", "Copper vs euros per dollar, 2006");
    var pIdx = period(cIdx.comparison), pEur = period(cEur.comparison), pEur06 = period(cEur06.comparison);
    var rIdx = find(reg, "model", "2. dollar index only"), rIdxY = find(reg, "model", "3. dollar index + 10-year");
    var shareDollar = rIdx["R squared"] * 100, shareYield = rIdxY["R squared"] * 100;
    var g1 = {};
    CMA.rows(St.guess_dollar).forEach(function (r) { g1[r.fact_id] = r; });
    var oppShare = g1.opposite_direction_share.value;

    // The dates in the text come from the sample of the tables, never from the first month of the rolling window.
    // The chart, the regression and the Story page must start in the same month, or the page stops here.
    var fromIso = pIdx.fromIso;
    if (SER[1].month.slice(0, 7) !== fromIso || SER.length - 1 !== cIdx.months) { throw new Error("the chart series does not match the correlation sample"); }
    if (rIdx.model.indexOf(fromIso + " on") < 0) { throw new Error("the regression sample starts in a different month than the correlation sample"); }
    if (g1.r2_dollar_index.period_from !== fromIso || g1.months_total.value !== cIdx.months) { throw new Error("the Story sample differs from the Dollar page sample"); }
    var indexFrom = pIdx.from, euroFrom = pEur.from, baseMonth = CMA.monthLong(SER[0].month);

    // rolling correlation: where the link was tightest and weakest
    var n = roll.length;
    var idxVals = roll.map(function (r) { return r["Broad dollar index"]; });
    var eurVals = roll.map(function (r) { return r["Euros per dollar"]; });
    var iMin = 0, iMax = 0, iLast = n - 1;
    idxVals.forEach(function (v, i) {
      if (v == null) { return; }
      if (idxVals[iMin] == null || v < idxVals[iMin]) { iMin = i; }
      if (idxVals[iMax] == null || v > idxVals[iMax]) { iMax = i; }
    });
    var meEnd = find(me, "version", "month-end"), meAvg = find(me, "version", "monthly averages");
    var sdEur = find(vr, "measure", "monthly std dev, copper in EUR").value, sdUsd = find(vr, "measure", "monthly std dev, copper in USD").value;
    // the dollar and euro swings are computed over the same months: the span must match the euro correlation's sample
    var sdMonths = find(vr, "measure", "months").value;
    var ymd = function (v) { var t = String(Math.round(v)); return t.slice(0, 4) + "-" + t.slice(4, 6); };
    var sdFrom = ymd(find(vr, "measure", "first month").value), sdTo = ymd(find(vr, "measure", "last month").value);
    if (sdMonths !== cEur.months || sdFrom !== pEur.fromIso || sdTo !== pEur.toIso) { throw new Error("swing months differ from the euro sample"); }

    var vars = {
      index_from: indexFrom, euro_from: euroFrom, opposite_share: CMA.n0(oppShare), r: CMA.f2(cIdx["pearson r"]),
      beta: CMA.n1(-rIdx.coefficient), share: CMA.n0(shareDollar),
      min_month: CMA.monthLong(roll[iMin].month), max_month: CMA.monthLong(roll[iMax].month), last: CMA.f2(idxVals[iLast]),
      sd_eur: CMA.n1(sdEur), sd_usd: CMA.n1(sdUsd), sd_months: sdMonths, sd_from: ym(sdFrom), sd_to: ym(sdTo)
    };

    root.textContent = "";
    var wrap = h("div", { class: "wrap" });
    root.appendChild(wrap);
    wrap.appendChild(h("header", { class: "page-head" },
      h("p", { class: "eyebrow", text: CMA.t("pages.dollar.eyebrow") }),
      h("h2", { id: "dollar-title", tabindex: "-1", text: CMA.t("pages.dollar.title") }),
      h("p", { class: "answer", text: T("answer") }),
      h("p", { class: "intro", text: T("intro") })));

    // ---- the one simple chart: copper and the broad dollar index, both set to 100 at the start
    var card = h("div", { class: "card chart-card" });
    card.appendChild(h("h3", { class: "qtitle", text: T("main_title") }));
    card.appendChild(h("div", { class: "key" },
      h("span", { style: "color:var(--copper)" }, h("span", { class: "sw" }), h("span", { style: "color:var(--ink)", text: T("label_copper") })),
      h("span", { style: "color:var(--verdigris)" }, h("span", { class: "sw dash" }), h("span", { style: "color:var(--ink)", text: T("label_dollar") }))));
    var host = h("div", { class: "chart-host" });
    card.appendChild(host);
    var N = SER.length, cu = SER.map(function (r) { return r.copper_indexed; }), dol = SER.map(function (r) { return r.dollar_indexed; });
    var marks = [
      { series: "copper", i: N - 1, lines: [CMA.monthLong(SER[N - 1].month), T("m_cu", { value: CMA.n0(cu[N - 1]) })], dx: -14, dy: -34, anchor: "end" },
      { series: "dollar", i: N - 1, lines: [CMA.monthLong(SER[N - 1].month), T("m_dol", { value: CMA.n0(dol[N - 1]) })], dx: -14, dy: 46, anchor: "end" }
    ];
    card.appendChild(h("p", { class: "small muted", style: "margin-top:10px", text: T("main_note", { base_month: baseMonth }) }));
    card.appendChild(h("ol", { class: "marklist" }, marks.map(function (m) { return h("li", { text: m.lines[0] + ": " + m.lines[1] }); })));
    var xTicks = [{ i: 0, label: String(SER[0].month.slice(0, 4)) }];
    SER.forEach(function (r, i) { var y = +r.month.slice(0, 4); if (r.month.slice(5, 7) === "01" && y % 5 === 0 && i > 12) { xTicks.push({ i: i, label: String(y) }); } });
    var top = Math.ceil(Math.max.apply(null, cu.concat(dol)) / 50) * 50;
    var yTicks = []; for (var yv = 50; yv <= top; yv += 50) { yTicks.push(yv); }
    wrap.appendChild(card);
    CMA.lineChart(host, {
      n: N, yMin: 50, yMax: top, yTicks: yTicks, yFormat: CMA.n0, yLabel: T("main_y", { base_month: baseMonth }), xTicks: xTicks, marginRight: 24,
      series: [
        { id: "copper", color: "--copper", values: cu, label: { text: T("label_copper"), short: T("label_copper_short") } },
        { id: "dollar", color: "--verdigris", dash: "6 4", values: dol, label: { text: T("label_dollar"), short: T("label_dollar_short") } }
      ],
      marks: marks,
      tip: function (i) {
        var r = SER[i];
        return { title: CMA.monthLong(r.month), lines: [T("tip_cu", { value: CMA.n0(r.copper_indexed), usd: CMA.usd0(r.copper_usd_t) }), T("tip_dol", { value: CMA.n0(r.dollar_indexed) })] };
      },
      aria: T("main_aria", { from: CMA.monthLong(SER[0].month), to: CMA.monthLong(SER[N - 1].month), base_month: baseMonth })
    });

    // ---- three short findings in plain words
    wrap.appendChild(h("section", { class: "findings", "aria-label": "Findings" },
      h("p", { class: "finding", text: T("finding_1", vars) }),
      h("p", { class: "finding", text: T("finding_2", vars) }),
      h("p", { class: "finding", text: T("finding_3", vars) })));

    // ---- what this page does not show
    var nsItems = window.CMA_STRINGS.dollar.notshow.items.map(function (s) { return CMA.fill(s, { me_end: CMA.f2(meEnd["pearson r"]), me_avg: CMA.f2(meAvg["pearson r"]) }); });
    wrap.appendChild(h("aside", { class: "note", "aria-labelledby": "dollar-ns" },
      h("h3", { id: "dollar-ns", text: T("notshow.title") }), h("ul", {}, nsItems.map(function (s) { return h("li", { text: s }); }))));

    // =============================== the details, closed by default
    var fold = [];
    fold.push(h("p", { class: "small", text: T("measured", vars) }));

    // the 36-month correlation chart
    var rcard = h("div", { class: "card chart-card" });
    rcard.appendChild(h("h3", { class: "qtitle", text: T("chart_title") }));
    rcard.appendChild(h("div", { class: "key" },
      h("span", { style: "color:var(--copper)" }, h("span", { class: "sw" }), h("span", { style: "color:var(--ink)", text: T("label_index") })),
      h("span", { style: "color:var(--verdigris)" }, h("span", { class: "sw dash" }), h("span", { style: "color:var(--ink)", text: T("label_euro") }))));
    var rhost = h("div", { class: "chart-host" });
    rcard.appendChild(rhost);
    rcard.appendChild(h("p", { class: "small muted", style: "margin-top:10px", text: T("below_hint") }));
    var rmarks = [
      { series: "index", i: iMin, lines: [CMA.monthLong(roll[iMin].month), T("m_low", { value: CMA.f2(idxVals[iMin]) })], dx: 12, dy: 18, anchor: "start" },
      { series: "index", i: iMax, lines: [CMA.monthLong(roll[iMax].month), T("m_high", { value: CMA.f2(idxVals[iMax]) })], dx: 0, dy: -36, anchor: "middle" },
      { series: "index", i: iLast, lines: [CMA.monthLong(roll[iLast].month), T("m_last", { value: CMA.f2(idxVals[iLast]) })], dx: 0, dy: 90, anchor: "end" }
    ];
    rcard.appendChild(h("ol", { class: "marklist" }, rmarks.map(function (m) { return h("li", { text: m.lines[0] + ": " + m.lines[1] }); })));
    var rx = [];
    roll.forEach(function (r, i) { var y = +r.month.slice(0, 4); if (r.month.slice(5, 7) === "01" && y % 5 === 0) { rx.push({ i: i, label: String(y) }); } });
    var all = idxVals.concat(eurVals).filter(function (v) { return v != null; });
    var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all);
    var yMin = Math.floor(lo * 2) / 2, yMax = Math.ceil(hi * 4) / 4 < 0.25 ? 0.25 : Math.ceil(hi * 4) / 4;
    var ryT = []; for (var v = yMin; v <= yMax + 1e-9; v += 0.25) { ryT.push(Math.round(v * 100) / 100); }
    CMA.lineChart(rhost, {
      n: n, yMin: yMin, yMax: yMax, yTicks: ryT, yFormat: function (x) { return CMA.f2(x); }, yLabel: T("y_label"), xTicks: rx, marginRight: 24,
      refLabel: ryT.indexOf(0) >= 0 ? { v: 0, text: T("zero_label") } : null,
      series: [
        { id: "index", color: "--copper", values: idxVals, label: { text: T("label_index"), short: T("label_index_short") } },
        { id: "euro", color: "--verdigris", dash: "6 4", values: eurVals, label: { text: T("label_euro"), short: T("label_euro_short") } }
      ],
      marks: rmarks,
      tip: function (i) {
        var r = roll[i];
        return { title: CMA.monthLong(r.month), lines: [
          T("tip_index", { value: r["Broad dollar index"] == null ? T("tip_none") : CMA.f2(r["Broad dollar index"]) }),
          T("tip_euro", { value: r["Euros per dollar"] == null ? T("tip_none") : CMA.f2(r["Euros per dollar"]) })
        ] };
      },
      aria: T("aria_chart", { from: CMA.monthLong(roll[0].month), to: CMA.monthLong(roll[n - 1].month) })
    });
    var thead = h("thead", {}, h("tr", {},
      h("th", { scope: "col", text: T("col_month") }), h("th", { scope: "col", text: T("label_index") }), h("th", { scope: "col", text: T("label_euro") })));
    var tbody = h("tbody");
    roll.forEach(function (r) {
      tbody.appendChild(h("tr", {}, h("td", { text: r.month.slice(0, 7) }),
        h("td", { text: r["Broad dollar index"] == null ? T("no_value") : CMA.f2(r["Broad dollar index"]) }),
        h("td", { text: r["Euros per dollar"] == null ? T("no_value") : CMA.f2(r["Euros per dollar"]) })));
    });
    rcard.appendChild(h("details", { class: "tableview" }, h("summary", { text: T("table_summary") }), h("div", { class: "tablewrap" }, h("table", {}, thead, tbody))));
    fold.push(rcard);

    // the numbers, in three groups
    var pair = function (a, b) { return T("result_pair", { a: a, b: b }); };
    var pc = function (x) { return CMA.n0(x) + "%"; };
    var beta = function (r) { return CMA.f1(r.coefficient) + "%" + range(r["95% interval low"], r["95% interval high"]); };
    var sInx = find(stab, "comparison", "broad dollar index, 2015"), sInx0 = find(stab, "comparison", "broad dollar index, 2006");
    var sEur0 = find(stab, "comparison", "euros per dollar, 1999"), sEur1 = find(stab, "comparison", "euros per dollar, 2015");
    var pI0 = period(sInx0.comparison), pI1 = period(sInx.comparison), pE0 = period(sEur0.comparison), pE1 = period(sEur1.comparison);
    var lagRow = function (idx, k) { return lag.filter(function (r) { return r["dollar measure"] === idx && r["dollar leads by k months"] === k; })[0]; };
    var cpiRow = function (what, ver) { return cpi.filter(function (r) { return r["dollar measure"] === what && r.version.indexOf(ver) === 0; })[0]; };
    var cumSince = find(cum, "window", "since 2006"), cumLast = find(cum, "window", "last 12 months");
    var pctC = function (x) { return CMA.pctChange(x); };
    var groups = [
      { title: T("g_strength"), rows: [
        [T("r_corr_index", { from: pIdx.from, to: pIdx.to }), CMA.f2(cIdx["pearson r"]) + range(cIdx["95% interval low"], cIdx["95% interval high"]), cIdx.months],
        [T("r_corr_euro", { from: pEur.from, to: pEur.to }), CMA.f2(cEur["pearson r"]) + range(cEur["95% interval low"], cEur["95% interval high"]), cEur.months],
        [T("r_corr_euro_same", { from: pEur06.from }), CMA.f2(cEur06["pearson r"]) + range(cEur06["95% interval low"], cEur06["95% interval high"]), cEur06.months],
        [T("r_beta"), beta(rIdx), rIdx.months],
        [T("r_beta_yield"), beta(rIdxY), rIdxY.months],
        [T("r_share"), pair(pc(shareDollar), pc(shareYield)), rIdx.months]
      ] },
      { title: T("g_holds"), rows: [
        [T("r_period_index", { from: pI0.from, to: pI0.to }), CMA.f2(sInx0["pearson r"]) + range(sInx0["95% interval low"], sInx0["95% interval high"]), sInx0.months],
        [T("r_period_index", { from: pI1.from, to: pI1.to }), CMA.f2(sInx["pearson r"]) + range(sInx["95% interval low"], sInx["95% interval high"]), sInx.months],
        [T("r_period_euro", { from: pE0.from, to: pE0.to }), CMA.f2(sEur0["pearson r"]) + range(sEur0["95% interval low"], sEur0["95% interval high"]), sEur0.months],
        [T("r_period_euro", { from: pE1.from, to: pE1.to }), CMA.f2(sEur1["pearson r"]) + range(sEur1["95% interval low"], sEur1["95% interval high"]), sEur1.months],
        [T("r_lag_before"), CMA.f2(lagRow("broad dollar index", 1)["pearson r"]), lagRow("broad dollar index", 1).months],
        [T("r_lag_same"), CMA.f2(lagRow("broad dollar index", 0)["pearson r"]), lagRow("broad dollar index", 0).months],
        [T("r_lag_after"), CMA.f2(lagRow("broad dollar index", -1)["pearson r"]), lagRow("broad dollar index", -1).months],
        [T("r_month_end"), pair(CMA.f2(meAvg["pearson r"]), CMA.f2(meEnd["pearson r"])), meEnd.months],
        [T("r_cpi"), pair(CMA.f2(cpiRow("broad dollar index", "nominal copper, all").coefficient), CMA.f2(cpiRow("broad dollar index", "nominal copper, without").coefficient)),
          cpiRow("broad dollar index", "nominal copper, all").months + " / " + cpiRow("broad dollar index", "nominal copper, without").months]
      ] },
      { title: T("g_euro"), rows: [
        [T("r_cum_since", { since: CMA.monthLong("2006-01-01") }), pair(pctC(cumSince["copper in USD, % change"]), pctC(cumSince["copper in EUR, % change"])), ""],
        [T("r_cum_last"), pair(pctC(cumLast["copper in USD, % change"]), pctC(cumLast["copper in EUR, % change"])), ""],
        [T("r_sd", { from: ym(sdFrom), to: ym(sdTo) }), pair(CMA.n1(sdUsd) + "%", CMA.n1(sdEur) + "%"), sdMonths]
      ] }
    ];
    var ntbody = h("tbody");
    groups.forEach(function (g) {
      ntbody.appendChild(h("tr", {}, h("th", { class: "group", colspan: "3", scope: "colgroup", text: g.title })));
      g.rows.forEach(function (r) {
        ntbody.appendChild(h("tr", {}, h("td", { text: r[0] }), h("td", { class: "res num", text: r[1] }), h("td", { class: "mon num", text: String(r[2]) })));
      });
    });
    fold.push(h("section", { class: "numbers", "aria-labelledby": "dollar-nums" },
      h("h3", { id: "dollar-nums", text: T("numbers_title") }),
      h("p", { class: "hint", text: T("numbers_hint") }),
      h("p", { class: "small muted", text: T("ci_note") }),
      h("div", { class: "numwrap" }, h("table", { class: "numtable" },
        h("thead", {}, h("tr", {}, h("th", { scope: "col", text: T("col_measure") }), h("th", { class: "res", scope: "col", text: T("col_result") }), h("th", { class: "mon", scope: "col", text: T("col_months") }))),
        ntbody))));
    wrap.appendChild(CMA.fold(T("details_lead"), fold));

    CMA.pageFoot(wrap, window.CMA_STRINGS.dollar.sources.names, T("sources.attribution"));
    wrap.appendChild(h("nav", { class: "next", "aria-label": "Next page" },
      h("a", { class: "btn secondary", href: "#story", text: CMA.t("nav.story") }),
      h("a", { class: "btn", href: "#ratio", text: T("next", { title: CMA.t("pages.ratio.title") }) })));
  };
})();
