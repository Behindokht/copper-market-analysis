"""Round 6 checks (Playwright, Chromium, WebKit and Firefox).
   python tools/round6_test.py [--browser chromium|webkit|firefox|all] [--site docs] [--quick] [--shots DIR]
1. Expand dialogs: for each of the six panels, with the page scrolled to the middle and to the bottom, on a 1366x768 and a 1280x600 desktop, a 390x844 phone, an 844x390 phone in landscape and a
   200 percent zoom (683x384 at device scale 2), and in dark mode and with reduced motion: the dialog is inside the viewport (or scrolls inside itself with the close button visible), focus is on the close
   button, the page behind does not move on a wheel, closing (Escape, a click on the backdrop and the close button are each tried) returns to the exact scroll position and focus returns to the Expand button.
2. The supply dialog at 390 px: the axis labels do not touch and the value labels (the "none" on the Japan row too) keep clear of the dots and the gridlines.
3. The metals read-out: at a known month the header shows the month and every row shows its share of its record and its price in the right unit, checked against results/res_dash_series.csv; as quoted and
   in today's money; labels return on leave; a screen-reader text with the month and the values is written while the arrow keys are used.
4. Touch: a horizontal drag moves the read-out in the small charts and in the dialogs, a tap sets it and a second tap clears it, a vertical drag does not set it, and the charts have touch-action pan-y.
5. The term control: hover, keyboard focus, tap and Escape, role tooltip, aria-describedby, the exact text, inside the viewport at 390 px, no animation with reduced motion.
6. Events: for 1Y, 5Y, 20Y and All, on desktop and at 390 px, no chart label touches a line, a dot or another label.
Exit code 1 if anything fails."""
import csv
import re
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
args = sys.argv[1:]
browser = args[args.index("--browser") + 1] if "--browser" in args else "chromium"
site = Path(args[args.index("--site") + 1]).resolve() if "--site" in args else ROOT / "docs"
shots = Path(args[args.index("--shots") + 1]) if "--shots" in args else None
quick = "--quick" in args
url = (site / "index.html").as_uri()
problems, passed = [], 0


def ok(cond, msg):
    global passed
    if cond:
        passed += 1
    else:
        problems.append(msg)


def launch(p, engine):
    if engine == "chromium":
        return p.chromium.launch(channel="chrome")
    return getattr(p, engine).launch()


OVERLAP_JS = r"""(sel) => {
  const res = [];
  document.querySelectorAll(sel).forEach(svg => {
    if (!svg.getBoundingClientRect().width) return;
    const texts = Array.from(svg.querySelectorAll('text')).filter(t => (t.textContent || '').trim() && !t.classList.contains('badge') && !t.classList.contains('zone') && !t.closest('.donut'));
    const paths = Array.from(svg.querySelectorAll('path')).filter(p => p.getAttribute('fill') === 'none' && p.getAttribute('stroke') && p.getAttribute('stroke') !== 'none' && p.getTotalLength() > 20);
    const circles = Array.from(svg.querySelectorAll('circle')).filter(c => +c.getAttribute('r') > 0 && c.getAttribute('fill') !== 'transparent' && !c.closest('.evm') && !c.classList.contains('endmark') && !c.classList.contains('ring') && !c.classList.contains('xhdot'));
    const boxes = texts.map(t => { const b = t.getBBox(); return { t, x0: b.x + 1.5, y0: b.y + 3, x1: b.x + b.width - 1.5, y1: b.y + b.height - 3, s: t.textContent.trim().slice(0, 30), tick: t.classList.contains('ax') || /^[\d.,%+−-]+[%×]?$/.test(t.textContent.trim()) }; });
    boxes.forEach((b, i) => {
      if (!b.tick) {
        for (const p of paths) { const L = p.getTotalLength(); for (let d = 0; d <= L; d += 2.5) { const q = p.getPointAtLength(d); if (q.x > b.x0 && q.x < b.x1 && q.y > b.y0 && q.y < b.y1) { res.push('"' + b.s + '" sits on a line'); d = L + 1; } } }
        for (const c of circles) { const r = +c.getAttribute('r'), cx = +c.getAttribute('cx'), cy = +c.getAttribute('cy'); if (cx + r > b.x0 && cx - r < b.x1 && cy + r > b.y0 && cy - r < b.y1) { res.push('"' + b.s + '" sits on a dot'); break; } }
      }
      for (let j = i + 1; j < boxes.length; j++) { const o = boxes[j]; if (b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0) res.push('"' + b.s + '" overlaps "' + o.s + '"'); }
    });
  });
  return Array.from(new Set(res));
}"""

# value labels and ticks of the supply chart against its marks: the label column must be clear of dots and gridlines
SUPPLY_JS = r"""() => {
  const svg = document.querySelector('#dlg svg'); if (!svg) return ['no supply svg'];
  const bad = [], texts = Array.from(svg.querySelectorAll('text')).filter(t => /%/.test(t.textContent) || /none/.test(t.textContent));
  const circles = Array.from(svg.querySelectorAll('circle')), lines = Array.from(svg.querySelectorAll('line'));
  const boxes = texts.map(t => ({ s: t.textContent.trim(), b: t.getBBox(), anchor: t.getAttribute('text-anchor') }));
  boxes.forEach(o => {
    const x0 = o.b.x, x1 = o.b.x + o.b.width, y0 = o.b.y + 2, y1 = o.b.y + o.b.height - 2;
    if (/\//.test(o.s)) {         // a value label: not on a dot, not across a gridline
      circles.forEach(c => { const r = +c.getAttribute('r'), cx = +c.getAttribute('cx'), cy = +c.getAttribute('cy'); if (cx + r > x0 && cx - r < x1 && cy + r > y0 && cy - r < y1) bad.push('value label "' + o.s + '" on a dot'); });
      lines.forEach(l => { const lx = +l.getAttribute('x1'); if (l.getAttribute('x1') === l.getAttribute('x2') && lx > x0 && lx < x1 && Math.min(+l.getAttribute('y1'), +l.getAttribute('y2')) < y1 && Math.max(+l.getAttribute('y1'), +l.getAttribute('y2')) > y0) bad.push('value label "' + o.s + '" across a gridline'); });
    }
  });
  const ticks = boxes.filter(o => /^\d+%$/.test(o.s));
  for (let i = 0; i < ticks.length; i++) for (let j = i + 1; j < ticks.length; j++) { const a = ticks[i].b, b = ticks[j].b; if (a.x < b.x + b.width + 4 && a.x + a.width + 4 > b.x && a.y < b.y + b.height && a.y + a.height > b.y) bad.push('ticks ' + ticks[i].s + ' and ' + ticks[j].s + ' touch'); }
  return bad;
}"""

PANELS = ["price", "metals", "ratio", "dollar", "supply", "uses"]
CONFIGS = [("1366x768", 1366, 768, 1, False), ("1280x600", 1280, 600, 1, False), ("390x844", 390, 844, 1, True), ("844x390", 844, 390, 1, True), ("zoom200", 683, 384, 2, False)]


def open_dash(pg, q=""):
    pg.goto(url + "#dashboard" + q)
    pg.reload()
    pg.wait_for_selector("#dashboard .grid")
    pg.wait_for_timeout(900)


def dialog_cycle(pg, key, where, how, tag):
    total = pg.evaluate("document.documentElement.scrollHeight - window.innerHeight")
    y = int(total // 2) if where == "middle" else int(total)
    pg.evaluate("(y) => { document.documentElement.style.scrollBehavior = 'auto'; window.scrollTo(0, y); }", y)
    pg.wait_for_timeout(250)
    before = pg.evaluate("window.pageYOffset")
    pg.evaluate("(k) => document.querySelector('#dashboard .p-' + k + ' .xb').click()", key)
    pg.wait_for_timeout(450)
    st = pg.evaluate("""() => { const d = document.getElementById('dlg'), r = d.getBoundingClientRect(), c = document.getElementById('dlg-x').getBoundingClientRect();
      return { open: d.open, top: r.top, left: r.left, bottom: r.bottom, right: r.right, vw: document.documentElement.clientWidth, vh: window.innerHeight, pos: getComputedStyle(d).position,
        scrolls: d.scrollHeight > d.clientHeight + 1, closeIn: c.top >= -1 && c.bottom <= window.innerHeight + 1 && c.left >= -1 && c.right <= document.documentElement.clientWidth + 1,
        active: document.activeElement && document.activeElement.id, bodyTop: parseInt(document.body.style.top || '0', 10), sy: window.pageYOffset }; }""")
    t = f"{tag} {key} {where}: "
    ok(st["open"], t + "the dialog should be open")
    ok(st["pos"] == "fixed", t + f"the dialog should be position fixed, it is {st['pos']}")
    inside = st["top"] >= -1 and st["left"] >= -1 and st["bottom"] <= st["vh"] + 1 and st["right"] <= st["vw"] + 1
    ok(inside or (st["scrolls"] and st["closeIn"]), t + f"the dialog is not inside the viewport: {st}")
    ok(st["active"] == "dlg-x", t + f"focus should be on the close button, it is on {st['active']!r}")
    ok(st["bodyTop"] == -before, t + f"the page should be pinned at {before}, body top is {st['bodyTop']}")
    # the page behind does not move on a wheel (the pointer is over the backdrop)
    pg.mouse.move(2, 2)
    pg.mouse.wheel(0, 700)
    pg.wait_for_timeout(200)
    after = pg.evaluate("({ top: parseInt(document.body.style.top || '0', 10), sy: window.pageYOffset, rect: document.body.getBoundingClientRect().top })")
    ok(after["top"] == -before and after["rect"] == -before, t + f"the page moved behind the dialog: {after}")
    # close
    if how == "Escape":
        pg.keyboard.press("Escape")
    elif how == "backdrop":
        pg.mouse.click(2, 2)
    else:
        pg.evaluate("document.getElementById('dlg-x').click()")
    pg.wait_for_timeout(350)
    res = pg.evaluate("(k) => ({ open: document.getElementById('dlg').open, sy: window.pageYOffset, locked: document.body.style.position, trigger: !!(document.activeElement && document.activeElement.classList.contains('xb') && document.activeElement.closest('.p-' + k)) })", key)
    ok(not res["open"], t + f"{how} should close the dialog")
    ok(res["sy"] == before and res["locked"] == "", t + f"closing should return to scroll position {before}, it is {res['sy']} (lock {res['locked']!r})")
    ok(res["trigger"], t + "focus should return to the Expand button")


def run(engine):
    with sync_playwright() as p:
        b = launch(p, engine)
        errs = []
        # ---------------------------------------------------------------- 1 and 2: the dialogs
        for name, w, h, dsf, touch in CONFIGS:
            variants = [("light", False)] + ([("dark", True)] if name in ("390x844", "1366x768") else [])
            for scheme, reduce in variants:
                kw = dict(viewport={"width": w, "height": h}, device_scale_factor=dsf, color_scheme=scheme, reduced_motion="reduce" if reduce else "no-preference")
                if touch and engine != "firefox":
                    kw["has_touch"] = True
                ctx = b.new_context(**kw)
                pg = ctx.new_page()
                pg.on("pageerror", lambda e: errs.append(str(e)))
                open_dash(pg)
                tag = f"[{engine} {name} {scheme}{' reduced' if reduce else ''}]"
                methods = ["Escape", "backdrop", "button"]
                n = 0
                for key in (PANELS if not quick else ["price", "supply"]):
                    for where in ("middle", "bottom"):
                        dialog_cycle(pg, key, where, methods[n % 3], tag)
                        n += 1
                if name == "390x844" and scheme == "light":
                    # the supply dialog on a phone
                    pg.evaluate("document.querySelector('#dashboard .p-supply .xb').click()")
                    pg.wait_for_timeout(500)
                    bad = pg.evaluate(SUPPLY_JS)
                    ok(not bad, f"{tag} supply dialog: {bad}")
                    ov = pg.evaluate(OVERLAP_JS, "#dlg svg")
                    ok(not ov, f"{tag} supply dialog labels touch: {ov}")
                    if shots:
                        pg.screenshot(path=str(shots / f"{engine}_supply_dialog_390.png"))
                    pg.keyboard.press("Escape")
                ctx.close()
        ok(not errs, f"[{engine}] script errors: {errs[:3]}")
        b.close()


def csv_series():
    rows = list(csv.DictReader(open(ROOT / "results" / "res_dash_series.csv", encoding="utf-8")))
    return rows


def n0(x):
    return f"{int(float(x) + 0.5):,}"


def price_label(v, unit):
    v = float(v)
    return "$" + (n0(v) if v >= 100 else f"{int(v * 10 + 0.5) / 10:.1f}") + unit


METALS = {"Copper": ("cu", "/t"), "Aluminium": ("al", "/t"), "Gold": ("gold", "/oz"), "Tin": ("tin", "/t"), "Brent oil": ("brent", "/bbl")}
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def run_features(engine):
    rows = csv_series()
    last = len(rows) - 1
    with sync_playwright() as p:
        b = launch(p, engine)
        errs = []
        # ---------------------------------------------------------------- 3: the metals read-out against Python
        ctx = b.new_context(viewport={"width": 1400, "height": 900}, reduced_motion="reduce")
        pg = ctx.new_page()
        pg.on("pageerror", lambda e: errs.append(str(e)))
        for q, suffix, basis in (("", "_usd", "as quoted"), ("?p=20y&c=usd&v=real&e=1", "_real", "real")):
            open_dash(pg, q)
            t = f"[{engine} metals {basis}] "
            rest = pg.evaluate("Array.from(document.querySelectorAll('#dashboard .p-metals .sm-row:not(.sm-axis)')).map(r => [r.querySelector('.sm-n').childNodes[0].textContent, r.querySelector('text.lbl').textContent, r.querySelector('text.lbl2').textContent])")
            ok(len(rest) == 5 and all(x[2] == "" for x in rest), t + f"at rest every row shows its share only, got {rest}")
            ok(rest[0][1].endswith("%"), t + "the share label is a percent")
            svg = pg.locator("#dashboard .p-metals .sm-row:not(.sm-axis) svg").first
            svg.focus()
            for _ in range(3):
                pg.keyboard.press("ArrowLeft")
                pg.wait_for_timeout(120)
            pg.wait_for_timeout(400)
            m = rows[last - 3]["month"]
            want_month = f"{MONTHS[int(m[5:7]) - 1]} {m[:4]}"
            ro = pg.locator("#ro-metals").inner_text().strip()
            ok(ro == want_month, t + f"the header should show {want_month}, it shows {ro!r}")
            got = pg.evaluate("Array.from(document.querySelectorAll('#dashboard .p-metals .sm-row:not(.sm-axis)')).map(r => [r.querySelector('.sm-n').childNodes[0].textContent, r.querySelector('text.lbl').textContent, r.querySelector('text.lbl2').textContent])")
            for name, share, price in got:
                key, unit = METALS[name]
                ws = n0(rows[last - 3][key + "_rec_pct"]) + "%"
                wp = price_label(rows[last - 3][key + suffix], unit)
                ok(share == ws and price == wp, t + f"{name} at {m}: page shows {share!r} and {price!r}, Python gives {ws!r} and {wp!r}")
            sr = pg.locator("#sr-metals").inner_text()
            ok(want_month.split()[1] in sr and "percent of its record" in sr and "Gold" in sr, t + f"the screen-reader text should name the month and the values, got {sr[:80]!r}")
            pg.keyboard.press("Escape")
            pg.wait_for_timeout(500)
            back = pg.evaluate("Array.from(document.querySelectorAll('#dashboard .p-metals .sm-row:not(.sm-axis) text.lbl2')).map(t => t.textContent)")
            ok(all(x == "" for x in back), t + f"on leave the price labels should go, got {back}")
        # the same read-out in the dialog
        open_dash(pg)
        pg.evaluate("document.querySelector('#dashboard .p-metals .xb').click()")
        pg.wait_for_timeout(500)
        pg.locator("#dlg .sm-row:not(.sm-axis) svg").first.focus()
        pg.keyboard.press("ArrowLeft"); pg.wait_for_timeout(300)
        ok(pg.locator("#x-ro").inner_text().strip() != "", f"[{engine}] the metals dialog header should show the month")
        ok(pg.evaluate("document.querySelectorAll('#dlg text.lbl2').length") == 5 and pg.evaluate("Array.from(document.querySelectorAll('#dlg text.lbl2')).every(t => t.textContent.indexOf('$') === 0)"), f"[{engine}] the metals dialog rows should show prices")
        pg.keyboard.press("Escape")
        ctx.close()

        # ---------------------------------------------------------------- 4: touch
        kw = dict(viewport={"width": 390, "height": 844}, reduced_motion="reduce")
        if engine != "firefox":
            kw["has_touch"] = True
        ctx = b.new_context(**kw)
        pg = ctx.new_page()
        pg.on("pageerror", lambda e: errs.append(str(e)))
        open_dash(pg)

        TOUCH = """([sel, x0f, x1f, yf, mode]) => {
          const el = document.querySelector(sel), r = el.getBoundingClientRect(), id = 7;
          const ev = (type, x, y) => el.dispatchEvent(new PointerEvent(type, { pointerType: 'touch', pointerId: id, isPrimary: true, bubbles: true, cancelable: true, clientX: x, clientY: y }));
          const y = r.top + r.height * yf, xa = r.left + r.width * x0f, xb = r.left + r.width * x1f;
          if (mode === 'drag') { ev('pointerdown', xa, y); ev('pointermove', xa + (xb - xa) * 0.3, y + 1); ev('pointermove', xb, y + 2); ev('pointerup', xb, y + 2); }
          else if (mode === 'vertical') { ev('pointerdown', xa, y); ev('pointermove', xa + 2, y + 40); ev('pointercancel', xa + 2, y + 40); }
          else { ev('pointerdown', xa, y); ev('pointerup', xa, y); }
        }"""
        for place, sel, ro in (("panel", "#dashboard .p-price .dchart svg .xhhit", "#ro-price"), ("dialog", "#dlg .dlg-chart svg .xhhit", "#x-ro")):
            if place == "dialog":
                pg.evaluate("document.querySelector('#dashboard .p-price .xb').click()")
                pg.wait_for_timeout(600)
            t = f"[{engine} touch {place}] "
            ok(pg.evaluate("(s) => getComputedStyle(document.querySelector(s).closest('svg')).touchAction === 'pan-y'", sel), t + "the chart should have touch-action pan-y")
            rest = pg.locator(ro).inner_text().strip()
            pg.evaluate(TOUCH, [sel, 0.2, 0.8, 0.5, "vertical"]); pg.wait_for_timeout(250)
            ok(pg.locator(ro).inner_text().strip() == rest, t + "a vertical drag must not set the read-out")
            pg.evaluate(TOUCH, [sel, 0.2, 0.7, 0.5, "drag"]); pg.wait_for_timeout(350)
            d1 = pg.locator(ro).inner_text().strip()
            ok(d1 != rest, t + f"a horizontal drag should move the read-out, it still shows {d1!r}")
            pg.evaluate(TOUCH, [sel, 0.2, 0.4, 0.5, "drag"]); pg.wait_for_timeout(350)
            d2 = pg.locator(ro).inner_text().strip()
            ok(d2 != d1, t + "dragging back should change it again")
            pg.evaluate(TOUCH, [sel, 0.5, 0.5, 0.5, "tap"]); pg.wait_for_timeout(350)
            ok(pg.locator(ro).inner_text().strip() == rest, t + "a tap with a month shown should clear it")
            pg.evaluate(TOUCH, [sel, 0.5, 0.5, 0.5, "tap"]); pg.wait_for_timeout(350)
            ok(pg.locator(ro).inner_text().strip() != rest, t + "a tap should set the read-out")
            if place == "dialog":
                pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
        # the metals rows
        pg.evaluate("window.scrollTo(0, 0)")
        sel = "#dashboard .p-metals .sm-row:not(.sm-axis) svg rect"
        pg.evaluate(TOUCH, [sel, 0.2, 0.8, 0.5, "drag"]); pg.wait_for_timeout(350)
        ok(pg.evaluate("Array.from(document.querySelectorAll('#dashboard .p-metals text.lbl2')).every(t => t.textContent.indexOf('$') === 0)"), f"[{engine}] a drag over the metals rows should show every price")
        ctx.close()

        # ---------------------------------------------------------------- 5: the term control
        for name, w, h in (("desktop", 1400, 900), ("phone", 390, 844)):
            ctx = b.new_context(viewport={"width": w, "height": h}, reduced_motion="reduce", **({"has_touch": True} if (name == "phone" and engine != "firefox") else {}))
            pg = ctx.new_page()
            pg.on("pageerror", lambda e: errs.append(str(e)))
            open_dash(pg)
            t = f"[{engine} term {name}] "
            term = pg.locator("#dashboard h1 .term")
            ok(term.count() == 1, t + "the headline needs the term control")
            ok(pg.evaluate("(() => { const b = document.querySelector('#dashboard h1 .term'); return b.getAttribute('aria-describedby') === 'term-tip' && /dotted/.test(getComputedStyle(b).textDecorationStyle + getComputedStyle(b).textDecoration); })()"), t + "the control is dotted and points to the tooltip")
            WANT = "Metric ton: 1,000 kg. Also written tonne or t. Not the US ton, which is 907 kg."
            vis = lambda: pg.evaluate("(() => { const t = document.getElementById('term-tip'); return t && !t.hidden ? t.textContent : null; })()")
            if name == "desktop":
                term.hover(); pg.wait_for_timeout(250)
                ok(vis() == WANT, t + f"hover should show the exact text, got {vis()!r}")
                ok(pg.evaluate("document.getElementById('term-tip').getAttribute('role')") == "tooltip", t + "role tooltip")
                pg.mouse.move(5, 5); pg.wait_for_timeout(400)
                ok(vis() is None, t + "leaving should hide it")
                term.focus(); pg.wait_for_timeout(250)
                ok(vis() == WANT, t + "keyboard focus should show it")
                pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
                ok(vis() is None, t + "Escape should hide it")
                ok(pg.evaluate("getComputedStyle(document.getElementById('term-tip')).animationName") in ("none", ""), t + "no animation with reduced motion")
                pg.evaluate("document.activeElement.blur()")
            else:
                (term.click() if engine == 'firefox' else term.tap()); pg.wait_for_timeout(300)
                ok(vis() == WANT, t + f"a tap should show it, got {vis()!r}")
                rect = pg.evaluate("(() => { const r = document.getElementById('term-tip').getBoundingClientRect(); return [r.left, r.right, r.top, r.bottom, innerWidth, innerHeight]; })()")
                ok(rect[0] >= 0 and rect[1] <= rect[4] and rect[2] >= 0 and rect[3] <= rect[5], t + f"the bubble must stay on the screen, got {rect}")
                (pg.mouse.click(30, 700) if engine == 'firefox' else pg.touchscreen.tap(30, 700)); pg.wait_for_timeout(300)
                ok(vis() is None, t + "a tap elsewhere should close it")
                (term.click() if engine == 'firefox' else term.tap()); pg.wait_for_timeout(250)
                pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
                ok(vis() is None, t + "Escape should close it")
                if shots:
                    (term.click() if engine == 'firefox' else term.tap()); pg.wait_for_timeout(300)
                    pg.screenshot(path=str(shots / f"{engine}_term_phone.png"))
            # the first KPI symbol and the price panel use it too
            ok(pg.locator("#dashboard .kpi[data-k='cu'] .k-v .term").count() == 1 and pg.locator("#dashboard .p-price .sub .term").count() == 1, t + "the first key figure and the price panel need the control")
            ctx.close()

        # ---------------------------------------------------------------- 6: events and labels
        for name, w, h in (("desktop", 1400, 900), ("phone", 390, 844)):
            ctx = b.new_context(viewport={"width": w, "height": h}, reduced_motion="reduce")
            pg = ctx.new_page()
            for per in ("1y", "5y", "20y", "all"):
                open_dash(pg, f"?p={per}&c=usd&v=nominal&e=1")
                ov = pg.evaluate(OVERLAP_JS, "#dashboard .dchart svg, #dashboard .p-metals svg")
                ok(not ov, f"[{engine} events {name} {per}] labels touch: {ov}")
                n = pg.evaluate("document.querySelectorAll('#dashboard .p-price .evl').length")
                if per in ("20y", "all") and name == "desktop":
                    ok(n >= 3, f"[{engine} events {name} {per}] expected at least three event labels, found {n}")
                pg.evaluate("document.querySelector('#dashboard .p-price .xb').click()")
                pg.wait_for_timeout(500)
                ov = pg.evaluate(OVERLAP_JS, "#dlg svg")
                ok(not ov, f"[{engine} events dialog {name} {per}] labels touch: {ov}")
                labs = pg.evaluate("Array.from(document.querySelectorAll('#dlg .evl')).map(e => e.textContent)")
                if per == "all" and name == "desktop":
                    ok(len(labs) >= 3, f"[{engine} events dialog {per}] expected at least three labels in the expanded chart, got {labs}")
                pg.keyboard.press("Escape"); pg.wait_for_timeout(250)
            ctx.close()
        ok(not errs, f"[{engine}] script errors: {errs[:3]}")
        b.close()


engines = ["chromium", "webkit", "firefox"] if browser == "all" else [browser]
for eng in engines:
    print(f"--- {eng}", flush=True)
    run(eng)
    run_features(eng)
if problems:
    print(f"ROUND 6 TEST FAILED: {len(problems)} problem(s), {passed} checks passed")
    for x in problems[:80]:
        print("  -", x.encode("ascii", "replace").decode())
    sys.exit(1)
print(f"ROUND 6 TEST PASSED: {passed} checks, browser {browser}")
