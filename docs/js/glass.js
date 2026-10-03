/* Liquid-glass rim for the opener plaque: bends the backdrop near the panel's edge (Chromium only). Other browsers keep plain frosted glass.
   Glass is used on the nav bar and the plaque only; this file touches the plaque (.lens) and nothing else. */
(function () {
  var CMA = window.CMA, NS = "http://www.w3.org/2000/svg";
  var host = null, counter = 0;

  function grad(id, o, a, mid, b, vertical) {
    return '<linearGradient id="' + id + '" x1="0" y1="0" x2="' + (vertical ? 0 : 1) + '" y2="' + (vertical ? 1 : 0) + '">' +
      '<stop offset="0" stop-color="' + a + '"/><stop offset="' + o + '" stop-color="' + mid + '"/>' +
      '<stop offset="' + (1 - o) + '" stop-color="' + mid + '"/><stop offset="1" stop-color="' + b + '"/></linearGradient>';
  }
  function lens(el, i) {
    var r = el.getBoundingClientRect(), W = Math.round(r.width), H = Math.round(r.height);
    if (W < 20 || H < 20) { return; }
    var e = Math.min(40, W / 5, H / 3);
    var map = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '"><defs>' +
      grad("x", (e / W).toFixed(4), "rgb(20,255,255)", "rgb(128,255,255)", "rgb(236,255,255)", false) +
      grad("y", (e / H).toFixed(4), "rgb(255,20,255)", "rgb(255,128,255)", "rgb(255,236,255)", true) +
      '</defs><rect width="' + W + '" height="' + H + '" fill="url(#x)"/>' +
      '<rect width="' + W + '" height="' + H + '" fill="url(#y)" style="mix-blend-mode:multiply"/></svg>';
    var id = "lg-" + i, old = host.querySelector("#" + id);
    if (old) { host.removeChild(old); }
    var f = document.createElementNS(NS, "filter");
    [["id", id], ["filterUnits", "userSpaceOnUse"], ["primitiveUnits", "userSpaceOnUse"], ["x", 0], ["y", 0], ["width", W], ["height", H], ["color-interpolation-filters", "sRGB"]]
      .forEach(function (p) { f.setAttribute(p[0], p[1]); });
    var img = document.createElementNS(NS, "feImage");
    [["href", "data:image/svg+xml;charset=utf-8," + encodeURIComponent(map)], ["x", 0], ["y", 0], ["width", W], ["height", H], ["preserveAspectRatio", "none"], ["result", "map"]]
      .forEach(function (p) { img.setAttribute(p[0], p[1]); });
    var d = document.createElementNS(NS, "feDisplacementMap");
    [["in", "SourceGraphic"], ["in2", "map"], ["scale", 36], ["xChannelSelector", "R"], ["yChannelSelector", "G"]].forEach(function (p) { d.setAttribute(p[0], p[1]); });
    f.appendChild(img); f.appendChild(d); host.appendChild(f);
    el.style.backdropFilter = "url(#" + id + ") blur(12px) saturate(1.3)";
  }

  CMA.glass = {
    init: function (scope) {
      var plain = CMA.reduce || (window.matchMedia && window.matchMedia("(prefers-reduced-transparency: reduce)").matches);
      var chromium = !!(window.chrome || (navigator.userAgentData && navigator.userAgentData.brands && navigator.userAgentData.brands.some(function (b) { return /Chromium/.test(b.brand); })));
      if (plain || !chromium) { return; }
      if (!host) {
        host = document.createElementNS(NS, "svg");
        host.setAttribute("width", 0); host.setAttribute("height", 0); host.setAttribute("aria-hidden", "true");
        host.style.cssText = "position:absolute;left:0;top:0;pointer-events:none";
        document.body.appendChild(host);
      }
      var els = Array.prototype.slice.call(scope.querySelectorAll(".lens"));
      var run = function () { els.forEach(function (el, k) { lens(el, ++counter + "-" + k); }); };
      setTimeout(run, 900);
      if ("ResizeObserver" in window) {
        var rt; new ResizeObserver(function () { clearTimeout(rt); rt = setTimeout(run, 150); }).observe(document.body);
      }
    }
  };
})();
