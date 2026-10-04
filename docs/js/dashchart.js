/* Dashboard time chart in plain SVG. One chart per panel; all of them share one month axis idea, so a crosshair set on any chart can be shown on the others (by month key).
   cfg: { months: ["YYYY-MM", ...], series: [{id, color, dash, values: [number|null]}], scale: "linear"|"log", yMin, yMax, yFormat(v), height,
          refLines: [{v, label, dashed}], marks: [{series, i, lines: [text], side: "left"|"right"}], endLabels: [{series, text}],
          events: [{i, n, tip: [lines]}], marginRight, aria, onMonth(month|null, fromKeyboard), onKey(delta) }
   Returns { update(cfg), setMonth(month|null), value(month, seriesId) }. No text lives here: every string comes in through cfg. */
(function () {
  var CMA = window.CMA, h = CMA.h, svg = CMA.svg;
  var lastTouch = -1e9;       // after a tap some browsers send an emulated mouse move: ignore mouse moves for a moment after a touch

  function niceTicks(lo, hi, count) {
    var span = hi - lo;
    if (!(span > 0)) { return [lo]; }
    var raw = span / count, mag = Math.pow(10, Math.floor(Math.log10(raw))), norm = raw / mag;
    var step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag, out = [];
    for (var v = Math.ceil(lo / step - 1e-9) * step; v <= hi + step * 1e-9; v += step) { out.push(Math.round(v / step) * step); }
    return out;
  }
  function logTicks(lo, hi) {
    var sets = [[1], [1, 3], [1, 2, 5], [1, 1.5, 2, 3, 5, 7]], best = [];
    for (var s = 0; s < sets.length; s++) {
      var out = [];
      for (var k = Math.floor(Math.log10(lo)); k <= Math.ceil(Math.log10(hi)); k++) {
        sets[s].forEach(function (m) { var v = m * Math.pow(10, k); if (v >= lo * 0.999 && v <= hi * 1.001) { out.push(v); } });
      }
      best = out;
      if (out.length >= 3) { break; }
    }
    return best;
  }
  function xTicks(months) {
    var n = months.length, out = [];
    if (n <= 13) {
      months.forEach(function (m, i) { if (i % 3 === 0 || i === n - 1) { out.push({ i: i, label: CMA.monthShort(m + "-01").slice(0, 3) + " " + m.slice(2, 4) }); } });
      return out;
    }
    var years = n / 12, step = years <= 6 ? 1 : years <= 14 ? 2 : years <= 32 ? 5 : 10;
    months.forEach(function (m, i) { var y = +m.slice(0, 4); if (m.slice(5, 7) === "01" && y % step === 0 && (i > 0 || true)) { out.push({ i: i, label: String(y) }); } });
    if (out.length > 8) { out = out.filter(function (_, k) { return k % 2 === 0; }); }
    return out;
  }

  CMA.dashChart = function (host, cfg0) {
    var cfg = cfg0, cur = null, lastW = 0, ro = null, first = true, nodes = {}, tip = null;
    host.classList.add("chart", "dchart");
    host.style.position = "relative";

    function color(c) { return getComputedStyle(document.documentElement).getPropertyValue(c).trim() || c; }
    function textW(s) { return 6.3 * String(s).length; }

    function draw(animate) {
      var W = Math.max(260, Math.round(host.clientWidth || 400)), H = cfg.height || 260;
      lastW = W;
      var ml = 46, mr = cfg.marginRight || 16, mt = 14, mb = 26, pw = W - ml - mr, ph = H - mt - mb;
      var n = cfg.months.length, log = cfg.scale === "log";
      var all = [];
      cfg.series.forEach(function (s) { s.values.forEach(function (v) { if (v != null) { all.push(v); } }); });
      var lo = cfg.yMin != null ? cfg.yMin : Math.min.apply(null, all), hi = cfg.yMax != null ? cfg.yMax : Math.max.apply(null, all);
      var ticks;
      if (log) {
        lo = lo / 1.08; hi = hi * 1.08; ticks = logTicks(lo, hi);
      } else {
        if (cfg.yMax == null) { var tk = niceTicks(lo, hi, 4); hi = Math.max(hi, tk[tk.length - 1]); }
        if (cfg.yMin == null) { var pad = (hi - lo) * 0.06 || 1; lo = lo - pad; }
        ticks = cfg.yTicks || niceTicks(lo, hi, 4);
      }
      if (!(hi > lo)) { hi = lo + 1; }
      var X = function (i) { return ml + (n > 1 ? i / (n - 1) : 0.5) * pw; };
      var Y = log ? function (v) { return mt + ph - (Math.log(v / lo) / Math.log(hi / lo)) * ph; } : function (v) { return mt + ph - ((v - lo) / (hi - lo)) * ph; };
      host.textContent = "";
      var s = svg("svg", { viewBox: "0 0 " + W + " " + H, role: "img", tabindex: "0", "aria-label": cfg.aria, focusable: "true" });
      var clipId = "dc-" + Math.random().toString(36).slice(2, 8), defs = svg("defs"), clip = svg("clipPath", { id: clipId });
      var cr = svg("rect", { class: "reveal-rect", x: 0, y: 0, width: animate === "first" && !CMA.reduce ? 0 : W, height: H });
      clip.appendChild(cr); defs.appendChild(clip); s.appendChild(defs);

      ticks.forEach(function (v) {
        var y = Y(v);
        if (y < mt - 1 || y > mt + ph + 1) { return; }
        s.appendChild(svg("line", { x1: ml, x2: ml + pw, y1: y, y2: y, class: "gridline" }));
        var t = svg("text", { x: ml - 8, y: y + 4, "text-anchor": "end", class: "ax" }); t.textContent = cfg.yFormat(v); s.appendChild(t);
      });
      s.appendChild(svg("line", { x1: ml, x2: ml + pw, y1: mt + ph, y2: mt + ph, class: "axisline" }));
      var lastX = -1e9;
      xTicks(cfg.months).filter(function (tk) { var x = X(tk.i); if (x - lastX < 56) { return false; } lastX = x; return true; }).forEach(function (tk) {
        s.appendChild(svg("line", { x1: X(tk.i), x2: X(tk.i), y1: mt + ph, y2: mt + ph + 4, class: "axisline" }));
        var t = svg("text", { x: Math.min(Math.max(X(tk.i), ml + 8), ml + pw - 8), y: mt + ph + 18, "text-anchor": "middle", class: "ax" }); t.textContent = tk.label; s.appendChild(t);
      });
      (cfg.refLines || []).forEach(function (r) {
        var y = Y(r.v);
        if (y < mt || y > mt + ph) { return; }
        s.appendChild(svg("line", { x1: ml, x2: ml + pw, y1: y, y2: y, class: r.dashed ? "bandline" : "zeroline" }));
        var t = svg("text", { x: ml + pw - 4, y: y - 5, "text-anchor": "end", class: "ax" }); t.textContent = r.label; s.appendChild(t);
      });

      var plot = svg("g", { class: "plot", "clip-path": "url(#" + clipId + ")" });
      s.appendChild(plot);
      cfg.series.forEach(function (sr) {
        var d = "", pen = false;
        sr.values.forEach(function (v, i) {
          if (v == null) { pen = false; return; }
          d += (pen ? "L" : "M") + X(i).toFixed(1) + " " + Y(v).toFixed(1); pen = true;
        });
        plot.appendChild(svg("path", { d: d, fill: "none", stroke: color(sr.color), "stroke-width": sr.width || 1.8, "stroke-linejoin": "round", "stroke-linecap": "round", "stroke-dasharray": sr.dash || null }));
      });

      // direct labels at the line ends, pushed apart so they never overlap
      var labs = (cfg.endLabels || []).map(function (l) {
        var sr = cfg.series.filter(function (x) { return x.id === l.series; })[0], i = sr.values.length - 1;
        while (i > 0 && sr.values[i] == null) { i--; }
        return { l: l, sr: sr, i: i, y: Y(sr.values[i]) };
      }).sort(function (a, b) { return a.y - b.y; });
      for (var k = 1; k < labs.length; k++) { if (labs[k].y - labs[k - 1].y < 13) { labs[k].y = labs[k - 1].y + 13; } }
      labs.forEach(function (o) {
        var t = svg("text", { x: X(o.i) + 7, y: o.y + 4, "text-anchor": "start", class: "dlabel", fill: color(o.l.ink || o.sr.color) });
        t.setAttribute("style", "paint-order:stroke;stroke:" + color("--card") + ";stroke-width:3px;stroke-linejoin:round");
        t.textContent = o.l.text; s.appendChild(t);
        s.appendChild(svg("circle", { cx: X(o.i), cy: Y(o.sr.values[o.i]), r: 3.2, fill: color(o.sr.color), stroke: color("--card"), "stroke-width": 1.5 }));
      });
      // marks with a short call-out (the record)
      (cfg.marks || []).forEach(function (m) {
        var sr = cfg.series.filter(function (x) { return x.id === m.series; })[0], cx = X(m.i), cy = Y(sr.values[m.i]);
        s.appendChild(svg("circle", { cx: cx, cy: cy, r: 5, fill: color(sr.color), stroke: color("--card"), "stroke-width": 2 }));
        var anchor = m.side === "right" ? "start" : "end", dx = m.side === "right" ? 9 : -9;
        var t = svg("text", { x: cx + dx, y: cy + (m.up ? -10 : 4), "text-anchor": anchor, class: "dlabel strong", fill: color("--ink") });
        t.setAttribute("style", "paint-order:stroke;stroke:" + color("--card") + ";stroke-width:3px;stroke-linejoin:round");
        t.textContent = m.lines[0]; s.appendChild(t);
      });
      // events: small numbered markers on the line
      var evG = svg("g", { class: "events" });
      (cfg.events || []).forEach(function (e) {
        var sr = cfg.series[0], v = sr.values[e.i];
        if (v == null) { return; }
        var cx = X(e.i), cy = Y(v);
        var g = svg("g", { class: "evm", tabindex: "0", role: "button", "aria-label": e.tip.join(". ") });
        g.appendChild(svg("circle", { cx: cx, cy: cy, r: 8, fill: color("--card"), stroke: color("--ink"), "stroke-width": 1.2 }));
        var tx = svg("text", { x: cx, y: cy + 3.5, "text-anchor": "middle", class: "evn" }); tx.textContent = String(e.n); g.appendChild(tx);
        var show = function () { showTip(e.tip, cx, cy); };
        g.addEventListener("pointerenter", show); g.addEventListener("focus", show); g.addEventListener("pointerleave", hideTip); g.addEventListener("blur", hideTip);
        g.addEventListener("click", function (ev) { ev.stopPropagation(); show(); });
        evG.appendChild(g);
      });
      s.appendChild(evG);

      // crosshair: one line and one dot per series, moved by setMonth
      var xh = svg("line", { class: "xh", y1: mt, y2: mt + ph, x1: 0, x2: 0, visibility: "hidden" });
      s.appendChild(xh);
      var dots = cfg.series.map(function (sr) { var c = svg("circle", { r: 3.6, fill: color(sr.color), stroke: color("--card"), "stroke-width": 1.5, visibility: "hidden", class: "xhdot" }); s.appendChild(c); return c; });
      nodes = { xh: xh, dots: dots, X: X, Y: Y, ml: ml, pw: pw, n: n };

      // pointer and keyboard
      var overlay = svg("rect", { x: ml, y: mt, width: pw, height: ph, fill: "transparent", class: "xhhit" });
      s.appendChild(overlay);
      var raf = 0, pendingI = null;
      function idxFromEvent(e) {
        var r = s.getBoundingClientRect(), x = (e.clientX - r.left) * (W / r.width);
        return Math.max(0, Math.min(n - 1, Math.round((x - ml) / pw * (n - 1))));
      }
      overlay.addEventListener("pointermove", function (e) {
        if (e.pointerType === "touch" || performance.now() - lastTouch < 900) { return; }
        pendingI = idxFromEvent(e);
        if (!raf) { raf = requestAnimationFrame(function () { raf = 0; cfg.onMonth(cfg.months[pendingI], false); }); }
      });
      overlay.addEventListener("pointerleave", function (e) { if (e.pointerType !== "touch" && performance.now() - lastTouch >= 900) { cfg.onMonth(null, false); } });
      overlay.addEventListener("pointerdown", function (e) {
        if (e.pointerType !== "touch") { return; }
        lastTouch = performance.now();
        if (cfg.getMonth && cfg.getMonth()) { cfg.onMonth(null, false); } else { cfg.onMonth(cfg.months[idxFromEvent(e)], false); }
      });
      s.addEventListener("keydown", function (e) {
        var d = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
        if (e.key === "Escape") { cfg.onMonth(null, true); return; }
        if (e.key === "Home" || e.key === "End") { e.preventDefault(); cfg.onKey(e.key === "Home" ? -100000 : 100000, cfg.months); return; }
        if (d) { e.preventDefault(); cfg.onKey(d * (e.shiftKey ? 12 : 1), cfg.months); }
      });
      s.addEventListener("blur", function () { cfg.onMonth(null, true); });

      host.appendChild(s);
      tip = h("div", { class: "chart-tip", hidden: true, role: "presentation" });
      host.appendChild(tip);

      if (animate === "first" && !CMA.reduce) {
        requestAnimationFrame(function () { cr.style.transition = "width 900ms cubic-bezier(.2,.6,.2,1)"; cr.setAttribute("width", W); });
      } else if (animate === "filter" && !CMA.reduce) {
        plot.style.opacity = "0.15";
        requestAnimationFrame(function () { plot.style.transition = "opacity 300ms ease"; plot.style.opacity = "1"; });
      }
      if (cur) { setMonth(cur); }
    }

    function showTip(lines, cx, cy) {
      tip.textContent = "";
      tip.appendChild(h("strong", { text: lines[0] }));
      lines.slice(1).forEach(function (l) { tip.appendChild(h("div", { text: l })); });
      tip.hidden = false;
      var r = host.getBoundingClientRect(), sr = host.querySelector("svg").getBoundingClientRect(), k = sr.width / lastW;
      var left = cx * k + 12, top = cy * k - 8;
      if (left + tip.offsetWidth > r.width - 4) { left = cx * k - tip.offsetWidth - 12; }
      tip.style.left = Math.max(4, left) + "px"; tip.style.top = Math.max(4, top) + "px";
    }
    function hideTip() { if (tip) { tip.hidden = true; } }

    function setMonth(month) {
      cur = month;
      if (!nodes.xh) { return; }
      var i = month == null ? -1 : cfg.months.indexOf(month);
      if (i < 0) {
        nodes.xh.setAttribute("visibility", "hidden");
        nodes.dots.forEach(function (d) { d.setAttribute("visibility", "hidden"); });
        return;
      }
      var x = nodes.X(i);
      nodes.xh.setAttribute("x1", x); nodes.xh.setAttribute("x2", x); nodes.xh.setAttribute("visibility", "visible");
      cfg.series.forEach(function (sr, k) {
        var v = sr.values[i], d = nodes.dots[k];
        if (v == null) { d.setAttribute("visibility", "hidden"); return; }
        d.setAttribute("cx", x); d.setAttribute("cy", nodes.Y(v)); d.setAttribute("visibility", "visible");
      });
    }

    function observe() {
      if (!("ResizeObserver" in window)) { return; }
      var rt = 0;
      ro = new ResizeObserver(function () {
        if (Math.abs(host.clientWidth - lastW) < 2) { return; }
        cancelAnimationFrame(rt); rt = requestAnimationFrame(function () { draw(null); });
      });
      ro.observe(host);
    }

    draw(first ? "first" : null); first = false;
    observe();
    return {
      update: function (c) { cfg = c; draw("filter"); },
      setMonth: setMonth,
      hasMonth: function (m) { return cfg.months.indexOf(m) >= 0; },
      value: function (m, id) { var i = cfg.months.indexOf(m); var sr = cfg.series.filter(function (x) { return x.id === id; })[0]; return i < 0 || !sr ? null : sr.values[i]; }
    };
  };
})();
