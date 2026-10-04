"""Behaviour test for the Dashboard (Playwright): URL state, filter rules, the synced crosshair (pointer, keyboard, touch), no layout shift, events, the CSV download,
the sticky filter bar and reduced motion.   python tools/dashboard_test.py [--browser chromium|webkit|both] [--site docs]
Exit code 1 if anything fails."""
import re
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


def pressed(pg, group):
    return pg.evaluate("(g) => Array.from(document.querySelectorAll('#dashboard .dgroup')[g].querySelectorAll('.dseg')).filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.dataset.v)", group)


def open_dash(pg, q=""):
    pg.goto(url + "#dashboard" + q)
    pg.reload()
    pg.wait_for_selector("#dashboard .d2-grid")
    pg.wait_for_timeout(300)


def changed(pg, sel, before, timeout=8000):
    """The text of a readout once it differs from `before` (a software-rendered browser can take a few frames)."""
    try:
        pg.wait_for_function("([s, b]) => document.querySelector(s).textContent.trim() !== b", arg=[sel, before], timeout=timeout)
    except Exception:
        pass
    return pg.locator(sel).first.inner_text()


def visible_cross(pg):
    return pg.evaluate("Array.from(document.querySelectorAll('#dashboard .dchart .xh')).map(l => l.getAttribute('visibility') === 'visible')")


def run(engine):
    with sync_playwright() as p:
        b = p.chromium.launch(channel="chrome") if engine == "chromium" else p.webkit.launch()
        ctx = b.new_context(viewport={"width": 1280, "height": 900}, reduced_motion="reduce", accept_downloads=True)
        pg = ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        t = f"[{engine}] "

        # 1. defaults, and invalid values fall back
        pg.goto(url)
        pg.wait_for_selector("#dashboard .d2-grid")
        ok(pg.evaluate("location.hash") in ("", "#dashboard"), t + "an empty hash should open the dashboard")
        ok(pressed(pg, 0) == ["20y"] and pressed(pg, 1) == ["usd"] and pressed(pg, 2) == ["nominal"], t + f"default filters wrong: {pressed(pg, 0)} {pressed(pg, 1)} {pressed(pg, 2)}")
        open_dash(pg, "?p=zz&c=gbp&v=nope&e=9")
        ok(pressed(pg, 0) == ["20y"] and pressed(pg, 1) == ["usd"] and pressed(pg, 2) == ["nominal"], t + "invalid values should fall back to the defaults")
        open_dash(pg, "?p=5y&c=eur&v=real")
        ok(pressed(pg, 1) == ["eur"] and pressed(pg, 2) == ["nominal"], t + "euros with today's money should fall back to as quoted")
        ok(pg.evaluate("document.querySelector('#dashboard .dseg[data-v=real]').disabled"), t + "today's money should be disabled when euros are selected")
        ok("US inflation" in pg.locator("#dashboard .dnotes").inner_text(), t + "the euro note about US inflation is missing")

        # 2. clicking changes the URL and the page; a shared URL restores the view
        open_dash(pg)
        pg.click("#dashboard .dseg[data-v='5y']")
        pg.click("#dashboard .dseg[data-v='eur']")
        h = pg.evaluate("location.hash")
        ok("p=5y" in h and "c=eur" in h, t + f"the URL should carry the filters, got {h}")
        ok("5 years" in pg.locator('#dashboard .kpi[data-k="change"] .klabel').inner_text().lower(), t + "the change label should follow the period")
        pg.click("#dashboard .dseg[data-v='20y']")
        ok("Euro prices start in 1999." not in pg.locator("#dashboard .dnotes").inner_text(), t + "the euro-start note should not show for 20 years (2006 is after 1999)")
        pg.click("#dashboard .dseg[data-v='all']")
        ok("Euro prices start in 1999." in pg.locator("#dashboard .dnotes").inner_text(), t + "the euro-start note should show for the whole series in euros")
        open_dash(pg, "?p=1y&c=usd&v=real&e=1")
        ok(pressed(pg, 0) == ["1y"] and pressed(pg, 2) == ["real"], t + "a shared URL should restore the filters")
        ok(pg.evaluate("document.querySelector('#ev-toggle').checked"), t + "the events toggle should follow e=1")

        # 3. the synced crosshair by pointer
        open_dash(pg)
        h_before = pg.evaluate("document.documentElement.scrollHeight")
        box = pg.locator("#dashboard .dchart svg").first.bounding_box()
        pg.mouse.move(box["x"] + box["width"] * 0.6, box["y"] + box["height"] * 0.4)
        IDLE = "Hover over a chart, or press the arrow keys on one, to compare the same month across the line charts."
        changed(pg, "#dreadout", IDLE)
        v = visible_cross(pg)
        ok(all(v), t + f"the crosshair should show on all four charts, got {v}")
        ro = pg.locator("#dreadout").inner_text()
        ok(re.match(r"^[A-Z][a-z]+ \d{4}", ro) is not None and "Copper" in ro, t + f"the readout should name the month and show values, got {ro!r}")
        ok(pg.evaluate("document.documentElement.scrollHeight") == h_before, t + "showing the crosshair should not change the page height")
        pg.mouse.move(5, 5)
        pg.wait_for_timeout(200)
        ok(not any(visible_cross(pg)), t + "moving away should clear the crosshair")

        # 4. keyboard
        pg.locator("#dashboard .dchart svg").first.focus()
        pg.keyboard.press("ArrowLeft")
        r1 = changed(pg, "#dreadout", IDLE)
        pg.keyboard.press("ArrowLeft")
        r2 = changed(pg, "#dreadout", r1)
        ok(r1 != r2 and all(visible_cross(pg)), t + "arrow keys should move the crosshair on all charts")
        pg.keyboard.press("Shift+ArrowLeft")
        ok(changed(pg, "#dreadout", r2) != r2, t + "shift and arrow should move by a year")
        pg.keyboard.press("Escape")
        pg.wait_for_timeout(150)
        ok(not any(visible_cross(pg)), t + "escape should clear the crosshair")

        # 5. events
        open_dash(pg, "?p=20y&c=usd&v=nominal&e=1")
        n = pg.locator("#dashboard .dchart .evm").count()
        ok(n >= 2, t + f"events should show as numbered markers, got {n}")
        pg.locator("#dashboard .dchart .evm").first.focus()
        ok(pg.locator("#dashboard .chart-tip").first.is_visible(), t + "an event marker should show its tooltip on focus")
        open_dash(pg, "?p=20y&c=usd&v=nominal&e=0")
        ok(pg.locator("#dashboard .dchart .evm").count() == 0, t + "no event markers when the toggle is off")

        # 6. sticky filter bar
        open_dash(pg)
        pg.mouse.wheel(0, 1500)
        pg.wait_for_timeout(300)
        top = pg.evaluate("document.querySelector('#dashboard .d2-bar').getBoundingClientRect().top")
        ok(40 < top < 120, t + f"the filter bar should stay just below the nav bar when scrolled, top is {top}")

        # 7. CSV download of the current view
        open_dash(pg, "?p=1y&c=usd&v=nominal")
        with pg.expect_download() as dl:
            pg.click("text=Download this view (CSV)")
        text = Path(dl.value.path()).read_text(encoding="utf-8")
        lines = text.strip().split("\n")
        head = [x for x in lines if x.startswith("# ")]
        rows = [x for x in lines if not x.startswith("# ")]
        ok(len(head) >= 5 and any("CC BY 4.0" in x for x in head) and any("FRED" in x for x in head), t + "the CSV header should name the sources and licences")
        ok(len(rows) == 14, t + f"one year should give a header row and 13 months, got {len(rows)} rows")
        ok("LME" not in text.replace("No LME data.", ""), t + "the CSV must not mention LME data other than the no-LME line")

        # 8. reduced motion: charts are drawn at once
        ok(pg.evaluate("Array.from(document.querySelectorAll('#dashboard .reveal-rect')).every(r => +r.getAttribute('width') > 100)"), t + "with reduced motion every chart should be fully drawn")

        # 9. touch: a tap sets the month, a second tap clears it
        tctx = b.new_context(viewport={"width": 400, "height": 800}, has_touch=True, reduced_motion="reduce")
        tp = tctx.new_page()
        tp.on("pageerror", lambda e: errs.append(str(e)))
        tp.goto(url + "#dashboard")
        tp.reload()
        tp.wait_for_selector("#dashboard .d2-grid")
        tp.locator("#dashboard .dchart svg").first.scroll_into_view_if_needed()
        bx = tp.locator("#dashboard .dchart svg").first.bounding_box()
        tp.touchscreen.tap(bx["x"] + bx["width"] * 0.5, bx["y"] + bx["height"] * 0.5)
        tp.wait_for_timeout(250)
        ok(any(visible_cross(tp)), t + "a tap should set the crosshair")
        tp.touchscreen.tap(bx["x"] + bx["width"] * 0.3, bx["y"] + bx["height"] * 0.5)
        tp.wait_for_timeout(250)
        ok(not any(visible_cross(tp)), t + "a second tap should clear the crosshair")
        ok(not tp.evaluate("document.documentElement.scrollWidth > window.innerWidth"), t + "no sideways scroll at 400 px")
        tctx.close()

        pg.close()
        pg = ctx.new_page()
        pg.on("pageerror", lambda e: errs.append(str(e)))
        # 10. expandable charts: every panel opens a dialog by mouse and by keyboard, Esc and the backdrop close it, focus returns, the table has the data
        open_dash(pg)
        want = {"price": 21, "metals": 21, "ratio": 21, "dollar": 2, "supply": 8, "uses": 6}        # the default view is 20 years (August 2006 to 2026): 21 calendar years
        for key, n_rows in want.items():
            btn = pg.locator(f'#dashboard .p-{key} .d2-expand')
            ok(btn.get_attribute("aria-haspopup") == "dialog" and (btn.get_attribute("aria-label") or "").startswith("Expand: "), t + f"{key}: the Expand button needs aria-haspopup and an aria-label")
            btn.scroll_into_view_if_needed()
            btn.click()
            pg.wait_for_timeout(250)
            ok(pg.evaluate("document.querySelector('dialog.d2-dialog').open"), t + f"{key}: the dialog should open")
            ok(pg.evaluate("document.querySelector('dialog.d2-dialog').matches(':modal')"), t + f"{key}: the dialog should be modal (the page behind is inert)")
            ok(pg.locator("dialog.d2-dialog .dlg-title").inner_text().strip() != "" and pg.locator("dialog.d2-dialog .dlg-chart svg").count() >= 1, t + f"{key}: the dialog needs a title and a chart")
            pg.locator("dialog.d2-dialog .dlg-table summary").click()
            pg.wait_for_timeout(150)
            rows = pg.locator("dialog.d2-dialog .dlg-table tbody tr").count()
            ok(rows == n_rows, t + f"{key}: the table should have {n_rows} rows, it has {rows}")
            if key in ("price", "ratio"):
                cb = pg.locator("dialog.d2-dialog .dlg-chart svg").first.bounding_box()
                pg.mouse.move(cb["x"] + cb["width"] * 0.5, cb["y"] + cb["height"] * 0.45)
                ro = changed(pg, "dialog.d2-dialog .dlg-readout", IDLE)
                ok(re.match(r"^[A-Z][a-z]+ \d{4}", ro) is not None, t + f"{key}: hovering the expanded chart should update the dialog readout, got {ro!r}")
                pg.locator("dialog.d2-dialog .dlg-chart svg").first.focus()
                pg.keyboard.press("ArrowLeft")
                r1 = changed(pg, "dialog.d2-dialog .dlg-readout", ro)
                pg.keyboard.press("ArrowLeft")
                ok(changed(pg, "dialog.d2-dialog .dlg-readout", r1) != r1, t + f"{key}: arrow keys should move the crosshair in the expanded chart")
            pg.keyboard.press("Escape")
            pg.wait_for_timeout(200)
            ok(not pg.evaluate("document.querySelector('dialog.d2-dialog').open"), t + f"{key}: Escape should close the dialog")
            ok(pg.evaluate("document.activeElement && document.activeElement.classList.contains('d2-expand') && document.activeElement.closest('.p-%s') !== null" % key), t + f"{key}: focus should return to the Expand button")
            pg.keyboard.press("Enter")
            pg.wait_for_timeout(250)
            ok(pg.evaluate("document.querySelector('dialog.d2-dialog').open"), t + f"{key}: Enter on the Expand button should open the dialog")
            pg.mouse.click(3, 3)
            pg.wait_for_timeout(200)
            ok(not pg.evaluate("document.querySelector('dialog.d2-dialog').open"), t + f"{key}: a click on the backdrop should close the dialog")
            btn.click()
            pg.wait_for_timeout(200)
            pg.click("dialog.d2-dialog .dlg-close")
            pg.wait_for_timeout(200)
            ok(not pg.evaluate("document.querySelector('dialog.d2-dialog').open"), t + f"{key}: the Close button should close the dialog")
            text = pg.evaluate("document.querySelector('dialog.d2-dialog').textContent")
            ok(not re.search(r"\{\w+\}|undefined|NaN", text), t + f"{key}: the dialog text should have no unfilled placeholder")

        # 11. the donut: hover and focus on each slice set the centre and the lift; reduced motion removes the scale
        open_dash(pg)
        n = pg.locator("#dashboard .donut .dn-slice").count()
        ok(n == 6, t + f"the donut should have six slices, got {n}")
        ok(pg.evaluate("document.querySelector('#dashboard .donut').getAttribute('role') === 'group' && document.querySelector('#dashboard .donut').getAttribute('aria-label').split('%').length >= 7"), t + "the donut svg needs role group and an aria-label that lists all six shares")
        for i in range(6):
            g = pg.locator(f'#dashboard .donut .dn-slice[data-i="{i}"]')
            ok(g.get_attribute("role") == "img" and "%" in (g.get_attribute("aria-label") or "") and g.locator("title").count() == 1, t + f"slice {i}: role img, aria-label and title are needed")
            g.focus()
            pg.wait_for_function("(i) => { const g = document.querySelector('#dashboard .donut .dn-slice[data-i=\"' + i + '\"]'); return getComputedStyle(g).transform !== 'none' && Array.from(document.querySelectorAll('#dashboard .donut .dn-slice')).filter(e => +e.dataset.i !== i).every(e => +getComputedStyle(e).opacity < 0.7); }", arg=i, timeout=8000)
            big = pg.locator("#dashboard .donut .dn-c-big").text_content()
            name = " ".join(pg.locator("#dashboard .donut .dn-c-name").all_text_contents()).strip()
            lab = g.get_attribute("aria-label")
            ok(big in lab and name.split(" ")[0] in lab, t + f"slice {i}: the centre ({big!r}, {name!r}) should match {lab!r}")
            tr = pg.evaluate("(i) => getComputedStyle(document.querySelector('#dashboard .donut .dn-slice[data-i=\"' + i + '\"]')).transform", i)
            ok(tr not in ("none", ""), t + f"slice {i}: a focused slice should be lifted (transform), got {tr}")
            others = pg.evaluate("(i) => Array.from(document.querySelectorAll('#dashboard .donut .dn-slice')).filter(e => +e.dataset.i !== i).every(e => +getComputedStyle(e).opacity < 0.7)", i)
            ok(others, t + f"slice {i}: the other slices should fall to about 60 percent")
        pg.evaluate("document.activeElement.blur()")
        pg.wait_for_function("document.querySelector('#dashboard .donut .dn-c-big').textContent === '2024'", timeout=8000)
        ok(pg.locator("#dashboard .donut .dn-c-big").text_content() == "2024", t + "leaving the donut should restore the centre")
        rctx = b.new_context(viewport={"width": 1280, "height": 900}, reduced_motion="reduce")
        rp = rctx.new_page()
        rp.goto(url + "#dashboard")
        rp.reload()
        rp.wait_for_selector("#dashboard .d2-grid")
        rp.locator('#dashboard .donut .dn-slice[data-i="1"]').focus()
        rp.wait_for_timeout(300)
        m = rp.evaluate("getComputedStyle(document.querySelector('#dashboard .donut .dn-slice[data-i=\"1\"]')).transform")
        sc = float(re.findall(r"matrix\(([-\d.e]+),", m)[0]) if m.startswith("matrix") else 1.0
        ok(abs(sc - 1.0) < 0.001 and m != "none", t + f"with reduced motion the slice should lift without scaling, got {m}")
        rctx.close()

        # 12. no sideways scroll at 400 px, also with a dialog open
        pctx = b.new_context(viewport={"width": 400, "height": 800}, reduced_motion="reduce")
        pp = pctx.new_page()
        pp.goto(url + "#dashboard")
        pp.reload()
        pp.wait_for_selector("#dashboard .d2-grid")
        pp.wait_for_timeout(300)
        ok(not pp.evaluate("document.documentElement.scrollWidth > window.innerWidth"), t + "no sideways scroll at 400 px")
        for key in ("price", "metals", "dollar", "supply", "uses"):
            bt = pp.locator(f'#dashboard .p-{key} .d2-expand')
            bt.scroll_into_view_if_needed()
            bt.click()
            pp.wait_for_timeout(300)
            wide = pp.evaluate("document.documentElement.scrollWidth > window.innerWidth || (() => { const d = document.querySelector('dialog.d2-dialog'); return d.scrollWidth > d.clientWidth + 1; })()")
            dw = pp.evaluate("document.querySelector('dialog.d2-dialog').getBoundingClientRect().width")
            ok(not wide, t + f"{key}: no sideways scroll at 400 px with the dialog open")
            ok(abs(dw - 388) < 2, t + f"{key}: the dialog should be the full width minus 12 px on a phone, got {dw}")
            pp.keyboard.press("Escape")
            pp.wait_for_timeout(150)
        pctx.close()

        ok(not errs, t + f"script errors: {errs}")
        b.close()


for eng in (["chromium", "webkit"] if browser == "both" else [browser]):
    run(eng)
if problems:
    print(f"DASHBOARD TEST FAILED: {len(problems)} problem(s), {passed} checks passed")
    for x in problems:
        print("  -", x)
    sys.exit(1)
print(f"DASHBOARD TEST PASSED: {passed} checks, browser {browser}")
