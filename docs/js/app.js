/* App shell: header, navigation, page switching by #hash, footer. Pages 2 to 5 are placeholders until they are built. */
(function () {
  var CMA = window.CMA, t = CMA.t, h = CMA.h;
  var ROUTES = ["story", "dollar", "ratio", "demand", "quality"];
  var built = {};

  function buildHeader() {
    document.getElementById("brand").textContent = t("site.brand");
    var nav = document.getElementById("nav");
    ROUTES.forEach(function (r) { nav.appendChild(h("a", { href: "#" + r, "data-route": r, text: t("nav." + r) })); });
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
          h("p", {}, h("a", { href: f.portfolio_url, text: f.portfolio_label, rel: "noopener" }))),
        h("div", {}, h("h2", { text: f.contact_title }), h("p", {}, f.email_label + " ", mailText), h("p", {}, mailLink))),
      h("details", {}, h("summary", { text: f.credits_summary }), f.credits.map(function (c) { return h("p", { class: "small", text: c }); })),
      h("p", { class: "fine", text: f.disclaimer })));
  }

  function placeholder(route) {
    var el = document.getElementById(route);
    el.appendChild(h("div", { class: "wrap" },
      h("header", { class: "page-head" },
        h("p", { class: "eyebrow", text: t("pages." + route + ".eyebrow") }),
        h("h2", { id: route + "-title", tabindex: "-1", text: t("pages." + route + ".title") })),
      h("div", { class: "placeholder", text: t("pages.placeholder") })));
  }

  function show(route, moveFocus) {
    if (ROUTES.indexOf(route) < 0) { route = "story"; }
    ROUTES.forEach(function (r) { document.getElementById(r).hidden = r !== route; });
    Array.prototype.forEach.call(document.querySelectorAll("#nav a"), function (a) {
      if (a.getAttribute("data-route") === route) { a.setAttribute("aria-current", "page"); } else { a.removeAttribute("aria-current"); }
    });
    if (!built[route]) {
      built[route] = true;
      if (CMA.pages[route]) { CMA.pages[route](document.getElementById(route)); } else { placeholder(route); }
    }
    document.title = t("nav." + route) + " | " + t("site.title");
    if (moveFocus) {
      window.scrollTo(0, 0);
      var head = document.getElementById(route + "-title");
      if (head) { head.focus({ preventScroll: true }); }
    }
  }

  buildHeader();
  buildFooter();
  window.addEventListener("hashchange", function () { show(location.hash.slice(1), true); });
  show(location.hash.slice(1) || "story", false);
})();
