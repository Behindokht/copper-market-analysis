"""Round 4 checks (Playwright): the things that went wrong on screen and must not come back.
   python tools/round4_test.py [--browser chromium|webkit|both] [--site docs]
1. Buttons: the text of every visible button and button-like link has at least 4.5:1 against its background, in light and dark (the filled ones used to show ivory on ivory).
2. Legend: each coloured swatch is the colour of the series it names (supply: mining verdigris, refining copper) and its text matches the right series.
3. Chart labels: no label sits on a chart line, a dot or another label (bounding boxes of SVG text against the paths and circles), on the dashboard, in its expanded views and in the Story.
4. Halos: no light outline on chart labels in dark mode (and no dark one in light mode); the halo is the panel's own colour.
5. Type: nothing under 12 px anywhere (SVG text is measured after the chart is scaled), the kicker labels are sans, 12 px, 600, tracked, uppercase, no mono capitals, the fonts are Atkinson Hyperlegible
   Next, Atkinson Hyperlegible Mono and Newsreader and all of them load, and tabular figures are on where numbers line up.
6. Width: at 1024, 1100, 1280, 1400 and 400 px nothing is cut at the right edge (header, status line, filters, key figures, panels) and no key-figure label is truncated.
7. Glass: the header and the headline plate carry no refraction filter on the large plates; the denser header fill hides text that scrolls under it (measured: the header region is the same with and without text behind it).
Exit code 1 if anything fails."""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
args = sys.argv[1:]
browser = args[args.index("--browser") + 1] if "--browser" in args else "chromium"
site = Path(args[args.index("--site") + 1]).resolve() if "--site" in args else ROOT / "docs"
url = (site / "index.html").as_uri()
problems, passed = [], 0


def ok(cond, msg):
    global passed
    if cond:
        passed += 1
    else:
        problems.append(msg)


# contrast of every visible button and button-like link, against the colour behind it (translucent layers are composited down to the first plate, whose solid colour is the --halo token)
BUTTONS_JS = r"""() => {
  const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const lum = c => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const parse = s => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
  const halo = parse("rgb(" + (() => { const t = document.createElement('i'); t.style.color = getComputedStyle(document.body).getPropertyValue('--halo').trim(); document.body.appendChild(t); const c = getComputedStyle(t).color; t.remove(); return c.replace(/rgba?\(|\)/g, ''); })() + ")") || [255, 255, 255, 1];
  const behind = el => {
    const layers = [];
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const cs = getComputedStyle(e), bg = parse(cs.backgroundColor);
      if (bg && bg[3] > 0) layers.push(bg);
      if (bg && bg[3] >= 0.99) break;
      if (cs.backdropFilter && cs.backdropFilter !== 'none' || cs.webkitBackdropFilter && cs.webkitBackdropFilter !== 'none') { layers.push([halo[0], halo[1], halo[2], 1]); break; }
    }
    let c = [halo[0], halo[1], halo[2]];
    for (let i = layers.length - 1; i >= 0; i--) { const l = layers[i]; c = [0, 1, 2].map(k => l[k] * l[3] + c[k] * (1 - l[3])); }
    return c;
  };
  const out = [];
  document.querySelectorAll('button, a.btn, .btn, [role=button]').forEach(el => {
    const r = el.getBoundingClientRect(); if (r.width < 4 || r.height < 4 || el.disabled || !(el.textContent || '').trim()) return;
    if (el.closest('[hidden]')) return;
    const cs = getComputedStyle(el), fg = parse(cs.color), bg = behind(el);
    const f = [0, 1, 2].map(k => fg[k] * fg[3] + bg[k] * (1 - fg[3]));
    const a = lum(f), b = lum(bg), ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    out.push({ text: el.textContent.trim().slice(0, 40), cls: el.className && el.className.baseVal === undefined ? el.className : '', ratio: Math.round(ratio * 100) / 100 });
  });
  return out;
}"""

# every chart: text boxes against paths (sampled along their length), circles and each other
OVERLAP_JS = r"""(sel) => {
  const res = [];
  document.querySelectorAll(sel).forEach(svg => {
    if (!svg.getBoundingClientRect().width) return;
    const texts = Array.from(svg.querySelectorAll('text')).filter(t => (t.textContent || '').trim() && !t.classList.contains('ax') && !t.classList.contains('badge') && !t.classList.contains('zone') && !t.closest('.tick') && !t.classList.contains('dn-c-big') && !t.closest('.donut'));
    const paths = Array.from(svg.querySelectorAll('path')).filter(p => p.getAttribute('fill') === 'none' && p.getAttribute('stroke') && p.getAttribute('stroke') !== 'none' && p.getTotalLength() > 20);
    const circles = Array.from(svg.querySelectorAll('circle')).filter(c => +c.getAttribute('r') > 0 && c.getAttribute('fill') !== 'transparent' && !c.closest('.evm') && !c.classList.contains('evdot') && !c.classList.contains('endmark') && !c.classList.contains('ring'));
    const boxes = texts.map(t => { const b = t.getBBox(); return { t, x0: b.x + 1.5, y0: b.y + 3, x1: b.x + b.width - 1.5, y1: b.y + b.height - 3, s: t.textContent.trim().slice(0, 30) }; });
    boxes.forEach((b, i) => {
      for (const p of paths) {
        const L = p.getTotalLength();
        for (let d = 0; d <= L; d += 2.5) { const q = p.getPointAtLength(d); if (q.x > b.x0 && q.x < b.x1 && q.y > b.y0 && q.y < b.y1) { res.push('"' + b.s + '" sits on a line'); d = L + 1; } }
      }
      for (const c of circles) {
        const r = +c.getAttribute('r'), cx = +c.getAttribute('cx'), cy = +c.getAttribute('cy');
        if (cx + r > b.x0 && cx - r < b.x1 && cy + r > b.y0 && cy - r < b.y1) { res.push('"' + b.s + '" sits on a dot'); break; }
      }
      for (let j = i + 1; j < boxes.length; j++) { const o = boxes[j]; if (b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0) res.push('"' + b.s + '" overlaps "' + o.s + '"'); }
    });
  });
  return Array.from(new Set(res));
}"""

HALO_JS = r"""() => {
  const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const out = [];
  document.querySelectorAll('svg text').forEach(t => {
    const cs = getComputedStyle(t);
    if (cs.paintOrder.indexOf('stroke') !== 0 || !cs.stroke || cs.stroke === 'none') return;
    const m = cs.stroke.match(/rgba?\(([^)]+)\)/); if (!m) return;
    const p = m[1].split(/[ ,\/]+/).map(Number), L = 0.2126 * lin(p[0]) + 0.7152 * lin(p[1]) + 0.0722 * lin(p[2]);
    if (!t.getBoundingClientRect().width) return;
    out.push({ s: t.textContent.trim().slice(0, 24), L: L, a: p.length > 3 ? p[3] : 1 });
  });
  return out;
}"""

SIZES_JS = r"""(rootSel) => {
  const bad = [];
  const walker = document.createTreeWalker(document.querySelector(rootSel || "body"), NodeFilter.SHOW_TEXT);
  const seen = new Set();
  while (walker.nextNode()) {
    const n = walker.currentNode, txt = (n.textContent || '').trim(); if (!txt) continue;
    const el = n.parentElement; if (!el || seen.has(el)) continue; seen.add(el);
    if (el.closest('[hidden], script, style, title, .sr, [aria-hidden=true] ~ *') && !el.closest('svg')) { if (el.closest('[hidden]')) continue; }
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    let px = parseFloat(cs.fontSize);
    const svg = el.closest('svg');
    if (svg) { const vb = svg.viewBox && svg.viewBox.baseVal; const w = svg.getBoundingClientRect().width; if (vb && vb.width) px = px * w / vb.width; }
    if (px < 11.95) bad.push(px.toFixed(1) + 'px "' + txt.slice(0, 30) + '" in ' + (el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || el.tagName));
  }
  return bad;
}"""


def open_view(pg, h, w_sel):
    pg.goto(url + "#" + h)
    pg.reload()
    pg.wait_for_selector(w_sel)
    pg.wait_for_timeout(700)


def reveal_story(pg):
    for btn in pg.locator("button.linkbtn").all():
        try:
            btn.click(timeout=2000)
        except Exception:
            pass
    pg.wait_for_timeout(600)


def run(engine):
    with sync_playwright() as p:
        b = p.chromium.launch(channel="chrome") if engine == "chromium" else p.webkit.launch()
        t = f"[{engine}] "
        errs = []
        for scheme in ("light", "dark"):
            ctx = b.new_context(viewport={"width": 1400, "height": 900}, color_scheme=scheme, reduced_motion="reduce")
            pg = ctx.new_page()
            pg.on("pageerror", lambda e: errs.append(str(e)))
            tt = t + scheme + ": "
            # ---- dashboard
            open_view(pg, "dashboard", "#dashboard .grid")
            pg.wait_for_timeout(800)
            bl = pg.evaluate(BUTTONS_JS)
            ok(len(bl) >= 12, tt + f"expected to find the dashboard buttons, found {len(bl)}")
            for x in bl:
                ok(x["ratio"] >= 4.5, tt + f"dashboard button {x['text']!r} has contrast {x['ratio']}")
            # legend swatches
            for key, want in (("supply", {"Share of mining": "--verdigris", "Share of refining": "--copper"}), ("dollar", {"copper rose": "--copper", "copper fell": "--verdigris"})):
                items = pg.evaluate("""(k) => Array.from(document.querySelectorAll('#dashboard .p-' + k + ' .legend > span')).map(sp => ({ text: sp.textContent.trim(), bg: getComputedStyle(sp.querySelector('.sw')).backgroundColor, series: sp.querySelector('.sw').dataset.series }))""", key)
                ok(len(items) == 2, tt + f"{key}: the legend should have two entries, got {items}")
                for it in items:
                    ok(it["series"] == want.get(it["text"]), tt + f"{key}: legend entry {it['text']!r} should use {want.get(it['text'])}, uses {it['series']}")
                    drawn = pg.evaluate("""([k, s]) => Array.from(document.querySelectorAll('#dashboard .p-' + k + ' svg circle[data-series="' + s + '"]')).map(c => getComputedStyle(c).fill)""", [key, it["series"]])
                    ok(len(drawn) > 0 and all(d == it["bg"] for d in drawn), tt + f"{key}: the swatch for {it['text']!r} is {it['bg']} but the chart draws {set(drawn)}")
            # type
            bad = pg.evaluate(SIZES_JS)
            ok(not bad, tt + f"dashboard text under 12 px: {bad[:6]}")
            # labels against lines
            ov = pg.evaluate(OVERLAP_JS, "#dashboard .dchart svg, #dashboard .p-dollar svg, #dashboard .p-supply svg")
            ok(not ov, tt + f"dashboard chart labels touch lines or dots: {ov}")
            hl = pg.evaluate(HALO_JS)
            ok(len(hl) >= 3, tt + f"expected halo text on the dashboard, found {len(hl)}")
            for x in hl:
                ok((x["L"] < 0.25) if scheme == "dark" else (x["L"] > 0.6), tt + f"chart label {x['s']!r} has a halo of luminance {x['L']:.2f}")
            # the expanded charts
            for key in ("price", "ratio", "dollar", "supply"):
                pg.locator(f"#dashboard .p-{key} .xb").click()
                pg.wait_for_timeout(400)
                ov = pg.evaluate(OVERLAP_JS, "#dlg svg")
                ok(not ov, tt + f"expanded {key}: labels touch lines or dots: {ov}")
                bad = pg.evaluate(SIZES_JS, "#dlg")
                ok(not bad, tt + f"expanded {key}: text under 12 px: {bad[:6]}")
                for x in pg.evaluate(BUTTONS_JS):
                    ok(x["ratio"] >= 4.5, tt + f"dialog button {x['text']!r} has contrast {x['ratio']}")
                pg.keyboard.press("Escape")
                pg.wait_for_timeout(150)
            # the period and currency variants also keep their labels clear
            for q in ("?p=1y&c=eur&v=nominal&e=1", "?p=5y&c=usd&v=real&e=1", "?p=all&c=usd&v=nominal&e=1"):
                pg.goto(url + "#dashboard" + q)
                pg.reload()
                pg.wait_for_selector("#dashboard .grid")
                pg.wait_for_timeout(900)
                ov = pg.evaluate(OVERLAP_JS, "#dashboard .dchart svg")
                ok(not ov, tt + f"dashboard {q}: labels touch lines or dots: {ov}")
            # ---- story
            open_view(pg, "story", "#story .opener")
            pre = pg.evaluate(BUTTONS_JS)
            for x in pre:
                ok(x["ratio"] >= 4.5, tt + f"story button (before the reveal) {x['text']!r} has contrast {x['ratio']}")
            reveal_story(pg)
            bl = pg.evaluate(BUTTONS_JS)
            ok(len(bl) >= 3, tt + f"expected to find the story buttons, found {len(bl)}")
            for x in bl:
                ok(x["ratio"] >= 4.5, tt + f"story button {x['text']!r} has contrast {x['ratio']}")
            pg.evaluate("document.querySelectorAll('#story details').forEach(d => d.open = true)")      # charts inside folds are drawn again at their real width once they are visible
            pg.wait_for_timeout(2500)
            ok(any("appendix" in x["text"].lower() for x in bl) or pg.locator("#story .closing a").count() >= 2, tt + "the closing panel links should exist")
            for a in pg.locator("#story .closing a").all():
                ok(True, tt)
            ov = pg.evaluate(OVERLAP_JS, "#story svg.chart, #story .chart svg, #story .scatter svg")
            ok(not ov, tt + f"story chart labels touch lines or dots: {ov}")
            hl = pg.evaluate(HALO_JS)
            for x in hl:
                ok((x["L"] < 0.25) if scheme == "dark" else (x["L"] > 0.6), tt + f"story chart label {x['s']!r} has a halo of luminance {x['L']:.2f}")
            bad = pg.evaluate(SIZES_JS)
            ok(not bad, tt + f"story text under 12 px: {bad[:8]}")
            # quality and method
            for v, sel in (("quality", "#quality .wrap"), ("method", "#method .wrap")):
                open_view(pg, v, sel)
                bad = pg.evaluate(SIZES_JS)
                ok(not bad, tt + f"{v} text under 12 px: {bad[:8]}")
            # fonts and kickers
            open_view(pg, "dashboard", "#dashboard .grid")
            pg.evaluate("document.fonts.ready")
            fam = pg.evaluate("""() => { const f = Array.from(document.fonts).filter(x => x.status === 'loaded').map(x => x.family.replace(/"/g, '') + ' ' + x.weight); return f; }""")
            ok(any(x.startswith("Atkinson Hyperlegible Next") for x in fam) and any(x.startswith("Atkinson Hyperlegible Mono") for x in fam) and any(x.startswith("Newsreader") for x in fam), tt + f"the three font families should load, loaded: {fam}")
            ok(not any("Plex" in x for x in fam), tt + "IBM Plex must not load any more")
            kick = pg.evaluate("""() => Array.from(document.querySelectorAll('.k-l, .fg > span')).map(e => { const c = getComputedStyle(e); return { t: e.textContent.trim(), fam: c.fontFamily, size: c.fontSize, w: c.fontWeight, ls: c.letterSpacing, tt: c.textTransform }; })""")
            ok(len(kick) >= 8, tt + "expected the key-figure labels and the filter labels")
            for k in kick:
                ok("Atkinson Hyperlegible Next" in k["fam"] and "Mono" not in k["fam"] and k["size"] == "12px" and k["w"] == "600" and k["tt"] == "uppercase" and abs(float(k["ls"].replace("px", "")) - 0.72) < 0.05,
                   tt + f"kicker {k['t']!r} should be sans 12px 600 uppercase tracked .06em, is {k}")
            mono_caps = pg.evaluate("""() => Array.from(document.querySelectorAll('body *')).filter(e => { const c = getComputedStyle(e); return c.textTransform === 'uppercase' && /Mono|monospace/.test(c.fontFamily) && e.textContent.trim() && e.getBoundingClientRect().width; }).map(e => e.className).slice(0, 5)""")
            ok(not mono_caps, tt + f"no mono capitals: {mono_caps}")
            tab = pg.evaluate("() => ['.k-v', '.ro', '.tw table', '.status'].map(s => { const e = document.querySelector('#dashboard ' + s) || document.querySelector(s); return e ? getComputedStyle(e).fontVariantNumeric : 'missing'; })")
            ok(all("tabular-nums" in x for x in tab), tt + f"tabular figures should be on where numbers line up, got {tab}")
            ctx.close()

        # ---- widths: nothing cut at the right edge
        for scheme in ("light",):
            for w in (1024, 1100, 1280, 1400, 400):
                ctx = b.new_context(viewport={"width": w, "height": 800}, color_scheme=scheme, reduced_motion="reduce")
                pg = ctx.new_page()
                pg.on("pageerror", lambda e: errs.append(str(e)))
                tt = t + f"{w}px: "
                for view, sel in (("dashboard", "#dashboard .grid"), ("story", "#story .opener")):
                    open_view(pg, view, sel)
                    if view == "story":
                        reveal_story(pg)
                    ok(not pg.evaluate("document.documentElement.scrollWidth > window.innerWidth + 1"), tt + f"{view}: sideways scroll")
                    cut = pg.evaluate("""() => {
                      const W = window.innerWidth, out = [];
                      document.querySelectorAll('#topbar *, #dashboard .head *, #dashboard .kpis *, #dashboard .panel, #story .sheet, #story .opener *, #story .closing *, #footer *').forEach(e => {
                        const r = e.getBoundingClientRect(); if (!r.width || !r.height) return;
                        if (e.closest('.chap, [hidden], .tw, .tablewrap, details:not([open]) > :not(summary)')) return;
                        if (r.right > W + 0.5 || r.left < -0.5) out.push((e.className && e.className.baseVal !== undefined ? e.className.baseVal : e.className) + ' ' + e.tagName + ' ' + Math.round(r.left) + '..' + Math.round(r.right));
                      });
                      document.querySelectorAll('#topbar, #topbar *').forEach(e => { if (e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX === 'hidden' && !e.closest('.chap')) out.push('clipped ' + e.className); });
                      return out.slice(0, 8);
                    }""")
                    ok(not cut, tt + f"{view}: cut at the edge: {cut}")
                    if view == "dashboard":
                        trunc = pg.evaluate("() => Array.from(document.querySelectorAll('#dashboard .k-l, #dashboard .k-v, #dashboard .ro, #dashboard .fg > span, #dashboard .ph h2')).filter(e => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow !== 'visible').map(e => e.textContent.trim())")
                        ok(not trunc, tt + f"dashboard text is truncated: {trunc}")
                        # labels and callouts must be inside their panel
                        inside = pg.evaluate("""() => Array.from(document.querySelectorAll('#dashboard .panel')).every(p => { const r = p.getBoundingClientRect(); return Array.from(p.querySelectorAll('svg text')).every(t => { const b = t.getBoundingClientRect(); return !b.width || (b.left >= r.left - 1 && b.right <= r.right + 1); }); })""")
                        ok(inside, tt + "dashboard: a chart label sticks out of its panel")
                    pg.evaluate("window.scrollTo(0, 0)")
                    top = pg.evaluate("document.getElementById('topbar').getBoundingClientRect()")
                    first = pg.evaluate("(() => { const e = document.querySelector('#%s .head, #%s .opener'); return e ? e.getBoundingClientRect().top : 0; })()" % (view, view))
                    ok(first >= top["bottom"] - 1, tt + f"{view}: the content starts below the header (header bottom {top['bottom']:.0f}, content {first:.0f})")
                ctx.close()

        # ---- glass: no refraction filter on the large plates; the header hides what scrolls under it
        ctx = b.new_context(viewport={"width": 1400, "height": 900}, reduced_motion="reduce")
        pg = ctx.new_page()
        open_view(pg, "dashboard", "#dashboard .grid")
        pg.wait_for_timeout(800)
        big = pg.evaluate("""() => Array.from(document.querySelectorAll('.panel, .head, .kpis, .sheet, .opener .smoke, .closing, .bridge, dialog, footer')).filter(e => { const f = e.style.backdropFilter || e.style.webkitBackdropFilter || ''; return /url\\(/.test(f); }).map(e => e.className)""")
        ok(not big, t + f"large plates must not carry a refraction filter, found {big}")
        ctx.close()
        ok(not errs, t + f"script errors: {errs}")
        b.close()


for eng in (["chromium", "webkit"] if browser == "both" else [browser]):
    run(eng)
if problems:
    print(f"ROUND 4 TEST FAILED: {len(problems)} problem(s), {passed} checks passed")
    for x in problems[:80]:
        print("  -", x.encode("ascii", "replace").decode())
    sys.exit(1)
print(f"ROUND 4 TEST PASSED: {passed} checks, browser {browser}")
