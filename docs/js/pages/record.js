/* Chapter 1: is copper at a record high right now? Builds the answer, the euro sentence, the long price chart with the approved events, and the bridge.
   Numbers come from window.CMA_DATA.story (World Bank copper, nominal and real) and window.CMA_DATA.chapters (euro record, events). */
(function () {
  var CMA = window.CMA, t = CMA.t, h = CMA.h;

  // ctx: { choice: "a" | "b" | "c" | null }
  CMA.chapters.record = function (box, ctx) {
    var D = window.CMA_DATA.story, C = window.CMA_DATA.chapters;
    var R = {}, E = {};
    CMA.rows(D.record_facts).forEach(function (r) { R[r.fact_id] = r; });
    CMA.rows(C.euro).forEach(function (r) { E[r.fact_id] = r; });
    var S = CMA.rows(D.copper_series), n = S.length;
    var nominal = S.map(function (r) { return r.nominal_usd_t; });
    var real = S.map(function (r) { return r.real_usd_t_aug2026; });
    var idx = function (month) { return S.findIndex(function (r) { return r.month === month; }); };
    var baseMonth = CMA.monthLong(R.real_latest.month);
    var realRec = CMA.realRecord();
    var seriesStart = CMA.monthLong(R.series_months.month);

    // the answer must be true in the data, or the page stops
    if (R.nominal_record.month !== R.nominal_latest.month || R.real_months_above_latest.value < 1) { throw new Error("the record answer no longer matches the data"); }
    if (E.eur_latest_is_record.value !== 1) { throw new Error("the euro sentence no longer matches the data"); }

    box.appendChild(h("h4", { class: "sr", text: t("story.guess2.reveal_title") }));
    if (ctx && ctx.choice) { box.appendChild(h("p", { class: "verdict", text: ctx.choice === "b" ? t("story.guess2.match") : t("story.guess2.differ") })); }
    box.appendChild(h("p", { class: "answer", text: t("record.answer", {
      latest_month: baseMonth, series_start: seriesStart, nominal: CMA.usd0(R.nominal_latest.value),
      peak_month: CMA.monthLong(realRec.month), peak_above: CMA.n0(realRec.abovePct) }) }));
    box.appendChild(h("p", { class: "finding", text: t("record.euro", {
      eur_latest: "€" + CMA.n0(E.eur_latest.value), eur_pct: CMA.n1(E.eur_latest_vs_previous_high_pct.value),
      eur_prev_month: CMA.monthLong(E.eur_previous_high.month + "-01"), eur_start: CMA.monthLong(E.eur_series_start.month + "-01") }) }));

    // ---- the chart
    var card = h("div", { class: "card chart-card" });
    card.appendChild(h("h3", { class: "qtitle", text: t("story.guess2.chart_title") }));
    var realLabel = t("story.guess2.series_real", { base_month: baseMonth });
    card.appendChild(h("div", { class: "key" },
      h("span", { style: "color:var(--copper)" }, h("span", { class: "sw" }), h("span", { style: "color:var(--ink)", text: t("story.guess2.series_nominal") })),
      h("span", { style: "color:var(--verdigris)" }, h("span", { class: "sw dash" }), h("span", { style: "color:var(--ink)", text: realLabel }))));
    var host = h("div", { class: "chart-host" });
    card.appendChild(host);
    var gapIdx = real.findIndex(function (v) { return v == null; });
    var gapMonth = gapIdx >= 0 ? CMA.monthLong(S[gapIdx].month) : "";
    if (gapIdx >= 0) { card.appendChild(h("p", { class: "small muted", style: "margin-top:10px", text: t("story.guess2.gap_note", { month: gapMonth }) })); }
    box.appendChild(card);

    var iPeak = idx(R.real_peak_all.month), i2011 = idx(R.real_peak_since_1990.month), iNow = n - 1;
    function lines1974() { return [CMA.monthLong(R.real_peak_all.month)].concat(t("story.guess2.c_1974", { value: CMA.usd0(R.real_peak_all.value), pct: CMA.n1(R.real_peak_vs_latest_pct.value) }).split(", ")); }
    function lines2011() { return [CMA.monthLong(R.real_peak_since_1990.month)].concat(t("story.guess2.c_2011", { value: CMA.usd0(R.real_peak_since_1990.value) }).split(", ")); }
    function linesNowFn() { return [CMA.monthLong(R.nominal_latest.month)].concat(t("story.guess2.c_now", { value: CMA.usd0(R.nominal_latest.value) }).split(", ")); }
    var marksList = [lines1974(), lines2011(), linesNowFn()];
    // the approved events, as numbered markers on the as-quoted line; the two records are already call-outs, so they get a number but no second label
    var EV = CMA.rows(C.events).sort(function (a, b) { return a.month < b.month ? -1 : 1; });
    var events = EV.map(function (e, k) { return { series: "nominal", i: idx(e.month + "-01"), n: k + 1 }; });
    events.forEach(function (e) { if (e.i < 0) { throw new Error("an event month is not on the price series"); } });
    card.appendChild(h("ul", { class: "marklist letters" }, marksList.map(function (ls, k) { return h("li", { text: String.fromCharCode(65 + k) + ". " + ls[0] + ": " + ls.slice(1).join(", ") }); })));
    var xTicks = [];
    S.forEach(function (r, i) { var y = +r.month.slice(0, 4); if (r.month.slice(5, 7) === "01" && y % 10 === 0) { xTicks.push({ i: i, label: String(y) }); } });
    CMA.lineChart(host, {
      n: n, yMax: 22000, yTicks: [0, 5000, 10000, 15000, 20000], yFormat: CMA.usd0, yLabel: t("story.guess2.y_label"), xTicks: xTicks,
      series: [
        { id: "nominal", color: "--copper", values: nominal, label: { text: t("story.guess2.label_nominal"), short: t("story.guess2.label_nominal_short") } },
        { id: "real", color: "--verdigris", dash: "6 5", values: real, label: { text: t("story.guess2.label_real", { base_month: baseMonth }), short: t("story.guess2.label_real_short") } }
      ],
      marks: [
        { series: "real", i: iPeak, lines: lines1974(), dx: 12, dy: 4, anchor: "start" },
        { series: "real", i: i2011, lines: lines2011(), dx: 0, dy: -50, anchor: "middle" },
        { series: "nominal", i: iNow, lines: linesNowFn(), dx: -24, dy: -44, anchor: "end" }
      ],
      events: events,
      gap: gapIdx >= 0 ? { i: gapIdx, series: "real", label: t("story.guess2.gap_label", { month: gapMonth }) } : null,
      tip: function (i) {
        var r = S[i];
        return { title: CMA.monthLong(r.month), lines: [
          t("story.guess2.tip_nominal", { value: CMA.usd0(r.nominal_usd_t) }),
          r.real_usd_t_aug2026 == null ? t("story.guess2.tip_real_missing") : t("story.guess2.tip_real", { base_month: baseMonth, value: CMA.usd0(r.real_usd_t_aug2026) })
        ] };
      },
      aria: t("story.guess2.aria_chart", { from: CMA.monthLong(S[0].month), to: CMA.monthLong(S[n - 1].month), base_month: baseMonth })
    });

    // the same data as a table
    var thead = h("thead", {}, h("tr", {},
      h("th", { scope: "col", text: t("story.guess2.col_month") }), h("th", { scope: "col", text: t("story.guess2.col_nominal") }),
      h("th", { scope: "col", text: t("story.guess2.col_real", { base_month: baseMonth }) })));
    var tbody = h("tbody");
    S.forEach(function (r) {
      tbody.appendChild(h("tr", {},
        h("td", { text: r.month.slice(0, 7) }), h("td", { text: CMA.usd0(r.nominal_usd_t) }),
        h("td", { text: r.real_usd_t_aug2026 == null ? t("story.guess2.no_value") : CMA.usd0(r.real_usd_t_aug2026) })));
    });
    card.appendChild(h("details", { class: "tableview" }, h("summary", { text: t("story.guess2.table_summary") }), h("div", { class: "tablewrap" }, h("table", {}, thead, tbody))));

    // ---- around this time
    CMA.sources.add({ S02: window.CMA_STRINGS.story.sources.names.S02, S04: window.CMA_STRINGS.story.sources.names.S04, S19: window.CMA_STRINGS.story.sources.names.S19 }, t("story.sources.attribution"));
    var srcNames = {};
    EV.forEach(function (e) { srcNames[e.source_id] = e.source_name; });
    CMA.sources.add(srcNames, null);
    box.appendChild(h("section", { class: "events", "aria-labelledby": "ev-title" },
      h("h3", { id: "ev-title", text: t("record.events_title") }),
      h("p", { class: "hint", text: t("record.events_hint") }),
      h("ol", { class: "eventlist" }, EV.map(function (e) {
        return h("li", {},
          h("span", { class: "evdate mono", text: CMA.monthShort(e.month + "-01") }), " ", h("b", { text: e.label + ". " }), e.description + " ",
          h("a", { href: e.source_url, target: "_blank", rel: "noopener noreferrer", text: t("record.event_source") + ": " + e.source_id }));
      }))));

    box.appendChild(h("p", { class: "small muted", text: t("story.guess2.note_2011") }));
    var nsItems = window.CMA_STRINGS.story.notshow.items.map(function (s) { return CMA.fill(s, { series_start: seriesStart }); });
    box.appendChild(h("aside", { class: "note", "aria-labelledby": "rec-ns" },
      h("h3", { id: "rec-ns", text: t("story.notshow.title") }), h("ul", {}, nsItems.map(function (s) { return h("li", { text: s }); }))));
    CMA.bridge(box, t("record.bridge"));
  };
})();
