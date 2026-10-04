/* Chapter 1: what is copper for, and who uses it? The 3D copper donut (the same component as the dashboard, larger) with the three facts beside it, as in the story study.
   Data: window.CMA_DATA.uses (end_use, facts, figures). The page stops if the shares no longer add up to 100. */
(function () {
  var CMA = window.CMA, t = CMA.t, h = CMA.h;
  var T = function (key, vars) { return t("uses." + key, vars); };

  CMA.chapters.uses = function (box) {
    var D = window.CMA_DATA.uses, F = {};
    CMA.rows(D.facts).forEach(function (r) { F[r.fact_id] = r; });
    var rows = CMA.rows(D.end_use).sort(function (a, b) { return a.rank - b.rank; });
    var year = rows[0].year;
    if (rows.reduce(function (s, r) { return s + r.share_pct; }, 0) !== 100) { throw new Error("the end-use shares no longer add up to 100"); }
    var names = window.CMA_STRINGS.uses.sectors;
    var data = rows.map(function (r) { return { name: names[r.sector], pct: r.share_pct }; });

    box.appendChild(h("p", { class: "answer", text: T("answer") }));

    var left = h("div", { class: "donut-wrap" }), leg = h("ul", { class: "eu-leg" }), facts = h("div", { class: "facts" });
    [["F06", "fact_wire", CMA.n0(F.F06.value) + "%"], ["F01", "fact_china", CMA.n0(F.F01.value) + "%"], ["F02", "fact_recycled", T("fact_third")]].forEach(function (f) {
      var v = F[f[0]].value;
      facts.appendChild(h("div", { class: "fact" }, h("b", { text: f[2] }), h("span", { text: T(f[1]) }), h("i", { style: "--w:" + v + "%", role: "img", "aria-label": T("fact_aria", { text: T(f[1]), pct: CMA.n0(v) }) })));
    });
    box.appendChild(h("div", { class: "fig" },
      h("h3", { text: T("chart_title") }), h("p", { class: "sub", text: T("caption", { year: year }) }),
      h("div", { class: "eu-wrap" }, h("div", {}, left, leg), facts),
      CMA.figFoot(T("source_line"), ["uses.end_use", "uses.facts"])));
    CMA.donut(left, { data: data, idle: [String(year), T("donut_idle")], height: 360, legend: leg,
      aria: T("donut_aria", { list: data.map(function (d) { return d.name + " " + d.pct + "%"; }).join(", "), year: year }) });

    box.appendChild(h("p", { class: "small", style: "margin-top:16px" }, T("scale_line", { mined: CMA.n0(F.F05.value), used: CMA.n1(F.F04.value), year: F.F05.year })));

    var lim = CMA.limits(window.CMA_STRINGS.uses.notshow.items.map(function (x) { return CMA.fill(x, { year: year }); }), T("notshow.title"));
    box.appendChild(lim.short);
    box.appendChild(CMA.fold(null, [lim.full]));

    var R = {};
    CMA.rows(window.CMA_DATA.story.record_facts).forEach(function (r) { R[r.fact_id] = r; });
    CMA.sources.add(window.CMA_STRINGS.uses.sources.names, T("sources.attribution"));
    CMA.bridge(box, T("bridge", { month: CMA.monthLong(R.nominal_latest.month) }));
  };
})();
