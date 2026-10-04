/* The copper donut: a tilted ring with real thickness, in plain SVG (no library, no image files).
   Each slice is a group: far inner wall, two radial cut faces, front outer wall, the top face with a metallic gradient and two layers of grain (feTurbulence, clipped to the slice),
   a dark outline, a light rim on the outer edge and a sheen that sweeps once across the slice (animateTransform, restarted with beginElement()).
   Hover or focus on a slice: it lifts outward by about 9 px and scales to about 1.07 (CSS), the others fall to 60 percent, and the centre of the ring shows the share and the name.
   Nothing loops. With reduced motion there is no scale, no sweep and no transition: the slice only lifts.
   CMA.donut(host, { data: [{name, pct}], year, idle: [top, bottom], aria, expanded, labels: bool, listHost }) -> { activate(i), clear(), destroy(), el }.
   Every id is made unique per drawing, so the page and the dialog can both hold one. All text comes in through the options. */
(function () {
  var CMA = window.CMA, NS = "http://www.w3.org/2000/svg", uidN = 0;
  var K = 0.58;            // vertical squash of the tilted ring
  var LIFT = 9, SCALE = 1.07;
  // bright to deep copper, ordered by size; "Other" is patina green in the same style
  var COPPER = [["#F2BE92", "#DE9159", "#BB6B33", "#8E4A22"], ["#EBB07F", "#D68A4C", "#B26028", "#86441F"], ["#E2A06D", "#CC7C40", "#A75723", "#7E3F1B"],
    ["#D58F5C", "#BF6D33", "#9B501F", "#743A18"], ["#C77E4D", "#AE5F2B", "#8B461B", "#6A3315"]];
  var PATINA = ["#A3CDBB", "#5F9E8A", "#3F7F6C", "#285A4B"];

  function mk(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    if (attrs) { Object.keys(attrs).forEach(function (a) { e.setAttribute(a, attrs[a]); }); }
    if (parent) { parent.appendChild(e); }
    return e;
  }
  function lines2(name) {            // two balanced lines
    var w = name.split(" ");
    if (w.length < 2) { return [name]; }
    var best = 1, bestDiff = 1e9;
    for (var i = 1; i < w.length; i++) {
      var a = w.slice(0, i).join(" ").length, b = w.slice(i).join(" ").length;
      if (Math.abs(a - b) < bestDiff) { bestDiff = Math.abs(a - b); best = i; }
    }
    return [w.slice(0, best).join(" "), w.slice(best).join(" ")];
  }

  CMA.donut = function (host, o) {
    var id = "dn" + (++uidN), reduce = CMA.reduce, timers = [], ro = null, drawn = null;
    host.classList.add("donut-host");

    function draw() {
      var W = Math.max(280, Math.round(host.clientWidth || 600)), narrow = W < 520, withLabels = o.labels !== false && !narrow;
      var Ro = narrow ? Math.min(W * 0.4, 130) : Math.min((W - 2 * (o.expanded ? 190 : 176)) / 2, o.expanded ? 260 : 150);
      Ro = Math.max(Ro, 70);
      var Ri = Ro * 0.56, T = Ro * 0.17, cx = W / 2, labelRoom = withLabels ? 74 : 20;
      var top = labelRoom + LIFT + 6, cy = top + K * Ro, H = Math.round(cy + K * Ro + T + labelRoom + 16);
      host.textContent = "";
      var svg = mk("svg", { viewBox: "0 0 " + W + " " + H, width: "100%", height: H, role: "group", "aria-label": o.aria, class: "donut" });
      host.appendChild(svg);
      var defs = mk("defs", null, svg);
      // grain: dark specks and light specks, from noise, no image files
      var fA = mk("filter", { id: id + "gA", x: "0", y: "0", width: "1", height: "1", "color-interpolation-filters": "sRGB" }, defs);
      mk("feTurbulence", { type: "fractalNoise", baseFrequency: ".85", numOctaves: "2", seed: "4", result: "n" }, fA);
      mk("feColorMatrix", { "in": "n", type: "matrix", values: "0 0 0 0 .16  0 0 0 0 .07  0 0 0 0 .03  2.4 0 0 0 -1.1" }, fA);
      var fB = mk("filter", { id: id + "gB", x: "0", y: "0", width: "1", height: "1", "color-interpolation-filters": "sRGB" }, defs);
      mk("feTurbulence", { type: "fractalNoise", baseFrequency: ".42", numOctaves: "2", seed: "9", result: "n" }, fB);
      mk("feColorMatrix", { "in": "n", type: "matrix", values: "0 0 0 0 1  0 0 0 0 .88  0 0 0 0 .72  0 2.6 0 0 -1.5" }, fB);
      var fS = mk("filter", { id: id + "sh", x: "-20%", y: "-30%", width: "140%", height: "170%" }, defs);
      mk("feGaussianBlur", { stdDeviation: Math.max(4, Ro * 0.05) }, fS);

      var P = function (r, th, dy) { return [cx + r * Math.cos(th), cy + K * r * Math.sin(th) + (dy || 0)]; };
      var f = function (p) { return p[0].toFixed(2) + " " + p[1].toFixed(2); };
      var arc = function (r, a, b, sweep, dy) { var p = P(r, b, dy); return "A " + r.toFixed(2) + " " + (K * r).toFixed(2) + " 0 " + ((b - a) > Math.PI ? 1 : 0) + " " + sweep + " " + f(p); };

      // contact shadow: a ring (even-odd), never filling the hole
      var sy = T + Ro * 0.07;
      var ring = "M" + f(P(Ro * 1.03, 0, sy)) + arc(Ro * 1.03, 0, Math.PI, 1, sy) + arc(Ro * 1.03, Math.PI, 2 * Math.PI, 1, sy) + "Z M" + f(P(Ri * 0.98, 0, sy * 0.5)) + arc(Ri * 0.98, 0, Math.PI, 1, sy * 0.5) + arc(Ri * 0.98, Math.PI, 2 * Math.PI, 1, sy * 0.5) + "Z";
      mk("path", { d: ring, "fill-rule": "evenodd", fill: "rgba(20,10,4,.34)", filter: "url(#" + id + "sh)" }, svg);

      var total = o.data.reduce(function (s, d) { return s + d.pct; }, 0), a0 = -Math.PI / 2, slices = [];
      o.data.forEach(function (d, i) {
        var a1 = a0 + (d.pct / total) * 2 * Math.PI, mid = (a0 + a1) / 2;
        slices.push({ d: d, i: i, a: a0, b: a1, mid: mid, depth: Math.sin(mid) });
        a0 = a1;
      });
      var painted = slices.slice().sort(function (p, q) { return p.depth - q.depth; });      // back to front
      var bySize = o.data.map(function (d, i) { return i; }).sort(function (p, q) { return o.data[q].pct - o.data[p].pct; });
      var gSlices = mk("g", { class: "dn-slices" }, svg), els = [];

      painted.forEach(function (s) {
        var i = s.i, last = o.other === i, pal = last ? PATINA : COPPER[Math.min(bySize.indexOf(i), COPPER.length - 1)];
        var g = mk("g", { class: "dn-slice", tabindex: i === 0 ? "0" : "-1", role: "img", "aria-label": s.d.name + ": " + s.d.pct + "%", "data-i": i }, gSlices);
        var hp = P((Ro + Ri) / 2, s.mid); g.setAttribute("data-hx", hp[0].toFixed(1)); g.setAttribute("data-hy", hp[1].toFixed(1));      // a point on the top face of the slice (used by the tests)
        g.style.setProperty("--ox", hp[0].toFixed(1) + "px"); g.style.setProperty("--oy", hp[1].toFixed(1) + "px");      // the slice scales about its own middle, the same in every browser
        g.style.setProperty("--dx", (LIFT * Math.cos(s.mid)).toFixed(2) + "px");
        g.style.setProperty("--dy", (LIFT * K * Math.sin(s.mid)).toFixed(2) + "px");
        mk("title", null, g).textContent = s.d.name + ": " + s.d.pct + "%";
        var gid = id + "t" + i, wid = id + "w" + i, iid = id + "i" + i;
        var lg = mk("linearGradient", { id: gid, x1: "0", y1: "0", x2: "1", y2: "1" }, defs);
        [[0, pal[0]], [0.34, pal[1]], [0.52, pal[0]], [0.74, pal[2]], [1, pal[3]]].forEach(function (st) { mk("stop", { offset: st[0], "stop-color": st[1] }, lg); });
        var wg = mk("linearGradient", { id: wid, x1: "0", y1: "0", x2: "0", y2: "1" }, defs);
        [[0, pal[2]], [1, pal[3]]].forEach(function (st) { mk("stop", { offset: st[0], "stop-color": st[1] }, wg); });
        var ig = mk("linearGradient", { id: iid, x1: "0", y1: "0", x2: "0", y2: "1" }, defs);
        [[0, pal[3]], [1, pal[2]]].forEach(function (st) { mk("stop", { offset: st[0], "stop-color": st[1] }, ig); });

        // far inner wall: the inner ellipse, back half only (sin < 0)
        // angles run from -pi/2 clockwise; the back half of the ring is where sin < 0, the front half where sin > 0
        var segs = function (front) {
          var out = [], a = s.a, b = s.b;
          // split the slice at every multiple of pi, keep the parts whose middle has the wanted sign
          var cuts = [a], k0 = Math.ceil(a / Math.PI);
          for (var c = k0 * Math.PI; c < b; c += Math.PI) { if (c > a + 1e-9) { cuts.push(c); } }
          cuts.push(b);
          for (var q = 0; q < cuts.length - 1; q++) { var m = (cuts[q] + cuts[q + 1]) / 2; if ((Math.sin(m) > 0) === front) { out.push([cuts[q], cuts[q + 1]]); } }
          return out;
        };
        segs(false).forEach(function (r) {
          var inner = "M" + f(P(Ri, r[0])) + " A " + Ri.toFixed(2) + " " + (K * Ri).toFixed(2) + " 0 " + ((r[1] - r[0]) > Math.PI ? 1 : 0) + " 1 " + f(P(Ri, r[1])) + " L" + f(P(Ri, r[1], T)) + " A " + Ri.toFixed(2) + " " + (K * Ri).toFixed(2) + " 0 " + ((r[1] - r[0]) > Math.PI ? 1 : 0) + " 0 " + f(P(Ri, r[0], T)) + " Z";
          mk("path", { d: inner, fill: "url(#" + iid + ")", stroke: "rgba(35,16,6,.5)", "stroke-width": 1, class: "dn-wall-in" }, g);
        });
        // radial cut faces at both edges of the slice
        [s.a, s.b].forEach(function (th) {
          var q = [P(Ri, th), P(Ro, th), P(Ro, th, T), P(Ri, th, T)];
          mk("path", { d: "M" + q.map(f).join(" L") + " Z", fill: "url(#" + wid + ")", stroke: "rgba(35,16,6,.55)", "stroke-width": 1, class: "dn-cut" }, g);
        });
        // front outer wall: outer ellipse, front half only (sin > 0)
        segs(true).forEach(function (r) {
          var big = (r[1] - r[0]) > Math.PI ? 1 : 0;
          var d = "M" + f(P(Ro, r[0])) + " A " + Ro.toFixed(2) + " " + (K * Ro).toFixed(2) + " 0 " + big + " 1 " + f(P(Ro, r[1])) + " L" + f(P(Ro, r[1], T)) + " A " + Ro.toFixed(2) + " " + (K * Ro).toFixed(2) + " 0 " + big + " 0 " + f(P(Ro, r[0], T)) + " Z";
          mk("path", { d: d, fill: "url(#" + wid + ")", stroke: "rgba(35,16,6,.5)", "stroke-width": 1, class: "dn-wall-out" }, g);
          mk("path", { d: d, fill: "rgba(0,0,0,.18)", class: "dn-wall-shade" }, g);
        });
        // top face
        var big2 = (s.b - s.a) > Math.PI ? 1 : 0;
        var top = "M" + f(P(Ro, s.a)) + " A " + Ro.toFixed(2) + " " + (K * Ro).toFixed(2) + " 0 " + big2 + " 1 " + f(P(Ro, s.b)) + " L" + f(P(Ri, s.b)) + " A " + Ri.toFixed(2) + " " + (K * Ri).toFixed(2) + " 0 " + big2 + " 0 " + f(P(Ri, s.a)) + " Z";
        mk("path", { d: top, fill: "url(#" + gid + ")", class: "dn-top" }, g);
        var cid = id + "c" + i, cp = mk("clipPath", { id: cid }, defs);
        mk("path", { d: top }, cp);
        var gg = mk("g", { "clip-path": "url(#" + cid + ")" }, g);
        mk("rect", { x: cx - Ro, y: cy - K * Ro, width: 2 * Ro, height: 2 * K * Ro, filter: "url(#" + id + "gA)", opacity: ".55", style: "mix-blend-mode:multiply" }, gg);
        mk("rect", { x: cx - Ro, y: cy - K * Ro, width: 2 * Ro, height: 2 * K * Ro, filter: "url(#" + id + "gB)", opacity: ".42", style: "mix-blend-mode:screen" }, gg);
        // the sheen: a narrow bright diagonal band that starts off to the left and sweeps once
        var bx = cx - Ro, bw = 2 * Ro, sid = id + "s" + i;
        var ang = 0.44, Lg = bw * 0.34;      // the axis is mostly horizontal, so the narrow band across it is a steep diagonal that moves from left to right
        var sg = mk("linearGradient", { id: sid, gradientUnits: "userSpaceOnUse", x1: bx, y1: cy - K * Ro * 0.5, x2: bx + Lg * Math.cos(ang), y2: cy - K * Ro * 0.5 + Lg * Math.sin(ang), gradientTransform: "translate(" + (-bw * 1.4) + " 0)" }, defs);
        [[0, "rgba(255,255,255,0)"], [0.42, "rgba(255,255,255,0)"], [0.5, "rgba(255,246,232,.62)"], [0.58, "rgba(255,255,255,0)"], [1, "rgba(255,255,255,0)"]].forEach(function (st) { mk("stop", { offset: st[0], "stop-color": st[1] }, sg); });
        var anim = mk("animateTransform", { attributeName: "gradientTransform", type: "translate", from: (-bw * 1.4) + " 0", to: (bw * 1.4) + " 0", dur: ".95s", begin: "indefinite", fill: "freeze" }, sg);
        mk("path", { d: top, fill: "url(#" + sid + ")", class: "dn-sheen", "pointer-events": "none" }, g);
        mk("path", { d: top, fill: "none", stroke: "rgba(40,18,8,.62)", "stroke-width": 1, class: "dn-outline" }, g);
        mk("path", { d: "M" + f(P(Ro - 0.6, s.a)) + " A " + (Ro - 0.6).toFixed(2) + " " + (K * (Ro - 0.6)).toFixed(2) + " 0 " + big2 + " 1 " + f(P(Ro - 0.6, s.b)), fill: "none", stroke: "rgba(255,238,214,.9)", "stroke-width": 1, class: "dn-rim", "pointer-events": "none" }, g);
        els[i] = { g: g, anim: anim, s: s };
      });

      // centre read-out: the share large, the name on two lines; at rest the year
      // the visible part of the hole lies between the bottom of the far inner wall and the front inner edge
      var vis0 = cy - K * Ri + T, visH = 2 * K * Ri - T, big = Math.min(visH * 0.36, 36), lh = 13.5, blockH = big * 0.8 + 6 + 2 * lh;
      var y0c = vis0 + Math.max(0, (visH - blockH) / 2) + big * 0.8;
      var cBig = mk("text", { x: cx, y: y0c, "text-anchor": "middle", class: "dn-c-big", style: "font-size:" + big.toFixed(0) + "px" }, svg);
      var cN1 = mk("text", { x: cx, y: y0c + 6 + lh, "text-anchor": "middle", class: "dn-c-name" }, svg);
      var cN2 = mk("text", { x: cx, y: y0c + 6 + 2 * lh, "text-anchor": "middle", class: "dn-c-name" }, svg);
      function rest() { cBig.textContent = o.idle[0]; cN1.textContent = o.idle[1]; cN2.textContent = ""; cBig.setAttribute("class", "dn-c-big idle"); }
      rest();

      // labels outside the ring, name and percent, on a wider ellipse; they never touch each other or the ring
      var labelEls = [];
      if (withLabels) {
        var Rx = Ro + 34, Ry = K * Ro + T + 34, items = slices.map(function (s) {
          var ln = (s.d.name.length > 24 ? lines2(s.d.name) : [s.d.name]), cs = Math.cos(s.mid), sn = Math.sin(s.mid);
          var anchor = cs > 0.2 ? "start" : (cs < -0.2 ? "end" : "middle");
          var x = cx + Rx * cs, y = cy + Ry * sn + (sn > 0 ? T * 0.5 : 0);
          var w = Math.max.apply(null, ln.map(function (t) { return t.length; }).concat([5])) * 6.6, hgt = (ln.length + 1) * 14.5;
          return { s: s, ln: ln, anchor: anchor, x: x, y: y, w: w, h: hgt };
        });
        var clearsRing = function (it) {         // the box of the label against the ring (an ellipse with its wall and the lift)
          var x0 = it.anchor === "start" ? it.x : (it.anchor === "end" ? it.x - it.w : it.x - it.w / 2), x1 = x0 + it.w, y0 = it.y - it.h / 2, y1 = y0 + it.h;
          var ex = Ro + LIFT + 8, ey = K * Ro + T / 2 + LIFT + 8, ecy = cy + T / 2;
          for (var xs = x0; xs <= x1 + 0.1; xs += (x1 - x0) / 6 || 1) { for (var ys = y0; ys <= y1 + 0.1; ys += (y1 - y0) / 4 || 1) { if (Math.pow((xs - cx) / ex, 2) + Math.pow((ys - ecy) / ey, 2) < 1) { return false; } } }
          return true;
        };
        items.forEach(function (it) {
          var tries = 0, dirx = Math.cos(it.s.mid), diry = Math.sin(it.s.mid);
          while (!clearsRing(it) && tries++ < 40) { it.x += dirx * 3; it.y += diry * 3; }
        });
        [items.filter(function (it) { return Math.cos(it.s.mid) >= 0; }), items.filter(function (it) { return Math.cos(it.s.mid) < 0; })].forEach(function (side) {
          side.sort(function (p, q) { return p.y - q.y; });
          for (var k = 1; k < side.length; k++) { var gap = (side[k - 1].h + side[k].h) / 2 + 6; if (side[k].y - side[k - 1].y < gap) { side[k].y = side[k - 1].y + gap; } }
        });
        items.forEach(function (it) {
          var t = mk("text", { x: it.x, y: it.y - it.h / 2 + 11, "text-anchor": it.anchor, class: "dn-label" }, svg);
          it.ln.forEach(function (l, k) { var ts = mk("tspan", { x: it.x, dy: k ? 14.5 : 0, class: "dn-ln" }, t); ts.textContent = l; });
          var tp = mk("tspan", { x: it.x, dy: 14.5, class: "dn-lp" }, t); tp.textContent = it.s.d.pct + "%";
          labelEls[it.s.i] = t;
        });
      }

      function activate(i, viaKey) {
        els.forEach(function (e, k) { if (e) { e.g.classList.toggle("on", k === i); } });
        svg.classList.add("has-on");
        var d = o.data[i], ln = lines2(d.name);
        cBig.textContent = d.pct + "%"; cBig.setAttribute("class", "dn-c-big");
        cN1.textContent = ln[0]; cN2.textContent = ln[1] || "";
        if (!reduce) { try { els[i].anim.beginElement(); } catch (e) { /* the sweep is decoration */ } }
        if (o.onActive) { o.onActive(i); }
      }
      function clear() {
        els.forEach(function (e) { if (e) { e.g.classList.remove("on"); } });
        svg.classList.remove("has-on");
        rest();
        if (o.onActive) { o.onActive(null); }
      }
      els.forEach(function (e, i) {
        e.g.addEventListener("pointerenter", function () { activate(i); });
        e.g.addEventListener("pointerleave", clear);
        e.g.addEventListener("focus", function () { activate(i, true); });
        e.g.addEventListener("blur", clear);
        e.g.addEventListener("keydown", function (ev) {
          var d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[ev.key];
          if (!d) { return; }
          ev.preventDefault();
          var n = (i + d + els.length) % els.length;
          els.forEach(function (x, k) { x.g.setAttribute("tabindex", k === n ? "0" : "-1"); });
          els[n].g.focus();
        });
      });
      // one sweep per slice when the chart first appears, staggered about 140 ms apart; none with reduced motion
      if (!reduce && !drawn) {
        o.data.forEach(function (d, i) { timers.push(setTimeout(function () { try { els[i].anim.beginElement(); } catch (e) { /* decoration */ } }, 350 + i * 140)); });
      }
      drawn = { svg: svg, els: els, activate: activate, clear: clear, W: W };

      // narrow screens: no outside labels, a text list under the chart instead
      if (o.listHost) {
        o.listHost.textContent = "";
        if (narrow) {
          var ul = document.createElement("ul"); ul.className = "dn-list";
          o.data.forEach(function (d) { var li = document.createElement("li"); li.textContent = d.name + ": " + d.pct + "%"; ul.appendChild(li); });
          o.listHost.appendChild(ul);
        }
      }
    }

    draw();
    if ("ResizeObserver" in window) {
      var rt = 0, lastW = host.clientWidth;
      ro = new ResizeObserver(function () { if (Math.abs(host.clientWidth - lastW) < 2) { return; } lastW = host.clientWidth; cancelAnimationFrame(rt); rt = requestAnimationFrame(draw); });
      ro.observe(host);
    }
    return {
      activate: function (i) { if (drawn) { drawn.activate(i); } },
      clear: function () { if (drawn) { drawn.clear(); } },
      destroy: function () { timers.forEach(clearTimeout); if (ro) { ro.disconnect(); } },
      get el() { return drawn && drawn.svg; }
    };
  };
})();
