/* Chapter 7: copper is expensive, why not use aluminium? The ratio chart with the break-even line and its zone labels, the two wire cross-sections drawn to scale (as in the story
   study), one section "Where aluminium already wins" (the USGS uses and the weight point) and why copper holds on. Data: window.CMA_DATA.ratio (series, case) and
   window.CMA_DATA.uses.facts (F07). The page stops if the run above the break-even is no longer unbroken. */
(function () {
  var CMA = window.CMA, t = CMA.t, h = CMA.h, svg = CMA.svg;
  var T = function (key, vars) { return t("aluminium." + key, vars); };

  // the wire cross-sections, to scale: the aluminium wire is as much wider as the data says, each wire sits in a dark insulation ring
  function wires(host, widthFactor, vars) {
    var uid = "w" + Math.random().toString(36).slice(2, 6), w = Math.max(280, host.clientWidth || 520), h0 = 200;
    host.textContent = "";
    var sv = svg("svg", { class: "chart", viewBox: "0 0 " + w + " " + h0, height: h0, role: "img", "aria-label": T("wires_aria", vars) });
    host.appendChild(sv);
    var r1 = Math.min(48, (w - 120) / 4.8), r2 = r1 * widthFactor, cy = 74, gap = Math.min(110, w - 2 * r1 - 2 * r2 - 80), x1 = r1 + 40, x2 = x1 + r1 + r2 + gap;
    var defs = svg("defs"); sv.appendChild(defs);
    defs.innerHTML = '<radialGradient id="' + uid + 'cu" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#E9A472"/><stop offset=".6" stop-color="#B8622E"/><stop offset="1" stop-color="#8A4520"/></radialGradient>' +
      '<radialGradient id="' + uid + 'al" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#E6E8EA"/><stop offset=".6" stop-color="#BFC4C8"/><stop offset="1" stop-color="#959BA1"/></radialGradient>' +
      '<filter id="' + uid + 'gr"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="4"/><feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1.4 0 0 0 -.6"/><feComposite in2="SourceAlpha" operator="in"/></filter>';
    [[x1, r1, "cu", T("wire_cu"), T("wire_cu_sub")], [x2, r2, "al", T("wire_al"), T("wire_al_sub", vars)]].forEach(function (a) {
      var x = a[0], r = a[1];
      sv.appendChild(svg("circle", { cx: x, cy: cy, r: r + 7, fill: "#2A1D16" }));
      sv.appendChild(svg("circle", { cx: x, cy: cy, r: r + 7, fill: "none", stroke: "rgba(255,235,215,.25)" }));
      sv.appendChild(svg("circle", { cx: x, cy: cy, r: r, fill: "url(#" + uid + a[2] + ")", stroke: "rgba(40,20,8,.45)" }));
      sv.appendChild(svg("circle", { cx: x, cy: cy, r: r, fill: "#000", filter: "url(#" + uid + "gr)", opacity: 0.25 }));
      sv.appendChild(svg("circle", { cx: x, cy: cy, r: r - 1.5, fill: "none", stroke: "rgba(255,240,225,.5)", "stroke-width": 1 }));
      var t1 = svg("text", { x: x, y: cy + r2 + 34, "text-anchor": "middle", class: "lbl" }); t1.textContent = a[3]; sv.appendChild(t1);
      var t2 = svg("text", { x: x, y: cy + r2 + 50, "text-anchor": "middle" }); t2.textContent = a[4]; sv.appendChild(t2);
    });
  }

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
    if (Math.abs(C.mass_factor.value - 0.5) > 0.02) { throw new Error("the wire captions say half the weight, and the data says otherwise"); }
    var vars = { since: CMA.monthLong(firstRun + "-01"), cond: cond, wider: wider, be: CMA.f2(be), month: CMA.monthLong(SR[iLast].month) };

    box.appendChild(h("p", { class: "answer", text: T("answer", vars) }));

    // ---- the ratio chart, with a dashed line at the break-even and the two zone labels
    var vals = SR.map(function (r) { return r.ratio; });
    var chost = h("div", { class: "chart-host" });
    var marks = [{ series: "ratio", i: iLast, lines: [CMA.monthLong(SR[iLast].month), T("m_latest", { value: CMA.f2(vals[iLast]) })], dx: -16, dy: -30, anchor: "end" }];
    var thead = h("thead", {}, h("tr", {}, h("th", { scope: "col", text: T("col_month") }), h("th", { scope: "col", text: T("col_ratio") })));
    var tbody = h("tbody");
    SR.forEach(function (r) { tbody.appendChild(h("tr", {}, h("td", { text: r.month.slice(0, 7) }), h("td", { text: CMA.f2(r.ratio) }))); });
    box.appendChild(h("div", { class: "card chart-card" },
      h("h3", { class: "qtitle", text: T("chart_title", vars) }), h("p", { class: "hint", text: T("chart_hint") }), chost,
      h("ol", { class: "marklist" }, marks.map(function (m) { return h("li", { text: m.lines[0] + ": " + m.lines[1] }); })),
      h("details", { class: "tableview" }, h("summary", { text: T("table") }), h("div", { class: "tablewrap" }, h("table", {}, thead, tbody))),
      CMA.figFoot(T("source_line"), ["ratio.case"])));
    var xTicks = [];
    SR.forEach(function (r, i) { var y = +r.month.slice(0, 4); if (r.month.slice(5, 7) === "01" && y % 10 === 0) { xTicks.push({ i: i, label: String(y) }); } });
    CMA.lineChart(chost, {
      n: n, yMax: 5, yTicks: [0, 1, 2, 3, 4, 5], yFormat: function (v) { return CMA.n0(v) + "×"; }, xTicks: xTicks, marginRight: 24,
      band: { v: be, label: T("be_label"), zoneTop: T("zone_top"), zoneBottom: T("zone_bottom") },
      series: [{ id: "ratio", color: "--copper", values: vals, label: { text: T("ctx_label"), short: T("ctx_label_short") } }],
      marks: marks,
      tip: function (i) {
        var r = SR[i];
        return { title: CMA.monthLong(r.month), lines: [T("tip_ratio", { value: CMA.f2(r.ratio) }), T("tip_side", { side: r.ratio > be ? T("tip_above") : T("tip_below") })] };
      },
      aria: T("aria", { from: CMA.monthLong(SR[0].month), to: CMA.monthLong(SR[iLast].month), be: CMA.f2(be) })
    });

    // ---- why the line sits at about two: the two wires, to scale
    var whost = h("div", { class: "wires" }), wsvgHost = h("div", { style: "width:100%;max-width:520px" });
    whost.appendChild(wsvgHost);
    box.appendChild(h("div", { class: "fig" }, h("h3", { text: T("wires_title") }), h("p", { class: "sub", text: T("wires_hint", vars) }), whost));
    wires(wsvgHost, C.width_factor.value, vars);
    if ("ResizeObserver" in window) { var rt = 0, lw = wsvgHost.clientWidth; new ResizeObserver(function () { if (Math.abs(wsvgHost.clientWidth - lw) < 2) { return; } lw = wsvgHost.clientWidth; cancelAnimationFrame(rt); rt = requestAnimationFrame(function () { wires(wsvgHost, C.width_factor.value, vars); }); }).observe(wsvgHost); }

    // ---- where aluminium already wins: the USGS uses (as written) and the weight point, in one section
    var stmt = U.F07.statement, at = stmt.indexOf(" copper in ");
    if (at < 0) { throw new Error("the USGS substitutes statement changed shape"); }
    var list = stmt.slice(at + " copper in ".length);
    box.appendChild(h("section", { "aria-labelledby": "al-wins", style: "margin-top:28px" }, h("h3", { id: "al-wins", text: T("wins_title") }),
      h("p", { text: T("wins_text_replace", { list: list }) }), h("p", { text: T("wins") })));
    box.appendChild(h("section", { "aria-labelledby": "al-holds" }, h("h3", { id: "al-holds", text: T("holds_title") }),
      h("ul", { class: "holds" }, window.CMA_STRINGS.aluminium.holds_lines.map(function (x) { return h("li", { text: CMA.fill(x, vars) }); }))));
    box.appendChild(h("p", { class: "closing-line", text: T("closing") }));

    var lim = CMA.limits(window.CMA_STRINGS.aluminium.notshow.items, T("notshow.title"));
    box.appendChild(lim.short);

    // ---- the working, behind the fold
    var rowsW = [
      ["w_cond", cond + "%"], ["w_area", CMA.f2(C.area_factor.value) + "x"], ["w_width", CMA.f2(C.width_factor.value) + "x"], ["w_mass", CMA.f2(C.mass_factor.value)],
      ["w_break", CMA.f2(be)], ["w_ratio", CMA.f2(C.ratio_latest.value), { month: vars.month }], ["w_cost", CMA.n0(C.cost_share_latest.value) + "%"],
      ["w_last_below", CMA.monthLong(lastBelow + "-01") + " (" + CMA.f2(C.last_below_ratio.value) + ")"], ["w_run", CMA.n0(C.run_months.value)],
      ["w_share", CMA.n0(C.share_months_above.value) + "%", { start: CMA.monthLong(SR[0].month) }]
    ];
    var wt = h("table", {}, h("thead", {}, h("tr", {}, h("th", { scope: "col", text: T("w_what") }), h("th", { scope: "col", text: T("w_value") }))),
      h("tbody", {}, rowsW.map(function (r) { return h("tr", {}, h("td", { text: T(r[0], r[2]) }), h("td", { class: "num", text: r[1] })); })));
    box.appendChild(CMA.fold(T("working_lead"), [lim.full, h("div", { class: "tablewrap" }, wt), h("p", { class: "small muted", text: T("w_note") })]));

    CMA.sources.add(window.CMA_STRINGS.aluminium.sources.names, T("sources.attribution"));
    CMA.bridge(box, T("bridge"));
  };
})();
