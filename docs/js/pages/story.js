/* Story page: two guesses, then the numbers. Every number on the page comes from window.CMA_DATA.story (derived result files). */
(function () {
  var CMA = window.CMA, t = CMA.t, h = CMA.h;

  CMA.pages.story = function (root) {
    var D = window.CMA_DATA.story, Q = window.CMA_DATA.quality;
    var F = {}, R = {};
    CMA.rows(D.guess_dollar).forEach(function (r) { F[r.fact_id] = r; });
    CMA.rows(D.record_facts).forEach(function (r) { R[r.fact_id] = r; });
    var S = CMA.rows(D.copper_series);
    var n = S.length;
    var nominal = S.map(function (r) { return r.nominal_usd_t; });
    var real = S.map(function (r) { return r.real_usd_t_aug2026; });
    var idx = function (month) { return S.findIndex(function (r) { return r.month === month; }); };
    var baseMonth = CMA.monthLong(R.real_latest.month);
    var seriesStart = CMA.monthLong(R.series_months.month);

    root.textContent = "";

    // ---- hero
    root.appendChild(h("div", { class: "hero" }, h("div", { class: "wrap" },
      h("h1", { text: t("hero.title") }),
      h("p", { class: "lead", text: t("hero.lead") }),
      h("p", { class: "byline", text: t("hero.byline") }))));

    var wrap = h("div", { class: "wrap" });
    root.appendChild(wrap);
    wrap.appendChild(h("header", { class: "page-head" },
      h("p", { class: "eyebrow", text: t("story.eyebrow") }),
      h("h2", { id: "story-title", tabindex: "-1", text: t("story.title") }),
      h("p", { class: "intro", text: t("story.intro") }),
      h("button", { class: "btn secondary small", type: "button", id: "g-reset", text: t("story.reset"), onclick: function () {
        CMA.store.clear(["g1", "g2"]); CMA.pages.story(root);
      } })));

    // =============================== guess 1: how much does the dollar account for?
    var g1 = F, locked = false, guess = 50;
    var slider = h("input", { type: "range", id: "g1-slider", min: "0", max: "100", step: "1", value: "50" });
    var out = h("output", { class: "guess-value", for: "g1-slider", text: "50%" });
    var lockBtn = h("button", { class: "btn", type: "button", id: "g1-lock", text: t("story.guess1.lock") });
    var reveal1 = h("div", { class: "reveal", hidden: true, "aria-live": "polite" });
    wrap.appendChild(h("article", { class: "card", id: "guess1", "aria-labelledby": "g1-title" },
      h("p", { class: "eyebrow", text: t("story.guess1.title") }),
      h("h3", { id: "g1-title", text: t("story.guess1.question") }),
      h("p", { class: "hint", text: t("story.guess1.hint") }),
      h("div", { class: "row" },
        h("label", { for: "g1-slider", class: "sr", text: t("story.guess1.slider_label") }), slider, out, lockBtn),
      reveal1));

    function renderReveal1() {
      var actual = g1.r2_dollar_index.value, euro = g1.r2_euro.value;
      var diff = guess - actual;
      var verdictKey = Math.abs(diff) <= 5 ? "verdict_close" : (diff > 0 ? "verdict_high" : "verdict_low");
      var meterPos = function (p) { return "clamp(70px, " + p + "%, calc(100% - 70px))"; };
      var meter = h("div", { class: "meter", role: "img", "aria-label": t("story.guess1.meter_aria", { guess: Math.round(guess), actual: CMA.n0(actual), euro: CMA.n0(euro) }) },
        h("span", { class: "tick", style: "left:" + euro + "%" }),
        h("span", { class: "dot actual", style: "left:" + actual + "%" }),
        h("span", { class: "dot you", style: "left:" + guess + "%" }),
        h("span", { class: "lab up", style: "left:" + meterPos(guess), text: t("story.guess1.meter_you", { value: Math.round(guess) }) }),
        h("span", { class: "lab down", style: "left:" + meterPos(actual), text: t("story.guess1.meter_dollar", { value: CMA.n0(actual) }) }),
        h("span", { class: "lab down2", style: "left:" + meterPos(euro), text: t("story.guess1.meter_euro", { value: CMA.n0(euro) }) }),
        h("span", { class: "ends" }, h("span", { text: t("story.guess1.meter_none") }), h("span", { text: t("story.guess1.meter_all") })));
      var unchanged = g1.unchanged_months.value;
      reveal1.textContent = "";
      reveal1.appendChild(h("h4", { class: "sr", text: t("story.guess1.reveal_title") }));
      reveal1.appendChild(h("div", { class: "bignum num", text: CMA.n0(actual) + "%" }));
      reveal1.appendChild(h("p", { class: "bigcap", text: t("story.guess1.big_caption", {
        r2: CMA.n0(actual), r2_euro: CMA.n0(euro), months: g1.months_total.value,
        from: CMA.monthLong(g1.r2_dollar_index.period_from + "-01"), to: CMA.monthLong(g1.r2_dollar_index.period_to + "-01") }) }));
      reveal1.appendChild(h("p", { class: "verdict", text: t("story.guess1." + verdictKey, { guess: Math.round(guess), actual: CMA.n0(actual) }) }));
      reveal1.appendChild(meter);
      reveal1.appendChild(h("p", { text: t("story.guess1.direction", {
        in_ten: Math.round(g1.opposite_direction_share.value / 10), opposite: g1.opposite_months.value, months: g1.months_total.value,
        fell_share: CMA.n1(g1.copper_fell_when_dollar_rose.value), rose_months: g1.dollar_rose_months.value,
        rose_share: CMA.n1(g1.copper_rose_when_dollar_fell.value), fell_months: g1.dollar_fell_months.value }) }));
      if (unchanged > 0) {
        reveal1.appendChild(h("p", { class: "small muted", text: unchanged === 1 ? t("story.guess1.unchanged_one") : t("story.guess1.unchanged_many", { unchanged: unchanged }) }));
      }
      reveal1.appendChild(h("p", { text: t("story.guess1.caveat") }));
      reveal1.appendChild(h("p", { class: "small muted", text: t("story.guess1.definition") }));
    }
    function setLocked(v) {
      locked = v;
      slider.disabled = v;
      lockBtn.textContent = v ? t("story.guess1.change") : t("story.guess1.lock");
      lockBtn.classList.toggle("secondary", v);
      reveal1.hidden = !v;
      if (v) { renderReveal1(); }
    }
    slider.addEventListener("input", function () { guess = +slider.value; out.textContent = guess + "%"; });
    lockBtn.addEventListener("click", function () {
      if (locked) { setLocked(false); slider.focus(); return; }
      guess = +slider.value; CMA.store.set("g1", String(guess)); setLocked(true);
    });
    var saved1 = CMA.store.get("g1");
    if (saved1 !== null && !isNaN(+saved1)) { guess = +saved1; slider.value = guess; out.textContent = guess + "%"; setLocked(true); }

    // =============================== guess 2: is copper at a record high?
    var optsDef = [["a", "opt_a"], ["b", "opt_b"], ["c", "opt_c"]];
    var reveal2 = h("div", { class: "reveal", hidden: true });
    var radios = optsDef.map(function (o) {
      return h("label", { class: "opt" }, h("input", { type: "radio", name: "g2", value: o[0] }), h("span", { text: t("story.guess2." + o[1]) }));
    });
    var fs = h("fieldset", { class: "opts" }, h("legend", { text: t("story.guess2.legend") }), radios);
    wrap.appendChild(h("article", { class: "card", id: "guess2", "aria-labelledby": "g2-title" },
      h("p", { class: "eyebrow", text: t("story.guess2.title") }),
      h("h3", { id: "g2-title", text: t("story.guess2.question") }),
      h("p", { class: "hint", text: t("story.guess2.hint") }),
      fs, reveal2));

    var chartBuilt = false;
    function renderReveal2(choice) {
      var ok = choice === "b";
      reveal2.hidden = false;
      reveal2.textContent = "";
      reveal2.appendChild(h("h4", { class: "sr", text: t("story.guess2.reveal_title") }));
      reveal2.appendChild(h("p", { class: "verdict", text: ok ? t("story.guess2.match") : t("story.guess2.differ") }));
      reveal2.appendChild(h("p", { class: "finding", text: t("story.guess2.finding", {
        nominal: CMA.usd0(R.nominal_latest.value), latest_month: baseMonth, months: CMA.n0(R.series_months.value), series_start: seriesStart,
        above_count: CMA.n0(R.real_months_above_latest.value), below_2011: CMA.n1(Math.abs(R.latest_vs_real_peak_since_1990_pct.value)),
        peak_above: CMA.n1(R.real_peak_vs_latest_pct.value) }) }));
      reveal2.appendChild(h("p", { class: "small muted", text: t("story.guess2.note_2011") }));

      var card = h("div", { class: "card chart-card" });
      card.appendChild(h("h3", { class: "qtitle", text: t("story.guess2.chart_title") }));
      var realLabel = t("story.guess2.series_real", { base_month: baseMonth });
      card.appendChild(h("div", { class: "key" },
        h("span", { style: "color:var(--copper)" }, h("span", { class: "sw" }), h("span", { style: "color:var(--forest)", text: t("story.guess2.series_nominal") })),
        h("span", { style: "color:var(--green)" }, h("span", { class: "sw" }), h("span", { style: "color:var(--forest)", text: realLabel }))));
      var host = h("div", { class: "chart-host" });
      card.appendChild(host);
      var gapIdx = real.findIndex(function (v) { return v == null; });
      var gapMonth = gapIdx >= 0 ? CMA.monthLong(S[gapIdx].month) : "";
      if (gapIdx >= 0) { card.appendChild(h("p", { class: "small muted", style: "margin-top:10px", text: t("story.guess2.gap_note", { month: gapMonth }) })); }
      reveal2.appendChild(card);

      var iPeak = idx(R.real_peak_all.month), i2011 = idx(R.real_peak_since_1990.month), iNow = n - 1;
      function lines1974() { return [CMA.monthLong(R.real_peak_all.month)].concat(t("story.guess2.c_1974", { value: CMA.usd0(R.real_peak_all.value), pct: CMA.n1(R.real_peak_vs_latest_pct.value) }).split(", ")); }
      function lines2011() { return [CMA.monthLong(R.real_peak_since_1990.month)].concat(t("story.guess2.c_2011", { value: CMA.usd0(R.real_peak_since_1990.value) }).split(", ")); }
      function linesNowFn() { return [CMA.monthLong(R.nominal_latest.month)].concat(t("story.guess2.c_now", { value: CMA.usd0(R.nominal_latest.value) }).split(", ")); }
      var marksList = [lines1974(), lines2011(), linesNowFn()];
      card.appendChild(h("ol", { class: "marklist" }, marksList.map(function (ls) { return h("li", { text: ls[0] + ": " + ls.slice(1).join(", ") }); })));
      var xTicks = [];
      S.forEach(function (r, i) { var y = +r.month.slice(0, 4); if (r.month.slice(5, 7) === "01" && y % 10 === 0) { xTicks.push({ i: i, label: String(y) }); } });
      CMA.lineChart(host, {
        n: n, yMax: 22000, yTicks: [0, 5000, 10000, 15000, 20000], yFormat: CMA.usd0, yLabel: t("story.guess2.y_label"), xTicks: xTicks,
        series: [
          { id: "nominal", color: "--copper", values: nominal, label: { text: t("story.guess2.label_nominal"), short: t("story.guess2.label_nominal_short") } },
          { id: "real", color: "--green", values: real, label: { text: t("story.guess2.label_real", { base_month: baseMonth }), short: t("story.guess2.label_real_short") } }
        ],
        marks: [
          { series: "real", i: iPeak, lines: lines1974(), dx: 12, dy: 4, anchor: "start" },
          { series: "real", i: i2011, lines: lines2011(), dx: 0, dy: -50, anchor: "middle" },
          { series: "nominal", i: iNow, lines: linesNowFn(), dx: -24, dy: -44, anchor: "end" }
        ],
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
      card.appendChild(h("details", { class: "tableview" }, h("summary", { text: t("story.guess2.table_summary") }),
        h("div", { class: "tablewrap" }, h("table", {}, thead, tbody))));
    }
    radios.forEach(function (lab) {
      lab.querySelector("input").addEventListener("change", function (e) { CMA.store.set("g2", e.target.value); renderReveal2(e.target.value); });
    });
    var saved2 = CMA.store.get("g2");
    if (saved2 && optsDef.some(function (o) { return o[0] === saved2; })) {
      radios.forEach(function (lab) { var i = lab.querySelector("input"); if (i.value === saved2) { i.checked = true; } });
      renderReveal2(saved2);
    }

    // =============================== what this does not show, sources, next
    var nsItems = window.CMA_STRINGS.story.notshow.items.map(function (s) { return CMA.fill(s, { series_start: seriesStart }); });
    wrap.appendChild(h("aside", { class: "note", "aria-labelledby": "story-ns" },
      h("h3", { id: "story-ns", text: t("story.notshow.title") }), h("ul", {}, nsItems.map(function (s) { return h("li", { text: s }); }))));

    var srcRows = {};
    CMA.rows(Q.sources).forEach(function (r) { srcRows[r.source_id] = r; });
    var chips = Object.keys(window.CMA_STRINGS.story.sources.names).map(function (id) {
      var r = srcRows[id];
      return h("li", { class: "chip" }, h("b", { text: id }), " " + t("story.sources.names." + id) + ", " +
        t("story.sources.reliability", { reliability: r ? r.reliability : "unrated" }));
    });
    wrap.appendChild(h("section", { class: "sources", "aria-labelledby": "story-src" },
      h("h3", { id: "story-src", text: t("story.sources.title") }), h("ul", { class: "chips" }, chips),
      h("p", { class: "attrib", text: t("story.sources.attribution") })));

    wrap.appendChild(h("nav", { class: "next", "aria-label": "Next page" },
      h("span"), h("a", { class: "btn", href: "#dollar", text: t("story.next", { title: t("pages.dollar.title") }) })));
  };
})();
