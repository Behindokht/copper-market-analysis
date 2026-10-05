/* Chapter 4: who supplies copper? A proportional-symbol map (circle area = mine output or reserves), a ranked top-10 list with the exact figures, a table view.
   Data: window.CMA_DATA.supply.countries (USGS, from notebook 05) and window.CMA_DATA.map (Equal Earth outline as plain SVG paths, from tools/build_map.py). */
(function () {
  var CMA = window.CMA, t = CMA.t, h = CMA.h, svg = CMA.svg;
  var T = function (key, vars) { return t("supply." + key, vars); };
  var MAX_R = 64;                     // radius of the largest circle, in map units (the map is 1000 units wide)
  var FS = 17;                        // label size, in map units

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
    var kt = function (v) { return CMA.n0(v); }, mt = CMA.mt;     // kt: whole numbers (years); mt: thousand tonnes shown as million tonnes

    box.appendChild(h("p", { class: "answer", text: T("answer", { top2_names: top2.map(function (r) { return r.display_name; }).join(" and "), top2_share: CMA.n0(top2share), year: year }) }));
    box.appendChild(h("p", { class: "finding", text: T("reserves_line", { years: CMA.n0(world.reserve_life_years) }) }));
    box.appendChild(h("p", { class: "intro", text: T("intro") }));

    var mode = "output";
    var measures = { output: { key: "production_2025e_kt", share: "share_of_world_production_pct", cls: "out" }, reserves: { key: "reserves_kt", share: "share_of_world_reserves_pct", cls: "res" } };

    // ---- map card: the map across the full width, the ranked list below it
    var mapHost = h("div", { class: "mapbox" });
    var tip = h("div", { class: "chart-tip", hidden: true, role: "presentation" });
    var sizeNote = h("p", { class: "small muted", style: "margin:6px 0 0" });
    var notesHost = h("div", { class: "mapnotes" });
    var radios = ["output", "reserves"].map(function (k) {
      var inp = h("input", { type: "radio", name: "supply-mode", value: k });
      if (k === mode) { inp.checked = true; }
      inp.addEventListener("change", function () { mode = k; render(true); });
      return h("label", {}, inp, h("span", { text: k === "output" ? T("measure_output", { year: year }) : T("measure_reserves") }));
    });
    var listHost = h("div", { class: "toplist" });
    var altText = h("p", { class: "sr" });
    var mapwrap = h("div", { class: "mapwrap" }, mapHost, tip, sizeNote);
    box.appendChild(h("div", { class: "card chart-card supply-card" },
      h("h3", { class: "qtitle", text: T("map_title") }),
      h("fieldset", { class: "seg" }, h("legend", { text: T("switch_legend") }), h("div", { class: "opts-row" }, radios)),
      mapwrap, listHost, notesHost, altText));

    // ---- the map is built once; switching the measure resizes the circles
    var W = M.viewBox[2], H = M.viewBox[3];
    var s = svg("svg", { viewBox: "0 0 " + W + " " + H, role: "group" });
    s.appendChild(svg("path", { d: M.land, class: "land" }));
    var dotsLayer = svg("g", {}), labelLayer = svg("g", { "aria-hidden": "true" });
    s.appendChild(dotsLayer); s.appendChild(labelLayer);
    var marks = {};
    places.forEach(function (r) {
      var p = M.points[r.iso_a3];
      var g = svg("g", { class: "bubble", tabindex: "0", role: "img", "aria-label": describe(r) });
      var c = svg("circle", { cx: p[0], cy: p[1], r: 0, class: "disc" });
      g.appendChild(c);
      var show = function () { showTip(r, g); };
      g.addEventListener("pointerenter", show); g.addEventListener("focus", show);
      g.addEventListener("pointerleave", hideTip); g.addEventListener("blur", hideTip);
      dotsLayer.appendChild(g);
      marks[r.iso_a3] = { g: g, c: c, r: 0 };
    });
    mapHost.appendChild(s);
    if (window.ResizeObserver) { new ResizeObserver(function () { mapwrap.classList.toggle("narrow", mapHost.clientWidth < 520); }).observe(mapHost); }

    function listFor(m) { return places.slice().sort(function (a, b) { return b[m.key] - a[m.key]; }); }

    // labels for the ten largest: right of the circle if free, else left, below or above
    function placeLabels(sorted) {
      labelLayer.textContent = "";
      var boxes = [];
      // the two largest producers together, in the output view (placed first, so the country labels keep clear of it)
      if (mode === "output") {
        var a = M.points[top2[0].iso_a3], b = M.points[top2[1].iso_a3];
        var text = T("pair_note", { a: top2[0].display_name, b: top2[1].display_name, share: CMA.n0(top2share) }), nw = text.length * FS * 0.56;
        // in the open water to the right of the more western of the two, low on the map, clear of both circles
        var west = a[0] < b[0] ? 0 : 1, wp = west === 0 ? a : b, wr = marks[top2[west].iso_a3].r;
        var nx = Math.min(W - nw - 4, wp[0] + wr + 24), ny = H - 10;
        [a, b].forEach(function (p, k) {
          var r = marks[top2[k].iso_a3].r, dx = nx - p[0], dy = (ny - FS * 0.4) - p[1], d = Math.sqrt(dx * dx + dy * dy) || 1;
          labelLayer.appendChild(svg("line", { x1: (k === west ? nx - 4 : nx + nw * 0.5), y1: ny - FS, x2: p[0] + dx / d * r, y2: p[1] + dy / d * r, class: "pairline" }));
        });
        var note = svg("text", { x: nx, y: ny, "text-anchor": "start", class: "maplab pair" });
        note.textContent = text;
        labelLayer.appendChild(note);
        boxes.push({ x0: nx - 2, x1: nx + nw + 2, y0: ny - FS, y1: ny + 4 });
      }
      sorted.slice(0, 10).forEach(function (r) {
        var p = M.points[r.iso_a3], rad = marks[r.iso_a3].r, w = r.display_name.length * FS * 0.56;
        var cands = [
          { x: p[0] + rad + 5, y: p[1] + FS * 0.35, a: "start" }, { x: p[0] - rad - 5, y: p[1] + FS * 0.35, a: "end" },
          { x: p[0], y: p[1] + rad + FS, a: "middle" }, { x: p[0], y: p[1] - rad - 6, a: "middle" },
          { x: p[0] + rad * 0.7 + 4, y: p[1] - rad * 0.7 - 2, a: "start" }, { x: p[0] + rad * 0.7 + 4, y: p[1] + rad * 0.7 + FS, a: "start" }];
        var pick = null;
        cands.some(function (cd) {
          var x0 = cd.a === "start" ? cd.x : (cd.a === "end" ? cd.x - w : cd.x - w / 2), bx = { x0: x0 - 2, x1: x0 + w + 2, y0: cd.y - FS, y1: cd.y + 4 };
          if (bx.x0 < 0 || bx.x1 > W || bx.y0 < 0 || bx.y1 > H) { return false; }
          var hit = boxes.some(function (o) { return bx.x0 < o.x1 && bx.x1 > o.x0 && bx.y0 < o.y1 && bx.y1 > o.y0; });
          if (!hit) { pick = { cd: cd, b: bx }; }
          return !hit;
        });
        if (!pick) { return; }
        boxes.push(pick.b);
        var tx = svg("text", { x: pick.cd.x.toFixed(1), y: pick.cd.y.toFixed(1), "text-anchor": pick.cd.a, class: "maplab" });
        tx.textContent = r.display_name;
        labelLayer.appendChild(tx);
      });
    }

    function render(animate) {
      var m = measures[mode], sorted = listFor(m), maxV = sorted[0][m.key];
      s.setAttribute("aria-label", T("map_aria", { n: places.length, measure: mode === "output" ? T("measure_output", { year: year }) : T("measure_reserves") }));
      // biggest first, so the small circles stay on top and can be reached
      sorted.forEach(function (r) { var mk = marks[r.iso_a3]; mk.g.setAttribute("class", "bubble " + m.cls); dotsLayer.appendChild(mk.g); });
      var targets = {}, from = {};
      sorted.forEach(function (r) { targets[r.iso_a3] = MAX_R * Math.sqrt(r[m.key] / maxV); });
      Object.keys(marks).forEach(function (k) { from[k] = marks[k].r; });
      var set = function (e) { Object.keys(marks).forEach(function (k) { marks[k].r = from[k] + (targets[k] - from[k]) * e; marks[k].c.setAttribute("r", marks[k].r.toFixed(1)); }); };
      if (!animate || CMA.reduce) {
        set(1);
        placeLabels(sorted);
      } else {
        // one smooth 400 ms resize, then the labels
        labelLayer.textContent = "";
        var t0 = null;
        var step = function (ts) {
          if (t0 === null) { t0 = ts; }
          var q = Math.min(1, (ts - t0) / 400);
          set(q < 0.5 ? 2 * q * q : 1 - Math.pow(-2 * q + 2, 2) / 2);
          if (q < 1) { requestAnimationFrame(step); } else { placeLabels(sorted); }
        };
        requestAnimationFrame(step);
      }
      sizeNote.textContent = T(mode === "output" ? "size_note_output" : "size_note_reserves");

      // ---- ranked list: the exact reading
      listHost.textContent = "";
      listHost.appendChild(h("h4", { text: T("list_title_" + mode) }));
      listHost.appendChild(h("ol", {}, sorted.slice(0, 10).map(function (r, k) {
        return h("li", {}, h("span", { class: "rank mono", text: String(k + 1) }),
          h("div", {}, h("b", { text: r.display_name }), h("div", { class: "num", text: T("list_value_" + mode, { mt: mt(r[m.key]), share: CMA.n1(r[m.share]) }) }),
            h("div", { class: "small muted", text: T("life", { n: kt(r.reserve_life_years) }) })));
      })));
      notesHost.textContent = "";
      if (mode === "output") {
        notesHost.appendChild(h("p", { class: "small muted", text: T("other_note", { mt: mt(other.production_2025e_kt), share: CMA.n1(other.share_of_world_production_pct) }) }));
        notesHost.appendChild(h("p", { class: "small muted", text: T("estimate_note", { year: year }) }));
      } else {
        notesHost.appendChild(h("p", { class: "small muted", text: T("other_note_reserves", { mt: mt(other.reserves_kt), share: CMA.n1(other.share_of_world_reserves_pct) }) }));
      }
      notesHost.appendChild(h("p", { class: "small muted", text: T("life_note") }));
      altText.textContent = T("text_alt", { list: sorted.slice(0, 5).map(function (r) { return r.display_name + " " + mt(r[m.key]) + " " + T("unit_mt"); }).join(", ") });
    }

    function describe(r) {
      return [r.display_name, T("tip_output", { year: year, mt: mt(r.production_2025e_kt), share: CMA.n1(r.share_of_world_production_pct) }),
        T("tip_reserves", { mt: mt(r.reserves_kt), share: CMA.n1(r.share_of_world_reserves_pct) }), T("tip_life", { n: kt(r.reserve_life_years) })].join(". ");
    }
    function showTip(r, g) {
      tip.textContent = "";
      tip.appendChild(h("strong", { text: r.display_name }));
      [T("tip_output", { year: year, mt: mt(r.production_2025e_kt), share: CMA.n1(r.share_of_world_production_pct) }),
        T("tip_reserves", { mt: mt(r.reserves_kt), share: CMA.n1(r.share_of_world_reserves_pct) }), T("tip_life", { n: kt(r.reserve_life_years) })]
        .forEach(function (l) { tip.appendChild(h("div", { text: l })); });
      tip.hidden = false;
      var wrapR = mapwrap.getBoundingClientRect(), gr = g.getBoundingClientRect();
      var left = gr.left - wrapR.left + gr.width / 2 + 12, top = gr.top - wrapR.top - 6;
      if (left + tip.offsetWidth > wrapR.width - 4) { left = gr.left - wrapR.left - tip.offsetWidth - 12; }
      tip.style.left = Math.max(4, left) + "px";
      tip.style.top = Math.max(4, Math.min(top, wrapR.height - tip.offsetHeight - 4)) + "px";
    }
    function hideTip() { tip.hidden = true; }
    render(false);

    // ---- the details: every country, and how to read reserve life
    var head = h("thead", {}, h("tr", {}, [["col_country", {}], ["col_output", { year: year }], ["col_output_share", {}], ["col_reserves", {}], ["col_reserves_share", {}], ["col_life", {}]]
      .map(function (c) { return h("th", { scope: "col", text: T(c[0], c[1]) }); })));
    var all = rows.filter(function (r) { return r.country !== "World total"; }).sort(function (a, b) { return b.production_2025e_kt - a.production_2025e_kt; }).concat([world]);
    var body = h("tbody", {}, all.map(function (r) {
      return h("tr", {}, h("td", { text: r.country === "World total" ? T("world_row") : r.display_name }), h("td", { text: mt(r.production_2025e_kt) }), h("td", { text: CMA.n1(r.share_of_world_production_pct) + "%" }),
        h("td", { text: mt(r.reserves_kt) }), h("td", { text: CMA.n1(r.share_of_world_reserves_pct) + "%" }), h("td", { text: kt(r.reserve_life_years) }));
    }));
    // ---- mined here, refined there: mine and refinery share of eight countries, paired
    var RM = CMA.rows(window.CMA_DATA.supply.refined), none = RM.filter(function (r) { return !r.mine_listed; });
    if (none.some(function (r) { return r.mine_share_pct !== null; })) { throw new Error("a country with no mine figure must not get a mine share"); }
    var byC = {};
    RM.forEach(function (r) { byC[r.country] = r; });
    var wmine = RM[0].world_mine_kt, wref = RM[0].world_refinery_kt, topShare = Math.max.apply(null, RM.map(function (r) { return Math.max(r.mine_share_pct || 0, r.refinery_share_pct); })), sc = Math.ceil(topShare / 10) * 10;
    var pctTxt = function (v) { return CMA.n1(v) + "%"; };
    var mrRows = RM.map(function (r) {
      var mineVal = r.mine_listed ? pctTxt(r.mine_share_pct) : T("mr_none");
      return h("li", { class: "mrrow", "aria-hidden": "true" },
        h("div", { class: "mrname", text: r.display_name }),
        h("div", { class: "mrbars" },
          h("div", { class: "mrbar mine" }, h("div", { class: "mrtrack" }, r.mine_listed ? h("span", { class: "mrfill", style: "width:" + (r.mine_share_pct / sc * 100) + "%" }) : null), h("span", { class: "mrval", text: mineVal })),
          h("div", { class: "mrbar ref" }, h("div", { class: "mrtrack" }, h("span", { class: "mrfill", style: "width:" + (r.refinery_share_pct / sc * 100) + "%" }), null), h("span", { class: "mrval", text: pctTxt(r.refinery_share_pct) }))));
    });
    var mrAria = T("mr_aria", { n: RM.length, year: year, list: RM.map(function (r) { return T("mr_aria_item", { name: r.display_name, mine: r.mine_listed ? pctTxt(r.mine_share_pct) : T("mr_none"), ref: pctTxt(r.refinery_share_pct) }); }).join("; ") });
    var mrHead = h("thead", {}, h("tr", {}, ["mr_col_country", "mr_col_mine", "mr_col_mine_share", "mr_col_ref", "mr_col_ref_share"].map(function (k) { return h("th", { scope: "col", text: T(k) }); })));
    var mrBody = h("tbody", {}, RM.map(function (r) {
      return h("tr", {}, h("td", { text: r.display_name }), h("td", { text: r.mine_listed ? mt(r.mine_kt) : T("mr_none") }), h("td", { text: r.mine_listed ? pctTxt(r.mine_share_pct) : T("mr_none") }),
        h("td", { text: mt(r.refinery_kt) }), h("td", { text: pctTxt(r.refinery_share_pct) }));
    }));
    box.appendChild(h("section", { class: "card chart-card mr", "aria-labelledby": "mr-title" },
      h("h3", { id: "mr-title", class: "qtitle", text: T("mr_title") }),
      h("p", { text: T("mr_above", { chile_mine: CMA.n0(byC.Chile.mine_share_pct), chile_ref: CMA.n0(byC.Chile.refinery_share_pct), china_mine: CMA.n0(byC["China"].mine_share_pct), china_ref: CMA.n0(byC["China"].refinery_share_pct) }) }),
      h("ul", { class: "bars", style: "list-style:none;margin:10px 0 0;padding:0", "aria-label": mrAria }, mrRows),
      h("p", { class: "mrkey" }, h("span", { class: "mine" }, h("i"), T("mr_mine")), h("span", { class: "ref" }, h("i"), T("mr_refinery")), h("span", { class: "muted", text: T("mr_axis") })),
      h("p", { text: T("mr_below", { ref_mt: CMA.n0(wref / 1000), mine_mt: CMA.n0(wmine / 1000), year: year }) }),
      h("p", { text: T("mr_conc", { n: CMA.CHAPTER_NO.record }) }),
      h("details", { class: "tableview" }, h("summary", { text: T("mr_table") }), h("div", { class: "tablewrap" }, h("table", {}, mrHead, mrBody))),
      CMA.chip(["supply.refined"])));

    var lim = CMA.limits(window.CMA_STRINGS.supply.notshow.items, T("notshow.title"));
    box.appendChild(lim.short);
    box.appendChild(CMA.fold(T("details_lead"), [lim.full, h("div", { class: "tablewrap tall" }, h("table", {}, head, body))]));
    CMA.sources.add(window.CMA_STRINGS.supply.sources.names, T("sources.attribution"));
    CMA.bridge(box, T("bridge"));
  };
})();
