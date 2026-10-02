/* A small line chart in plain SVG: direct labels, call-outs, a visible gap marker, a hover and keyboard crosshair with a tooltip card.
   Colours come from the CSS tokens (--copper, --green, ...), so the stylesheet stays the single source of truth. */
(function () {
  var CMA = window.CMA;
  var h = CMA.h, svg = CMA.svg;

  /* cfg: {
       n, yMax, yTicks, yFormat, xTicks: [{i, label}],
       series: [{id, color, values: [number|null], label: {i, dx, dy, text, anchor}}],
       marks: [{series, i, lines: [text], dx, dy, anchor}],
       gap: {i, series, label},
       tip: function (i) -> {title, lines: [text]},
       aria: text, onMove: function (i) }                                   */
  CMA.lineChart = function (host, cfg) {
    var cur = null, tip = null, ro = null, lastW = 0, raf = 0;
    host.classList.add("chart");

    function color(c) { return getComputedStyle(document.documentElement).getPropertyValue(c).trim() || c; }
    function textW(s) { return 6.4 * s.length; }

    function draw() {
      var W = Math.max(300, Math.round(host.clientWidth || 600));
      lastW = W;
      var narrow = W < 560;
      host.setAttribute("data-narrow", narrow ? "true" : "false");
      var H = narrow ? 320 : 410;
      var ml = 58, mr = narrow ? 14 : (cfg.marginRight || 14), mt = 26, mb = 34, pw = W - ml - mr, ph = H - mt - mb;
      var yMin = cfg.yMin || 0;
      var X = function (i) { return ml + (i / (cfg.n - 1)) * pw; };
      var Y = function (v) { return mt + ph - ((v - yMin) / (cfg.yMax - yMin)) * ph; };
      host.textContent = "";
      var s = svg("svg", { viewBox: "0 0 " + W + " " + H, role: "img", tabindex: "0", "aria-label": cfg.aria, focusable: "true" });

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

      // lines, broken wherever a value is missing
      cfg.series.forEach(function (sr) {
        var d = "", pen = false;
        sr.values.forEach(function (v, i) {
          if (v == null) { pen = false; return; }
          d += (pen ? "L" : "M") + X(i).toFixed(1) + " " + Y(v).toFixed(1);
          pen = true;
        });
        s.appendChild(svg("path", { d: d, fill: "none", stroke: color(sr.color), "stroke-width": 2.2, "stroke-linejoin": "round", "stroke-linecap": "round", "stroke-dasharray": sr.dash || null }));
      });

      // open circles on both sides of the gap, so the break reads as a break
      if (cfg.gap) {
        var gs = cfg.series.filter(function (x) { return x.id === cfg.gap.series; })[0];
        [cfg.gap.i - 1, cfg.gap.i + 1].forEach(function (i) {
          if (gs.values[i] != null) {
            s.appendChild(svg("circle", { cx: X(i), cy: Y(gs.values[i]), r: 3.5, fill: color("--card"), stroke: color(gs.color), "stroke-width": 1.8 }));
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
          s.appendChild(svg("circle", { cx: cx, cy: cy, r: 9, fill: color("--card"), stroke: color(sr.color), "stroke-width": 2.5 }));
          var nt = svg("text", { x: cx, y: cy + 4, "text-anchor": "middle", class: "badge", fill: color("--forest") }); nt.textContent = String(mi + 1); s.appendChild(nt);
          box(cx - 10, cy - 10, cx + 10, cy + 10);
          return;
        }
        s.appendChild(svg("circle", { cx: cx, cy: cy, r: 5.5, fill: color(sr.color), stroke: color("--card"), "stroke-width": 2.2 }));
        var widest = m.lines.reduce(function (a, b) { return textW(b) > a ? textW(b) : a; }, 0);
        var anchor = m.anchor || "start", dx = m.dx || 0;
        if (anchor === "start" && cx + dx + widest > W - 4) { anchor = "end"; dx = -Math.abs(dx); }
        else if (anchor === "end" && cx + dx - widest < ml) { anchor = "start"; dx = Math.abs(dx); }
        else if (anchor === "middle") {
          if (cx - widest / 2 < ml) { anchor = "start"; dx = 0; } else if (cx + widest / 2 > W - 4) { anchor = "end"; dx = 0; }
        }
        var bx0 = anchor === "start" ? cx + dx : (anchor === "end" ? cx + dx - widest : cx + dx - widest / 2);
        box(bx0 - 3, cy + (m.dy || 0) - 13, bx0 + widest + 3, cy + (m.dy || 0) + 14.5 * (m.lines.length - 1) + 5);
        if (Math.abs(m.dy || 0) > 24) {              // a thin leader from the dot to a label that sits further away
          var ly = (m.dy || 0) > 0 ? cy + m.dy - 14 : cy + m.dy + 14.5 * (m.lines.length - 1) + 5;
          s.appendChild(svg("line", { x1: cx, y1: cy + ((m.dy || 0) > 0 ? 6 : -6), x2: cx + dx, y2: ly, class: "leader" }));
        }
        var t = svg("text", { x: cx + dx, y: cy + (m.dy || 0), "text-anchor": anchor, class: "callout", fill: color("--forest") });
        t.setAttribute("style", "paint-order:stroke;stroke:" + color("--card") + ";stroke-width:3px;stroke-linejoin:round");
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
          [-9, 17].forEach(function (off) {
            var base = Y(v) + off, y0 = base - 12, y1 = base + 4;
            if (y0 < mt + 2 || y1 > mt + ph - 2) { return; }
            var sc = crossings(x0 - 2, y0, x1 + 2, y1) * 1000 + Math.abs(i - cfg.n * 0.55) * 0.05;
            if (best === null || sc < best.sc) { best = { sc: sc, x: x0, base: base, x1: x1, y0: y0, y1: y1 }; }
          });
        }
        if (!best) { return; }
        box(best.x - 2, best.y0, best.x1 + 2, best.y1);
        var t = svg("text", { x: best.x, y: best.base, "text-anchor": "start", class: "lbl", fill: color("--forest") });
        t.textContent = ltext;
        t.setAttribute("style", "paint-order:stroke;stroke:" + color("--card") + ";stroke-width:3.5px;stroke-linejoin:round");
        s.appendChild(t);
      });

      // crosshair
      var cross = svg("g", { class: "cross", visibility: "hidden" });
      var vline = svg("line", { y1: mt, y2: mt + ph, stroke: color("--forest-muted"), "stroke-width": 1 });
      cross.appendChild(vline);
      var dots = cfg.series.map(function (sr) {
        var c = svg("circle", { r: 4.5, fill: color(sr.color), stroke: color("--card"), "stroke-width": 2 }); cross.appendChild(c); return c;
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
})();
