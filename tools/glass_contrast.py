"""Contrast of text on every glass version, measured over the brightest point behind it.   python tools/glass_contrast.py [--measure]
Glass in this site is dark smoked glass: a tint of --ink over a blurred backdrop, with a soft highlight (at most 6 percent white) under the pointer. Text on it is --ivory,
--ivory-dim or --copper-bright. The backdrop can be: the brightest element of a content page (the solid card colour, and pure white as an upper bound), or the
brightest point of the copper plate photo after the 3 px frost and 140 percent saturation (read from design_reference/copper-plate.jpg when it is on this disk).
Versions: bending (Chromium: the same tint and blur, the displacement only moves backdrop pixels, so it cannot add light), frosted (Safari, Firefox), solid (--ink-2, used for
reduced transparency and for browsers without backdrop-filter). Every pair must reach 4.5:1; the script exits 1 otherwise.
--measure also loads the dashboard in Chromium and WebKit, lets the sticky filter bar sit over the copper line, and measures the brightest background pixel inside the bar.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
css = (ROOT / "docs" / "css" / "site.css").read_text(encoding="utf-8")
tok = {m.group(1): m.group(2) for m in re.finditer(r"--([\w-]+):\s*(#[0-9A-Fa-f]{6}|[\d.]+)\s*;", css)}
hexrgb = lambda h: tuple(int(h.lstrip("#")[i:i + 2], 16) for i in (0, 2, 4))
INK, INK2 = hexrgb(tok["ink"]), hexrgb(tok["ink-2"])
TEXT = {"ivory": hexrgb(tok["ivory"]), "ivory-dim": hexrgb(tok["ivory-dim"]), "copper-bright": hexrgb(tok["copper-bright"])}
TINT = {"bar (nav, chapter bar, filter bar)": float(tok["tint-bar"]), "plaque": float(tok["tint-plaque"]), "closing panel": float(tok["tint-panel"])}
HIGHLIGHT = 0.06       # peak alpha of the pointer highlight, rgba(255, 244, 232, .06) in the CSS


def lin(c):
    c /= 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def lum(rgb):
    r, g, b = (lin(x) for x in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def ratio(a, b):
    hi, lo = max(lum(a), lum(b)), min(lum(a), lum(b))
    return (hi + 0.05) / (lo + 0.05)


def over(alpha, fg, bg):
    return tuple(alpha * f + (1 - alpha) * b for f, b in zip(fg, bg))


def saturate(rgb, s=1.4):
    r, g, b = rgb
    m = [[0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s], [0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s], [0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s]]
    return tuple(max(0, min(255, row[0] * r + row[1] * g + row[2] * b)) for row in m)


backdrops = {"content page, brightest element (card colour)": hexrgb(tok["card"]) if "card" in tok else (250, 249, 246), "upper bound: pure white": (255, 255, 255)}
photo = ROOT / "design_reference" / "copper-plate.jpg"
photo_note = "copper plate photo not on this disk: photo rows skipped"
try:
    from PIL import Image, ImageFilter
    import numpy as np
    if photo.exists():
        im = Image.open(photo).convert("RGB").filter(ImageFilter.GaussianBlur(3))
        a = np.asarray(im).astype(float)
        Y = 0.2126 * np.vectorize(lin)(a[..., 0][::4, ::4]) + 0.7152 * np.vectorize(lin)(a[..., 1][::4, ::4]) + 0.0722 * np.vectorize(lin)(a[..., 2][::4, ::4])
        i = np.unravel_index(Y.argmax(), Y.shape)
        px = tuple(float(x) for x in a[::4, ::4][i])
        backdrops["copper plate photo, brightest point after 3 px frost and 140% saturation"] = saturate(px)
        photo_note = f"photo: brightest blurred pixel {tuple(round(x) for x in px)}, luminance {lum(px):.3f}"
except Exception as e:           # Pillow or NumPy missing
    photo_note = f"photo rows skipped ({e})"

bad = []
print("Tints from site.css:", ", ".join(f"{k} {v}" for k, v in TINT.items()), "| pointer highlight peak", HIGHLIGHT)
print(photo_note, "\n")
rows = []
backdrops["plain ink (the photo is not there)"] = INK
PAGE = ("content page", "upper bound")                # what can sit behind the bars: the page, never the photo only
PHOTO = ("copper plate", "plain ink")                 # what can sit behind the plaque and the closing panel: the dark opener and closing sections
for tname, t in TINT.items():
    for bname, b in backdrops.items():
        if tname.startswith("bar") and not bname.startswith(PAGE + ("copper plate",)):
            continue                                  # the bars also sit over the hero photo, so they are tested on the photo too
        if not tname.startswith("bar") and not bname.startswith(PHOTO):
            continue
        for vname in ("bending (Chromium)", "frosted (Safari, Firefox)"):
            bg = over(HIGHLIGHT, (255, 244, 232), over(t, INK, b))
            rows.append((tname, vname, bname, bg))
for vname in ("solid (reduced transparency, no backdrop-filter)",):
    rows.append(("all glass", vname, "any backdrop", INK2))
print(f"{'element':38} {'version':50} {'backdrop':78} " + " ".join(f"{k:>14}" for k in TEXT))
for tname, vname, bname, bg in rows:
    vals = {k: ratio(v, bg) for k, v in TEXT.items()}
    flag = ""
    for k, v in vals.items():
        if v < 4.5:
            bad.append((tname, vname, bname, k, v)); flag = "  <-- below 4.5"
    print(f"{tname:38} {vname:50} {bname[:78]:78} " + " ".join(f"{v:14.2f}" for v in vals.values()) + flag)

if "--measure" in sys.argv:
    from playwright.sync_api import sync_playwright
    print("\nMeasured with the filter bar over the copper line (brightest background pixel inside the bar):")
    with sync_playwright() as p:
        for eng in ("chromium", "webkit"):
            b = p.chromium.launch(channel="chrome") if eng == "chromium" else p.webkit.launch()
            pg = b.new_page(viewport={"width": 1280, "height": 800}, reduced_motion="reduce")
            pg.goto((ROOT / "docs" / "index.html").as_uri() + "#dashboard")
            pg.reload()
            pg.wait_for_selector("#dashboard .dgrid")
            pg.wait_for_timeout(800)
            top = pg.evaluate("document.querySelector('.p-price').getBoundingClientRect().top + window.scrollY")
            best = None
            for off in range(120, 420, 30):               # scroll so the bar sits over different parts of the chart
                pg.evaluate(f"window.scrollTo(0, {top + off})")
                pg.wait_for_timeout(250)
                r = pg.evaluate("(() => { const r = document.querySelector('.dashbar').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })()")
                png = pg.screenshot(clip={"x": r[0] + 16, "y": r[1] + 4, "width": r[2] - 32, "height": 4})        # a strip in the bar's top padding: background only
                from io import BytesIO
                strip = np.asarray(Image.open(BytesIO(png)).convert("RGB")).reshape(-1, 3).astype(float)
                ys = [lum(px) for px in strip]
                k = int(np.argmax(ys))
                if best is None or ys[k] > best[0]:
                    best = (ys[k], tuple(strip[k]))
            bg = best[1]
            print(f"  {eng:9} brightest background pixel {tuple(round(x) for x in bg)} (luminance {best[0]:.3f}): " + ", ".join(f"{k} {ratio(v, bg):.2f}" for k, v in TEXT.items()))
            for k, v in TEXT.items():
                if ratio(v, bg) < 4.5:
                    bad.append(("filter bar over the copper line", eng, "measured", k, ratio(v, bg)))
            b.close()

if bad:
    print(f"\nGLASS CONTRAST FAILED: {len(bad)} pair(s) below 4.5:1")
    for x in bad:
        print("  -", x[0], "|", x[1], "|", x[2], "|", x[3], f"{x[4]:.2f}")
    sys.exit(1)
print("\nGLASS CONTRAST PASSED: every pair is at least 4.5:1")
