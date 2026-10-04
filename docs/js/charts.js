/* A small line chart in plain SVG: direct labels, call-outs, a visible gap marker, a hover and keyboard crosshair with a tooltip card.
   Colours come from the CSS tokens (--copper, --verdigris, ...), so the stylesheet stays the single source of truth. */
(function () {
  var CMA = window.CMA;
  var h = CMA.h, svg = CMA.svg;

  /* cfg: {
       n, yMax, yTicks, yFormat, xTicks: [{i, label}],
       series: [{id, color, values: [number|null], label: {i, dx, dy, text, anchor}}],
       marks: [{series, i, lines: [text], dx, dy, anchor}],
       gap: {i, series, label},
       band: {v, label, zoneTop, zoneBottom},
       tip: function (i) -> {title, lines: [text]},
       aria: text, onMove: function (i) }                                   */
  CMA.lineChart = function (host, cfg) {
    var cur = null, tip = null, ro = null, lastW = 0, raf = 0, io = null;
    var state = (CMA.reduce || !("IntersectionObserver" in window)) ? "done" : "pending";   // pending, running, done: the reveal plays once
    host.classList.add("chart");

    var sparkEl = null;
    function color(c) { return getComputedStyle(document.body).getPropertyValue(c).trim() || c; }
    function textW(s) { return 6.4 * s.length; }

    function draw() {
      var W = Math.max(300, Math.round(host.clientWidth || 600));
      lastW = W;
      var narrow = W < 560;
      host.setAttribute("data-narrow", narrow ? "true" : "false");
      var H = narrow ? 320 : 410;
      var ml = 58, mr = narrow ? 14 : (cfg.marginRight || 14), mt = (cfg.events && cfg.events.length) ? 52 : 26, mb = 34, pw = W - ml - mr, ph = H - mt - mb;
      var yMin = cfg.yMin || 0;
      var X = function (i) { return ml + (i / (cfg.n - 1)) * pw; };
      var Y = function (v) { return mt + ph - ((v - yMin) / (cfg.yMax - yMin)) * ph; };
      host.textContent = "";
      var s = svg("svg", { viewBox: "0 0 " + W + " " + H, role: "img", tabindex: "0", "aria-label": cfg.aria, focusable: "true" });
      var clipId = "clip-" + Math.random().toString(36).slice(2, 8);
      var defs = svg("defs");
      var clip = svg("clipPath", { id: clipId });
      clip.appendChild(svg("rect", { class: "reveal-rect", x: 0, y: 0, width: W, height: H }));
      defs.appendChild(clip);
      s.appendChild(defs);

      cfg.yTicks.forEach(function (v) {
        s.appendChild(svg("line", { x1: ml, x2: ml + pw, y1: Y(v), y2: Y(v), class: v === yMin ? "axisline" : (v === 0 ? "zeroline" : "gridline") }));
        var t = svg("text", { x: ml - 8, y: Y(v) + 4, "text-anchor": "end", class: "ax" }); t.textContent = cfg.yFormat(v); s.appendChild(t);
      });
      cfg.xTicks.forEach(function (tk) {
        s.appendChild(svg("line", { x1: X(tk.i), x2: X(tk.i), y1: mt + ph, y2: mt + ph + 5, class: "axisline" }));
        var t = svg("text", { x: X(tk.i), y: mt + ph + 20, "text-anchor": "middle", class: "ax" }); t.textContent = tk.label; s.appendChild(t);
      });

      if (cfg.yLabel) {
        var yl = svg("text", { x: ml, y: 14, "text-anchor": "start", class: "ax" }); yl.textContent = cfg.yLabel; s.appendChild(yl);
      }
      var occupied = [];                       // boxes already used by text, so later labels keep clear of them
      function box(x0, y0, x1, y1) { var b = { x0: x0, y0: y0, x1: x1, y1: y1 }; occupied.push(b); return b; }

      if (cfg.refLabel && !narrow) {
        var rl = svg("text", { x: ml + pw - 6, y: Y(cfg.refLabel.v) - 6, "text-anchor": "end", class: "ax" }); rl.textContent = cfg.refLabel.text; s.appendChild(rl);
        box(ml + pw - 6 - textW(cfg.refLabel.text), Y(cfg.refLabel.v) - 20, ml + pw - 4, Y(cfg.refLabel.v) + 2);
      }

      // gap marker (drawn under the lines)
      if (cfg.gap) {
        var gx = X(cfg.gap.i);
        s.appendChild(svg("line", { x1: gx, x2: gx, y1: mt, y2: mt + ph, class: "gapline" }));
        if (!narrow) {
          var gl = svg("text", { x: gx - 6, y: mt + ph - 8, "text-anchor": "end", class: "ax" }); gl.textContent = cfg.gap.label; s.appendChild(gl);
          box(gx - 6 - textW(cfg.gap.label), mt + ph - 22, gx - 6, mt + ph - 4);
        }
      }

      // the break-even: a dashed line, its label at the right under the line, "aluminium cheaper" at the top left and "copper cheaper" under the break-even label (clear of the data)
      if (cfg.band) {
        var by = Y(cfg.band.v);
        s.appendChild(svg("line", { x1: ml, x2: ml + pw, y1: by, y2: by, class: "bandline" }));
        var bl = svg("text", { x: ml + pw - 4, y: by + 13, "text-anchor": "end", class: "ax" }); bl.textContent = cfg.band.label; s.appendChild(bl);
        var zb = svg("text", { x: ml + pw - 4, y: by + 27, "text-anchor": "end", class: "ax" }); zb.textContent = cfg.band.zoneBottom; s.appendChild(zb);
        var zt = svg("text", { x: ml + 6, y: mt + 12, class: "ax zonetop" }); zt.textContent = cfg.band.zoneTop; s.appendChild(zt);
        box(ml + pw - 4 - 130, by, ml + pw, by + 32);
        box(ml, mt, ml + 110, mt + 16);
      }

      // lines, broken wherever a value is missing
      var lines = svg("g", { "clip-path": "url(#" + clipId + ")" });
      s.appendChild(lines);
      cfg.series.forEach(function (sr) {
        var d = "", pen = false;
        sr.values.forEach(function (v, i) {
          if (v == null) { pen = false; return; }
          d += (pen ? "L" : "M") + X(i).toFixed(1) + " " + Y(v).toFixed(1);
          pen = true;
        });
        lines.appendChild(svg("path", { d: d, fill: "none", stroke: color(sr.color), "stroke-width": 2.2, "stroke-linejoin": "round", "stroke-linecap": "round", "stroke-dasharray": sr.dash || null }));
      });

      // open circles on both sides of the gap, so the break reads as a break
      if (cfg.gap) {
        var gs = cfg.series.filter(function (x) { return x.id === cfg.gap.series; })[0];
        [cfg.gap.i - 1, cfg.gap.i + 1].forEach(function (i) {
          if (gs.values[i] != null) {
            s.appendChild(svg("circle", { cx: X(i), cy: Y(gs.values[i]), r: 3.5, fill: color("--halo"), stroke: color(gs.color), "stroke-width": 1.8 }));
          }
        });
      }

      function place(x, text, anchor, dx) {
        var w = textW(text);
        if (anchor === "start" && x + dx + w > W - 4) { anchor = "end"; dx = -dx; }
        else if (anchor === "end" && x + dx - w < ml) { anchor = "start"; dx = -dx; }
        return { anchor: anchor, dx: dx };
      }

      // call-outs: a ring marker and up to three short lines (on a narrow screen: a numbered badge, explained in a list under the chart)
      (cfg.marks || []).forEach(function (m, mi) {
        var sr = cfg.series.filter(function (x) { return x.id === m.series; })[0];
        var cx = X(m.i), cy = Y(sr.values[m.i]);
        if (narrow) {
          s.appendChild(svg("circle", { class: "endmark", cx: cx, cy: cy, r: 9, fill: color("--halo"), stroke: color(sr.color), "stroke-width": 2.5 }));
          var nt = svg("text", { x: cx, y: cy + 4, "text-anchor": "middle", class: "badge endmark", fill: color("--ink") }); nt.textContent = (cfg.events && cfg.events.length) ? String.fromCharCode(65 + mi) : String(mi + 1); s.appendChild(nt);   // letters when the chart also has numbered event markers
          box(cx - 10, cy - 10, cx + 10, cy + 10);
          return;
        }
        s.appendChild(svg("circle", { class: "endmark", cx: cx, cy: cy, r: 5.5, fill: color(sr.color), stroke: color("--halo"), "stroke-width": 2.2 }));
        var widest = m.lines.reduce(function (a, b) { return textW(b) > a ? textW(b) : a; }, 0);
        var anchor = m.anchor || "start", dx = m.dx || 0, dyv = m.dy || 0;
        if (anchor === "start" && cx + dx + widest > W - 4) { anchor = "end"; dx = -Math.abs(dx); }
        else if (anchor === "end" && cx + dx - widest < ml) { anchor = "start"; dx = Math.abs(dx); }
        else if (anchor === "middle") {
          if (cx - widest / 2 < ml) { anchor = "start"; dx = 0; } else if (cx + widest / 2 > W - 4) { anchor = "end"; dx = 0; }
        }
        // the call-out must not sit on a line: try the given spot first, then other heights on both sides of the dot
        var spotBox = function (an, ddx, ddy) {
          var x0 = an === "start" ? cx + ddx : (an === "end" ? cx + ddx - widest : cx + ddx - widest / 2);
          return { x0: x0 - 3, x1: x0 + widest + 3, y0: cy + ddy - 13, y1: cy + ddy + 14.5 * (m.lines.length - 1) + 5 };
        };
        var okSpot = function (bx) { return bx.x0 >= ml && bx.x1 <= W - 2 && bx.y0 >= mt - 6 && bx.y1 <= mt + ph && crossings(bx.x0, bx.y0, bx.x1, bx.y1) === 0; };
        if (!okSpot(spotBox(anchor, dx, dyv))) {
          var tries = [];
          [-30, -48, -66, -84, -102, 28, 46, 64, 82, 100, 118, 136].forEach(function (dd) { [["end", -16], ["start", 16], ["middle", 0], ["end", -60], ["start", 60]].forEach(function (a2) { tries.push([a2[0], a2[1], dd]); }); });
          for (var q = 0; q < tries.length; q++) { if (okSpot(spotBox(tries[q][0], tries[q][1], tries[q][2]))) { anchor = tries[q][0]; dx = tries[q][1]; dyv = tries[q][2]; break; } }
        }
        var bx0 = anchor === "start" ? cx + dx : (anchor === "end" ? cx + dx - widest : cx + dx - widest / 2);
        box(bx0 - 3, cy + dyv - 13, bx0 + widest + 3, cy + dyv + 14.5 * (m.lines.length - 1) + 5);
        if (Math.abs(dyv) > 24) {              // a thin leader from the dot to a label that sits further away
          var ly = dyv > 0 ? cy + dyv - 14 : cy + dyv + 14.5 * (m.lines.length - 1) + 5;
          s.appendChild(svg("line", { x1: cx, y1: cy + (dyv > 0 ? 6 : -6), x2: cx + dx, y2: ly, class: "leader" }));
        }
        var t = svg("text", { x: cx + dx, y: cy + dyv, "text-anchor": anchor, class: "callout endmark", fill: color("--ink") });
        t.setAttribute("style", "paint-order:stroke;stroke:" + color("--halo") + ";stroke-width:3px;stroke-linejoin:round");
        m.lines.forEach(function (line, k) {
          var ts = svg("tspan", { x: cx + dx, dy: k === 0 ? 0 : 14.5, class: k === 0 ? "strong" : "" }); ts.textContent = line; t.appendChild(ts);
        });
        s.appendChild(t);
      });

      // direct labels: for each line, the open spot (above or below the line) where the label crosses the fewest lines and call-outs
      function crossings(x0, y0, x1, y1) {
        var score = 0;
        occupied.forEach(function (o) { if (x0 < o.x1 && x1 > o.x0 && y0 < o.y1 && y1 > o.y0) { score += 100; } });
        cfg.series.forEach(function (sr) {
          for (var k = 0; k < cfg.n - 1; k++) {
            var a = sr.values[k], b = sr.values[k + 1];
            if (a == null || b == null) { continue; }
            var xa = X(k), xb = X(k + 1), ya = Y(a), yb = Y(b);
            if (xb < x0 - 2 || xa > x1 + 2) { continue; }
            if (Math.max(ya, yb) >= y0 - 2 && Math.min(ya, yb) <= y1 + 2) { score += 1; }
          }
        });
        return score;
      }
      cfg.series.forEach(function (sr) {
        if (!sr.label) { return; }
        var ltext = narrow ? sr.label.short : sr.label.text;
        if (!ltext) { return; }
        var w = textW(ltext), best = null;
        for (var i = 0; i < cfg.n; i += 3) {
          var v = sr.values[i];
          if (v == null) { continue; }
          var x0 = X(i), x1 = x0 + w;
          if (x1 > ml + pw - 2) { break; }
          [-9, 17, -26, 34, -44, 52, -62, 70].forEach(function (off) {
            var base = Y(v) + off, y0 = base - 12, y1 = base + 4;
            if (y0 < mt + 2 || y1 > mt + ph - 2) { return; }
            var sc = crossings(x0 - 2, y0, x1 + 2, y1) * 1000 + Math.abs(off) * 0.4 + Math.abs(i - cfg.n * 0.55) * 0.05;
            if (best === null || sc < best.sc) { best = { sc: sc, x: x0, base: base, x1: x1, y0: y0, y1: y1 }; }
          });
        }
        if (!best) { return; }
        box(best.x - 2, best.y0, best.x1 + 2, best.y1);
        var t = svg("text", { x: best.x, y: best.base, "text-anchor": "start", class: "lbl endmark", fill: color("--ink") });
        t.textContent = ltext;
        t.setAttribute("style", "paint-order:stroke;stroke:" + color("--halo") + ";stroke-width:3.5px;stroke-linejoin:round");
        s.appendChild(t);
      });

      // event markers: a thin dotted line through the whole plot and a numbered badge above it; badges that would touch drop to a second row
      var evs = (cfg.events || []).slice().sort(function (p, q) { return p.i - q.i; }), lastX = -1e9, row = 0;
      evs.forEach(function (ev) {
        var ex = X(ev.i);
        row = ex - lastX < 19 ? row + 1 : 0;
        lastX = ex;
        var ey = 30 + row * 19;
        s.insertBefore(svg("line", { x1: ex, x2: ex, y1: ey + 8.5, y2: mt + ph, class: "evline" }), s.firstChild.nextSibling);
        s.appendChild(svg("circle", { class: "evdot", cx: ex, cy: ey, r: 8.5, fill: color("--halo"), stroke: color("--ink"), "stroke-width": 1.3 }));
        var et = svg("text", { class: "badge", x: ex, y: ey + 3.8, "text-anchor": "middle", fill: color("--ink") }); et.textContent = String(ev.n); s.appendChild(et);
      });

      // a small spark at the latest point of the main line, fired once when the reveal ends
      var sp = svg("g", { class: "spark", "aria-hidden": "true" });
      var s0 = cfg.series[0], li = s0.values.length - 1;
      while (li > 0 && s0.values[li] == null) { li--; }
      sp.setAttribute("transform", "translate(" + X(li).toFixed(1) + " " + Y(s0.values[li]).toFixed(1) + ") scale(" + (narrow ? 0.45 : 0.6) + ")");
      CMA.spark.build(sp);
      s.appendChild(sp);
      sparkEl = sp;

      // crosshair
      var cross = svg("g", { class: "cross", visibility: "hidden" });
      var vline = svg("line", { y1: mt, y2: mt + ph, stroke: color("--muted"), "stroke-width": 1 });
      cross.appendChild(vline);
      var dots = cfg.series.map(function (sr) {
        var c = svg("circle", { r: 4.5, fill: color(sr.color), stroke: color("--halo"), "stroke-width": 2 }); cross.appendChild(c); return c;
      });
      s.appendChild(cross);
      var hit = svg("rect", { x: ml, y: mt, width: pw, height: ph, fill: "transparent" });
      s.appendChild(hit);

      tip = h("div", { class: "chart-tip", hidden: true, role: "presentation" });
      host.appendChild(s);
      host.appendChild(tip);

      function show(i, announce) {
        i = Math.max(0, Math.min(cfg.n - 1, i)); cur = i;
        var x = X(i);
        vline.setAttribute("x1", x); vline.setAttribute("x2", x);
        cfg.series.forEach(function (sr, k) {
          var v = sr.values[i];
          if (v == null) { dots[k].setAttribute("visibility", "hidden"); }
          else { dots[k].setAttribute("visibility", "visible"); dots[k].setAttribute("cx", x); dots[k].setAttribute("cy", Y(v)); }
        });
        cross.setAttribute("visibility", "visible");
        var info = cfg.tip(i);
        tip.textContent = "";
        tip.appendChild(h("strong", { text: info.title }));
        info.lines.forEach(function (l) { tip.appendChild(h("div", { text: l })); });
        tip.hidden = false;
        var tw = tip.offsetWidth, left = x + 14;
        if (left + tw > W - 4) { left = x - tw - 14; }
        tip.style.left = Math.max(4, left) + "px";
        tip.style.top = (mt + 6) + "px";
        if (announce) { CMA.say(info.title + ". " + info.lines.join(". ")); }
        if (cfg.onMove) { cfg.onMove(i); }
      }
      function hide() { cross.setAttribute("visibility", "hidden"); tip.hidden = true; }
      function idxFromEvent(e) {
        var r = s.getBoundingClientRect(), px = (e.clientX - r.left) * (W / r.width);
        return Math.round(((px - ml) / pw) * (cfg.n - 1));
      }
      hit.addEventListener("pointermove", function (e) { show(idxFromEvent(e), false); });
      hit.addEventListener("pointerdown", function (e) { show(idxFromEvent(e), false); });
      s.addEventListener("pointerleave", function () { if (document.activeElement !== s) { hide(); } });
      s.addEventListener("focus", function () { show(cur == null ? cfg.n - 1 : cur, true); });
      s.addEventListener("blur", hide);
      s.addEventListener("keydown", function (e) {
        var step = { ArrowLeft: -1, ArrowRight: 1, PageDown: -12, PageUp: 12 }[e.key];
        if (step != null) { e.preventDefault(); show((cur == null ? cfg.n - 1 : cur) + step, true); }
        else if (e.key === "Home") { e.preventDefault(); show(0, true); }
        else if (e.key === "End") { e.preventDefault(); show(cfg.n - 1, true); }
        else if (e.key === "Escape") { hide(); }
      });
      if (cur != null && document.activeElement === s) { show(cur, false); }
      host.classList.remove("will-draw", "draw", "done");
      if (state === "pending") { host.classList.add("will-draw"); }
      if (state === "pending" && !io) {
        io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { io.disconnect(); startReveal(); } }); }, { threshold: 0.35 });
        io.observe(host);
      }
    }
    function startReveal() {
      if (state !== "pending") { return; }
      state = "running";
      host.classList.add("draw");
      var rect = host.querySelector(".reveal-rect");
      if (rect) { rect.addEventListener("transitionend", finish, { once: true }); }
      setTimeout(finish, 1400);
    }
    function finish() {
      if (state === "done") { return; }
      state = "done";
      host.classList.add("done");
      if (sparkEl) { CMA.spark.fire(sparkEl); }
    }

    draw();
    if (window.ResizeObserver) {
      ro = new ResizeObserver(function () {
        if (Math.abs(host.clientWidth - lastW) < 2) { return; }
        cancelAnimationFrame(raf); raf = requestAnimationFrame(draw);
      });
      ro.observe(host);
    }
    return { redraw: draw, destroy: function () { if (ro) { ro.disconnect(); } } };
  };
  /* A quadrant scatter of monthly % changes: x across, y down. The two opposite-direction corners are tinted, their dots copper, the rest grey.
     cfg: { rows, x, y, fit: {slope_log, intercept_log}, big, count, xLabel, yLabel, aria, tip: function (row) -> {title, lines} } */
  CMA.scatterChart = function (host, cfg) {
    var tip = null, cur = null, lastW = 0, raf = 0;
    host.classList.add("chart");
    function color(c) { return getComputedStyle(document.body).getPropertyValue(c).trim() || c; }
    function nice(v, step) { return Math.ceil(Math.abs(v) / step) * step; }
    var rows = cfg.rows;
    var xMax = nice(Math.max.apply(null, rows.map(function (r) { return Math.abs(r[cfg.x]); })), 2);
    var yMax = nice(Math.max.apply(null, rows.map(function (r) { return Math.abs(r[cfg.y]); })), 10);

    function draw() {
      var W = Math.max(300, Math.round(host.clientWidth || 600));
      lastW = W;
      var narrow = W < 560;
      var H = Math.round(Math.min(480, Math.max(300, W * 0.62)));
      var ml = narrow ? 40 : 52, mr = 12, mt = 30, mb = 42, pw = W - ml - mr, ph = H - mt - mb;
      var X = function (v) { return ml + (v + xMax) / (2 * xMax) * pw; };
      var Y = function (v) { return mt + (yMax - v) / (2 * yMax) * ph; };
      host.textContent = "";
      var s = svg("svg", { viewBox: "0 0 " + W + " " + H, role: "img", tabindex: "0", "aria-label": cfg.aria, focusable: "true" });
      host.appendChild(s);                 // attached now, so the labels can be measured before they are placed
      // the two opposite-direction corners
      s.appendChild(svg("rect", { x: ml, y: mt, width: X(0) - ml, height: Y(0) - mt, class: "quad" }));
      s.appendChild(svg("rect", { x: X(0), y: Y(0), width: ml + pw - X(0), height: mt + ph - Y(0), class: "quad" }));
      var xs = narrow ? 4 : 2;
      for (var v = -xMax; v <= xMax + 1e-9; v += xs) {
        s.appendChild(svg("line", { x1: X(v), x2: X(v), y1: mt, y2: mt + ph, class: v === 0 ? "zeroline" : "gridline" }));
        var tx = svg("text", { x: X(v), y: mt + ph + 16, "text-anchor": "middle", class: "ax" }); tx.textContent = CMA.minus(String(v)); s.appendChild(tx);
      }
      for (var u = -yMax; u <= yMax + 1e-9; u += 10) {
        s.appendChild(svg("line", { x1: ml, x2: ml + pw, y1: Y(u), y2: Y(u), class: u === 0 ? "zeroline" : "gridline" }));
        var ty = svg("text", { x: ml - 6, y: Y(u) + 4, "text-anchor": "end", class: "ax" }); ty.textContent = CMA.minus(String(u)); s.appendChild(ty);
      }
      var xl = svg("text", { x: ml + pw, y: H - 6, "text-anchor": "end", class: "ax" }); xl.textContent = cfg.xLabel; s.appendChild(xl);
      var yl = svg("text", { x: ml, y: 14, "text-anchor": "start", class: "ax" }); yl.textContent = cfg.yLabel; s.appendChild(yl);
      // the regression line, drawn in % terms (it is fitted on log changes)
      var d = "", fitPts = [];
      for (var k = 0; k <= 60; k++) {
        var xv = -xMax + k * (2 * xMax / 60);
        var yv = 100 * (Math.exp(cfg.fit.intercept_log + cfg.fit.slope_log * Math.log(1 + xv / 100)) - 1);
        if (yv > yMax || yv < -yMax) { continue; }
        d += (d ? "L" : "M") + X(xv).toFixed(1) + " " + Y(yv).toFixed(1); fitPts.push([X(xv), Y(yv)]);
      }
      // dots: grey first, copper on top
      var dots = [];
      ["same", "unchanged", "opposite"].forEach(function (kind) {
        rows.forEach(function (r, i) {
          if (r.direction !== kind) { return; }
          var c = svg("circle", { cx: X(r[cfg.x]).toFixed(1), cy: Y(r[cfg.y]).toFixed(1), r: narrow ? 2.8 : 3.6, class: "pt " + kind });
          s.appendChild(c);
          dots[i] = c;
        });
      });
      s.appendChild(svg("path", { d: d, class: "fitline" }));
      // the big label sits inside the upper-left tinted corner, in the spot that touches the fitted line and the dots least; the count goes under it, the small label is in the lower-right corner
      var big = svg("text", { x: 0, y: 0, class: "bigl" }); big.textContent = cfg.big; s.appendChild(big);
      var cnt = svg("text", { x: 0, y: 0, class: "ax strong" }); cnt.textContent = cfg.count; s.appendChild(cnt);
      var bb = big.getBBox(), cb = cnt.getBBox(), bw = Math.max(bb.width, cb.width) + 6, bh = bb.height + cb.height + 2;
      function hitsIn(x0, y0, x1, y1) {
        var n = 0;
        for (var q = 0; q < fitPts.length - 1; q++) {
          for (var f = 0; f < 1; f += 0.125) {
            var px = fitPts[q][0] + (fitPts[q + 1][0] - fitPts[q][0]) * f, py = fitPts[q][1] + (fitPts[q + 1][1] - fitPts[q][1]) * f;
            if (px > x0 - 6 && px < x1 + 6 && py > y0 - 6 && py < y1 + 6) { n += 1000; }
          }
        }
        rows.forEach(function (r) { var px = X(r[cfg.x]), py = Y(r[cfg.y]); if (px > x0 - 4 && px < x1 + 4 && py > y0 - 4 && py < y1 + 4) { n++; } });
        return n;
      }
      var spot = null, qx1 = X(0) - 8, qy1 = Y(0) - 8;
      for (var by0 = mt + 8; by0 + bh <= qy1; by0 += 6) {
        for (var bx0 = ml + 8; bx0 + bw <= qx1; bx0 += 10) {
          var sc = hitsIn(bx0, by0, bx0 + bw, by0 + bh) + (bx0 - ml) * 0.01 + (by0 - mt) * 0.01;
          if (spot === null || sc < spot.sc) { spot = { sc: sc, x: bx0, y: by0 }; }
        }
      }
      if (!spot) { spot = { x: ml + 12, y: mt + 8 }; }
      big.setAttribute("x", spot.x + 2); big.setAttribute("y", spot.y - bb.y);
      cnt.setAttribute("x", spot.x + 2); cnt.setAttribute("y", spot.y + bb.height + 2 - cb.y);
      var here = svg("text", { x: ml + pw - 10, y: mt + ph - 12, "text-anchor": "end", class: "ax strong" }); here.textContent = cfg.here; s.appendChild(here);
      var ring = svg("circle", { r: 7, class: "ring", visibility: "hidden" });
      s.appendChild(ring);
      tip = h("div", { class: "chart-tip", hidden: true, role: "presentation" });
      host.appendChild(tip);

      function show(i, announce) {
        i = Math.max(0, Math.min(rows.length - 1, i)); cur = i;
        var r = rows[i], cx = X(r[cfg.x]), cy = Y(r[cfg.y]);
        ring.setAttribute("cx", cx); ring.setAttribute("cy", cy); ring.setAttribute("visibility", "visible");
        var info = cfg.tip(r);
        tip.textContent = "";
        tip.appendChild(h("strong", { text: info.title }));
        info.lines.forEach(function (l) { tip.appendChild(h("div", { text: l })); });
        tip.hidden = false;
        var sc = host.clientWidth / W;
        var left = cx * sc + 14, top = cy * sc - 10;
        if (left + tip.offsetWidth > host.clientWidth - 4) { left = cx * sc - tip.offsetWidth - 14; }
        tip.style.left = Math.max(4, left) + "px"; tip.style.top = Math.max(4, top) + "px";
        if (announce) { CMA.say(info.title + ". " + info.lines.join(". ")); }
      }
      function hide() { ring.setAttribute("visibility", "hidden"); tip.hidden = true; }
      s.addEventListener("pointermove", function (e) {
        var rc = s.getBoundingClientRect(), px = (e.clientX - rc.left) * (W / rc.width), py = (e.clientY - rc.top) * (H / rc.height);
        var best = -1, bd = 22 * 22;
        rows.forEach(function (r, i) { var dx = X(r[cfg.x]) - px, dy = Y(r[cfg.y]) - py, dd = dx * dx + dy * dy; if (dd < bd) { bd = dd; best = i; } });
        if (best >= 0) { show(best, false); } else { hide(); }
      });
      s.addEventListener("pointerleave", function () { if (document.activeElement !== s) { hide(); } });
      s.addEventListener("focus", function () { show(cur == null ? rows.length - 1 : cur, true); });
      s.addEventListener("blur", hide);
      s.addEventListener("keydown", function (e) {
        var step = { ArrowLeft: -1, ArrowRight: 1, ArrowDown: -1, ArrowUp: 1, PageDown: -12, PageUp: 12 }[e.key];
        if (step != null) { e.preventDefault(); show((cur == null ? rows.length - 1 : cur) + step, true); }
        else if (e.key === "Home") { e.preventDefault(); show(0, true); }
        else if (e.key === "End") { e.preventDefault(); show(rows.length - 1, true); }
        else if (e.key === "Escape") { hide(); }
      });
    }
    draw();
    if (window.ResizeObserver) {
      new ResizeObserver(function () {
        if (Math.abs(host.clientWidth - lastW) < 2) { return; }
        cancelAnimationFrame(raf); raf = requestAnimationFrame(draw);
      }).observe(host);
    }
  };
})();
