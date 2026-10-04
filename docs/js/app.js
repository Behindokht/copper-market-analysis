/* App shell: navigation, footer and the views: the dashboard (the landing page), the story (one long page with chapter anchors), the data-quality appendix and
   the method page. The top bar switches views; a second bar with the chapter links shows only inside the story. */
(function () {
  var CMA = window.CMA, t = CMA.t, h = CMA.h;
  var TOP = [["dashboard", "dashboard"], ["story", "story"], ["quality", "quality"]];
  var NAV = [["uses", "uses"], ["record", "record"], ["just-copper", "just"], ["dollar", "dollar"], ["supply", "supply"], ["demand", "demand"], ["aluminium", "aluminium"], ["summary", "summary"]];
  var LEGACY = { ratio: "aluminium" };      // old page links still land in the right place
  var built = {}, spy = null, current = null, curView = "dashboard";

  function buildHeader() {
    var brand = document.getElementById("brand");
    brand.appendChild(document.createTextNode(t("site.brand")));
    brand.appendChild(h("small", { text: t("site.brand_sub") }));
    var nav = document.getElementById("nav");
    nav.setAttribute("aria-label", t("nav.main_aria"));
    TOP.forEach(function (n) { nav.appendChild(h("a", { href: "#" + n[0], "data-target": n[0], text: t("nav." + n[1]) })); });
    var sub = document.getElementById("subnav");
    sub.setAttribute("aria-label", t("nav.chapters_aria"));
    NAV.forEach(function (n, k) { sub.appendChild(h("a", { href: "#" + n[0], "data-target": n[0], text: (k + 1) + " " + t("nav." + n[1]) })); });
    // the status line (dashboard only): the month of the data and the counts from the checks the appendix lists
    var st = document.getElementById("status"), checks = CMA.rows(window.CMA_DATA.quality.checks), K = {};
    CMA.rows(window.CMA_DATA.dash.kpis).forEach(function (r) { K[r.fact_id] = r.value; });
    var count = function (x) { return checks.filter(function (r) { return r.status === x; }).length; };
    var vals = { month: CMA.monthShort(K.latest_month + "-01"), passed: count("PASS"), fail: count("FAIL"), warn: count("WARN") };
    st.setAttribute("aria-label", t("dashboard.status_aria"));
    st.appendChild(h("span", { class: "dot", "aria-hidden": "true" }));
    var stText = h("span", {});
    st.appendChild(stText);
    t("dashboard.status").split(/(\{\w+\})/).forEach(function (part) {
      var m = /^\{(\w+)\}$/.exec(part);
      if (!m) { stText.appendChild(document.createTextNode(part)); } else if (m[1] === "warn") { stText.appendChild(document.createTextNode(String(vals.warn))); } else { stText.appendChild(h("b", { text: String(vals[m[1]]) })); }
    });
  }

  // the slim smoked footer: one line, the credits behind a fold
  function buildFooter() {
    var f = window.CMA_STRINGS.footer, el = document.getElementById("footer");
    var addr = f.email_user + "@" + f.email_domain;      // assembled here, so the address is not written out in the page source
    el.appendChild(h("div", { class: "foot-row" },
      h("span", { text: f.slim_left }),
      h("span", { class: "foot-right" },
        h("span", { class: "foot-slot", id: "foot-slot" }),
        h("a", { href: "#method", text: f.method_label }),
        h("a", { href: f.repo_url, text: f.repo_label_short, rel: "noopener" }),
        h("a", { href: f.portfolio_url, text: f.portfolio_label_short, rel: "noopener" }),
        h("a", { href: "mailto:" + addr, text: f.email_link_short }),
        h("span", { class: "muted", text: f.slim_right }))),
      h("details", { class: "foot-credits" }, h("summary", { text: f.credits_summary }), f.credits.map(function (c) { return h("p", { class: "small", text: c }); }), h("p", { class: "small", text: f.disclaimer })));
  }

  function mark(target) {
    Array.prototype.forEach.call(document.querySelectorAll("#nav a"), function (a) {
      if (a.getAttribute("data-target") === curView) { a.setAttribute("aria-current", "page"); } else { a.removeAttribute("aria-current"); }
    });
    Array.prototype.forEach.call(document.querySelectorAll("#subnav a"), function (a) {
      if (curView === "story" && a.getAttribute("data-target") === target) { a.setAttribute("aria-current", "location"); } else { a.removeAttribute("aria-current"); }
    });
    current = target;
    var active = document.querySelector("#subnav a[aria-current]"), sub = document.getElementById("subnav");
    if (active && sub.scrollWidth > sub.clientWidth) { sub.scrollLeft = active.offsetLeft - sub.clientWidth / 2 + active.clientWidth / 2; }
  }

  // which chapter is the reader in: the last one whose top has passed a line a little below the nav bar
  function watch() {
    if (spy) { return; }
    var update = function () {
      if (document.getElementById("story").hidden) { return; }
      var line = 140, id = CMA.CHAPTER_IDS[0], any = false;
      CMA.CHAPTER_IDS.forEach(function (cid) {
        var el = document.getElementById(cid);
        if (el && el.getBoundingClientRect().top <= line) { id = cid; any = true; }
      });
      mark(any ? id : null);
    };
    var tick = 0;
    spy = function () { cancelAnimationFrame(tick); tick = requestAnimationFrame(update); };
    window.addEventListener("scroll", spy, { passive: true });
    window.addEventListener("resize", spy);
    update();
  }

  function view(name) {
    curView = name === "method" ? "method" : name;
    ["dashboard", "story", "quality", "method"].forEach(function (v) { document.getElementById(v).hidden = name !== v; });
    var photo = name === "dashboard" || name === "story";
    document.body.classList.toggle("has-bg", photo);             // the photo background and the light glass plates: dashboard and story
    var bar = document.getElementById("topbar");
    bar.setAttribute("data-view", name);
    document.getElementById("subnav").hidden = name !== "story";
    document.getElementById("status").hidden = name !== "dashboard";
    document.documentElement.style.setProperty("--hmax", name === "dashboard" ? "1400px" : "1180px");
    if (!built[name]) { built[name] = true; CMA.pages[name](document.getElementById(name)); if (CMA.glass) { CMA.glass.init(document.getElementById(name)); } }
    var slot = document.getElementById("foot-slot"); if (slot) { slot.hidden = name !== "dashboard"; }
    navOffset();
    if (CMA.glass && CMA.glass.refresh) { CMA.glass.refresh(); }
  }

  // the hash is a view, a chapter anchor of the story, or an older page name; the dashboard keeps its filters after a "?"
  function show(hash, moveFocus) {
    var q = hash.indexOf("?"), base = q < 0 ? hash : hash.slice(0, q), qs = q < 0 ? "" : hash.slice(q + 1);
    if (base === "") { base = "dashboard"; }
    var id = LEGACY[base] || base;
    if (id === "dashboard") {
      if (!built.dashboard) { CMA.dash.initialState(qs); } else { CMA.dash.apply(qs); }
      view("dashboard");
      mark(null);
      document.title = t("nav.dashboard") + " | " + t("site.title");
      window.scrollTo(0, 0);
      if (moveFocus) { var hd0 = document.getElementById("dashboard-title"); if (hd0) { hd0.focus({ preventScroll: true }); } }
      return;
    }
    if (id === "method") {
      view("method");
      mark(null);
      document.title = t("method.title") + " | " + t("site.title");
      window.scrollTo(0, 0);
      if (moveFocus) { var hm = document.getElementById("method-title"); if (hm) { hm.focus({ preventScroll: true }); } }
      return;
    }
    if (id === "quality") {
      view("quality");
      mark("quality");
      document.title = t("nav.quality") + " | " + t("site.title");
      window.scrollTo(0, 0);
      if (moveFocus) { var hq = document.getElementById("quality-title"); if (hq) { hq.focus({ preventScroll: true }); } }
      return;
    }
    view("story");
    document.title = t("site.title");
    watch();
    var el = CMA.CHAPTER_IDS.indexOf(id) >= 0 ? document.getElementById(id) : null;
    if (el) {
      el.scrollIntoView({ behavior: CMA.reduce || !moveFocus ? "auto" : "smooth", block: "start" });
      mark(id);
      if (moveFocus) { var hd = document.getElementById(id + "-title"); if (hd) { hd.focus({ preventScroll: true }); } }
    } else {
      window.scrollTo(0, 0);
      mark(null);
      if (spy) { spy(); }
    }
  }

  // anchors land below the sticky header: its height plus 16 px, measured, not guessed
  function navOffset() {
    var bar = document.getElementById("topbar");
    if (bar) { document.documentElement.style.setProperty("--navh", Math.ceil(bar.getBoundingClientRect().bottom + 16) + "px"); }
  }

  // without the photo file the smoked plates would sit on plain paper: they get a denser tint (the photo is local only, known issue K08)
  (function () {
    var m = /url\(["']?([^"')]+)["']?\)/.exec(getComputedStyle(document.documentElement).getPropertyValue("--bg-photo") || "");
    if (!m) { document.body.classList.add("no-photo"); return; }
    var probe = new Image();
    probe.onerror = function () { document.body.classList.add("no-photo"); };
    probe.src = m[1];
  })();
  buildHeader();
  buildFooter();
  if (CMA.glass) { CMA.glass.init(document); }
  navOffset();
  window.addEventListener("resize", navOffset);
  window.addEventListener("hashchange", function () { show(location.hash.slice(1), true); });
  show(location.hash.slice(1), false);
  // fonts change text heights after the first layout: land on the chapter again once they are in
  if (document.fonts && document.fonts.ready && location.hash.length > 1) {
    document.fonts.ready.then(function () { navOffset(); var el = document.getElementById(location.hash.slice(1)); if (el && !document.getElementById("story").hidden) { el.scrollIntoView({ block: "start" }); } });
  }
})();
