/* Small helpers: text lookup, DOM building, number and date formatting, data decoding, local storage. No dependencies. */
(function () {
  var CMA = (window.CMA = window.CMA || {});
  var S = window.CMA_STRINGS;

  // text lookup with {placeholders}; a missing key throws, so a typo cannot reach a visitor silently
  CMA.t = function (path, vars) {
    var v = path.split(".").reduce(function (o, k) { return o == null ? o : o[k]; }, S);
    if (v == null) { throw new Error("missing text: " + path); }
    return CMA.fill(v, vars);
  };
  CMA.fill = function (v, vars) {
    if (typeof v !== "string" || !vars) { return v; }
    return v.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? vars[k] : m; });
  };

  // DOM: h("div", {class: "card", text: "hi"}, child, "text", ...)
  CMA.h = function (tag, attrs) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) { return; }
      if (k === "text") { el.textContent = v; }
      else if (k === "class") { el.className = v; }
      else if (k.slice(0, 2) === "on") { el.addEventListener(k.slice(2), v); }
      else { el.setAttribute(k, v === true ? "" : v); }
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c == null || c === false) { continue; }
      if (Array.isArray(c)) { c.forEach(function (cc) { el.appendChild(typeof cc === "string" ? document.createTextNode(cc) : cc); }); }
      else { el.appendChild(typeof c === "string" ? document.createTextNode(c) : c); }
    }
    return el;
  };
  CMA.svg = function (tag, attrs) {
    var el = document.createElementNS("http://www.w3.org/2000/svg", tag);
    Object.keys(attrs || {}).forEach(function (k) { if (attrs[k] != null) { el.setAttribute(k, attrs[k]); } });
    return el;
  };

  // numbers (written by hand so the output never depends on the visitor's locale)
  CMA.n0 = function (x) { return String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ","); };
  CMA.n1 = function (x) { return (Math.round(x * 10) / 10).toFixed(1); };
  CMA.usd0 = function (x) { return "$" + CMA.n0(x); };
  // negative numbers use a real minus sign
  CMA.minus = function (s) { return String(s).replace("-", "\u2212"); };
  CMA.f1 = function (x) { return CMA.minus((Math.round(x * 10) / 10).toFixed(1)); };
  CMA.f2 = function (x) { return CMA.minus((Math.round(x * 100) / 100).toFixed(2)); };
  CMA.s1 = function (x) { return (x >= 0 ? "+" : "") + CMA.f1(x); };
  CMA.s2 = function (x) { return (x >= 0 ? "+" : "") + CMA.f2(x); };
  CMA.pctChange = function (x) { return (x >= 0 ? "+" : "") + CMA.minus(Math.abs(x) >= 100 ? CMA.n0(x) : (Math.round(x * 10) / 10).toFixed(1)) + "%"; };
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  CMA.monthLong = function (iso) { return MONTHS[parseInt(iso.slice(5, 7), 10) - 1] + " " + iso.slice(0, 4); };
  CMA.monthShort = function (iso) { return MONTHS[parseInt(iso.slice(5, 7), 10) - 1].slice(0, 3) + " " + iso.slice(0, 4); };

  // a dataset {columns, rows} as a list of objects
  CMA.rows = function (ds) {
    return ds.rows.map(function (r) { var o = {}; ds.columns.forEach(function (c, i) { o[c] = r[i]; }); return o; });
  };

  // local storage, wrapped: it can be blocked (private windows, previews), and the page works without it
  CMA.store = {
    get: function (k) { try { return window.localStorage.getItem("cma." + k); } catch (e) { return null; } },
    set: function (k, v) { try { window.localStorage.setItem("cma." + k, v); } catch (e) { /* ignore */ } },
    clear: function (keys) { try { keys.forEach(function (k) { window.localStorage.removeItem("cma." + k); }); } catch (e) { /* ignore */ } }
  };
  CMA.say = function (text) { var l = document.getElementById("live"); if (l) { l.textContent = text; } };
  CMA.pages = CMA.pages || {};
})();
