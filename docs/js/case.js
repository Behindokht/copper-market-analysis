/* The case-study page (case-study.html): the same strings and data files as the site, the same glass and type. Every number is read from window.CMA_DATA and filled into the text.
   The method figures (block length, number of resamples, lags) are the ones in notebook 01; tools/build_facts.py checks that the notebook still uses them. */
(function () {
  var CMA = window.CMA, t = CMA.t, h = CMA.h;
  var METHOD = { block: "six months", boots: "5,000", lags: "three" };
  var D = window.CMA_DATA;

  function rows(ds) { return CMA.rows(ds); }
  function facts(ds) { var o = {}; rows(ds).forEach(function (r) { o[r.fact_id] = r.value; }); return o; }
  function build() {
    document.title = t("case.page_title");
    var K = facts(D.dash.kpis), G = facts(D.story.guess_dollar), C = facts(D.ratio.case);
    var corr = rows(D.dollar.correlations).filter(function (r) { return /broad dollar index, 2006/.test(r.comparison); })[0];
    var slope = rows(D.ratio.slopes).filter(function (r) { return +r.horizon_m === 6 && /^1970-01 to latest/.test(r.period) && /^log of the ratio/.test(r.predictor); })[0];
    var sup = rows(D.supply.refined), china = sup.filter(function (r) { return r.display_name === "China"; })[0];
    var top = sup.filter(function (r) { return r.mine_listed; }).sort(function (a, b) { return b.mine_share_pct - a.mine_share_pct; })[0];
    var checks = rows(D.quality.checks), count = function (s) { return checks.filter(function (r) { return r.status === s; }).length; };
    var issues = rows(D.quality.known_issues).filter(function (r) { return r.status !== "closed" && r.status !== "resolved"; }).length;
    var v = {
      month: CMA.monthLong(K.latest_month + "-01"), price: "$" + CMA.n0(K.copper_usd_t), years: Math.floor(K.months_total / 12),
      sources: rows(D.quality.sources).length, checks: count("PASS") + count("WARN") + count("FAIL"), fail: count("FAIL"), warn: count("WARN"), issues: issues,
      block: METHOD.block, boots: METHOD.boots, lags: METHOD.lags,
      below: CMA.n0(100 - K.real_share_of_record_pct), peak_month: CMA.monthLong(K.real_peak_month + "-01"), rank: CMA.ordinal(K.real_rank_latest), real_months: CMA.n0(K.real_months_valid),
      r2: CMA.n0(G.r2_dollar_index), opp: CMA.n0(G.opposite_months), n: CMA.n0(G.months_total), r: CMA.f2(corr["pearson r"]), lo: CMA.f2(corr["95% interval low"]), hi: CMA.f2(corr["95% interval high"]),
      be: CMA.f2(C.breakeven_ratio), since: CMA.monthLong(String(C.first_month_of_run) + "-01"), ratio: CMA.f2(C.ratio_latest), slope_r2: CMA.n0(100 * slope.r_squared),
      mine_country: top.display_name, china_ref: CMA.n0(china.refinery_share_pct)
    };
    var P = function (k) { return h("p", { text: t("case." + k, v) }); };
    var LI = function (ks) { return h("ul", {}, ks.map(function (k) { return h("li", { text: t("case." + k, v) }); })); };
    var main = document.getElementById("case");
    main.appendChild(h("div", { class: "ch" }, t("case.kicker")));
    main.appendChild(h("h1", { id: "case-title", tabindex: "-1", text: t("case.title") }));
    main.appendChild(h("p", { class: "byline", text: t("case.byline") }));
    main.appendChild(h("h2", { text: t("case.h_problem") })); main.appendChild(P("p_problem"));
    main.appendChild(h("h2", { text: t("case.h_data") })); main.appendChild(P("p_data"));
    main.appendChild(h("h2", { text: t("case.h_method") })); ["p_method_1", "p_method_2", "p_method_3", "p_method_4"].forEach(function (k) { main.appendChild(P(k)); });
    main.appendChild(h("h2", { text: t("case.h_findings") })); main.appendChild(LI(["f_record", "f_dollar", "f_ratio", "f_supply"]));
    main.appendChild(h("h2", { text: t("case.h_next") })); main.appendChild(LI(["n_1", "n_2", "n_3", "n_4"]));
    main.appendChild(h("h2", { text: t("case.h_learned") })); main.appendChild(LI(["l_1", "l_2", "l_3"]));
    main.appendChild(h("div", { class: "row cs-links" }, h("a", { class: "btn", href: "index.html#dashboard", text: t("case.back") }), h("a", { class: "btn secondary", href: "index.html#story", text: t("case.story_link") }),
      h("a", { class: "btn secondary", href: window.CMA_STRINGS.footer.repo_url, rel: "noopener", text: t("case.repo_link") })));
    main.appendChild(h("p", { class: "small muted cs-note", text: t("case.advice") }));

    // header and footer text
    document.getElementById("brand").appendChild(document.createTextNode(t("site.brand")));
    document.getElementById("brand").appendChild(h("small", { text: t("site.brand_sub") }));
    var nav = document.getElementById("nav");
    [["dashboard", "index.html#dashboard"], ["story", "index.html#story"], ["quality", "index.html#quality"]].forEach(function (n) { nav.appendChild(h("a", { href: n[1], text: t("nav." + n[0]) })); });
    nav.appendChild(h("a", { href: "case-study.html", "aria-current": "page", text: t("footer.case_label") }));
    document.getElementById("skip").textContent = t("case.skip");
    var f = window.CMA_STRINGS.footer, addr = f.email_user + "@" + f.email_domain;
    document.getElementById("footer").appendChild(h("div", { class: "foot-row" }, h("span", { text: f.slim_left }),
      h("span", { class: "foot-right" }, h("a", { href: "index.html#method", text: f.method_label }), h("a", { href: f.repo_url, text: f.repo_label_short, rel: "noopener" }), h("a", { href: f.portfolio_url, text: f.portfolio_label_short, rel: "noopener" }),
        h("a", { href: "mailto:" + addr, text: f.email_link_short }), h("span", { class: "muted", text: f.slim_right }))));
  }
  build();
  document.getElementById("footer").hidden = false;
})();
