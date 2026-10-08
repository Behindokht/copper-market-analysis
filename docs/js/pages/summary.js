/* Chapter 8: what it adds up to. The verdict, one sentence per chapter, the driver strip, the visitor's guesses, what we cannot say, and the link to the appendix.
   Every figure is read from the data files again; the page stops if the data no longer supports a sentence. */
(function () {
  var CMA = window.CMA, t = CMA.t, h = CMA.h;
  var T = function (key, vars) { return t("summary." + key, vars); };

  CMA.chapters.summary = function (box) {
    var D = window.CMA_DATA, R = {}, E = {}, C = {};
    CMA.rows(D.story.record_facts).forEach(function (r) { R[r.fact_id] = r; });
    CMA.rows(D.chapters.euro).forEach(function (r) { E[r.fact_id] = r; });
    CMA.rows(D.ratio.case).forEach(function (r) { C[r.fact_id] = r; });
    var rec = {};
    CMA.rows(D.chapters.records).forEach(function (r) { rec[r.commodity] = r; });
    var places = CMA.rows(D.supply.countries).filter(function (r) { return r.placeable === 1; }).sort(function (a, b) { return b.production_2025e_kt - a.production_2025e_kt; });
    var top2 = places[0].share_of_world_production_pct + places[1].share_of_world_production_pct;
    var china = CMA.rows(D.supply.refined).filter(function (r) { return r.country === "China"; })[0];
    var th = CMA.rows(D.ratio.threshold);
    var ref = CMA.rows(D.demand.sensitivity).filter(function (r) { return r.bar_order === 0; })[0];
    var corr = CMA.rows(D.dollar.correlations).filter(function (r) { return r[Object.keys(r)[0]].indexOf("Copper vs broad dollar index") === 0; })[0];

    // the sentences must hold
    var J = CMA.justFacts();
    var topNames = places[0].display_name + " and " + places[1].display_name;
    if (R.nominal_record.month !== R.nominal_latest.month || R.real_months_above_latest.value < 1 || E.eur_latest_is_record.value !== 1 ||
      !(corr["pearson r"] < 0) || th.filter(function (r) { return r.p_holm < 0.05; }).length > th.length / 4 ||
      topNames !== "Chile and DR Congo" || C.run_months.value / 12 < 17.5 || C.run_months.value / 12 >= 18) { throw new Error("a summary sentence no longer matches the data"); }

    var vars = { peak_month: CMA.monthLong(CMA.realRecord().month), peak_above: CMA.n0(CMA.realRecord().belowPct), others: J.othersText, is_are: J.isAre, top2_share: CMA.n0(top2), demand_pct: CMA.n0(ref.headline_total_pct_of_mine), china_ref: CMA.n0(china.refinery_share_pct),
      since: CMA.monthLong(String(C.first_month_of_run.value) + "-01") };
    function checkCount(status) { return CMA.rows(D.quality.checks).filter(function (r) { return r.status === status; }).length; }
    CMA.closingVars = { peak_above: vars.peak_above, peak_month: vars.peak_month };         // the closing panel of the story: two short sentences from the same figures
    var full = box.F || box;
    full.appendChild(h("p", { class: "answer summary-verdict", text: T("verdict", vars) }));

    var items = [["s_uses", "uses", ["uses.end_use", "uses.facts"]], ["s_record", "record", ["story.record_facts", "chapters.euro"]], ["s_just", "just-copper", ["chapters.records"]],
      ["s_dollar", "dollar", ["story.guess_dollar", "dollar.correlations"]], ["s_supply", "supply", ["supply.countries", "supply.refined"]], ["s_demand", "demand", ["demand.sensitivity"]],
      ["s_aluminium", "aluminium", ["ratio.case"]]];
    box.appendChild(h("section", { class: "found", "aria-labelledby": "sum-list" },
      h("h3", { id: "sum-list", text: T("list_title") }),
      h("ul", {}, items.map(function (it) {
        var no = CMA.CHAPTER_NO[it[1] === "just-copper" ? "just" : it[1]];
        // the link sits at the end of its sentence: "Chapter 4" and an arrow drawn by the stylesheet
        return h("li", {}, T(it[0], vars), " ", h("a", { class: "golink", href: "#" + it[1], "aria-label": T("go_aria", { n: no }) }, T("go", { n: no }), h("span", { class: "arr", "aria-hidden": "true" })));
      }))));

    var CAN = window.CMA_STRINGS.summary.cannot, SHORT_CAN = [2, 3];
    function list(titleKey, id) {
      return h("section", { class: "cancan", "aria-labelledby": id },
        h("h3", { id: id, text: T(titleKey) }), h("ul", {}, CAN.map(function (x, i) { return SHORT_CAN.indexOf(i) < 0 ? h("li", { text: CMA.fill(x, vars) }) : null; }).filter(Boolean)));
    }
    // the visitor's own guesses, if they made any (nothing if they skipped)
    var guessBox = h("section", { class: "guesses", "aria-labelledby": "sum-guess", hidden: true });
    box.appendChild(guessBox);
    var G = {};
    CMA.rows(D.story.guess_dollar).forEach(function (r) { G[r.fact_id] = r; });
    CMA.summaryGuesses = function () {
      var g1 = CMA.store.get("g1"), g2 = CMA.store.get("g2"), lines = [];
      if (g1 !== null && !isNaN(+g1)) { lines.push(T("guess1", { guess: Math.round(+g1), actual: CMA.n0(G.r2_dollar_index.value) })); }
      if (g2) { lines.push(T("guess2", { choice: t("story.guess2.opt_" + g2), answer: t("story.guess2.opt_b") })); }
      guessBox.textContent = "";
      guessBox.hidden = !lines.length;
      if (lines.length) { guessBox.appendChild(h("h3", { id: "sum-guess", text: T("guess_title") })); guessBox.appendChild(h("ul", {}, lines.map(function (l) { return h("li", { text: l }); }))); }
    };
    CMA.summaryGuesses();
    box.appendChild(h("p", { class: "cannot-line" }, SHORT_CAN.map(function (i) { return CMA.fill(CAN[i], vars); }).join(" ")));
    full.appendChild(list("cannot_title", "sum-cannot"));

    box.appendChild(h("section", { class: "card", "aria-labelledby": "sum-app" },
      h("h3", { id: "sum-app", text: T("appendix_title") }), h("p", { text: T("appendix_text", { fail: checkCount("FAIL"), warn: checkCount("WARN") }) }),
      h("div", { class: "row" }, h("a", { class: "btn", href: "#quality", text: T("appendix_link") }), h("a", { class: "btn secondary", href: "#method", text: T("method_link") }))));
  };
})();
