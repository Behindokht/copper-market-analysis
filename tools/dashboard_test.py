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
    pg.wait_for_selector("#dashboard .dgrid")
    pg.wait_for_timeout(300)


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
        pg.wait_for_selector("#dashboard .dgrid")
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
        pg.wait_for_timeout(250)
        v = visible_cross(pg)
        ok(all(v), t + f"the crosshair should show on all four charts, got {v}")
        ro = pg.locator("#dashreadout, #dreadout").first.inner_text()
        ok(re.match(r"^[A-Z][a-z]+ \d{4}", ro) is not None and "Copper" in ro, t + f"the readout should name the month and show values, got {ro!r}")
        ok(pg.evaluate("document.documentElement.scrollHeight") == h_before, t + "showing the crosshair should not change the page height")
        pg.mouse.move(5, 5)
        pg.wait_for_timeout(200)
        ok(not any(visible_cross(pg)), t + "moving away should clear the crosshair")

        # 4. keyboard
        pg.locator("#dashboard .dchart svg").first.focus()
        pg.keyboard.press("ArrowLeft")
        pg.wait_for_timeout(150)
        r1 = pg.locator("#dreadout").inner_text()
        pg.keyboard.press("ArrowLeft")
        pg.wait_for_timeout(150)
        r2 = pg.locator("#dreadout").inner_text()
        ok(r1 != r2 and all(visible_cross(pg)), t + "arrow keys should move the crosshair on all charts")
        pg.keyboard.press("Shift+ArrowLeft")
        pg.wait_for_timeout(150)
        ok(pg.locator("#dreadout").inner_text() != r2, t + "shift and arrow should move by a year")
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
        top = pg.evaluate("document.querySelector('#dashboard .dashbar').getBoundingClientRect().top")
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
        tp.wait_for_selector("#dashboard .dgrid")
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
