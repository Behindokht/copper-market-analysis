"""Behaviour test for the Dashboard and the Story (Playwright): URL state, filter rules, panel chrome, the synced crosshair (pointer, keyboard, touch) and the per-panel readouts, events,
the CSV download, the expand dialogs (mouse and keyboard, Esc, backdrop, focus return, tables), the 3D donut (hover, focus, reduced motion), equal row-2 panels, no sideways scroll at 400 px
(also with a dialog open), and the story's structure (one header, light glass sheets, bridges, one drivers block, a closing panel of its own words, the patina photo as the only photo).
   python tools/dashboard_test.py [--browser chromium|webkit|both] [--site docs]
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


def changed(pg, sel, before, timeout=8000):
    """The text of a readout once it differs from `before` (a software-rendered browser can take a few frames)."""
    try:
        pg.wait_for_function("([s, b]) => document.querySelector(s).textContent.trim() !== b", arg=[sel, before], timeout=timeout)
    except Exception:
        pass
    return pg.locator(sel).first.inner_text().strip()


def pressed(pg, group):
    return pg.evaluate("(g) => Array.from(document.querySelectorAll('#dashboard .filters .fg')[g].querySelectorAll('button')).filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.dataset.v)", group)


def open_dash(pg, q=""):
    pg.goto(url + "#dashboard" + q)
    pg.reload()
    pg.wait_for_selector("#dashboard .grid")
    pg.wait_for_timeout(300)


def crosses(pg):
    return pg.evaluate("Array.from(document.querySelectorAll('#dashboard .dchart .xh, #dashboard .sm line[visibility]')).map(l => l.getAttribute('visibility') === 'visible')")


def run(engine):
    with sync_playwright() as p:
        b = p.chromium.launch(channel="chrome") if engine == "chromium" else p.webkit.launch()
        ctx = b.new_context(viewport={"width": 1400, "height": 900}, reduced_motion="reduce", accept_downloads=True)
        pg = ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        t = f"[{engine}] "

        if "--progress" in args: print("section 1", flush=True)
        # 1. defaults, invalid values, the euro rule
        pg.goto(url)
        pg.wait_for_selector("#dashboard .grid")
        ok(pg.evaluate("location.hash") in ("", "#dashboard"), t + "an empty hash should open the dashboard")
        ok(pressed(pg, 0) == ["20y"] and pressed(pg, 1) == ["usd"] and pressed(pg, 2) == ["nominal"], t + f"default filters wrong: {pressed(pg, 0)} {pressed(pg, 1)} {pressed(pg, 2)}")
        ok(pg.evaluate("document.querySelector('#ev-toggle').checked"), t + "events should be on by default, as in the study")
        open_dash(pg, "?p=zz&c=gbp&v=nope&e=9")
        ok(pressed(pg, 0) == ["20y"] and pressed(pg, 1) == ["usd"] and pressed(pg, 2) == ["nominal"], t + "invalid values should fall back to the defaults")
        open_dash(pg, "?p=5y&c=eur&v=real")
        ok(pressed(pg, 1) == ["eur"] and pressed(pg, 2) == ["nominal"], t + "euros with today's money should fall back to as quoted")
        ok(pg.evaluate("document.querySelector('#dashboard .filters button[data-v=real]').disabled"), t + "today's money should be disabled when euros are selected")
        ok("Today's money is shown in dollars only." in pg.locator("#dsub-price").inner_text(), t + "the price subtitle should say that today's money is dollars only when euros are selected")

        if "--progress" in args: print("section 2", flush=True)
        # 2. the page as the study has it
        open_dash(pg)
        ok(pg.locator("#topbar").count() == 1 and pg.locator("header").count() == 1, t + "there should be one header for the whole site")
        st = re.sub(r"\s+", " ", pg.locator("#status").inner_text())
        ok(re.match(r"^Data through \w{3} \d{4} . \d+ checks passed . \d+ failures . \d+ warnings$", st.strip()) is not None, t + f"the status line is wrong: {st!r}")
        ok(pg.locator("#dashboard .kpi").count() == 5, t + "the key figures should be five items")
        txt = pg.locator("#dashboard").inner_text()
        ok("Hover over a chart" not in txt and "Data health" not in txt and "known issues" not in txt, t + "the hint sentence, the health tile and the bottom strip should be gone")
        ok(pg.locator("#dashboard .head .filters").count() == 1 and pg.locator("#dashboard .head h1").count() == 1, t + "the headline and the filters should share one plate")
        for key in ("price", "metals", "ratio", "dollar", "supply", "uses"):
            sel = f"#dashboard .p-{key}"
            btn = pg.locator(sel + " .xb")
            ok(btn.inner_text().strip() == "Expand", t + f"{key}: the button should read Expand in sentence case, got {btn.inner_text()!r}")
            ok(btn.get_attribute("aria-haspopup") == "dialog" and (btn.get_attribute("aria-label") or "").startswith("Expand: "), t + f"{key}: the Expand button needs aria-haspopup and an aria-label")
            ok(pg.locator(sel + " .pf a").count() == 1 and pg.locator(sel + " .pf a").inner_text().startswith("Why? Chapter"), t + f"{key}: the footer row needs one Why link")
            ok(pg.locator(sel + " details").count() == 0 and pg.locator(sel + " .chipx").count() == 0, t + f"{key}: no table fold and no source chip on the panel face")
        ok(pg.locator("#dp-price").inner_text() == "Copper price, as quoted", t + "the price title should follow the filter")
        pg.click("#dashboard .filters button[data-v=real]")
        ok(pg.locator("#dp-price").inner_text() == "Copper price, in today's money", t + "the price title should say today's money after the filter")
        open_dash(pg)

        if "--progress" in args: print("section 3", flush=True)
        # 3. the price and ratio charts: the top tick, the labels
        tick_vals = pg.evaluate("Array.from(document.querySelectorAll('#dashboard .p-price svg text.ax')).map(e => e.textContent.replace(/,/g, '')).filter(x => /^\\d+$/.test(x)).map(Number)")
        ok(max(tick_vals) >= 14326 and max(tick_vals) == 15000, t + f"the top tick should be 15,000, above the record, got {tick_vals}")
        inside = pg.evaluate("(() => { const s = document.querySelector('#dashboard .p-price .dchart svg').getBoundingClientRect(); return Array.from(document.querySelectorAll('#dashboard .p-price .dchart svg .dlabel')).every(e => { const r = e.getBoundingClientRect(); return r.left >= s.left - 1 && r.right <= s.right + 1 && r.top >= s.top - 1 && r.bottom <= s.bottom + 1; }); })()")
        ok(inside, t + "the record label must stay inside the plot")
        rt = pg.evaluate("Array.from(document.querySelectorAll('#dashboard .p-ratio svg text')).map(e => e.textContent)")
        ok("4.41×" in rt and "12-month average" in rt and any(x == "3×" for x in rt), t + f"the ratio chart needs the latest value with its unit, the line label and tick units, got {rt[:12]}")
        ok("4.41×" in pg.locator('#dashboard .kpi[data-k="ratio"] .k-v').inner_text(), t + "the key figure and the chart must agree on 4.41")

        if "--progress" in args: print("section 4", flush=True)
        # 4. row 2: equal panels, content from the top
        hs = pg.evaluate("['ratio', 'dollar', 'supply'].map(k => Math.round(document.querySelector('#dashboard .p-' + k).getBoundingClientRect().height))")
        ok(max(hs) - min(hs) <= 1, t + f"the three row-2 panels should have the same height, got {hs}")
        gaps = pg.evaluate("['ratio', 'dollar', 'supply'].map(k => { const el = document.querySelector('#dashboard .p-' + k); const h = el.querySelector('.d2-host'), pf = el.querySelector('.pf'); return Math.round(pf.offsetTop - (h.offsetTop + h.offsetHeight)); })")
        ok(max(gaps) <= 16, t + f"no stretched empty space inside the shorter row-2 panel, gaps {gaps}")

        if "--progress" in args: print("section 5", flush=True)
        # 5. clicking changes the URL and the page
        pg.click("#dashboard .filters button[data-v='5y']")
        pg.click("#dashboard .filters button[data-v='eur']")
        h = pg.evaluate("location.hash")
        ok("p=5y" in h and "c=eur" in h, t + f"the URL should carry the filters, got {h}")
        ok("since" in pg.locator("#dsub-price").inner_text(), t + "the price subtitle should give the change since the start of the period")
        pg.click("#dashboard .filters button[data-v='all']")
        ok("Euro prices start in 1999." in pg.locator("#dsub-price").inner_text(), t + "the euro-start note should show for the whole series in euros")
        open_dash(pg, "?p=1y&c=usd&v=real&e=0")
        ok(pressed(pg, 0) == ["1y"] and pressed(pg, 2) == ["real"], t + "a shared URL should restore the filters")
        ok(pg.locator("#dashboard .dchart .evm").count() == 0, t + "no event markers when the toggle is off")

        if "--progress" in args: print("section 6", flush=True)
        # 6. the synced crosshair and the per-panel readouts
        open_dash(pg)
        h_before = pg.evaluate("document.documentElement.scrollHeight")
        r0 = pg.locator("#ro-price").inner_text().strip()
        ok(r0.startswith("Aug 2026") and "$14,326" in r0, t + f"at rest the price readout shows the latest month, got {r0!r}")
        box = pg.locator("#dashboard .p-price .dchart svg").first.bounding_box()
        pg.mouse.move(box["x"] + box["width"] * 0.6, box["y"] + box["height"] * 0.4)
        r1 = changed(pg, "#ro-price", r0)
        ok(r1 != r0 and re.match(r"^\w{3} \d{4} ", r1) is not None, t + f"hovering the price chart should change its readout, got {r1!r}")
        ok(changed(pg, "#ro-ratio", pg.locator("#ro-ratio").inner_text().strip()).endswith("×") and "Aug 2026" not in pg.locator("#ro-ratio").inner_text(), t + "the ratio readout should follow the same month")
        c = crosses(pg)
        ok(len(c) >= 7 and all(c), t + f"the crosshair should show on the price chart, the ratio chart and the five metal rows, got {c}")
        ok(pg.evaluate("document.documentElement.scrollHeight") == h_before, t + "showing the crosshair should not change the page height")
        pg.mouse.move(5, 5)
        try:
            pg.wait_for_function("document.querySelector('#ro-price').textContent.trim().startsWith('Aug 2026')", timeout=8000)
        except Exception:
            pass
        ok(pg.locator("#ro-price").inner_text().strip().startswith("Aug 2026") and not any(crosses(pg)), t + "moving away should clear the crosshair and show the latest month again")
        pg.locator("#dashboard .p-price .dchart svg").first.focus()
        pg.keyboard.press("ArrowLeft")
        k1 = changed(pg, "#ro-price", r0)
        pg.keyboard.press("ArrowLeft")
        k2 = changed(pg, "#ro-price", k1)
        ok(k1 != r0 and k2 != k1 and all(crosses(pg)), t + "arrow keys should move the crosshair on all charts and change the readout")
        pg.keyboard.press("Shift+ArrowLeft")
        ok(changed(pg, "#ro-price", k2) != k2, t + "shift and arrow should move by a year")
        pg.keyboard.press("Escape")
        try:
            pg.wait_for_function("document.querySelector('#ro-price').textContent.trim().startsWith('Aug 2026')", timeout=8000)
        except Exception:
            pass
        ok(pg.locator("#ro-price").inner_text().strip().startswith("Aug 2026") and not any(crosses(pg)), t + "escape should clear the crosshair")

        if "--progress" in args: print("section 7", flush=True)
        # 7. events
        open_dash(pg, "?p=20y&c=usd&v=nominal&e=1")
        n = pg.locator("#dashboard .dchart .evm").count()
        labs = pg.evaluate("Array.from(document.querySelectorAll('#dashboard .p-price .dchart .evl')).map(e => e.textContent)")
        ok(n >= 2 and len(labs) == n and not any(re.fullmatch(r"\d+", x) for x in labs), t + f"events should show as short text labels, not numbers, got {labs}")
        ok("New record" not in " ".join(pg.evaluate("Array.from(document.querySelectorAll('#dashboard .p-price svg text')).map(e => e.textContent)")), t + "the August 2026 new-record event must not be drawn on the chart")
        pg.locator("#dashboard .dchart .evm").first.focus()
        ok(pg.locator("#dashboard .chart-tip").first.is_visible(), t + "an event marker should show its tooltip on focus")

        if "--progress" in args: print("section 8", flush=True)
        # 8. the header stays, the slim footer is there with the CSV
        open_dash(pg)
        pg.mouse.wheel(0, 1500)
        pg.wait_for_timeout(300)
        top = pg.evaluate("document.getElementById('topbar').getBoundingClientRect().top")
        ok(0 <= top <= 14, t + f"the header should stay at the top when scrolled, top is {top}")
        ok(pg.locator("footer.foot.smoke").count() == 1 and pg.evaluate("document.getElementById('footer').getBoundingClientRect().height") < 140, t + "the footer should be one slim smoked bar")
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

        if "--progress" in args: print("section 9", flush=True)
        # 9. touch: a tap sets the month, a second tap clears it
        pg.close()
        pg = ctx.new_page()
        pg.on("pageerror", lambda e: errs.append(str(e)))
        tctx = b.new_context(viewport={"width": 400, "height": 800}, has_touch=True, reduced_motion="reduce")
        tp = tctx.new_page()
        tp.on("pageerror", lambda e: errs.append(str(e)))
        tp.goto(url + "#dashboard")
        tp.reload()
        tp.wait_for_selector("#dashboard .grid")
        tp.locator("#dashboard .p-price .dchart svg").first.scroll_into_view_if_needed()
        bx = tp.locator("#dashboard .p-price .dchart svg").first.bounding_box()
        tp.touchscreen.tap(bx["x"] + bx["width"] * 0.5, bx["y"] + bx["height"] * 0.5)
        tp.wait_for_timeout(300)
        ok(any(crosses(tp)), t + "a tap should set the crosshair")
        tp.touchscreen.tap(bx["x"] + bx["width"] * 0.3, bx["y"] + bx["height"] * 0.5)
        tp.wait_for_timeout(300)
        ok(not any(crosses(tp)), t + "a second tap should clear the crosshair")
        ok(not tp.evaluate("document.documentElement.scrollWidth > window.innerWidth"), t + "no sideways scroll at 400 px")
        tctx.close()

        if "--progress" in args: print("section 10", flush=True)
        # 10. expandable charts
        open_dash(pg)
        want = {"price": 21, "metals": 21, "ratio": 21, "dollar": 2, "supply": 8, "uses": 6}        # the default view is 20 years (August 2006 to 2026): 21 calendar years
        for key, n_rows in want.items():
            btn = pg.locator(f"#dashboard .p-{key} .xb")
            btn.scroll_into_view_if_needed()
            btn.click()
            pg.wait_for_timeout(250)
            ok(pg.evaluate("document.getElementById('dlg').open"), t + f"{key}: the dialog should open")
            ok(pg.evaluate("document.getElementById('dlg').matches(':modal')"), t + f"{key}: the dialog should be modal (the page behind is inert)")
            ok(pg.locator("#dlg h2").inner_text().strip() != "" and pg.locator("#dlg-b svg").count() >= 1, t + f"{key}: the dialog needs a title and a chart")
            ok(pg.locator("#dlg .sub").inner_text().strip() != "" and pg.locator("#dlg .pf").inner_text().strip() != "", t + f"{key}: the dialog needs a subtitle and the full source line")
            pg.locator("#dlg-d summary").click()
            pg.wait_for_timeout(150)
            rows = pg.locator("#dlg-d tbody tr").count()
            ok(rows == n_rows, t + f"{key}: the table should have {n_rows} rows, it has {rows}")
            if key in ("price", "ratio"):
                cb = pg.locator("#dlg-b svg").first.bounding_box()
                before = pg.locator("#x-ro").inner_text().strip()
                pg.mouse.move(cb["x"] + cb["width"] * 0.5, cb["y"] + cb["height"] * 0.45)
                ro = changed(pg, "#x-ro", before)
                ok(ro != before and re.match(r"^\w{3} \d{4}", ro) is not None, t + f"{key}: hovering the expanded chart should update the dialog readout, got {ro!r}")
                pg.locator("#dlg-b svg").first.focus()
                pg.keyboard.press("ArrowLeft")
                r1 = changed(pg, "#x-ro", ro)
                pg.keyboard.press("ArrowLeft")
                ok(changed(pg, "#x-ro", r1) != r1, t + f"{key}: arrow keys should move the crosshair in the expanded chart")
            pg.keyboard.press("Escape")
            pg.wait_for_timeout(200)
            ok(not pg.evaluate("document.getElementById('dlg').open"), t + f"{key}: Escape should close the dialog")
            ok(pg.evaluate("document.activeElement && document.activeElement.classList.contains('xb') && document.activeElement.closest('.p-%s') !== null" % key), t + f"{key}: focus should return to the Expand button")
            pg.keyboard.press("Enter")
            pg.wait_for_timeout(250)
            ok(pg.evaluate("document.getElementById('dlg').open"), t + f"{key}: Enter on the Expand button should open the dialog")
            pg.mouse.click(3, 3)
            pg.wait_for_timeout(200)
            ok(not pg.evaluate("document.getElementById('dlg').open"), t + f"{key}: a click on the backdrop should close the dialog")
            btn.click()
            pg.wait_for_timeout(200)
            pg.click("#dlg-x")
            pg.wait_for_timeout(200)
            ok(not pg.evaluate("document.getElementById('dlg').open"), t + f"{key}: the Close button should close the dialog")
            ok(not re.search(r"\{\w+\}|undefined|NaN", pg.evaluate("document.getElementById('dlg').textContent")), t + f"{key}: the dialog text should have no unfilled placeholder")

        if "--progress" in args: print("section 11", flush=True)
        # 11. the donut: hover and focus on each slice set the centre and the lift; reduced motion removes the scale
        open_dash(pg)
        ok(pg.locator("#dashboard .donut .slice").count() == 6, t + "the donut should have six slices")
        ok(pg.evaluate("document.querySelector('#dashboard .donut').getAttribute('role') === 'group' && document.querySelector('#dashboard .donut').getAttribute('aria-label').split('%').length >= 7"), t + "the donut svg needs role group and an aria-label that lists all six shares")
        ok(pg.locator("#dashboard .p-uses").inner_text().count("Source S31") == 0, t + "no 'Source S31' under the facts")
        for i in range(6):
            g = pg.locator(f'#dashboard .donut .slice[data-i="{i}"]')
            ok(g.get_attribute("role") == "img" and "%" in (g.get_attribute("aria-label") or "") and g.locator("title").count() == 1, t + f"slice {i}: role img, aria-label and title are needed")
            g.focus()
            pg.wait_for_function("(i) => { const g = document.querySelector('#dashboard .donut .slice[data-i=\"' + i + '\"]'); return getComputedStyle(g).transform !== 'none' && Array.from(document.querySelectorAll('#dashboard .donut .slice')).filter(e => +e.dataset.i !== i).every(e => +getComputedStyle(e).opacity < 0.7); }", arg=i, timeout=8000)
            big = pg.locator("#dashboard .donut .dn-c-big").text_content()
            name = " ".join(pg.locator("#dashboard .donut .dn-c-name").all_text_contents()).strip()
            lab = g.get_attribute("aria-label")
            ok(big in lab and name.split(" ")[0] in lab, t + f"slice {i}: the centre ({big!r}, {name!r}) should match {lab!r}")
        pg.evaluate("document.activeElement.blur()")
        pg.wait_for_function("document.querySelector('#dashboard .donut .dn-c-big').textContent === '2024'", timeout=8000)
        rctx = b.new_context(viewport={"width": 1400, "height": 900}, reduced_motion="reduce")
        rp = rctx.new_page()
        rp.goto(url + "#dashboard")
        rp.reload()
        rp.wait_for_selector("#dashboard .grid")
        rp.locator('#dashboard .donut .slice[data-i="1"]').focus()
        rp.wait_for_timeout(300)
        m = rp.evaluate("getComputedStyle(document.querySelector('#dashboard .donut .slice[data-i=\"1\"]')).transform")
        sc = float(re.findall(r"matrix\(([-\d.e]+),", m)[0]) if m.startswith("matrix") else 1.0
        ok(abs(sc - 1.0) < 0.001 and m != "none", t + f"with reduced motion the slice should lift without scaling, got {m}")
        rctx.close()

        if "--progress" in args: print("section 12", flush=True)
        # 12. no sideways scroll at 400 px, also with a dialog open
        pctx = b.new_context(viewport={"width": 400, "height": 800}, reduced_motion="reduce")
        pp = pctx.new_page()
        pp.goto(url + "#dashboard")
        pp.reload()
        pp.wait_for_selector("#dashboard .grid")
        pp.wait_for_timeout(300)
        ok(not pp.evaluate("document.documentElement.scrollWidth > window.innerWidth"), t + "no sideways scroll at 400 px")
        for key in ("price", "metals", "dollar", "supply", "uses"):
            bt = pp.locator(f"#dashboard .p-{key} .xb")
            bt.scroll_into_view_if_needed()
            bt.click()
            pp.wait_for_timeout(300)
            wide = pp.evaluate("document.documentElement.scrollWidth > window.innerWidth || (() => { const d = document.getElementById('dlg'); return d.scrollWidth > d.clientWidth + 1; })()")
            dw = pp.evaluate("document.getElementById('dlg').getBoundingClientRect().width")
            ok(not wide, t + f"{key}: no sideways scroll at 400 px with the dialog open")
            ok(abs(dw - 388) < 2, t + f"{key}: the dialog should be the full width minus 12 px on a phone, got {dw}")
            pp.keyboard.press("Escape")
            pp.wait_for_timeout(150)
        pctx.close()

        if "--progress" in args: print("section 13", flush=True)
        # 13. the story
        sctx = b.new_context(viewport={"width": 1400, "height": 900}, reduced_motion="reduce")
        sp = sctx.new_page()
        sp.on("pageerror", lambda e: errs.append(str(e)))
        reqs = []
        sp.on("request", lambda r: reqs.append(r.url))
        sp.goto(url + "#story")
        sp.reload()
        sp.wait_for_selector("#story .opener")
        sp.wait_for_timeout(600)
        ok(sp.locator("header").count() == 1 and sp.locator("#subnav a").count() == 8 and not sp.evaluate("document.getElementById('subnav').hidden"), t + "the story shows the chapter links inside the one header")
        ok(sp.locator("#story section.sheet.glass.chapter").count() == 8, t + "eight chapters should be light glass sheets")
        ok(sp.locator("#story .opener .smoke").count() == 2 and sp.locator("#story .closing.smoke").count() == 1, t + "the opener and the closing panel should be smoked glass")
        ok(sp.locator("#story .bridge.smoke").count() >= 5, t + "bridge sentences should sit on smoked glass between chapters")
        ok(sp.locator("#story .drivers .drv").count() == 6 and sp.locator("#story .drv-head").count() == 1, t + "the drivers block appears once, with six items")
        ok("Chapter" in sp.locator("#uses .ch").inner_text() or "CHAPTER" in sp.locator("#uses .ch").inner_text().upper(), t + "the chapter label should sit inside the sheet")
        ok(sp.evaluate("Array.from(document.querySelectorAll('#story .sheet .card')).every(c => parseFloat(getComputedStyle(c).borderLeftWidth) === 0 && parseFloat(getComputedStyle(c).borderRightWidth) === 0)"), t + "no bordered boxes inside a chapter sheet")
        ok(sp.locator("#uses .donut .slice").count() == 6 and sp.locator("#uses .bars").count() == 0, t + "chapter 1 uses the donut, not the bar list")
        ok(sp.locator("#aluminium .wires svg circle").count() >= 10, t + "chapter 7 shows the wire cross-sections")
        ok(sp.locator("#story .hero").count() == 0, t + "no photo opener of the old kind")
        ok(not any("copper-plate" in u for u in reqs), t + "the copper plate photo must not be loaded")
        close_txt = sp.locator("#story .closing p").inner_text()
        summ_txt = sp.locator("#summary .answer").inner_text()
        ok(close_txt.strip() != "" and close_txt.strip() != summ_txt.strip() and len(close_txt) < len(summ_txt), t + "the closing panel must not repeat the summary paragraph")
        ok(sp.locator("#summary .found li a").count() == 7 and sp.locator("#summary .found .chipx").count() == 0, t + "the summary list has one link per line and no Source link")
        story_txt = sp.locator("#story").inner_text()
        ok("Not covered" not in story_txt and "thousand tonnes" not in story_txt.lower(), t + "no 'not covered' and no 'thousand tonnes' in the story")
        ok(sp.locator("#aluminium").inner_text().count("Where aluminium already") == 1, t + "chapter 7 has one 'Where aluminium already wins' section")
        sctx.close()

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
