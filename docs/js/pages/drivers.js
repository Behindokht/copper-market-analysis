/* The driver strip, "What moves the price of copper": seven items, each with a tag that says what this site does with it. Used in the opener and in the summary.
   Chapter numbers come from CMA.CHAPTER_NO (story.js); the China share comes from the context facts (ICSG). */
(function () {
  var CMA = window.CMA, h = CMA.h;

  CMA.drivers = function (idPrefix) {
    var F = {};
    CMA.rows(window.CMA_DATA.uses.facts).forEach(function (r) { F[r.fact_id] = r; });
    var N = CMA.CHAPTER_NO;
    var vars = { n_dollar: N.dollar, n_supply: N.supply, n_demand: N.demand, n_aluminium: N.aluminium, n_uses: N.uses, china: CMA.n0(F.F01.value) };
    var items = window.CMA_STRINGS.drivers.items;
    return h("section", { class: "drivers", "aria-labelledby": idPrefix + "-drivers" },
      h("h3", { id: idPrefix + "-drivers", text: CMA.t("drivers.title") }),
      h("ul", {}, items.map(function (it) {
        return h("li", {}, h("span", { class: "dtag " + it.tag.replace("_", "-"), text: CMA.t("drivers.tag_" + it.tag) }), h("b", { text: it.name }), h("p", { text: CMA.fill(it.line, vars) }));
      })));
  };
})();
