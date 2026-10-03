/* Interlude: is it just copper? How close each of five prices is to its own record, in today's money. Data: window.CMA_DATA.chapters.records. */
(function () {
  var CMA = window.CMA, t = CMA.t, h = CMA.h;
  var T = function (key, vars) { return t("just." + key, vars); };

  CMA.chapters.just = function (box) {
    var rows = CMA.rows(window.CMA_DATA.chapters.records).sort(function (a, b) { return b.latest_pct_of_real_peak - a.latest_pct_of_real_peak; });
    var by = {};
    rows.forEach(function (r) { by[r.commodity] = r; });
    var names = window.CMA_STRINGS.just.names;

    // the answer sentence is built from the data, and the page stops if the data no longer supports it
    var others = rows.filter(function (r) { return r.at_nominal_record && r.commodity !== "copper"; }).map(function (r) { return names[r.commodity].toLowerCase(); });
    if (!by.copper.at_nominal_record || !others.length || rows.some(function (r) { return r.at_real_record; })) { throw new Error("the interlude answer no longer matches the data"); }
    var gold = by.gold, goldMonth = gold.nominal_peak_month + "-01";
    var monthsSince = (+gold.latest_month.slice(0, 4) - +gold.nominal_peak_month.slice(0, 4)) * 12 + (+gold.latest_month.slice(5, 7) - +gold.nominal_peak_month.slice(5, 7));
    if (gold.at_nominal_record || monthsSince > 12) { throw new Error("the gold record is no longer recent"); }

    box.appendChild(h("p", { class: "answer", text: T("answer", { others: others.join(" and "), is_are: others.length === 1 ? "is" : "are", gold_month: CMA.monthLong(goldMonth) }) }));

    var list = h("ul", { class: "bars" }, rows.map(function (r) {
      var cls = r.commodity === "copper" ? "dc" : "ev";
      var pct = CMA.n0(r.latest_pct_of_real_peak);
      return h("li", { class: "brow " + cls, "aria-label": T("bar_aria", { name: names[r.commodity], pct: pct, month: CMA.monthLong(r.real_peak_month + "-01"), year: r.series_start.slice(0, 4) }) },
        h("div", { class: "bname" }, names[r.commodity], r.at_nominal_record ? h("span", { class: "pill warn", style: "margin-left:10px", text: T("bar_quoted") }) : null),
        h("div", { class: "btrack" }, h("span", { class: "bfill", style: "width:" + r.latest_pct_of_real_peak + "%" })),
        h("div", { class: "bval num", text: T("bar_value", { pct: pct }) }),
        h("div", { class: "bsub small muted", text: T("bar_record", { month: CMA.monthShort(r.real_peak_month + "-01") }) + "; " + T("bar_start", { year: r.series_start.slice(0, 4) }) }));
    }));
    box.appendChild(h("div", { class: "card chart-card" },
      h("h3", { class: "qtitle", text: T("chart_title") }), h("p", { class: "hint", text: T("chart_hint") }), list));

    // what the early years of each series are
    var notes = rows.filter(function (r) { return r.note_kind; }).map(function (r) {
      return h("li", {}, h("b", { text: names[r.commodity] + ". " }), T("note_" + r.note_kind, { until: r.note_until && r.note_until.length === 7 ? CMA.monthLong(r.note_until + "-01") : (r.note_until || "") }));
    });
    box.appendChild(h("section", { class: "events", "aria-labelledby": "just-notes" },
      h("h3", { id: "just-notes", text: T("notes_title") }), h("ul", {}, notes)));

    // the exact records, behind the fold
    var usd = function (r, v) { return r.commodity === "brent" ? "$" + CMA.n1(v) : CMA.usd0(v); };
    var head = h("thead", {}, h("tr", {}, ["col_name", "col_start", "col_nominal", "col_nominal_now", "col_real", "col_real_now", "col_share"].map(function (k) { return h("th", { scope: "col", text: T(k) }); })));
    var body = h("tbody", {}, rows.map(function (r) {
      return h("tr", {}, h("td", { text: names[r.commodity] }), h("td", { text: CMA.monthShort(r.series_start + "-01") }),
        h("td", { text: usd(r, r.nominal_peak) + " (" + CMA.monthShort(r.nominal_peak_month + "-01") + ")" }), h("td", { text: usd(r, r.latest_nominal) }),
        h("td", { text: usd(r, r.real_peak) + " (" + CMA.monthShort(r.real_peak_month + "-01") + ")" }), h("td", { text: usd(r, r.latest_real) }),
        h("td", { text: CMA.n1(r.latest_pct_of_real_peak) + "%" }));
    }));
    box.appendChild(h("aside", { class: "note", "aria-labelledby": "just-ns" },
      h("h3", { id: "just-ns", text: T("notshow.title") }), h("ul", {}, window.CMA_STRINGS.just.notshow.items.map(function (x) { return h("li", { text: x }); }))));
    box.appendChild(CMA.fold(T("details_lead"), [h("div", { class: "tablewrap" }, h("table", {}, head, body)), h("p", { class: "small muted", text: T("unit_note") })]));
    CMA.sources.add({ S02: window.CMA_STRINGS.story.sources.names.S02, S04: window.CMA_STRINGS.story.sources.names.S04, S27: T("sources.names.S27") }, null);
    CMA.bridge(box, T("bridge"));
  };
})();
