/* Demand scenario page. The inputs are the result grids in window.CMA_DATA.demand (tonnes and percentages from notebook 03).
   The page only adds two tabulated results and divides by today's mine output; the reference case is checked against the sensitivity table when the page loads. */
(function () {
  var CMA = window.CMA, h = CMA.h;
  var T = function (key, vars) { return CMA.t("demand." + key, vars); };

  function num(x) { return x == null ? "" : CMA.minus(String(Math.round(x * 100) / 100)); }

  CMA.chapters.demand = function (box) {
    var D = window.CMA_DATA.demand, Q = window.CMA_DATA.quality;
    var EV = CMA.rows(D.ev_cases), DC = CMA.rows(D.dc_cases), AS = CMA.rows(D.assumptions), CT = CMA.rows(D.context);
    var SE = CMA.rows(D.sensitivity), RG = CMA.rows(D.ranges), KI = CMA.rows(Q.known_issues);
    var ctx = {}, asm = {};
    CT.forEach(function (r) { ctx[r.metric] = r; });
    AS.forEach(function (r) { asm[r.input_id] = r; });
    var mine = ctx.world_mine_production_2025e_t.value;
    // whole kilotonnes, halves rounded to the even number: the same rule as Python's round(), so the page matches the notebook
    var r0 = function (x) { var f = Math.floor(x); return x - f === 0.5 ? (f % 2 === 0 ? f : f + 1) : Math.round(x); };
    var ktv = function (k) { return CMA.minus(CMA.n0(r0(k))); };
    var kt = function (t) { return ktv(t / 1000); };
    var pct = function (t) { return CMA.minus(CMA.n1(t / mine * 100)); };

    var evMap = {}, dcMap = {};
    EV.forEach(function (r) { evMap[[r.iea_scenario, r.year, r.path_method, r.bev_case, r.phev_case, r.petrol_case, r.growth_case].join("|")] = r; });
    DC.forEach(function (r) { dcMap[[r.iea_case, r.basis, r.year, r.path, r.intensity_case, r.base_build_case].join("|")] = r; });
    function get(map, key) { var r = map[key]; if (!r) { throw new Error("missing case: " + key); } return r; }

    // ---- settings; the first set is the reference case
    var REF = { scen: "CPS", path: "linear", cu: "mid", petrol: "midsize_mid", dccase: "Base", dcpath: "even", basis: "Whole data centre", intensity: "mid", base: "2023-24" };
    var s = Object.assign({}, REF);

    function evRow(year, st, growth) { return get(evMap, [st.scen, year, year === 2035 ? "direct" : st.path, st.cu, st.cu, st.petrol, growth || "central"].join("|")); }
    function dcRow(year, st, basis) { return get(dcMap, [st.dccase, basis || st.basis, year, st.dcpath, st.intensity, st.base].join("|")); }
    function calc(year, st) {
      var ev = evRow(year, st), dc = dcRow(year, st);
      return { ev: ev.transition_t, mkt: ev.market_growth_t, mktLo: evRow(year, st, "min").market_growth_t, mktHi: evRow(year, st, "max").market_growth_t,
        dcNew: dc.new_capacity_copper_t, dcExtra: dc.extra_vs_base_t, slow: dc.is_slower_build === 1, total: ev.transition_t + dc.extra_vs_base_t, evRow: ev, dcRow: dc };
    }

    // ---- the reference case must equal the sensitivity table's reference row
    var ref30 = calc(2030, REF), refRow = SE.filter(function (r) { return r.bar_order === 0; })[0];
    [[ref30.ev, refRow.ev_transition_t], [ref30.dcNew, refRow.dc_new_capacity_t], [ref30.dcExtra, refRow.dc_extra_vs_base_t], [ref30.total, refRow.headline_total_t]].forEach(function (p) {
      if (Math.abs(p[0] - p[1]) > 1) { throw new Error("the reference case does not match the sensitivity table"); }
    });
    var ref35 = calc(2035, REF);

    var rg = {};
    RG.forEach(function (r) { rg[r.range_id + ":" + r.end] = r; });
    var vars = {
      mine: CMA.n0(mine / 1e6), ev_pct: pct(ref30.ev), dc_pct: pct(ref30.dcNew), tot_pct: pct(ref30.total), ev35_pct: pct(ref35.ev),
      r1_lo: CMA.n1(rg["one_at_a_time:low"].total_pct_of_mine), r1_hi: CMA.n1(rg["one_at_a_time:high"].total_pct_of_mine),
      r2_lo: CMA.n1(rg["all_combinations:low"].total_pct_of_mine), r2_hi: CMA.n1(rg["all_combinations:high"].total_pct_of_mine)
    };

    var wrap = box;
    wrap.appendChild(h("p", { class: "answer", text: T("answer", vars) }));
    wrap.appendChild(h("p", { class: "intro", text: T("intro", vars) }));
    wrap.appendChild(h("p", { class: "verdict", text: T("warn") }));
    var findingsEl = h("section", { class: "findings", "aria-label": "Findings" },
      h("p", { class: "finding", text: T("finding_3", vars) }), h("p", { class: "finding", text: T("finding_4", vars) }));

    // =============================== both ranges, visible without any click
    var axisMax = Math.ceil(rg["all_combinations:high"].total_pct_of_mine / 2) * 2;
    var refPct = refRow.headline_total_pct_of_mine;
    function rangeRow(name, lo, hi, loKt, hiKt, note, extra) {
      var left = lo / axisMax * 100, width = (hi - lo) / axisMax * 100;
      return h("li", { class: "rrow" },
        h("div", { class: "rname", text: name }),
        h("div", { class: "rtrack" }, h("span", { class: "rbar", style: "left:" + left + "%;width:" + width + "%" }),
          h("span", { class: "rref", style: "left:" + (refPct / axisMax * 100) + "%" })),
        h("div", { class: "rval", text: T("range_value", { lo: CMA.n1(lo), hi: CMA.n1(hi), lo_kt: ktv(loKt), hi_kt: ktv(hiKt) }) }),
        note ? h("div", { class: "small muted", text: note }) : null, extra);
    }
    var ticks = [];
    for (var tk = 0; tk <= axisMax; tk += 2) { ticks.push(h("span", { style: "left:" + (tk / axisMax * 100) + "%", text: String(tk) })); }
    function endsDetails() {
      return h("details", { class: "tableview" }, h("summary", { text: T("range_ends") }),
        h("p", { class: "small", text: T("range_low_end", { detail: rg["all_combinations:low"].detail }) }),
        h("p", { class: "small", text: T("range_high_end", { detail: rg["all_combinations:high"].detail }) }));
    }
    var rcard = h("div", { class: "card chart-card", "aria-labelledby": "dm-ranges" },
      h("h3", { id: "dm-ranges", class: "qtitle", text: T("ranges_title") }),
      h("p", { class: "hint", text: T("ranges_hint") }),
      h("ul", { class: "ranges", role: "img", "aria-label": T("range_aria", {
        ref: CMA.n1(refPct) + "%", one_lo: vars.r1_lo + "%", one_hi: vars.r1_hi + "%", all_lo: vars.r2_lo + "%", all_hi: vars.r2_hi + "%" }) },
        h("li", { class: "rrow" }, h("div", { class: "rname", text: T("range_ref") }),
          h("div", { class: "rtrack" }, h("span", { class: "rdot", style: "left:" + (refPct / axisMax * 100) + "%" })),
          h("div", { class: "rval", text: T("range_ref_value", { pct: CMA.n1(refPct), kt: kt(refRow.headline_total_t) }) })),
        rangeRow(T("range_one"), rg["one_at_a_time:low"].total_pct_of_mine, rg["one_at_a_time:high"].total_pct_of_mine, rg["one_at_a_time:low"].total_kt, rg["one_at_a_time:high"].total_kt,
          T("range_cases", { n: CMA.n0(rg["one_at_a_time:low"].cases_considered) })),
        rangeRow(T("range_all"), rg["all_combinations:low"].total_pct_of_mine, rg["all_combinations:high"].total_pct_of_mine, rg["all_combinations:low"].total_kt, rg["all_combinations:high"].total_kt,
          T("range_all_note") + " " + T("range_cases", { n: CMA.n0(rg["all_combinations:low"].cases_considered) }), endsDetails())),
      h("div", { class: "raxis" }, ticks), h("p", { class: "small muted raxis-label", text: T("range_axis") }));

    // =============================== the explorer: selectors and two panels
    var stateLine = h("p", { class: "verdict", "aria-live": "polite" });
    var resetBtn = h("button", { class: "btn secondary small", type: "button", text: T("reset"), onclick: function () { s = Object.assign({}, REF); syncSelects(); update(); } });
    var selects = {};
    function sel(key, label, options, hintFn) {
      var id = "dm-sel-" + key, el = h("select", { id: id });
      options.forEach(function (o) { el.appendChild(h("option", { value: o.value, text: o.text })); });
      el.addEventListener("change", function () { s[key] = el.value; update(); });
      selects[key] = { el: el, options: options };
      var hint = hintFn ? h("p", { class: "small muted", id: id + "-hint" }) : null;
      if (hint) { selects[key].hint = hint; selects[key].hintFn = hintFn; }
      return h("div", { class: "field" }, h("label", { for: id, text: label }), el, hint);
    }
    function syncSelects() { Object.keys(selects).forEach(function (k) { selects[k].el.value = s[k]; }); }

    var growth = CMA.n0(asm.dc_build_growth_pct.mid);
    function tOf(intensity) { return dcRow(2030, Object.assign({}, s, { intensity: intensity })).t_per_mw; }
    var evFields = [
      sel("scen", T("sel_scen"), ["CPS", "STEPS"].map(function (k) { return { value: k, text: T("scen_" + k) }; })),
      sel("path", T("sel_path"), ["linear", "constant_growth"].map(function (k) { return { value: k, text: T("path_" + k) }; })),
      sel("cu", T("sel_cu"), ["low", "mid", "high"].map(function (k) { return { value: k, text: T("cu_" + k) }; }), function () {
        var r = evRow(2030, s); return T("cu_hint", { bev: num(r.bev_kg), phev: num(r.phev_kg) });
      }),
      sel("petrol", T("sel_petrol"), ["midsize_low", "midsize_mid", "midsize_high", "compact_mid", "luxury_mid", "hybrid_bound_mid"].map(function (k) { return { value: k, text: T("pet_" + k) }; }), function () {
        return T("pet_hint", { kg: num(evRow(2030, s).petrol_kg) });
      })
    ];
    var dcFields = [
      sel("dccase", T("sel_dccase"), ["Base", "Lift-Off", "High Efficiency", "Headwinds"].map(function (k) { return { value: k, text: T("dc_" + k) }; })),
      sel("dcpath", T("sel_dcpath"), ["even", "constant_growth"].map(function (k) { return { value: k, text: T("dcpath_" + k, { growth: growth }) }; })),
      sel("basis", T("sel_basis"), ["Whole data centre", "IT equipment"].map(function (k) { return { value: k, text: T("basis_" + k) }; }), function () { return T("basis_hint"); }),
      sel("intensity", T("sel_int"), ["low", "mid", "high", "fibre_shift"].map(function (k) {
        return { value: k, text: k === "fibre_shift" ? T("int_fibre_shift", { t: num(tOf(k)) }) : T("int_" + k, { t: num(tOf(k)) }) };
      })),
      sel("base", T("sel_base"), ["2023-24", "2020-24 average"].map(function (k) { return { value: k, text: T("base_" + k) }; }))
    ];
    var panels = h("div", { class: "panels" });
    var xcard = h("div", { class: "card", id: "dm-explorer", "aria-labelledby": "dm-exp-title" },
      h("h3", { id: "dm-exp-title", class: "qtitle", text: T("explorer_title") }),
      h("p", { class: "hint", text: T("explorer_hint") }),
      h("details", { class: "tableview settings" }, h("summary", { text: T("explorer_open") }),
        h("div", { class: "selgrid" },
          h("fieldset", { class: "selgroup" }, h("legend", { text: T("group_ev") }), evFields),
          h("fieldset", { class: "selgroup" }, h("legend", { text: T("group_dc") }), dcFields))),
      h("div", { class: "row", style: "margin:10px 0" }, stateLine, resetBtn),
      panels);

    var domain = Math.ceil(Math.max(
      Math.max.apply(null, EV.map(function (r) { return r.transition_t; })) + Math.max.apply(null, DC.map(function (r) { return r.extra_vs_base_t; })),
      Math.max.apply(null, DC.map(function (r) { return r.new_capacity_copper_t; }))) / 500000) * 500000;

    function bar(cls, name, sub, value, text) {
      var w = Math.max(0, value) / domain * 100;
      return h("li", { class: "brow " + cls },
        h("div", { class: "bname", text: name }),
        h("div", { class: "btrack" }, h("span", { class: "bfill", style: "width:" + w + "%" })),
        h("div", { class: "bval num", text: text }),
        sub ? h("div", { class: "bsub small muted", text: sub }) : null);
    }
    function panel(year) {
      var c = calc(year, s);
      var val = function (t) { return T("value", { kt: kt(t), pct: pct(t) }); };
      var rows = [
        bar("ev", T("row_ev"), T("row_ev_sub"), c.ev, val(c.ev)),
        bar("dc", T("row_dc"), T("row_dc_sub"), c.dcNew, val(c.dcNew)),
        bar("dcx", T("row_dcx"), T("row_dcx_sub"), c.dcExtra, c.dcExtra < 0 ? T("value_slow", { kt: kt(c.dcExtra) }) : val(c.dcExtra)),
        bar("mkt", T("row_mkt"), T("row_mkt_sub"), c.mkt, T("value_band", { kt: kt(c.mkt), pct: pct(c.mkt), lo: kt(c.mktLo), hi: kt(c.mktHi) })),
        bar("total", T("row_total"), T("row_total_sub"), c.total, val(c.total))
      ];
      var summary = [T("row_ev") + " " + val(c.ev), T("row_dc") + " " + val(c.dcNew), T("row_total") + " " + val(c.total)].join(". ");
      return h("section", { class: "panel", "aria-label": T("panel_title", { year: year }) },
        h("h4", { text: T("panel_title", { year: year }) }),
        h("p", { class: "small muted", text: T(year === 2035 ? "panel_note_2035" : "panel_note_2030") }),
        h("ul", { class: "bars", "aria-label": T("panel_aria", { year: year, rows: summary }) }, rows));
    }

    var basisHost = h("div", { class: "card", "aria-labelledby": "dm-basis" });
    function renderBasis() {
      var w = dcRow(2030, s, "Whole data centre"), it = dcRow(2030, s, "IT equipment");
      var lowerNew = (1 - it.new_capacity_copper_t / w.new_capacity_copper_t) * 100;
      var bothPos = w.extra_vs_base_t > 0 && it.extra_vs_base_t > 0;
      var lowerExtra = bothPos ? (1 - it.extra_vs_base_t / w.extra_vs_base_t) * 100 : null;
      var val = function (t) { return T("value", { kt: kt(t), pct: pct(t) }); };
      basisHost.textContent = "";
      basisHost.appendChild(h("div", { class: "row" }, h("h3", { id: "dm-basis", class: "qtitle", text: T("basis_title") }), h("span", { class: "pill warn", text: T("basis_open") })));
      basisHost.appendChild(h("p", { text: T("basis_text", { t_lo: num(asm.dc_cu_t_per_mw.low), t_hi: num(asm.dc_cu_t_per_mw.high), year: 2030 }) }));
      basisHost.appendChild(h("ul", { class: "bars" },
        bar("dc", T("basis_new") + ": " + T("basis_whole"), null, w.new_capacity_copper_t, val(w.new_capacity_copper_t)),
        bar("dcx", T("basis_new") + ": " + T("basis_it"), null, it.new_capacity_copper_t, val(it.new_capacity_copper_t)),
        bar("dc", T("basis_extra") + ": " + T("basis_whole"), null, w.extra_vs_base_t, w.extra_vs_base_t < 0 ? T("value_slow", { kt: kt(w.extra_vs_base_t) }) : val(w.extra_vs_base_t)),
        bar("dcx", T("basis_extra") + ": " + T("basis_it"), null, it.extra_vs_base_t, it.extra_vs_base_t < 0 ? T("value_slow", { kt: kt(it.extra_vs_base_t) }) : val(it.extra_vs_base_t))));
      basisHost.appendChild(h("p", { class: "verdict", text: T("basis_result", { pct: CMA.n0(lowerNew) }) + " " + (bothPos ? T("basis_result_extra", { pct: CMA.n0(lowerExtra) }) : T("basis_result_none")) }));
    }

    function update() {
      panels.textContent = "";
      panels.appendChild(panel(2030));
      panels.appendChild(panel(2035));
      Object.keys(selects).forEach(function (k) { if (selects[k].hint) { selects[k].hint.textContent = selects[k].hintFn(); } });
      var isRef = Object.keys(REF).every(function (k) { return REF[k] === s[k]; });
      stateLine.textContent = T(isRef ? "state_ref" : "state_custom");
      resetBtn.disabled = isRef;
      renderBasis();
    }
    syncSelects();
    update();

    // =============================== what moves the 2030 total most
    var groups = {};
    SE.forEach(function (r) {
      if (r.bar_order === 0) { return; }
      var g = groups[r.bar_order] = groups[r.bar_order] || { label: r.bar, vals: [] };
      g.vals.push(r.change_vs_reference_t);
    });
    var items = Object.keys(groups).map(function (k) {
      var g = groups[k], lo = Math.min.apply(null, g.vals.concat(0)), hi = Math.max.apply(null, g.vals.concat(0));
      return { label: g.label, lo: lo, hi: hi, swing: hi - lo };
    }).filter(function (g) { return g.swing > 0; }).sort(function (a, b) { return b.swing - a.swing; });
    var tdom = Math.ceil(Math.max.apply(null, items.map(function (g) { return Math.max(-g.lo, g.hi); })) / 100000) * 100000;
    var signed = function (t) { return (t > 0 ? "+" : "") + kt(t); };
    var lab = function (t) { return Math.abs(t) < 500 ? T("sens_tiny") : T("sens_value", { value: signed(t) }); };
    var tbars = h("ul", { class: "tornado" }, items.map(function (g) {
      var negW = -g.lo / tdom * 50, posW = g.hi / tdom * 50;
      return h("li", { class: "trow", "aria-label": T("sens_aria", { label: g.label, lo: signed(g.lo), hi: signed(g.hi) }) },
        h("div", { class: "tname", text: g.label }),
        h("div", { class: "ttrack" }, h("span", { class: "tzero" }),
          g.lo < 0 ? h("span", { class: "tseg neg", style: "left:" + (50 - negW) + "%;width:" + negW + "%" }) : null,
          g.hi > 0 ? h("span", { class: "tseg pos", style: "left:50%;width:" + posW + "%" }) : null,
          g.lo < 0 ? h("span", { class: "tlab l num", style: "left:" + (50 - negW) + "%", text: lab(g.lo) }) : null,
          g.hi > 0 ? h("span", { class: "tlab r num", style: "left:" + (50 + posW) + "%", text: lab(g.hi) }) : null));
    }));
    var sensEl = (h("div", { class: "card chart-card", "aria-labelledby": "dm-sens" },
      h("h3", { id: "dm-sens", class: "qtitle", text: T("sens_title") }),
      h("p", { class: "hint", text: T("sens_hint") }),
      h("p", { class: "small muted", text: T("sens_key") }),
      h("div", { class: "tzero-label small muted", text: T("sens_zero") }),
      tbars,
      h("p", { class: "small muted", text: T("sens_note_hybrid") }),
      h("p", { class: "small muted", text: T("sens_note_round") })));

    // =============================== open issues, known limits, inputs
    var K = {};
    KI.forEach(function (r) { K[r.issue_id] = r; });
    var m = function (t) { return CMA.n2 ? CMA.n2(t / 1e6) : (Math.round(t / 1e4) / 100).toFixed(2); };
    var issues = h("div", { class: "card", "aria-labelledby": "dm-issues" },
      h("h3", { id: "dm-issues", class: "qtitle", text: T("issues_title") }),
      ["K01", "K02"].map(function (id) {
        var text = id === "K01" ? T("issue_k01") : T("issue_k02", {
          s13: CMA.n1(ctx.s13_dc_copper_demand_2025_t.value / 1e6), lo: m(ctx.model_dc_build_2024_copper_low_t.value), hi: m(ctx.model_dc_build_2024_copper_high_t.value) });
        return h("div", { class: "issue" }, h("p", {}, h("span", { class: "pill warn", text: T("issue_open") }), " ", h("b", { text: id + ". " }), text),
          h("details", { class: "tableview" }, h("summary", { text: CMA.t("quality.show_detail") }), h("p", { class: "small", text: K[id].description }), h("p", { class: "small muted", text: K[id].note })));
      }));
    var limitsEl = h("div", { class: "card", "aria-labelledby": "dm-limits" },
      h("h3", { id: "dm-limits", class: "qtitle", text: T("limits_title") }),
      h("ul", {}, KI.filter(function (r) { return r.status === "limitation"; }).map(function (r) { return h("li", {}, h("b", { text: r.issue_id + ". " }), r.description); })));

    var inRows = AS.filter(function (r) { return String(r.kind).indexOf("IEA") < 0; });
    var inputsEl = (h("details", { class: "tableview card-details" }, h("summary", { text: T("inputs_summary") }),
      h("p", { class: "small muted", text: T("inputs_note") }),
      h("div", { class: "tablewrap" }, h("table", {},
        h("thead", {}, h("tr", {}, ["in_col_name", "in_col_low", "in_col_mid", "in_col_high", "in_col_src", "in_col_rel"].map(function (k) { return h("th", { scope: "col", text: T(k) }); }))),
        h("tbody", {}, inRows.map(function (r) {
          return h("tr", {}, h("td", { text: r.name + (r.unit && r.unit !== "method" ? " (" + r.unit + ")" : "") }), h("td", { text: num(r.low) }), h("td", { text: num(r.mid) }),
            h("td", { text: num(r.high) }), h("td", { text: r.source_id }), h("td", { text: r.reliability }));
        }))))));

    // =============================== what this does not show, sources, next
    var nsEl = (h("aside", { class: "note", "aria-labelledby": "dm-ns" },
      h("h3", { id: "dm-ns", text: T("notshow.title") }), h("ul", {}, window.CMA_STRINGS.demand.notshow.items.map(function (x) { return h("li", { text: x }); }))));
    // the page in its final order: answer, the bars, the ranges, findings, capacity basis, open issues, limits, details, foot
    wrap.appendChild(xcard);
    wrap.appendChild(rcard);
    wrap.appendChild(findingsEl);
    wrap.appendChild(basisHost);
    wrap.appendChild(issues);
    wrap.appendChild(nsEl);
    wrap.appendChild(CMA.fold(T("details_lead"), [sensEl, limitsEl, inputsEl]));
    CMA.sources.add(window.CMA_STRINGS.demand.sources.names, T("sources.attribution"));
    CMA.bridge(wrap, T("bridge"));
  };
})();
