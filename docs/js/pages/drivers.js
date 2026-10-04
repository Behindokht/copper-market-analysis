/* "What moves the price of copper": six items on a light glass sheet right after the opener, one tag each that says what this site does with it (as in the story study).
   Chapter numbers come from CMA.CHAPTER_NO (story.js); the China share comes from the context facts (ICSG). It appears once only. */
(function () {
  var CMA = window.CMA, h = CMA.h;

  CMA.drivers = function () {
    var F = {};
    CMA.rows(window.CMA_DATA.uses.facts).forEach(function (r) { F[r.fact_id] = r; });
    var N = CMA.CHAPTER_NO;
    var vars = { n_dollar: N.dollar, n_supply: N.supply, n_demand: N.demand, n_aluminium: N.aluminium, n_uses: N.uses, china: CMA.n0(F.F01.value) };
    return h("div", { class: "drivers" }, window.CMA_STRINGS.drivers.items.map(function (it) {
      return h("div", { class: "drv" }, h("small", { text: CMA.t("drivers.tag_" + it.tag) }), h("b", { text: it.name }), h("span", { text: CMA.fill(it.line, vars) }));
    }));
  };
})();
