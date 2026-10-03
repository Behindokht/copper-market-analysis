/* Appendix: how I built this. The pipeline with the real counts at each step (from the data files), the tools, the main decisions, what comes next. */
(function () {
  var CMA = window.CMA, h = CMA.h;
  var T = function (key, vars) { return CMA.t("method." + key, vars); };

  CMA.pages.method = function (root) {
    var Q = window.CMA_DATA.quality, P = window.CMA_DATA.provenance.datasets;
    var pl = {};
    CMA.rows(Q.pipeline).forEach(function (r) { pl[r.kind] = r.n_tables; });
    var checks = CMA.rows(Q.checks), count = function (st) { return checks.filter(function (c) { return c.status === st; }).length; };
    var notebooks = [];
    Object.keys(P).forEach(function (k) { if (P[k].notebook && notebooks.indexOf(P[k].notebook) < 0) { notebooks.push(P[k].notebook); } });
    notebooks.sort();

    var steps = [
      [T("step_raw"), T("n_tables", { n: pl.raw })],
      [T("step_staging"), T("n_tables", { n: pl.staging })],
      [T("step_mart"), T("n_tables", { n: pl.mart })],
      [T("step_checks"), T("n_checks", { pass: count("PASS"), warn: count("WARN"), fail: count("FAIL") })],
      [T("step_notebooks"), T("n_notebooks", { n: notebooks.length })],
      [T("step_results"), T("n_tables", { n: pl.result })],
      [T("step_site"), T("n_site", { n: CMA.CHAPTER_COUNT })]
    ];
    root.textContent = "";
    var wrap = h("div", { class: "wrap" });
    root.appendChild(wrap);
    wrap.appendChild(h("header", { class: "page-head" },
      h("p", { class: "eyebrow", text: CMA.t("pages.quality.eyebrow") }),
      h("h2", { id: "method-title", tabindex: "-1", text: T("title") }),
      h("p", { class: "intro", text: T("intro") })));
    wrap.appendChild(h("section", { class: "card", "aria-labelledby": "m-flow" },
      h("h3", { id: "m-flow", class: "qtitle", text: T("flow_title") }),
      h("ol", { class: "flow" }, steps.map(function (st, k) {
        return h("li", {}, h("span", { class: "flow-n mono", text: String(k + 1) }), h("b", { text: st[0] }), h("span", { class: "flow-c num", text: st[1] }));
      })),
      h("p", { class: "small muted", text: notebooks.join(", ") })));
    function list(titleKey, key, id) {
      return h("section", { class: "cancan", "aria-labelledby": id }, h("h3", { id: id, text: T(titleKey) }),
        h("ul", {}, window.CMA_STRINGS.method[key].map(function (x) { return h("li", { text: x }); })));
    }
    wrap.appendChild(h("div", { class: "cangrid" }, list("tools_title", "tools", "m-tools"), list("decisions_title", "decisions", "m-dec")));
    wrap.appendChild(list("next_title", "next", "m-next"));
    CMA.pageFoot(wrap, null);
    wrap.appendChild(h("nav", { class: "next", "aria-label": "Back" }, h("a", { class: "btn secondary", href: "#summary", text: T("back") })));
  };
})();
