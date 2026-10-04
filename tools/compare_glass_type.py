"""Round 4 acceptance pictures: the build next to the matching part of design_reference/glass-type-study.html, light and dark, 1400 and 400 px.
   python tools/compare_glass_type.py [--out DIR] [--widths 1400,400] [--schemes light,dark]
Needs the preview with the photo (python tools/build_preview.py --with-photo assets/patina-background.webp). The study has two kinds of tile: the proposed glass (header, filters, one chart panel) and the small-type
tile B (key figures, a table and a chart). Dashboard spots are paired with the proposed-glass tile, Story spots with tile B. Writes <spot>_<width>_<scheme>_{study,build,pair}.png.
Spots: dashboard top, dashboard row 2, dashboard donut hovered; Story opener, chapter 3, chapter 4 chart, chapter 7 chart, chapter 7 wires, summary trust box."""
import io
import sys
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
args = sys.argv[1:]
arg = lambda k, d: args[args.index(k) + 1] if k in args else d
OUT = Path(arg("--out", str(ROOT / "preview" / "r4" / "pairs"))); OUT.mkdir(parents=True, exist_ok=True)
WIDTHS = [int(x) for x in arg("--widths", "1400,400").split(",")]
SCHEMES = arg("--schemes", "light,dark").split(",")
prev = (ROOT / "preview" / "copper-market-preview.html").read_text(encoding="utf-8")
(ROOT / "preview" / "_shot.html").write_text('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' + prev, encoding="utf-8")
BUILD = (ROOT / "preview" / "_shot.html").as_uri()
STUDY = (ROOT / "design_reference" / "glass-type-study.html").as_uri()


def snap(pg):
    pg.wait_for_timeout(500)
    return Image.open(io.BytesIO(pg.screenshot())).convert("RGB")


def scroll_to(pg, sel, off=110):
    pg.evaluate("([s, o]) => { const e = document.querySelector(s); window.scrollTo(0, e.getBoundingClientRect().top + window.scrollY - o); }", [sel, off])
    pg.wait_for_timeout(700)


def pair(a, b, path):
    h = max(a.height, b.height)
    out = Image.new("RGB", (a.width + b.width + 12, h), (120, 120, 120))
    out.paste(a, (0, 0)); out.paste(b, (a.width + 12, 0))
    out.save(path)


with sync_playwright() as p:
    br = p.chromium.launch(channel="chrome")
    for w in WIDTHS:
        for sch in SCHEMES:
            tag = f"{w}_{sch}"
            ctx = br.new_context(viewport={"width": w, "height": 900 if w > 600 else 800}, color_scheme=sch, reduced_motion="reduce")
            pg = ctx.new_page()
            pg.goto(STUDY); pg.wait_for_timeout(1800)
            tk = "t-" + sch
            prop = pg.locator(f".tile.proposed.{tk}").first; prop.scroll_into_view_if_needed(); pg.wait_for_timeout(300)
            s_prop = Image.open(io.BytesIO(prop.screenshot())).convert("RGB")
            fb = pg.locator(f".tile.fb.{tk}").first; fb.scroll_into_view_if_needed(); pg.wait_for_timeout(300)
            s_fb = Image.open(io.BytesIO(fb.screenshot())).convert("RGB")
            pg.goto(BUILD + "#dashboard"); pg.reload(); pg.wait_for_selector("#dashboard .grid"); pg.wait_for_timeout(1800)
            shots = {"dash_top": (snap(pg), s_prop)}
            scroll_to(pg, "#dashboard .p-ratio", 130); shots["dash_row2"] = (snap(pg), s_prop)
            scroll_to(pg, "#dashboard .p-uses", 150)
            bb = pg.evaluate("(() => { const g = document.querySelectorAll('#dashboard .donut .slice')[1]; const r = g.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()")
            pg.mouse.move(bb[0], bb[1]); pg.wait_for_timeout(900)
            shots["dash_donut"] = (snap(pg), s_prop)
            pg.goto(BUILD + "#story"); pg.reload(); pg.wait_for_selector("#story .opener"); pg.wait_for_timeout(1800)
            shots["story_opener"] = (snap(pg), s_fb)
            for btn in pg.locator("button.linkbtn").all():
                try:
                    btn.click(timeout=1500)
                except Exception:
                    pass
            pg.wait_for_timeout(1200)
            scroll_to(pg, "#just-copper", 110); shots["story_ch3"] = (snap(pg), s_fb)
            scroll_to(pg, "#dollar .scatter, #dollar .chart-host", 160); shots["story_ch4_chart"] = (snap(pg), s_fb)
            scroll_to(pg, "#aluminium .chart-card", 120); shots["story_ch7_chart"] = (snap(pg), s_fb)
            scroll_to(pg, "#aluminium .wires", 260); shots["story_ch7_wires"] = (snap(pg), s_fb)
            scroll_to(pg, "#summary .btn", 420); shots["story_summary_trust"] = (snap(pg), s_fb)
            for nm, (bld, std) in shots.items():
                bld.save(OUT / f"{nm}_{tag}_build.png"); std.save(OUT / f"{nm}_{tag}_study.png"); pair(std, bld, OUT / f"{nm}_{tag}_pair.png")
            ctx.close()
    br.close()
print("done", OUT)
