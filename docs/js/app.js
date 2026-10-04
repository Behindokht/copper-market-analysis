/* App shell: navigation, footer, and two views: the story (one long page with chapter anchors) and the data-quality appendix.
   The nav jumps to chapters and marks the one the reader is in. */
(function () {
  var CMA = window.CMA, t = CMA.t, h = CMA.h;
  var NAV = [["uses", "uses"], ["record", "record"], ["just-copper", "just"], ["dollar", "dollar"], ["supply", "supply"], ["demand", "demand"], ["aluminium", "aluminium"], ["summary", "summary"], ["quality", "quality"]];
  var LEGACY = { ratio: "aluminium", story: "record" };      // old page links still land in the right place
  var built = {}, spy = null, current = null;

  function buildHeader() {
    var brand = document.getElementById("brand");
    brand.appendChild(document.createTextNode(t("site.brand")));
    brand.appendChild(h("span", { text: t("site.brand_sub") }));
    var nav = document.getElementById("nav");
    nav.setAttribute("aria-label", t("nav.chapters_aria"));
    NAV.forEach(function (n) { nav.appendChild(h("a", { href: "#" + n[0], "data-target": n[0], text: t("nav." + n[1]) })); });
  }

  function buildFooter() {
    var f = window.CMA_STRINGS.footer, el = document.getElementById("footer");
    var addr = f.email_user + "@" + f.email_domain;      // assembled here, so the address is not written out in the page source
    var mailText = h("span", { class: "num", text: addr });
    var mailLink = h("a", { href: "mailto:" + addr, text: f.email_link });
    el.appendChild(h("div", { class: "wrap" },
      h("div", { class: "cols" },
        h("div", {}, h("h2", { text: f.name }), h("p", { text: f.tagline })),
        h("div", {}, h("h2", { text: f.links_title }),
          h("p", {}, h("a", { href: f.repo_url, text: f.repo_label, rel: "noopener" })),
          h("p", {}, h("a", { href: f.portfolio_url, text: f.portfolio_label, rel: "noopener" })),
          h("p", {}, h("a", { href: "#method", text: f.method_label }))),
        h("div", {}, h("h2", { text: f.contact_title }), h("p", {}, f.email_label + " ", mailText), h("p", {}, mailLink))),
      h("details", {}, h("summary", { text: f.credits_summary }), f.credits.map(function (c) { return h("p", { class: "small", text: c }); })),
      h("p", { class: "fine", text: f.disclaimer })));
  }

  function mark(target) {
    Array.prototype.forEach.call(document.querySelectorAll("#nav a"), function (a) {
      if (a.getAttribute("data-target") === target) { a.setAttribute("aria-current", target === "quality" ? "page" : "location"); } else { a.removeAttribute("aria-current"); }
    });
    current = target;
    var active = document.querySelector('#nav a[aria-current]');
    if (active && active.scrollIntoView && document.getElementById("nav").scrollWidth > document.getElementById("nav").clientWidth) {
      var nav = document.getElementById("nav");
      nav.scrollLeft = active.offsetLeft - nav.clientWidth / 2 + active.clientWidth / 2;
    }
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
    document.getElementById("story").hidden = name !== "story";
    document.getElementById("quality").hidden = name !== "quality";
    document.getElementById("method").hidden = name !== "method";
    if (!built[name]) { built[name] = true; CMA.pages[name](document.getElementById(name)); }
  }

  // the hash is a chapter anchor, "quality", or an older page name
  function show(hash, moveFocus) {
    var id = LEGACY[hash] && hash !== "story" ? LEGACY[hash] : hash;
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
      if (spy) { spy(); }
    }
  }

  // anchors land below the floating nav: its height plus 16 px, measured, not guessed
  function navOffset() {
    var bar = document.querySelector(".nav-bar");
    if (bar) { document.documentElement.style.setProperty("--navh", Math.ceil(bar.getBoundingClientRect().bottom + 16) + "px"); }
  }

  buildHeader();
  buildFooter();
  navOffset();
  window.addEventListener("resize", navOffset);
  window.addEventListener("hashchange", function () { show(location.hash.slice(1), true); });
  show(location.hash.slice(1), false);
  // fonts change text heights after the first layout: land on the chapter again once they are in
  if (document.fonts && document.fonts.ready && location.hash.length > 1) {
    document.fonts.ready.then(function () { navOffset(); var el = document.getElementById(location.hash.slice(1)); if (el && !document.getElementById("story").hidden) { el.scrollIntoView({ block: "start" }); } });
  }
})();
