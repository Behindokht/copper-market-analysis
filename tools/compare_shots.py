"""Screenshots of the studies (design_reference/dashboard-study.html and story-study.html) and of the build at the same widths and colour schemes, at the same spots, side by side.
   python tools/compare_shots.py [--out DIR] [--widths 1400,400] [--schemes light,dark] [--engine chromium|webkit]
Needs the single-file preview (python tools/build_preview.py --with-photo assets/patina-background.webp) so that the build shows the background photo; the photo is local only.
Spots: dashboard top, dashboard row 2, dashboard donut hovered; story opener, chapter 1, a bridge, chapter 7 wires, closing. Writes pairs: <spot>_<width>_<scheme>_{study,build,pair}.png"""
import io
import sys
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
args = sys.argv[1:]
arg = lambda k, d: args[args.index(k) + 1] if k in args else d
OUT = Path(arg("--out", str(ROOT / "preview" / "compare"))); OUT.mkdir(parents=True, exist_ok=True)
WIDTHS = [int(x) for x in arg("--widths", "1400,400").split(",")]
SCHEMES = arg("--schemes", "light,dark").split(",")
ENGINE = arg("--engine", "chromium")
prev = (ROOT / "preview" / "copper-market-preview.html").read_text(encoding="utf-8")
(ROOT / "preview" / "_shot.html").write_text('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' + prev, encoding="utf-8")
BUILD = (ROOT / "preview" / "_shot.html").as_uri()
DSTUDY = (ROOT / "design_reference" / "dashboard-study.html").as_uri()
SSTUDY = (ROOT / "design_reference" / "story-study.html").as_uri()


def settle(pg, ms=1600):
    pg.wait_for_timeout(ms)


def shot(pg, path, clip_sel=None):
    if clip_sel:
        pg.locator(clip_sel).first.scroll_into_view_if_needed()
    pg.wait_for_timeout(500)
    return Image.open(io.BytesIO(pg.screenshot(path=str(path)))).convert("RGB")


def scroll_to(pg, sel, offset=110):
    pg.evaluate("([s, o]) => { const e = document.querySelector(s); window.scrollTo(0, e.getBoundingClientRect().top + window.scrollY - o); }", [sel, offset])
    pg.wait_for_timeout(700)


def pair(a, b, path):
    h = max(a.height, b.height)
    out = Image.new("RGB", (a.width + b.width + 12, h), (120, 120, 120))
    out.paste(a, (0, 0)); out.paste(b, (a.width + 12, 0))
    out.save(path)


with sync_playwright() as p:
    br = p.chromium.launch(channel="chrome") if ENGINE == "chromium" else p.webkit.launch()
    for w in WIDTHS:
        for sch in SCHEMES:
            tag = f"{w}_{sch}"
            hgt = 900 if w > 600 else 800
            ctx = br.new_context(viewport={"width": w, "height": hgt}, color_scheme=sch, reduced_motion="reduce")
            pg = ctx.new_page()
            # ---- dashboard: study
            pg.goto(DSTUDY); settle(pg)
            s_top = shot(pg, OUT / f"dash_top_{tag}_study.png")
            scroll_to(pg, "#c-ratio", 130); s_row2 = shot(pg, OUT / f"dash_row2_{tag}_study.png")
            scroll_to(pg, "#c-use", 150)
            bb = pg.evaluate("(() => { const g = document.querySelectorAll('#c-use .slice')[1]; const r = g.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()")
            pg.mouse.move(bb[0], bb[1]); pg.wait_for_timeout(900)
            s_don = shot(pg, OUT / f"dash_donut_{tag}_study.png")
            # ---- dashboard: build
            pg.goto(BUILD + "#dashboard"); pg.reload(); pg.wait_for_selector("#dashboard .grid"); settle(pg)
            b_top = shot(pg, OUT / f"dash_top_{tag}_build.png")
            scroll_to(pg, "#dashboard .p-ratio", 130); b_row2 = shot(pg, OUT / f"dash_row2_{tag}_build.png")
            scroll_to(pg, "#dashboard .p-uses", 150)
            bb = pg.evaluate("(() => { const g = document.querySelectorAll('#dashboard .donut .slice')[1]; const r = g.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()")
            pg.mouse.move(bb[0], bb[1]); pg.wait_for_timeout(900)
            b_don = shot(pg, OUT / f"dash_donut_{tag}_build.png")
            for nm, a, b in (("dash_top", s_top, b_top), ("dash_row2", s_row2, b_row2), ("dash_donut", s_don, b_don)):
                pair(a, b, OUT / f"{nm}_{tag}_pair.png")
            # ---- story: study
            pg.goto(SSTUDY); settle(pg)
            sp = {}
            sp["story_opener"] = shot(pg, OUT / f"story_opener_{tag}_study.png")
            scroll_to(pg, "#c1", 110); sp["story_ch1"] = shot(pg, OUT / f"story_ch1_{tag}_study.png")
            scroll_to(pg, ".bridge", 300); sp["story_bridge"] = shot(pg, OUT / f"story_bridge_{tag}_study.png")
            scroll_to(pg, "#c-wire", 260); sp["story_wires"] = shot(pg, OUT / f"story_wires_{tag}_study.png")
            scroll_to(pg, ".closing", 300); sp["story_closing"] = shot(pg, OUT / f"story_closing_{tag}_study.png")
            # ---- story: build
            pg.goto(BUILD + "#story"); pg.reload(); pg.wait_for_selector("#story .opener"); settle(pg)
            bp = {}
            bp["story_opener"] = shot(pg, OUT / f"story_opener_{tag}_build.png")
            scroll_to(pg, "#uses", 110); bp["story_ch1"] = shot(pg, OUT / f"story_ch1_{tag}_build.png")
            scroll_to(pg, "#story .bridge:not([hidden])", 300); bp["story_bridge"] = shot(pg, OUT / f"story_bridge_{tag}_build.png")
            scroll_to(pg, "#aluminium .wires", 260); bp["story_wires"] = shot(pg, OUT / f"story_wires_{tag}_build.png")
            scroll_to(pg, "#story .closing", 300); bp["story_closing"] = shot(pg, OUT / f"story_closing_{tag}_build.png")
            for nm in sp:
                pair(sp[nm], bp[nm], OUT / f"{nm}_{tag}_pair.png")
            ctx.close()
    br.close()
print("done", OUT)
