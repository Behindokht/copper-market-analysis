/* Chapter 6: what it adds up to. The verdict, one sentence per chapter, what we can and cannot say, and the link to the appendix.
   Every figure is read from the data files again; the page stops if the data no longer supports a sentence. */
(function () {
  var CMA = window.CMA, t = CMA.t, h = CMA.h;
  var T = function (key, vars) { return t("summary." + key, vars); };

  CMA.chapters.summary = function (box) {
    var D = window.CMA_DATA, R = {}, E = {};
    CMA.rows(D.story.record_facts).forEach(function (r) { R[r.fact_id] = r; });
    CMA.rows(D.chapters.euro).forEach(function (r) { E[r.fact_id] = r; });
    var rec = {};
    CMA.rows(D.chapters.records).forEach(function (r) { rec[r.commodity] = r; });
    var places = CMA.rows(D.supply.countries).filter(function (r) { return r.placeable === 1; }).sort(function (a, b) { return b.production_2025e_kt - a.production_2025e_kt; });
    var top2 = places[0].share_of_world_production_pct + places[1].share_of_world_production_pct;
    var th = CMA.rows(D.ratio.threshold);
    var ref = CMA.rows(D.demand.sensitivity).filter(function (r) { return r.bar_order === 0; })[0];
    var corr = CMA.rows(D.dollar.correlations).filter(function (r) { return r[Object.keys(r)[0]].indexOf("Copper vs broad dollar index") === 0; })[0];

    // the sentences must hold
    var nearGold = rec.gold.latest_pct_of_nominal_peak >= 85, tinRecord = rec.tin.at_nominal_record;
    if (R.nominal_record.month !== R.nominal_latest.month || R.real_months_above_latest.value < 1 || E.eur_latest_is_record.value !== 1 || !tinRecord || !nearGold ||
      !(corr["pearson r"] < 0) || th.filter(function (r) { return r.p_holm < 0.05; }).length > th.length / 4) { throw new Error("a summary sentence no longer matches the data"); }

    var vars = { peak_month: CMA.monthLong(CMA.realRecord().month), top2_share: CMA.n0(top2), demand_pct: CMA.n0(ref.headline_total_pct_of_mine) };
    box.appendChild(h("p", { class: "answer", text: T("verdict", vars) }));

    var items = [["s_record", "record"], ["s_just", "just-copper"], ["s_dollar", "dollar"], ["s_aluminium", "aluminium"], ["s_supply", "supply"], ["s_demand", "demand"]];
    box.appendChild(h("section", { class: "found", "aria-labelledby": "sum-list" },
      h("h3", { id: "sum-list", text: T("list_title") }),
      h("ul", {}, items.map(function (it) {
        return h("li", {}, T(it[0], vars) + " ", h("a", { href: "#" + it[1], text: T("go") }));
      }))));

    function list(titleKey, key, id) {
      return h("section", { class: "cancan", "aria-labelledby": id },
        h("h3", { id: id, text: T(titleKey) }), h("ul", {}, window.CMA_STRINGS.summary[key].map(function (x) { return h("li", { text: CMA.fill(x, vars) }); })));
    }
    box.appendChild(h("div", { class: "cangrid" }, list("can_title", "can", "sum-can"), list("cannot_title", "cannot", "sum-cannot")));

    box.appendChild(h("section", { class: "card", "aria-labelledby": "sum-app" },
      h("h3", { id: "sum-app", text: T("appendix_title") }), h("p", { text: T("appendix_text") }),
      h("a", { class: "btn", href: "#quality", text: T("appendix_link") })));
  };
})();
