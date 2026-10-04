/* The story: one long page. An opener, then eight chapters in order: 1 uses, 2 record (with guess 2), 3 not only copper, 4 dollar (with guess 1), 5 supply,
   6 demand, 7 aluminium, 8 what it adds up to. Each chapter has an anchor; the data-quality page is a separate appendix. Every number comes from the data files in window.CMA_DATA. */
(function () {
  var CMA = window.CMA, t = CMA.t, h = CMA.h;

  var CHAPTERS = [
    { id: "uses", key: "uses", label: "chapter", numeral: "i", page: "uses" },
    { id: "record", key: "record", label: "chapter", numeral: "ii", page: "record" },
    { id: "just-copper", key: "just", label: "chapter", numeral: "iii", page: "just" },
    { id: "dollar", key: "dollar", label: "chapter", numeral: "iv", page: "dollar" },
    { id: "supply", key: "supply", label: "chapter", numeral: "v", page: "supply", wide: true },
    { id: "demand", key: "demand", label: "chapter", numeral: "vi", page: "demand" },
    { id: "aluminium", key: "aluminium", label: "chapter", numeral: "vii", page: "aluminium" },
    { id: "summary", key: "summary", label: "summary_index", numeral: "viii", page: "summary" }
  ];
  CMA.CHAPTER_NO = {};
  CHAPTERS.forEach(function (c, i) { CMA.CHAPTER_NO[c.key] = i + 1; });
  CMA.CHAPTER_IDS = CHAPTERS.map(function (c) { return c.id; });
  CMA.CHAPTER_COUNT = CHAPTERS.filter(function (c) { return c.label === "chapter" || c.label === "summary_index"; }).length;

  CMA.pages.story = function (root) {
    var D = window.CMA_DATA.story;
    var F = {}, R = {};
    CMA.rows(D.guess_dollar).forEach(function (r) { F[r.fact_id] = r; });
    CMA.rows(D.record_facts).forEach(function (r) { R[r.fact_id] = r; });
    CMA.sources.reset();
    root.textContent = "";

    // ---- opener: dark, with the copper plate photo when docs/img/copper-plate.jpg exists (see tools/photo_flag.py), plain ink if not
    var realRec = CMA.realRecord();
    var U = {};
    CMA.rows(window.CMA_DATA.uses.figures).forEach(function (r) { U[r.fact_id] = r; });
    var nChecks = CMA.rows(window.CMA_DATA.quality.checks).filter(function (r) { return r.status === "PASS"; }).length;
    var sparkSvg = CMA.svg("svg", { class: "spark spark-title", viewBox: "-40 -40 80 80", "aria-hidden": "true" });
    CMA.spark.build(sparkSvg);
    var plaque = h("aside", { class: "plaque glass lens rise", style: "--i:5", "aria-label": t("hero.plaque_aria") },
      h("p", { class: "mono", text: t("hero.plaque_label", { month: CMA.monthLong(R.nominal_latest.month) }) }),
      h("p", { class: "price num" }, CMA.usd0(R.nominal_latest.value), h("small", { text: t("hero.plaque_unit") }), CMA.chip(["story.record_facts"])),
      h("p", { class: "unit", text: t("hero.plaque_line") }),
      h("dl", { class: "cert" },
        h("div", {}, h("dt", { text: t("hero.cert_nominal") }), h("dd", {}, t("hero.cert_nominal_v", { n: CMA.n0(R.series_months.value) }), CMA.chip(["story.record_facts"]))),
        h("div", {}, h("dt", { text: t("hero.cert_12m") }), h("dd", {}, t("hero.cert_12m_v", { pct: CMA.n0(U.copper_12m_change_pct.value), month: CMA.monthShort(U.copper_12m_ago_month.value + "-01"), price: CMA.usd0(U.copper_12m_ago_usd_t.value) }), CMA.chip(["uses.figures"]))),
        h("div", {}, h("dt", { text: t("hero.cert_real") }), h("dd", {}, t("hero.cert_real_v", { pct: CMA.n0(realRec.belowPct), month: CMA.monthLong(realRec.month) }), CMA.chip(["story.record_facts", "chapters.records"])))));
    var hero = h("section", { class: "hero", id: "top" }, h("div", { class: "wrap hero-grid" },
      h("div", {},
        h("p", { class: "eyebrow rise", style: "--i:1", text: t("hero.eyebrow") }),
        h("h1", { class: "rise", style: "--i:2" }, h("em", { text: t("hero.title_em") }), h("span", { class: "spark-anchor" }, sparkSvg), t("hero.title_rest")),
        h("p", { class: "lede rise", style: "--i:3", text: t("hero.lead", { years: Math.floor(R.series_months.value / 12), change: CMA.n0(U.copper_12m_change_pct.value), chapters: window.CMA_STRINGS.hero.number_words[CMA.CHAPTER_COUNT] }) }),
        h("p", { class: "hurry rise", style: "--i:3" }, h("a", { href: "#summary", text: t("hero.summary_link") })),
        h("ul", { class: "facts rise", style: "--i:4" },
          h("li", {}, h("b", { class: "num", text: CMA.n0(R.series_months.value) }), h("span", { class: "mono", text: t("hero.fact_months", { year: R.series_months.month.slice(0, 4) }) })),
          h("li", {}, h("b", { class: "num", text: CMA.n0(nChecks) }), h("span", { class: "mono", text: t("hero.fact_checks") })))),
      plaque), h("div", { class: "wrap" }, CMA.drivers("hero")));
    if (window.CMA_PHOTO) { hero.classList.add("has-photo"); hero.style.setProperty("--photo", 'url("' + window.CMA_PHOTO + '")'); }
    root.appendChild(hero);
    if (CMA.glass) { CMA.glass.init(root); }
    setTimeout(function () { CMA.spark.fire(sparkSvg); }, 1050);

    var wrap = h("div", { class: "wrap" });
    root.appendChild(wrap);
    var resetBtn = h("button", { class: "btn secondary small", type: "button", id: "g-reset", text: t("story.reset"), hidden: true, onclick: function () {
      CMA.store.clear(["g1", "g2"]); CMA.pages.story(root);
    } });
    wrap.appendChild(resetBtn);
    function refreshReset() { resetBtn.hidden = CMA.store.get("g1") === null && CMA.store.get("g2") === null; }

    // ---- chapter shells: an index column and a body, with the chapter's question as its heading
    var bodies = {};
    CHAPTERS.forEach(function (c) {
      var idx = h("div", { class: "index" }, t("story." + c.label), c.numeral ? h("b", { text: c.numeral }) : null, h("span", { class: "of-total", text: t("story.of_total", { n: CMA.CHAPTER_COUNT }) }));
      var body = h("div", { class: "story-body" }, h("h2", { id: c.id + "-title", tabindex: "-1", text: t("pages." + c.page + ".title") }));
      wrap.appendChild(h("section", { class: "story chapter" + (c.wide ? " wide" : ""), id: c.id, "aria-labelledby": c.id + "-title" }, idx, body));
      bodies[c.id] = body;
    });

    function skipButton(onclick) { return h("button", { class: "linkbtn", type: "button", text: t("story.skip"), onclick: onclick }); }

    // =============================== chapter 1: the record, guess 2 first
    var optsDef = [["a", "opt_a"], ["b", "opt_b"], ["c", "opt_c"]];
    var reveal2 = h("div", { class: "reveal", hidden: true });
    var radios = optsDef.map(function (o) {
      return h("label", { class: "opt" }, h("input", { type: "radio", name: "g2", value: o[0] }), h("span", { text: t("story.guess2." + o[1]) }));
    });
    var shown2 = false;
    function showRecord(choice) {
      if (shown2) { return; }
      shown2 = true;
      reveal2.hidden = false;
      skip2.hidden = true;
      CMA.chapters.record(reveal2, { choice: choice });
    }
    bodies.record.appendChild(h("p", { class: "hint", text: t("story.guess2.hint") }));
    bodies.record.appendChild(h("fieldset", { class: "opts" }, h("legend", { text: t("story.guess2.legend") }), radios));
    var skip2 = h("p", { class: "skiprow" }, skipButton(function () { showRecord(null); }));
    bodies.record.appendChild(skip2);
    bodies.record.appendChild(reveal2);
    radios.forEach(function (lab) {
      lab.querySelector("input").addEventListener("change", function (e) { CMA.store.set("g2", e.target.value); showRecord(e.target.value); refreshReset(); if (CMA.summaryGuesses) { CMA.summaryGuesses(); } });
    });
    var saved2 = CMA.store.get("g2");
    if (saved2 && optsDef.some(function (o) { return o[0] === saved2; })) {
      radios.forEach(function (lab) { var i = lab.querySelector("input"); if (i.value === saved2) { i.checked = true; } });
      showRecord(saved2);
    }

    // =============================== chapter 1 (uses) and chapter 3 (not only copper)
    CMA.chapters.uses(bodies.uses);
    CMA.chapters.just(bodies["just-copper"]);

    // =============================== chapter 4: the dollar, guess 1 first
    var g1 = F, guess = 50, locked = false, haveGuess = false, shown1 = false;
    var slider = h("input", { type: "range", id: "g1-slider", min: "0", max: "100", step: "1", value: "50" });
    var out = h("output", { class: "guess-value", for: "g1-slider", text: "50%" });
    var lockBtn = h("button", { class: "btn", type: "button", id: "g1-lock", text: t("story.guess1.lock") });
    var reveal1 = h("div", { class: "reveal", hidden: true, "aria-live": "polite" });
    var result1 = h("div", { class: "result" });
    var rest1 = h("div", { class: "chapterrest" });
    reveal1.appendChild(result1);
    reveal1.appendChild(rest1);
    bodies.dollar.appendChild(h("p", { class: "intro", text: t("dollar.usual") }));
    bodies.dollar.appendChild(h("p", { class: "hint", text: t("story.guess1.question") + " " + t("story.guess1.hint") }));
    bodies.dollar.appendChild(h("div", { class: "row" }, h("label", { for: "g1-slider", class: "sr", text: t("story.guess1.slider_label") }), slider, out, lockBtn));
    var skip1 = h("p", { class: "skiprow" }, skipButton(function () { showDollar(); }));
    bodies.dollar.appendChild(skip1);
    bodies.dollar.appendChild(reveal1);

    function renderResult1() {
      var actual = g1.r2_dollar_index.value, euro = g1.r2_euro.value;
      var meterPos = function (p) { return "clamp(70px, " + p + "%, calc(100% - 70px))"; };
      var kids = [h("span", { class: "tick", style: "left:" + euro + "%" }), h("span", { class: "dot actual", style: "left:" + actual + "%" })];
      if (haveGuess) { kids.push(h("span", { class: "dot you", style: "left:" + guess + "%" })); kids.push(h("span", { class: "lab up", style: "left:" + meterPos(guess), text: t("story.guess1.meter_you", { value: Math.round(guess) }) })); }
      kids.push(h("span", { class: "lab down", style: "left:" + meterPos(actual), text: t("story.guess1.meter_dollar", { value: CMA.n0(actual) }) }));
      kids.push(h("span", { class: "lab down2", style: "left:" + meterPos(euro), text: t("story.guess1.meter_euro", { value: CMA.n0(euro) }) }));
      kids.push(h("span", { class: "ends" }, h("span", { text: t("story.guess1.meter_none") }), h("span", { text: t("story.guess1.meter_all") })));
      var meter = h("div", { class: "meter", role: "img", "aria-label": t("story.guess1.meter_aria", { guess: haveGuess ? Math.round(guess) : "none", actual: CMA.n0(actual), euro: CMA.n0(euro) }) }, kids);
      var diff = guess - actual;
      var verdictKey = Math.abs(diff) <= 5 ? "verdict_close" : (diff > 0 ? "verdict_high" : "verdict_low");
      var unchanged = g1.unchanged_months.value;
      result1.textContent = "";
      result1.appendChild(h("h4", { class: "sr", text: t("story.guess1.reveal_title") }));
      result1.appendChild(h("div", { class: "bignum num", text: CMA.n0(actual) + "%" }));
      result1.appendChild(h("p", { class: "bigcap", text: t("story.guess1.big_caption", {
        r2: CMA.n0(actual), r2_euro: CMA.n0(euro), months: g1.months_total.value,
        from: CMA.monthLong(g1.r2_dollar_index.period_from + "-01"), to: CMA.monthLong(g1.r2_dollar_index.period_to + "-01") }) }));
      if (haveGuess) { result1.appendChild(h("p", { class: "verdict", text: t("story.guess1." + verdictKey, { guess: Math.round(guess), actual: CMA.n0(actual) }) })); }
      result1.appendChild(meter);
      result1.appendChild(h("p", { text: t("story.guess1.direction", {
        in_ten: Math.round(g1.opposite_direction_share.value / 10), opposite: g1.opposite_months.value, months: g1.months_total.value,
        fell_share: CMA.n1(g1.copper_fell_when_dollar_rose.value), rose_months: g1.dollar_rose_months.value,
        rose_share: CMA.n1(g1.copper_rose_when_dollar_fell.value), fell_months: g1.dollar_fell_months.value }) }));
      if (unchanged > 0) { result1.appendChild(h("p", { class: "small muted", text: unchanged === 1 ? t("story.guess1.unchanged_one") : t("story.guess1.unchanged_many", { unchanged: unchanged }) })); }
      result1.appendChild(h("p", { text: t("story.guess1.caveat") }));
      result1.appendChild(h("p", { class: "small muted", text: t("story.guess1.definition") }));
    }
    function showDollar() {
      renderResult1();
      reveal1.hidden = false;
      skip1.hidden = true;
      if (!shown1) { shown1 = true; CMA.chapters.dollar(rest1); }
    }
    function setLocked(v) {
      locked = v;
      slider.disabled = v;
      lockBtn.textContent = v ? t("story.guess1.change") : t("story.guess1.lock");
      lockBtn.classList.toggle("secondary", v);
    }
    slider.addEventListener("input", function () { guess = +slider.value; out.textContent = guess + "%"; });
    lockBtn.addEventListener("click", function () {
      if (locked) { setLocked(false); slider.focus(); return; }
      guess = +slider.value; haveGuess = true; CMA.store.set("g1", String(guess)); setLocked(true); refreshReset(); showDollar(); if (CMA.summaryGuesses) { CMA.summaryGuesses(); }
    });
    var saved1 = CMA.store.get("g1");
    if (saved1 !== null && !isNaN(+saved1)) { guess = +saved1; haveGuess = true; slider.value = guess; out.textContent = guess + "%"; setLocked(true); showDollar(); }

    function revealWhenPassed(el, show) {
      // once the box is above the top of the screen (scrolled past, or jumped past with the nav), the visitor chose not to guess.
      // A scroll check, not an IntersectionObserver: a jump from below the screen to above it never crosses an observer threshold.
      var raf = 0, done = false;
      var check = function () {
        if (done || document.getElementById("story").hidden) { return; }
        if (el.getBoundingClientRect().bottom < 0) { done = true; window.removeEventListener("scroll", onScroll); show(); }
      };
      var onScroll = function () { cancelAnimationFrame(raf); raf = requestAnimationFrame(check); };
      window.addEventListener("scroll", onScroll, { passive: true });
    }
    revealWhenPassed(bodies.record.querySelector("fieldset.opts"), function () { showRecord(null); });
    revealWhenPassed(slider.parentNode, function () { if (!haveGuess) { showDollar(); } });

    // =============================== chapters 5 to 8
    CMA.chapters.supply(bodies.supply);
    CMA.chapters.demand(bodies.demand);
    CMA.chapters.aluminium(bodies.aluminium);
    CMA.chapters.summary(bodies.summary);
    refreshReset();

    // ---- one Sources line at the foot, with every source used on the page
    CMA.sources.render(wrap);
  };
})();
