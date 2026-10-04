/* Chapter 7: copper is expensive, why not use aluminium? The break-even from physical constants (NBS Circular 31), the ratio chart with a line at the break-even,
   the three-line explanation with a wire diagram, where aluminium already replaces copper (USGS) and why copper holds on. Data: window.CMA_DATA.ratio (series, case)
   and window.CMA_DATA.uses.facts (F07). The page stops if the run above the break-even is no longer unbroken. */
(function () {
  var CMA = window.CMA, t = CMA.t, h = CMA.h, svg = CMA.svg;
  var T = function (key, vars) { return t("aluminium." + key, vars); };

  CMA.chapters.aluminium = function (box) {
    var SR = CMA.rows(window.CMA_DATA.ratio.series), C = {}, U = {};
    CMA.rows(window.CMA_DATA.ratio.case).forEach(function (r) { C[r.fact_id] = r; });
    CMA.rows(window.CMA_DATA.uses.facts).forEach(function (r) { U[r.fact_id] = r; });
    var be = C.breakeven_ratio.value, n = SR.length, iLast = n - 1;
    var firstRun = String(C.first_month_of_run.value), lastBelow = String(C.last_month_below.value);
    // the run is read from the series itself and must match the result table
    var below = SR.filter(function (r) { return r.ratio <= be; }), lastBelowSeries = below[below.length - 1].month.slice(0, 7);
    if (lastBelowSeries !== lastBelow || SR[iLast].ratio <= be || Math.abs(SR[iLast].ratio - C.ratio_latest.value) > 0.001) { throw new Error("the aluminium run no longer matches the series"); }
    var wider = CMA.n0((C.width_factor.value - 1) * 100), cond = CMA.n0(C.conductivity_vs_copper.value * 100);
    var vars = { since: CMA.monthLong(firstRun + "-01"), cond: cond, wider: wider, be: CMA.f2(be), month: CMA.monthLong(SR[iLast].month) };

    box.appendChild(h("p", { class: "answer", text: T("answer", vars) }));

    // ---- the ratio chart, with a dashed line at the break-even
    var card = h("div", { class: "card chart-card" }, h("h3", { class: "qtitle", text: T("chart_title") }), h("p", { class: "hint", text: T("chart_hint") }));
    var chost = h("div", { class: "chart-host" });
    card.appendChild(chost);
    var vals = SR.map(function (r) { return r.ratio; });
    var marks = [{ series: "ratio", i: iLast, lines: [CMA.monthLong(SR[iLast].month), T("m_latest", { value: CMA.f2(vals[iLast]) })], dx: -16, dy: -30, anchor: "end" }];
    card.appendChild(h("p", { class: "small bandkey", text: T("band") }));
    card.appendChild(h("ol", { class: "marklist" }, marks.map(function (m) { return h("li", { text: m.lines[0] + ": " + m.lines[1] }); })));
    var xTicks = [];
    SR.forEach(function (r, i) { var y = +r.month.slice(0, 4); if (r.month.slice(5, 7) === "01" && y % 10 === 0) { xTicks.push({ i: i, label: String(y) }); } });
    box.appendChild(card);
    CMA.lineChart(chost, {
      n: n, yMax: 5, yTicks: [0, 1, 2, 3, 4, 5], yFormat: CMA.n0, xTicks: xTicks, marginRight: 24,
      band: { v: be, label: T("band") },
      series: [{ id: "ratio", color: "--copper", values: vals, label: { text: T("ctx_label"), short: T("ctx_label_short") } }],
      marks: marks,
      tip: function (i) {
        var r = SR[i];
        return { title: CMA.monthLong(r.month), lines: [T("tip_ratio", { value: CMA.f2(r.ratio) }), T("tip_side", { side: r.ratio > be ? T("tip_above") : T("tip_below") })] };
      },
      aria: T("aria", { from: CMA.monthLong(SR[0].month), to: CMA.monthLong(SR[iLast].month), be: CMA.f2(be) })
    });
    var thead = h("thead", {}, h("tr", {}, h("th", { scope: "col", text: T("col_month") }), h("th", { scope: "col", text: T("col_ratio") })));
    var tbody = h("tbody");
    SR.forEach(function (r) { tbody.appendChild(h("tr", {}, h("td", { text: r.month.slice(0, 7) }), h("td", { text: CMA.f2(r.ratio) }))); });
    card.appendChild(h("details", { class: "tableview" }, h("summary", { text: T("table") }), h("div", { class: "tablewrap" }, h("table", {}, thead, tbody))));
    card.appendChild(CMA.chip(["ratio.case"]));

    // ---- why the line sits at about two: three lines and a two-circle diagram
    var rCu = 38, rAl = Math.round(rCu * C.width_factor.value);
    var dia = svg("svg", { class: "wirediagram", viewBox: "0 0 210 " + (2 * rAl + 34), role: "img", "aria-label": T("diagram_aria", { wider: wider }) });
    var cy = rAl + 4;
    dia.appendChild(svg("circle", { class: "cu", cx: rCu + 4, cy: cy, r: rCu }));
    dia.appendChild(svg("circle", { class: "al", cx: 2 * rCu + 4 + rAl + 14, cy: cy, r: rAl }));
    var lc = svg("text", { x: rCu + 4, y: cy + rAl + 18, "text-anchor": "middle" }); lc.textContent = T("diagram_cu"); dia.appendChild(lc);
    var la = svg("text", { x: 2 * rCu + 4 + rAl + 14, y: cy + rAl + 18, "text-anchor": "middle" }); la.textContent = T("diagram_al"); dia.appendChild(la);
    box.appendChild(h("section", { class: "explain", "aria-labelledby": "al-explain" },
      h("div", {}, h("h3", { id: "al-explain", text: T("explain_title") }),
        h("ol", {}, ["explain_1", "explain_2", "explain_3"].map(function (k) { return h("li", { text: T(k, vars) }); }))),
      dia));

    // ---- where aluminium already replaces copper: the USGS list, as written
    var stmt = U.F07.statement, at = stmt.indexOf(" copper in ");
    if (at < 0) { throw new Error("the USGS substitutes statement changed shape"); }
    var list = stmt.slice(at + " copper in ".length);
    box.appendChild(h("section", { "aria-labelledby": "al-repl" }, h("h3", { id: "al-repl", text: T("replaces_title") }),
      h("p", { text: T("replaces", { list: list.charAt(0).toUpperCase() + list.slice(1) }) }), h("p", { class: "small muted", text: T("replaces_src") })));
    box.appendChild(h("section", { "aria-labelledby": "al-holds" }, h("h3", { id: "al-holds", text: T("holds_title") }), h("p", { text: T("holds", vars) })));

    box.appendChild(h("aside", { class: "note", "aria-labelledby": "al-ns" },
      h("h3", { id: "al-ns", text: T("notshow.title") }), h("ul", {}, window.CMA_STRINGS.aluminium.notshow.items.map(function (x) { return h("li", { text: x }); }))));

    // ---- the working, behind the fold
    var rowsW = [
      ["w_cond", cond + "%"], ["w_area", CMA.f2(C.area_factor.value) + "x"], ["w_width", CMA.f2(C.width_factor.value) + "x"], ["w_mass", CMA.f2(C.mass_factor.value)],
      ["w_break", CMA.f2(be)], ["w_ratio", CMA.f2(C.ratio_latest.value), { month: vars.month }], ["w_cost", CMA.n0(C.cost_share_latest.value) + "%"],
      ["w_last_below", CMA.monthLong(lastBelow + "-01") + " (" + CMA.f2(C.last_below_ratio.value) + ")"], ["w_run", CMA.n0(C.run_months.value)],
      ["w_share", CMA.n0(C.share_months_above.value) + "%", { start: CMA.monthLong(SR[0].month) }]
    ];
    var wt = h("table", {}, h("thead", {}, h("tr", {}, h("th", { scope: "col", text: T("w_what") }), h("th", { scope: "col", text: T("w_value") }))),
      h("tbody", {}, rowsW.map(function (r) { return h("tr", {}, h("td", { text: T(r[0], r[2]) }), h("td", { class: "num", text: r[1] })); })));
    box.appendChild(CMA.fold(T("working_lead"), [h("div", { class: "tablewrap" }, wt), h("p", { class: "small muted", text: T("w_note") })]));

    CMA.sources.add(window.CMA_STRINGS.aluminium.sources.names, T("sources.attribution"));
    CMA.bridge(box, T("bridge"));
  };
})();
