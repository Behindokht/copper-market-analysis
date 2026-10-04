"""Load the built site in a headless browser and list text that should never be on screen: unfilled placeholders such as {kt}, "undefined", "NaN", "[object".
Used by tools/check_site.py (which picks a Python that has Playwright). Usage: python tools/rendered_text.py [site_dir]
Prints one JSON object: {"problems": [...], "chars": N}. Exit code 0 even when there are problems; check_site decides.
It opens the story, presses every "Skip to the answer" button so the guess chapters are built, then visits the appendix and the method page.
The text read is textContent, so closed folds and tables are included."""
import json, re, sys
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
site = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else ROOT / "docs"
url = (site / "index.html").as_uri()
BAD = [(re.compile(r"\{[A-Za-z_][\w ]*\}"), "unfilled placeholder"), (re.compile(r"undefined"), "undefined"), (re.compile(r"\bNaN\b"), "NaN"), (re.compile(r"\[object"), "[object")]

problems, total = [], 0
with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome")
    pg = b.new_page(viewport={"width": 1280, "height": 900}, reduced_motion="reduce")
    errs = []
    pg.on("pageerror", lambda e: errs.append("script error: " + str(e)))
    for view in ("dashboard", "dashboard?p=1y&c=eur&v=nominal&e=1", "dashboard?p=all&c=usd&v=real", "story", "quality", "method"):
        base = view.split("?")[0]
        pg.goto(url + "#" + view)
        pg.wait_for_selector("#story .hero" if base == "story" else ("#dashboard .dgrid" if base == "dashboard" else "#" + base + " .wrap"), timeout=15000)
        pg.wait_for_timeout(500)
        if base == "dashboard":
            box = pg.locator("#dashboard .dchart svg").first.bounding_box()
            pg.mouse.move(box["x"] + box["width"] * 0.6, box["y"] + box["height"] * 0.5)
            pg.wait_for_timeout(300)
        if base == "story":
            for btn in pg.locator("button.linkbtn").all():
                try:
                    btn.click(timeout=2000)
                except Exception:
                    pass
            pg.wait_for_timeout(500)
        text = pg.evaluate("document.getElementById('%s').textContent" % base)
        total += len(text)
        for rx, name in BAD:
            for m in rx.finditer(text):
                problems.append("%s view: %s near: ...%s..." % (view, name, re.sub(r"\s+", " ", text[max(0, m.start() - 50): m.end() + 50])))
    problems += errs
    b.close()
print(json.dumps({"problems": problems, "chars": total}))
