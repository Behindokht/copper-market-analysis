/* Chapter 1: what is copper for, and who uses it? End-use bars (ICSG, 2024), three fact tiles and the mined-versus-used line.
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
    var maxShare = Math.max.apply(null, rows.map(function (r) { return r.share_pct; })), scale = Math.ceil(maxShare / 5) * 5 + 5;

    box.appendChild(h("p", { class: "answer", text: T("answer") }));

    var list = h("ul", { class: "bars", role: "img", "aria-label": rows.map(function (r) { return T("bar_aria", { name: names[r.sector], pct: r.share_pct }); }).join(". ") }, rows.map(function (r) {
      return h("li", { class: "brow dc", "aria-hidden": "true" },
        h("div", { class: "bname", text: names[r.sector] }),
        h("div", { class: "btrack" }, h("span", { class: "bfill", style: "width:" + (r.share_pct / scale * 100) + "%" })),
        h("div", { class: "bval num", text: r.share_pct + "%" }));
    }));
    box.appendChild(h("div", { class: "card chart-card" },
      h("h3", { class: "qtitle", text: T("chart_title") }), list,
      h("p", { class: "small muted", text: T("caption", { year: year }) }), CMA.chip(["uses.end_use"])));

    box.appendChild(h("div", { class: "usetiles" },
      h("div", { class: "usetile" }, h("b", { class: "num", text: CMA.n0(F.F06.value) + "%" }), h("span", { text: T("tile_wire") })),
      h("div", { class: "usetile" }, h("b", { class: "num", text: CMA.n0(F.F01.value) + "%" }), h("span", { text: T("tile_china") })),
      h("div", { class: "usetile" }, h("b", { text: T("tile_third") }), h("span", { text: T("tile_recycled") }))));
    box.appendChild(h("p", { class: "small" }, T("scale_line", { mined: CMA.n0(F.F05.value), used: CMA.n1(F.F04.value), year: F.F05.year }) + " ", CMA.chip(["uses.facts"])));

    box.appendChild(h("aside", { class: "note", "aria-labelledby": "uses-ns" },
      h("h3", { id: "uses-ns", text: T("notshow.title") }),
      h("ul", {}, window.CMA_STRINGS.uses.notshow.items.map(function (x) { return h("li", { text: CMA.fill(x, { year: year }) }); }))));

    var R = {};
    CMA.rows(window.CMA_DATA.story.record_facts).forEach(function (r) { R[r.fact_id] = r; });
    CMA.sources.add(window.CMA_STRINGS.uses.sources.names, T("sources.attribution"));
    CMA.bridge(box, T("bridge", { month: CMA.monthLong(R.nominal_latest.month) }));
  };
})();
