/* The copper donut, in plain SVG with no library and no image files. It follows design_reference/story-study.html and dashboard-study.html: a tilted ring (vertical squash 0.58)
   with real thickness (about 4 percent of the height), a hole of 0.56 of the radius, per-slice metallic gradients, two layers of grain from feTurbulence, a light rim, a dark outline and a
   soft ring-shaped contact shadow. Slices are drawn back to front. Hover or focus lifts a slice about 9 px and scales it to 1.07, the others drop to 60 percent, the centre shows the share
   and the name, and a narrow bright band sweeps across the slice once. Each slice also sweeps once on the first draw, 140 ms apart. Nothing loops.
   With reduced motion there is no scale, no sweep and no transition: the slice only lifts.
   CMA.donut(host, { data: [{name, pct}], idle: [text, text], aria, height, legend, onActive }) draws into host (an element) and returns { activate(i), clear(), destroy() }.
   Every id is unique per drawing, so the page and the dialog can both hold one. All text comes in through the options. */
(function () {
  var CMA = window.CMA, NS = "http://www.w3.org/2000/svg", uidN = 0;
  var TONES = [["#F6C59B", "#B8622E", "#6F3314"], ["#F0B88A", "#AA5628", "#68300F"], ["#E8AC7C", "#9C4D23", "#5F2B0E"], ["#DEA172", "#8F4620", "#58290C"], ["#D39668", "#84401D", "#522609"], ["#A6DCCB", "#3F8F7A", "#1D5043"]];

  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    if (attrs) { Object.keys(attrs).forEach(function (a) { e.setAttribute(a, attrs[a]); }); }
    if (parent) { parent.appendChild(e); }
    return e;
  }
  function wrapName(nm) {
    var i = nm.indexOf(", ");
    if (i > 0) { return [nm.slice(0, i + 1), nm.slice(i + 2)]; }
    if (nm.length > 16) { var j = nm.lastIndexOf(" ", nm.length / 2 + 3); return [nm.slice(0, j), nm.slice(j + 1)]; }
    return [nm, ""];
  }

  CMA.donut = function (host, o) {
    var uid = "dn" + (++uidN), reduce = CMA.reduce, timers = [], ro = null, firstDraw = true, api = { groups: [] };
    host.classList.add("donut-host");

    function draw() {
      var USE = o.data, w = Math.max(240, Math.round(host.clientWidth || 520)), h = o.height || 340, narrow = w < 520, ky = 0.58, dep = Math.round(10 + h * 0.035);
      host.classList.toggle("narrow", narrow);
      host.textContent = "";
      var svg = el("svg", { class: "chart donut", viewBox: "0 0 " + w + " " + h, width: "100%", height: h, role: "group", "aria-label": o.aria });
      host.appendChild(svg);
      var R = Math.max(60, narrow ? Math.min(w / 2 - 18, (h - dep - 30) / (2 * ky)) : Math.min((w - 310) / 2, (h - dep - 34) / (2 * ky))), r = R * 0.56, cx = w / 2, cy = (h - dep - 14) / 2;
      var P = function (rad, t) { return [cx + rad * Math.sin(t), cy - rad * ky * Math.cos(t)]; }, TAU = Math.PI * 2, f = function (n) { return n.toFixed(1); };
      var defs = el("defs", {}, svg);
      defs.innerHTML = '<filter id="' + uid + '-g1" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency=".75 .22" numOctaves="3" seed="7"/><feColorMatrix type="matrix" values="0 0 0 0 .22  0 0 0 0 .08  0 0 0 0 .01  1.7 0 0 0 -.62"/><feComposite in2="SourceAlpha" operator="in"/></filter>' +
        '<filter id="' + uid + '-g2" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="1.1 .5" numOctaves="2" seed="21"/><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 .86  0 0 0 0 .7  1.6 0 0 0 -.78"/><feComposite in2="SourceAlpha" operator="in"/></filter>' +
        '<filter id="' + uid + '-bl" x="-20%" y="-40%" width="140%" height="180%"><feGaussianBlur stdDeviation="' + f(R * 0.05) + '"/></filter>';
      USE.forEach(function (u, k) {
        var T = TONES[Math.min(k, TONES.length - 1)];
        defs.insertAdjacentHTML("beforeend",
          '<linearGradient id="' + uid + '-t' + k + '" gradientUnits="userSpaceOnUse" x1="' + f(cx - R) + '" y1="' + f(cy - R * ky) + '" x2="' + f(cx + R * 0.9) + '" y2="' + f(cy + R * ky) + '"><stop offset="0" stop-color="' + T[0] + '"/><stop offset=".4" stop-color="' + T[1] + '"/><stop offset=".72" stop-color="' + T[1] + '"/><stop offset="1" stop-color="' + T[2] + '"/></linearGradient>' +
          '<linearGradient id="' + uid + '-w' + k + '" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="' + T[1] + '"/><stop offset="1" stop-color="' + T[2] + '"/></linearGradient>' +
          '<linearGradient id="' + uid + '-s' + k + '" x1="0" y1="0" x2=".45" y2=".18" gradientTransform="translate(-.7 0)"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#FFF3E4" stop-opacity=".95"/><stop offset="1" stop-color="#fff" stop-opacity="0"/><animateTransform attributeName="gradientTransform" type="translate" from="-.7 0" to="1.2 0" dur=".9s" begin="indefinite" fill="freeze"/></linearGradient>');
      });
      // the contact shadow: a ring, so it never fills the hole
      var ell = function (rx, ry, oy) { var yy = cy + oy; return "M" + f(cx - rx) + " " + f(yy) + "A" + f(rx) + " " + f(ry) + " 0 1 0 " + f(cx + rx) + " " + f(yy) + "A" + f(rx) + " " + f(ry) + " 0 1 0 " + f(cx - rx) + " " + f(yy) + "Z"; };
      el("path", { d: ell(R * 1.02, R * ky * 1.02, dep + 6) + ell(r * 0.9, r * ky * 0.9, dep + 6), "fill-rule": "evenodd", fill: "rgba(27,20,16,.30)", filter: "url(#" + uid + "-bl)" }, svg);
      var arcPts = function (rad, t0, t1, n) { var out = []; for (var i = 0; i <= n; i++) { out.push(P(rad, t0 + (t1 - t0) * i / n)); } return out; };
      var total = USE.reduce(function (s, u) { return s + u.pct; }, 0), a = 0;
      var seg = USE.map(function (u) { var t0 = a / total * TAU, t1 = (a + u.pct) / total * TAU; a += u.pct; return [t0, t1, (t0 + t1) / 2]; });
      var order = USE.map(function (u, k) { return k; }).sort(function (i, j) { return Math.cos(seg[j][2]) - Math.cos(seg[i][2]); });
      var poly = function (pts) { return pts.map(function (q, i) { return (i ? "L" : "M") + f(q[0]) + " " + f(q[1]); }).join("") + "Z"; };
      var groups = [];
      order.forEach(function (k) {
        var u = USE[k], t0 = seg[k][0], t1 = seg[k][1], m = seg[k][2], T = TONES[Math.min(k, TONES.length - 1)];
        var g = el("g", { class: "slice", tabindex: 0, role: "img", "aria-label": u.name + ": " + u.pct + "%", "data-i": k }, svg);
        var clipA = function (lo, hi) { var A = Math.max(t0, lo), B = Math.min(t1, hi); return B > A ? [A, B] : null; };
        // the far inner wall (the back half, seen through the hole)
        [[0, Math.PI / 2], [3 * Math.PI / 2, TAU]].forEach(function (rg) {
          var c = clipA(rg[0], rg[1]); if (!c) { return; }
          var pts = arcPts(r, c[0], c[1], 8);
          el("path", { d: poly(pts.concat(pts.slice().reverse().map(function (q) { return [q[0], q[1] + dep]; }))), fill: T[2], "fill-opacity": 0.9 }, g);
        });
        // the radial cut faces
        [t0, t1].forEach(function (t) { var A = P(r, t), B = P(R, t); el("path", { d: poly([A, B, [B[0], B[1] + dep], [A[0], A[1] + dep]]), fill: T[2] }, g); });
        // the outer front wall
        var c = clipA(Math.PI / 2, 3 * Math.PI / 2);
        if (c) { var pts = arcPts(R, c[0], c[1], 14); el("path", { d: poly(pts.concat(pts.slice().reverse().map(function (q) { return [q[0], q[1] + dep]; }))), fill: "url(#" + uid + "-w" + k + ")" }, g); }
        // the top face
        var p0 = P(R, t0), p1 = P(R, t1), p2 = P(r, t1), p3 = P(r, t0), big = t1 - t0 > Math.PI ? 1 : 0;
        var d = "M" + f(p0[0]) + " " + f(p0[1]) + "A" + f(R) + " " + f(R * ky) + " 0 " + big + " 1 " + f(p1[0]) + " " + f(p1[1]) + "L" + f(p2[0]) + " " + f(p2[1]) + "A" + f(r) + " " + f(r * ky) + " 0 " + big + " 0 " + f(p3[0]) + " " + f(p3[1]) + "Z";
        el("path", { d: d, fill: "url(#" + uid + "-t" + k + ")", stroke: "rgba(50,20,6,.55)", "stroke-width": 1, "stroke-linejoin": "round" }, g);
        el("path", { d: d, fill: "#000", filter: "url(#" + uid + "-g1)", opacity: 0.32, "pointer-events": "none" }, g);
        el("path", { d: d, fill: "#000", filter: "url(#" + uid + "-g2)", opacity: 0.22, "pointer-events": "none" }, g);
        var rim = arcPts(R, t0, t1, 16);
        el("path", { d: rim.map(function (q, i) { return (i ? "L" : "M") + f(q[0]) + " " + f(q[1]); }).join(""), fill: "none", stroke: "rgba(255,236,214,.55)", "stroke-width": 1.2, "pointer-events": "none" }, g);
        el("path", { d: d, fill: "url(#" + uid + "-s" + k + ")", "pointer-events": "none" }, g);
        var mx = P((R + r) / 2, m), ox = Math.sin(m) * 9, oy = -Math.cos(m) * ky * 9 - 5;
        g._o = [ox, oy, mx[0], mx[1]]; groups[k] = g;
        g.setAttribute("data-hx", f(mx[0])); g.setAttribute("data-hy", f(mx[1]));
        el("title", {}, g).textContent = u.name + ": " + u.pct + "%";
      });
      // labels outside the ring: name and percent, in ink
      USE.forEach(function (u, k) {
        var m = seg[k][2]; if (narrow) { return; }
        var l = P(R + 14 + (Math.cos(m) < 0 ? 10 : 0), m), lx = l[0], ly = l[1], right = Math.sin(m) >= 0, lines = u.name.length > 22 && u.name.indexOf(", ") > 0 ? [u.name.slice(0, u.name.indexOf(", ") + 1), u.name.slice(u.name.indexOf(", ") + 2)] : [u.name];
        var y = ly + (Math.cos(m) < 0 ? dep : 0) - lines.length * 7 + 4;
        if (Math.cos(m) > 0.4) { y = ly - 8 - lines.length * 14; }          // a label above the ring sits wholly above it, so no text lies on the slice
        var tx = el("text", { x: lx, y: y, "text-anchor": right ? "start" : "end", class: "lbl", "pointer-events": "none" }, svg);
        lines.forEach(function (ln, i) { el("tspan", { x: lx, dy: i ? 13 : 0 }, tx).textContent = ln; });
        el("text", { x: lx, y: y + lines.length * 13, "text-anchor": right ? "start" : "end", "pointer-events": "none", style: "fill:var(--ink);font-weight:500" }, svg).textContent = u.pct + "%";
      });
      // the centre read-out: the share, then the name on two lines; at rest the year
      var cc = el("text", { x: cx, y: cy + 2, "text-anchor": "middle", "pointer-events": "none", class: "dn-c-big", style: "font:400 " + Math.round(R * 0.2) + "px var(--display);fill:var(--ink)" }, svg),
        c2 = el("text", { x: cx, y: cy + 2 + Math.round(R * 0.1) + 6, "text-anchor": "middle", "pointer-events": "none", class: "dn-c-name" }, svg),
        c3 = el("text", { x: cx, y: cy + 2 + Math.round(R * 0.1) + 19, "text-anchor": "middle", "pointer-events": "none", class: "dn-c-name" }, svg);
      var centre = function (k) {
        if (k == null) { cc.textContent = o.idle[0]; c2.textContent = o.idle[1]; c3.textContent = ""; }
        else { var ln = wrapName(USE[k].name); cc.textContent = USE[k].pct + "%"; c2.textContent = ln[0]; c3.textContent = ln[1]; }
      };
      centre(null);
      var hot = function (k) {
        groups.forEach(function (g, i) {
          var q = g._o; g.style.transformOrigin = f(q[2]) + "px " + f(q[3]) + "px";
          g.style.transform = i === k && !reduce ? "translate(" + f(q[0]) + "px," + f(q[1]) + "px) scale(1.07)" : i === k ? "translate(" + f(q[0]) + "px," + f(q[1]) + "px)" : "none";
          g.style.opacity = k == null || i === k ? 1 : 0.6;
        });
        centre(k);
        if (k != null && !reduce) { try { groups[k].querySelector("animateTransform").beginElement(); } catch (e) { /* the sweep is decoration */ } }
        if (o.onActive) { o.onActive(k); }
      };
      groups.forEach(function (g, k) {
        g.addEventListener("pointerenter", function () { hot(k); });
        g.addEventListener("pointerleave", function () { hot(null); });
        g.addEventListener("focus", function () { hot(k); });
        g.addEventListener("blur", function () { hot(null); });
      });
      // one sweep per slice when the chart first appears, 140 ms apart; none with reduced motion
      if (!reduce && firstDraw) {
        groups.forEach(function (g, k) { timers.push(setTimeout(function () { try { g.querySelector("animateTransform").beginElement(); } catch (e) { /* decoration */ } }, 500 + k * 140)); });
      }
      firstDraw = false;
      // narrow screens: no outside labels, a text list under the chart
      if (o.legend) {
        o.legend.textContent = "";
        if (narrow) { USE.forEach(function (u, k) { var li = document.createElement("li"), sw = document.createElement("i"); sw.className = "sw"; sw.style.background = TONES[Math.min(k, TONES.length - 1)][1]; li.appendChild(sw); li.appendChild(document.createTextNode(u.name + ", " + u.pct + "%")); o.legend.appendChild(li); }); }
        o.legend.style.display = narrow ? "grid" : "none";
      }
      api.groups = groups; api.svg = svg;
      return hot;
    }

    var hotFn = draw();
    if ("ResizeObserver" in window) {
      var rt = 0, lastW = host.clientWidth;
      ro = new ResizeObserver(function () { if (Math.abs(host.clientWidth - lastW) < 2) { return; } lastW = host.clientWidth; cancelAnimationFrame(rt); rt = requestAnimationFrame(function () { hotFn = draw(); }); });
      ro.observe(host);
    }
    api.activate = function (i) { hotFn(i); };
    api.clear = function () { hotFn(null); };
    api.destroy = function () { timers.forEach(clearTimeout); if (ro) { ro.disconnect(); } };
    return api;
  };
})();
