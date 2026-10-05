/* Liquid glass, in plain JavaScript and SVG (no library at run time). The effect follows the idea of rdev/liquid-glass-react (MIT, see CREDITS.md):
   a rim lens that bends the backdrop strongly at the edge and not at all in the centre, a small colour split at the rim, light frost, a soft highlight that
   follows the pointer, and on the opener plaque a small tilt that settles like a spring.
   Where: the header bar only (the element with class "lens"). Round 4 took it off every large plate (it left a white smudge in the headline plate) and the small clear-glass controls sit inside reading glass, which is a backdrop root, so there is nothing behind them to bend.
   Bending uses an SVG filter inside backdrop-filter, which only Chromium supports. Safari and Firefox keep plain frosted glass (set in the CSS).
   prefers-reduced-transparency and browsers without backdrop-filter get the solid colour (CSS). Touch screens and reduced motion get no pointer effects.
   Nothing here runs by itself: no idle animation. Contrast is checked by tools/glass_contrast.py. */
(function () {
  var CMA = window.CMA, NS = "http://www.w3.org/2000/svg";
  var SCALE = 66, SPLIT = 2, TILT = 2, SPRING = 0.15;
  var host = null, items = [], counter = 0, started = false;
  var mq = function (q) { return !!(window.matchMedia && window.matchMedia(q).matches); };
  var plain = function () { return mq("(prefers-reduced-transparency: reduce)") || !(window.CSS && CSS.supports && (CSS.supports("backdrop-filter", "blur(1px)") || CSS.supports("-webkit-backdrop-filter", "blur(1px)"))); };
  var chromium = !!(window.chrome || (navigator.userAgentData && navigator.userAgentData.brands && navigator.userAgentData.brands.some(function (b) { return /Chromium/.test(b.brand); })));
  var pointerFx = function () { return !CMA.reduce && !mq("(pointer: coarse)") && !mq("(hover: none)"); };

  // a PNG written by hand (stored deflate blocks): a canvas costs more than a second to read back the first time in a browser without a graphics card, and the map is tiny
  var CRC = null;
  function crc32(bytes) {
    if (!CRC) { CRC = []; for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) { c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; } CRC[n] = c >>> 0; } }
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) { crc = CRC[(crc ^ bytes[i]) & 255] ^ (crc >>> 8); }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  function pngDataURL(W, H, rgba) {
    var raw = new Uint8Array((W * 4 + 1) * H);
    for (var y = 0; y < H; y++) { raw.set(rgba.subarray(y * W * 4, (y + 1) * W * 4), y * (W * 4 + 1) + 1); }
    var z = [0x78, 0x01], pos = 0;
    while (pos < raw.length) {
      var len = Math.min(65535, raw.length - pos), last = pos + len >= raw.length ? 1 : 0;
      z.push(last, len & 255, len >> 8, (~len) & 255, ((~len) >> 8) & 255);
      for (var i = 0; i < len; i++) { z.push(raw[pos + i]); }
      pos += len;
    }
    var a1 = 1, a2 = 0;
    for (var j = 0; j < raw.length; j++) { a1 = (a1 + raw[j]) % 65521; a2 = (a2 + a1) % 65521; }
    z.push(a2 >> 8, a2 & 255, a1 >> 8, a1 & 255);
    function chunk(type, data) {
      var out = new Uint8Array(12 + data.length), dv = new DataView(out.buffer);
      dv.setUint32(0, data.length);
      for (var q = 0; q < 4; q++) { out[4 + q] = type.charCodeAt(q); }
      out.set(data, 8);
      dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
      return out;
    }
    var ihdr = new Uint8Array(13), dh = new DataView(ihdr.buffer);
    dh.setUint32(0, W); dh.setUint32(4, H); ihdr[8] = 8; ihdr[9] = 6;
    var parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", new Uint8Array(z)), chunk("IEND", new Uint8Array(0))], total = 0;
    parts.forEach(function (q) { total += q.length; });
    var all = new Uint8Array(total), off = 0, str = "";
    parts.forEach(function (q) { all.set(q, off); off += q.length; });
    for (var m = 0; m < all.length; m += 8192) { str += String.fromCharCode.apply(null, all.subarray(m, m + 8192)); }
    return "data:image/png;base64," + btoa(str);
  }

  // the displacement map: neutral grey in the centre, a push towards the middle at the rim (red = x, green = y)
  function makeMap(W, H, r, e) {
    var d = new Uint8Array(W * H * 4), hx = W / 2, hy = H / 2, rr = Math.min(r, hx, hy);
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        var px = x + 0.5 - hx, py = y + 0.5 - hy, ax = Math.abs(px), ay = Math.abs(py);
        var ox = Math.max(ax - (hx - rr), 0), oy = Math.max(ay - (hy - rr), 0), dist, nx, ny;
        if (ox > 0 || oy > 0) {
          var len = Math.hypot(ox, oy); dist = rr - len; nx = -(ox / len) * Math.sign(px || 1); ny = -(oy / len) * Math.sign(py || 1);
        } else if (hx - ax < hy - ay) { dist = hx - ax; nx = -Math.sign(px || 1); ny = 0; }
        else { dist = hy - ay; nx = 0; ny = -Math.sign(py || 1); }
        var t = Math.min(1, Math.max(0, dist / e)), m = 1 - t * t * (3 - 2 * t); m = m * m;
        var i = (y * W + x) * 4;
        d[i] = Math.round(128 + 127 * m * nx); d[i + 1] = Math.round(128 + 127 * m * ny); d[i + 2] = 128; d[i + 3] = 255;
      }
    }
    return pngDataURL(W, H, d);
  }
  function attr(el, o) { Object.keys(o).forEach(function (k) { el.setAttribute(k, o[k]); }); return el; }
  function mk(tag, o) { return attr(document.createElementNS(NS, tag), o || {}); }

  function lens(it) {
    var el = it.el, r = el.getBoundingClientRect(), W = Math.round(r.width), H = Math.round(r.height);
    if (W < 24 || H < 24 || W * H > 700000) { return; }
    var radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 10, e = Math.min(26, H / 2.2, W / 5);
    var id = it.id, old = host.querySelector("#" + id);
    if (old) { host.removeChild(old); }
    var f = mk("filter", { id: id, filterUnits: "userSpaceOnUse", primitiveUnits: "userSpaceOnUse", x: 0, y: 0, width: W, height: H, "color-interpolation-filters": "sRGB" });
    // the map is drawn at a quarter of the size or less (a smooth ramp needs no more) and stretched by feImage: the pixel loop is 16 times shorter, and the same size is drawn once
    var k = Math.max(1, Math.round(Math.max(W, H) / 240)), key = [Math.ceil(W / k), Math.ceil(H / k), radius, e].join("|");
    if (!lens.cache[key]) { lens.cache[key] = makeMap(Math.ceil(W / k), Math.ceil(H / k), radius / k, e / k); }
    f.appendChild(mk("feImage", { href: lens.cache[key], x: 0, y: 0, width: W, height: H, preserveAspectRatio: "none", result: "map" }));
    // one displacement per colour channel, a little apart: the split at the rim
    [["R", SCALE + SPLIT, "1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0"], ["G", SCALE, "0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0"], ["B", SCALE - SPLIT, "0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0"]].forEach(function (c) {
      f.appendChild(mk("feDisplacementMap", { "in": "SourceGraphic", in2: "map", scale: c[1], xChannelSelector: "R", yChannelSelector: "G", result: "d" + c[0] }));
      f.appendChild(mk("feColorMatrix", { "in": "d" + c[0], type: "matrix", values: c[2], result: "c" + c[0] }));
    });
    f.appendChild(mk("feBlend", { "in": "cR", in2: "cG", mode: "screen", result: "rg" }));
    f.appendChild(mk("feBlend", { "in": "rg", in2: "cB", mode: "screen" }));
    host.appendChild(f);
    var base = getComputedStyle(el).getPropertyValue("--bf").trim() || "blur(14px) saturate(190%)";
    el.style.backdropFilter = base + " url(#" + id + ")";      // the plate's own blur and saturation first, then the bend: text scrolling under the header stays unreadable
    el.style.webkitBackdropFilter = el.style.backdropFilter;
  }

  lens.cache = {};
  function alive() { items = items.filter(function (it) { return it.el.isConnected; }); }
  // the refraction is the most expensive thing on the page to draw without a graphics card (it makes every frame of the header a software filter), so it waits until the page has loaded and has painted
  // once, and only runs for a visitor with a mouse
  var ready = false, loadHooked = false;
  function lensOK() { return chromium && !plain() && ready && mq("(hover: hover) and (pointer: fine)"); }
  function refreshAll() { alive(); if (!lensOK()) { return; } items.forEach(lens); }

  // pointer effects: a soft highlight under the pointer, and the plaque tilts a little and settles like a spring
  var px = -1, py = -1, raf = 0, tilt = null;
  function frame() {
    raf = 0;
    items.forEach(function (it) {
      var r = it.el.getBoundingClientRect(), inside = px >= r.left && px <= r.right && py >= r.top && py <= r.bottom;
      if (inside) { it.el.style.setProperty("--mx", (px - r.left).toFixed(0) + "px"); it.el.style.setProperty("--my", (py - r.top).toFixed(0) + "px"); }
      it.el.classList.toggle("hot", inside);
      if (it.tilt) { it.tx = inside ? ((py - (r.top + r.height / 2)) / (r.height / 2)) * -TILT : 0; it.ty = inside ? ((px - (r.left + r.width / 2)) / (r.width / 2)) * TILT : 0; springStart(it); }
    });
  }
  function springStart(it) {
    if (it.run) { return; }
    it.run = true;
    (function step() {
      it.vx = (it.vx || 0) * 0.8 + (it.tx - (it.cx || 0)) * SPRING; it.vy = (it.vy || 0) * 0.8 + (it.ty - (it.cy || 0)) * SPRING;
      it.cx = (it.cx || 0) + it.vx; it.cy = (it.cy || 0) + it.vy;
      it.el.style.transform = "perspective(900px) rotateX(" + it.cx.toFixed(3) + "deg) rotateY(" + it.cy.toFixed(3) + "deg)";
      var settled = Math.abs(it.vx) < 0.002 && Math.abs(it.vy) < 0.002 && Math.abs(it.tx - it.cx) < 0.01 && Math.abs(it.ty - it.cy) < 0.01;
      if (settled) { it.run = false; if (!it.tx && !it.ty) { it.el.style.transform = ""; } return; }
      requestAnimationFrame(step);
    })();
  }
  function onMove(e) {
    if (e.pointerType === "touch") { return; }
    px = e.clientX; py = e.clientY;
    if (!raf) { raf = requestAnimationFrame(frame); }
  }
  function onLeave() { px = -1; py = -1; if (!raf) { raf = requestAnimationFrame(frame); } }

  CMA.glass = {
    // register every .lens element inside scope (the whole page at start, a view when it is built)
    refresh: function () { setTimeout(refreshAll, 60); },
    init: function (scope) {
      scope = scope || document;
      Array.prototype.forEach.call(scope.querySelectorAll(".lens"), function (el) {
        if (items.some(function (it) { return it.el === el; })) { return; }
        var it = { el: el, id: "lg-" + (++counter), tilt: el.classList.contains("tilt") };
        items.push(it);
        if (it.tilt) { el.addEventListener("animationend", function () { el.classList.remove("rise"); }); }
        if ("ResizeObserver" in window) {
          var t; new ResizeObserver(function () { clearTimeout(t); t = setTimeout(function () { if (lensOK() && el.isConnected) { lens(it); } }, 120); }).observe(el);
        }
      });
      if (!host && chromium && !plain()) {
        host = mk("svg", { width: 0, height: 0, "aria-hidden": "true" });
        host.style.cssText = "position:absolute;left:0;top:0;pointer-events:none";
        document.body.appendChild(host);
      }
      if (!started && pointerFx()) {
        started = true;
        document.addEventListener("pointermove", onMove, { passive: true });
        document.addEventListener("pointerleave", onLeave);
        window.addEventListener("blur", onLeave);
      }
      if (!loadHooked) {
        loadHooked = true;
        var go = function () { setTimeout(function () { ready = true; refreshAll(); }, 1500); };
        if (document.readyState === "complete") { go(); } else { window.addEventListener("load", go); }
      }
    }
  };
})();
