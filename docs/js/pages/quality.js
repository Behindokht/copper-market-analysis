/* Data quality page: the checks, open problems first, the source register, known limits. Everything comes from window.CMA_DATA.quality. */
(function () {
  var CMA = window.CMA, h = CMA.h;
  var T = function (key, vars) { return CMA.t("quality." + key, vars); };

  // which written reason belongs to which warning; a warning that matches none is still shown, with a note
  function reasonKey(c) {
    var d = String(c.description);
    if (/^known issue K01/.test(d)) { return "K01"; }
    if (/^known issue K02/.test(d)) { return "K02"; }
    if (c.table_name === "company_production" && /different bases/.test(d)) { return "company_diff"; }
    if (c.table_name === "company_production" && /secondary articles/.test(d)) { return "company_source"; }
    if (c.table_name === "mine_production") { return "mine_source"; }
    if (c.table_name === "stg_fred_monthly" && /CPIAUCSL/.test(d)) { return "cpi_gap"; }
    return "other";
  }
  var ORDER = ["K01", "K02", "company_diff", "company_source", "mine_source", "cpi_gap", "other"];

  CMA.pages.quality = function (root) {
    var D = window.CMA_DATA.quality;
    var C = CMA.rows(D.checks), SRC = CMA.rows(D.sources), KI = CMA.rows(D.known_issues), PL = CMA.rows(D.pipeline);
    var count = function (st) { return C.filter(function (c) { return c.status === st; }).length; };
    var pl = {};
    PL.forEach(function (r) { pl[r.kind] = r.n_tables; });

    root.textContent = "";
    var wrap = h("div", { class: "wrap" });
    root.appendChild(wrap);
    wrap.appendChild(h("header", { class: "page-head" },
      h("p", { class: "eyebrow", text: CMA.t("pages.quality.eyebrow") }),
      h("h2", { id: "quality-title", tabindex: "-1", text: CMA.t("pages.quality.title") }),
      h("p", { class: "intro", text: T("intro") }),
      h("p", { class: "finding", text: T("summary", { n_pass: count("PASS"), n_info: count("INFO"), n_warn: count("WARN"), n_fail: count("FAIL") }) })));

    // ---- how the data moves
    wrap.appendChild(h("section", { class: "card", "aria-labelledby": "q-flow" },
      h("h3", { id: "q-flow", text: T("flow_title") }),
      h("p", { text: T("flow_text", { raw: pl.raw, staging: pl.staging, mart: pl.mart, result: pl.result }) }),
      h("p", { class: "small muted", text: T("flow_note") })));

    // ---- open problems first
    var warns = C.filter(function (c) { return c.status === "WARN"; });
    warns.sort(function (a, b) { return ORDER.indexOf(reasonKey(a)) - ORDER.indexOf(reasonKey(b)) || a.check_no - b.check_no; });
    wrap.appendChild(h("section", { class: "card", "aria-labelledby": "q-open" },
      h("h3", { id: "q-open", text: T("open_title") }),
      h("p", { class: "hint", text: T("open_hint") }),
      h("ul", { class: "issues" }, warns.map(function (c) {
        var key = reasonKey(c);
        return h("li", { class: "issue" },
          h("p", {}, h("span", { class: "pill warn", text: T("open_chip") }), " ", h("b", { text: (/^K0/.test(key) ? key + ". " : "Check " + c.check_no + ". ") }), T("reason." + key)),
          h("details", { class: "tableview" }, h("summary", { text: T("show_detail") }),
            h("p", { class: "small", text: c.table_name + ": " + c.description }), h("p", { class: "small muted", text: String(c.detail) })));
      }))));

    // ---- known limits
    var limits = KI.filter(function (r) { return r.status === "limitation"; });
    wrap.appendChild(h("section", { class: "card", "aria-labelledby": "q-limits" },
      h("h3", { id: "q-limits", text: T("limits_title") }), h("p", { class: "hint", text: T("limits_hint") }),
      h("ul", {}, limits.map(function (r) { return h("li", {}, h("b", { text: r.issue_id + ". " }), r.description); }))));

    // ---- sources
    var rows = SRC.map(function (r) {
      var link = /^https?:\/\//.test(String(r.url)) ? h("a", { href: r.url, target: "_blank", rel: "noopener noreferrer", text: T("src_link") }) : null;
      return h("tr", {},
        h("td", { text: r.source_id }),
        h("td", {}, h("div", { text: r.name }),
          h("details", { class: "tableview" }, h("summary", { text: T("src_licence") }),
            h("p", { class: "small", text: String(r.licence_note) }), r.notes ? h("p", { class: "small muted", text: T("src_notes") + ": " + r.notes }) : null, link ? h("p", { class: "small" }, link) : null)),
        h("td", { text: r.publisher }), h("td", { text: r.source_type }),
        h("td", {}, h("span", { class: "pill rel-" + String(r.reliability).replace(/\W/g, ""), text: r.reliability })),
        h("td", { text: String(r.accessed_on) }));
    });
    wrap.appendChild(h("section", { class: "numbers", "aria-labelledby": "q-src" },
      h("h3", { id: "q-src", text: T("sources_title") }), h("p", { class: "hint", text: T("sources_hint") }),
      h("p", { class: "small muted", text: T("src_lme") }),
      h("div", { class: "numwrap" }, h("table", { class: "numtable srctable" },
        h("thead", {}, h("tr", {}, ["src_col_id", "src_col_name", "src_col_publisher", "src_col_type", "src_col_rel", "src_col_accessed"].map(function (k) { return h("th", { scope: "col", text: T(k) }); }))),
        h("tbody", {}, rows)))));

    // ---- every check, with a filter
    var filter = "all";
    var tbody = h("tbody"), countLine = h("p", { class: "small muted", "aria-live": "polite" });
    function renderChecks() {
      tbody.textContent = "";
      var list = C.filter(function (c) { return filter === "all" || c.status === filter; });
      list.forEach(function (c) {
        tbody.appendChild(h("tr", {}, h("td", { text: String(c.check_no) }), h("td", { text: c.table_name }), h("td", { text: c.description }),
          h("td", {}, h("span", { class: "pill " + String(c.status).toLowerCase(), text: c.status })), h("td", { text: String(c.detail) })));
      });
      countLine.textContent = T("chk_count", { n: list.length });
    }
    var opts = ["all", "WARN", "INFO", "PASS", "FAIL"].filter(function (k) { return k === "all" || count(k) > 0; });
    var radios = h("div", { class: "opts-row" }, opts.map(function (k) {
      var inp = h("input", { type: "radio", name: "qf", value: k });
      if (k === "all") { inp.checked = true; }
      inp.addEventListener("change", function () { filter = k; renderChecks(); });
      return h("label", {}, inp, h("span", { text: T("f_" + k) + (k === "all" ? " (" + C.length + ")" : " (" + count(k) + ")") }));
    }));
    wrap.appendChild(h("section", { class: "card", "aria-labelledby": "q-checks" },
      h("h3", { id: "q-checks", text: T("checks_title") }), h("p", { class: "hint", text: T("checks_hint") }),
      h("fieldset", { class: "seg" }, h("legend", { text: T("filter_legend") }), radios), countLine,
      h("div", { class: "tablewrap tall" }, h("table", { class: "checktable" },
        h("thead", {}, h("tr", {}, ["chk_col_no", "chk_col_table", "chk_col_what", "chk_col_status", "chk_col_detail"].map(function (k) { return h("th", { scope: "col", text: T(k) }); }))), tbody))));
    renderChecks();

    wrap.appendChild(h("nav", { class: "next", "aria-label": "Next page" },
      h("a", { class: "btn secondary", href: "#demand", text: CMA.t("nav.demand") }),
      h("a", { class: "btn", href: "#story", text: T("next_back") })));
  };
})();
