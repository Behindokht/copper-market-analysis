/* Chapter 4: who supplies copper? A proportional-symbol map (circle area = mine output or reserves), a ranked top-10 list with the exact figures, a table view.
   Data: window.CMA_DATA.supply.countries (USGS, from notebook 05) and window.CMA_DATA.map (Equal Earth outline as plain SVG paths, from tools/build_map.py). */
(function () {
  var CMA = window.CMA, t = CMA.t, h = CMA.h, svg = CMA.svg;
  var T = function (key, vars) { return t("supply." + key, vars); };
  var MAX_R = 60;                     // radius of the largest circle, in map units (the map is 1000 units wide)

  CMA.chapters.supply = function (box) {
    var rows = CMA.rows(window.CMA_DATA.supply.countries), M = window.CMA_DATA.map;
    var world = rows.filter(function (r) { return r.country === "World total"; })[0];
    var other = rows.filter(function (r) { return r.country === "Other countries"; })[0];
    var places = rows.filter(function (r) { return r.placeable === 1; });
    var year = 2025;
    places.forEach(function (r) { if (!M.points[r.iso_a3]) { throw new Error("no map point for " + r.country); } });
    var byOutput = places.slice().sort(function (a, b) { return b.production_2025e_kt - a.production_2025e_kt; });
    var top2 = byOutput.slice(0, 2);
    var top2share = top2.reduce(function (s, r) { return s + r.share_of_world_production_pct; }, 0);
    var kt = function (v) { return CMA.n0(v); };

    box.appendChild(h("p", { class: "answer", text: T("answer", { top2_names: top2.map(function (r) { return r.display_name; }).join(" and "), top2_share: CMA.n0(top2share), year: year }) }));
    box.appendChild(h("p", { class: "finding", text: T("reserves_line", { years: CMA.n0(world.reserve_life_years) }) }));
    box.appendChild(h("p", { class: "intro", text: T("intro") }));

    var mode = "output";
    var measures = { output: { key: "production_2025e_kt", share: "share_of_world_production_pct", cls: "out" }, reserves: { key: "reserves_kt", share: "share_of_world_reserves_pct", cls: "res" } };

    // ---- map card
    var mapHost = h("div", { class: "mapbox" });
    var tip = h("div", { class: "chart-tip", hidden: true, role: "presentation" });
    var sizeNote = h("p", { class: "small muted", style: "margin:6px 0 0" });
    var notesHost = h("div", { class: "mapnotes" });
    var radios = ["output", "reserves"].map(function (k) {
      var inp = h("input", { type: "radio", name: "supply-mode", value: k });
      if (k === mode) { inp.checked = true; }
      inp.addEventListener("change", function () { mode = k; render(); });
      return h("label", {}, inp, h("span", { text: k === "output" ? T("measure_output", { year: year }) : T("measure_reserves") }));
    });
    var listHost = h("div", { class: "toplist" });
    var altText = h("p", { class: "sr" });
    var card = h("div", { class: "card chart-card supply-card" },
      h("h3", { class: "qtitle", text: T("map_title") }),
      h("fieldset", { class: "seg" }, h("legend", { text: T("switch_legend") }), h("div", { class: "opts-row" }, radios)),
      h("div", { class: "supply-grid" }, h("div", { class: "mapwrap" }, mapHost, tip, sizeNote, notesHost), listHost), altText);
    box.appendChild(card);

    function listFor(m) {
      return places.slice().sort(function (a, b) { return b[m.key] - a[m.key]; });
    }

    function render() {
      var m = measures[mode], sorted = listFor(m);
      var maxV = sorted[0][m.key];
      var W = M.viewBox[2], H = M.viewBox[3];
      var s = svg("svg", { viewBox: "0 0 " + W + " " + H, role: "group", "aria-label": T("map_aria", { n: places.length, measure: mode === "output" ? T("measure_output", { year: year }) : T("measure_reserves") }) });
      s.appendChild(svg("path", { d: M.land, class: "land" }));
      var labelled = sorted.slice(0, 6).map(function (r) { return r.iso_a3; });
      // biggest first, so the small circles stay on top and can be reached
      sorted.forEach(function (r) {
        var p = M.points[r.iso_a3], rad = MAX_R * Math.sqrt(r[m.key] / maxV);
        var g = svg("g", { class: "bubble " + m.cls, tabindex: "0", role: "img", "aria-label": describe(r) });
        g.appendChild(svg("circle", { cx: p[0], cy: p[1], r: rad.toFixed(1), class: "disc" }));
        var show = function () { showTip(r, g); };
        g.addEventListener("pointerenter", show); g.addEventListener("focus", show);
        g.addEventListener("pointerleave", hideTip); g.addEventListener("blur", hideTip);
        s.appendChild(g);
        r._rad = rad;
      });
      sorted.slice(0, 6).forEach(function (r) {
        var p = M.points[r.iso_a3], left = r.iso_a3 === "CHL" || r.iso_a3 === "PER";
        var tx = svg("text", { x: (p[0] + (left ? -(r._rad + 6) : r._rad + 6)).toFixed(1), y: (p[1] + 5).toFixed(1), "text-anchor": left ? "end" : "start", class: "maplab" });
        tx.textContent = r.display_name; s.appendChild(tx);
      });
      mapHost.textContent = ""; mapHost.appendChild(s);
      sizeNote.textContent = T(mode === "output" ? "size_note_output" : "size_note_reserves");

      // ---- ranked list: the exact reading
      var top = sorted.slice(0, 10);
      var items = top.map(function (r, k) {
        return h("li", {}, h("span", { class: "rank mono", text: String(k + 1) }),
          h("div", {}, h("b", { text: r.display_name }), h("div", { class: "num", text: T("list_value_" + mode, { kt: kt(r[m.key]), share: CMA.n1(r[m.share]) }) }),
            h("div", { class: "small muted", text: T("life", { n: kt(r.reserve_life_years) }) })));
      });
      listHost.textContent = "";
      listHost.appendChild(h("h4", { text: T("list_title_" + mode) }));
      listHost.appendChild(h("ol", {}, items));
      notesHost.textContent = "";
      if (mode === "output") {
        notesHost.appendChild(h("p", { class: "small muted", text: T("other_note", { kt: kt(other.production_2025e_kt), share: CMA.n1(other.share_of_world_production_pct) }) }));
        notesHost.appendChild(h("p", { class: "small muted", text: T("estimate_note", { year: year }) }));
      } else {
        notesHost.appendChild(h("p", { class: "small muted", text: T("other_note_reserves", { kt: kt(other.reserves_kt), share: CMA.n1(other.share_of_world_reserves_pct) }) }));
      }
      notesHost.appendChild(h("p", { class: "small muted", text: T("life_note") }));
      altText.textContent = T("text_alt", { list: sorted.slice(0, 5).map(function (r) { return r.display_name + " " + kt(r[m.key]) + " kt"; }).join(", ") });
    }

    function describe(r) {
      return [r.display_name, T("tip_output", { year: year, kt: kt(r.production_2025e_kt), share: CMA.n1(r.share_of_world_production_pct) }),
        T("tip_reserves", { kt: kt(r.reserves_kt), share: CMA.n1(r.share_of_world_reserves_pct) }), T("tip_life", { n: kt(r.reserve_life_years) })].join(". ");
    }
    function showTip(r, g) {
      tip.textContent = "";
      tip.appendChild(h("strong", { text: r.display_name }));
      [T("tip_output", { year: year, kt: kt(r.production_2025e_kt), share: CMA.n1(r.share_of_world_production_pct) }),
        T("tip_reserves", { kt: kt(r.reserves_kt), share: CMA.n1(r.share_of_world_reserves_pct) }), T("tip_life", { n: kt(r.reserve_life_years) })]
        .forEach(function (l) { tip.appendChild(h("div", { text: l })); });
      tip.hidden = false;
      var wrapR = tip.parentNode.getBoundingClientRect(), gr = g.getBoundingClientRect();
      var left = gr.left - wrapR.left + gr.width / 2 + 12, top = gr.top - wrapR.top - 6;
      if (left + tip.offsetWidth > wrapR.width - 4) { left = gr.left - wrapR.left - tip.offsetWidth - 12; }
      tip.style.left = Math.max(4, left) + "px";
      tip.style.top = Math.max(4, Math.min(top, wrapR.height - tip.offsetHeight - 4)) + "px";
    }
    function hideTip() { tip.hidden = true; }
    render();
    if (window.ResizeObserver) {
      new ResizeObserver(function () { mapHost.parentNode.classList.toggle("narrow", mapHost.clientWidth < 520); }).observe(mapHost);
    }

    // ---- the details: every country, and how to read reserve life
    var head = h("thead", {}, h("tr", {}, [["col_country", {}], ["col_output", { year: year }], ["col_output_share", {}], ["col_reserves", {}], ["col_reserves_share", {}], ["col_life", {}]]
      .map(function (c) { return h("th", { scope: "col", text: T(c[0], c[1]) }); })));
    var all = rows.filter(function (r) { return r.country !== "World total"; }).sort(function (a, b) { return b.production_2025e_kt - a.production_2025e_kt; }).concat([world]);
    var body = h("tbody", {}, all.map(function (r) {
      return h("tr", {}, h("td", { text: r.country === "World total" ? T("world_row") : r.display_name }), h("td", { text: kt(r.production_2025e_kt) }), h("td", { text: CMA.n1(r.share_of_world_production_pct) + "%" }),
        h("td", { text: kt(r.reserves_kt) }), h("td", { text: CMA.n1(r.share_of_world_reserves_pct) + "%" }), h("td", { text: kt(r.reserve_life_years) }));
    }));
    box.appendChild(h("aside", { class: "note", "aria-labelledby": "sup-ns" },
      h("h3", { id: "sup-ns", text: T("notshow.title") }), h("ul", {}, window.CMA_STRINGS.supply.notshow.items.map(function (x) { return h("li", { text: x }); }))));
    box.appendChild(CMA.fold(T("details_lead"), [h("div", { class: "tablewrap tall" }, h("table", {}, head, body))]));
    CMA.sources.add(window.CMA_STRINGS.supply.sources.names, T("sources.attribution"));
    CMA.bridge(box, T("bridge"));
  };
})();
