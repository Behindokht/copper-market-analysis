"""Contrast of text on every glass plate, over the lightest and the darkest 1 percent of the patina photo (read from assets/patina-background.webp when it is on this disk), light and dark.
   python tools/glass_contrast.py [--measure]
Plates: light glass (header, headline, key figures, chart panels, chapter sheets) and smoked glass (opener, plaque, bridges, closing panel, footer). Opacities and tints are read from
docs/css/site.css. The photo is blurred like the plate blurs it (22 px), the 1 percent extremes are taken by luminance, and in dark mode the dark shade (--tex-shade) lies over it.
A faint sheen sits on every plate (soft light, at most 30 percent white at one corner): the table adds 12 percent white over the smoked plates and 6 percent over the light ones as a worst case.
Text colours tested per plate: ink, muted, copper text, verdigris (light glass) and ivory, ivory-2, bright copper (smoked glass). Every pair must reach 4.5:1; exit code 1 otherwise.
Without the photo the table uses pure black and pure white as bounds. --measure also loads the dashboard in Chromium and WebKit and measures the brightest background pixel in strips of
the real plates (the header, the headline plate, a chart panel, the opener) with the photo embedded in the preview."""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
css = (ROOT / "docs" / "css" / "site.css").read_text(encoding="utf-8")
hexrgb = lambda h: tuple(int(h.lstrip("#")[i:i + 2], 16) for i in (0, 2, 4))


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


def rgba(text):
    m = re.search(r"rgba\(([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\)", text)
    return (float(m.group(1)), float(m.group(2)), float(m.group(3))), float(m.group(4))


def var_in(block, name):
    return re.search(r"--" + name + r":\s*([^;]+);", block).group(1)


root_block = css[css.index(":root {\n  --bg-photo"):]
root_block = root_block[:root_block.index("}")]
dark_block = css[css.index(':root[data-theme="dark"] body.has-bg {'):]
dark_block = dark_block[:dark_block.index("}")]
light_scope = css[css.index("body.has-bg { --copper-text:"):]
light_scope = light_scope[:light_scope.index("}")]
tok = {}
for m in re.finditer(r"--([\w-]+):\s*(#[0-9A-Fa-f]{6})\s*;", css):
    tok.setdefault(m.group(1), m.group(2))

gc_l, gc_la = rgba(var_in(root_block, "gc")); sm_l, sm_la = rgba(var_in(root_block, "smoke"))
gc_d, gc_da = rgba(var_in(dark_block, "gc")); sm_d, sm_da = rgba(var_in(dark_block, "smoke"))
shade, shade_a = rgba(var_in(dark_block, "tex-shade"))
copper_text_l = hexrgb(re.search(r"--copper-text:\s*(#[0-9A-Fa-f]{6})", light_scope).group(1))
dv = lambda n: hexrgb(re.search(r"--" + n + r":\s*(#[0-9A-Fa-f]{6})", dark_block).group(1))

TEXT = {
    "light": {"glass": {"ink": hexrgb(tok["ink"]), "muted": hexrgb(tok["muted"]), "copper text": copper_text_l, "verdigris": hexrgb(tok["verdigris-text"])},
              "smoke": {"ivory": hexrgb(tok["ivory"]), "ivory-2": hexrgb("#D9CFC2"), "bright copper": hexrgb(tok["cu-bright"])}},
    "dark": {"glass": {"ink": dv("ink"), "muted": dv("muted"), "copper text": dv("copper-text"), "verdigris": dv("verdigris-text")},
             "smoke": {"ivory": hexrgb(tok["ivory"]), "ivory-2": hexrgb("#D9CFC2"), "bright copper": hexrgb(tok["cu-bright"])}},
}
PLATE = {"light": {"glass": (gc_l, gc_la, 0.06), "smoke": (sm_l, sm_la, 0.08)}, "dark": {"glass": (gc_d, gc_da, 0.12), "smoke": (sm_d, sm_da, 0.08)}}

backdrops = {"light": {}, "dark": {}}
photo = ROOT / "assets" / "patina-background.webp"
note = "assets/patina-background.webp is not on this disk: pure black and pure white are used as bounds"
try:
    from PIL import Image, ImageFilter
    import numpy as np
    if photo.exists():
        im = Image.open(photo).convert("RGB")
        im = im.filter(ImageFilter.GaussianBlur(22 * im.size[0] / 1400))          # the plate blurs the photo by 22 px at a 1400 px wide screen
        a = np.asarray(im).astype(float).reshape(-1, 3)
        Y = 0.2126 * np.vectorize(lin)(a[:, 0]) + 0.7152 * np.vectorize(lin)(a[:, 1]) + 0.0722 * np.vectorize(lin)(a[:, 2])
        idx = np.argsort(Y)
        k = max(1, len(Y) // 100)
        dark1 = tuple(float(x) for x in a[idx[:k]].mean(axis=0)); light1 = tuple(float(x) for x in a[idx[-k:]].mean(axis=0))
        # per-pixel worst case would be stricter than the mean of the 1 percent, so the single darkest and lightest pixel are tested as well
        d0 = tuple(float(x) for x in a[idx[0]]); l0 = tuple(float(x) for x in a[idx[-1]])
        for mode in ("light", "dark"):
            sh = (lambda c: over(shade_a, shade, c)) if mode == "dark" else (lambda c: c)
            backdrops[mode]["photo, darkest 1% (mean)"] = sh(dark1)
            backdrops[mode]["photo, lightest 1% (mean)"] = sh(light1)
            backdrops[mode]["photo, darkest single pixel"] = sh(d0)
            backdrops[mode]["photo, lightest single pixel"] = sh(l0)
        note = f"photo (blurred 22 px): darkest 1% mean {tuple(round(x) for x in dark1)}, lightest 1% mean {tuple(round(x) for x in light1)}"
except Exception as e:
    note = f"photo rows skipped ({e})"
if not backdrops["light"]:
    for mode in ("light", "dark"):
        backdrops[mode]["pure black (bound)"] = (0, 0, 0) if mode == "light" else over(shade_a, shade, (0, 0, 0))
        backdrops[mode]["pure white (bound)"] = (255, 255, 255) if mode == "light" else over(shade_a, shade, (255, 255, 255))
for mode in ("light", "dark"):
    backdrops[mode]["no photo: plain paper"] = hexrgb(tok["paper"]) if mode == "light" else (22, 17, 14)

bad = []
print("Glass plates, text contrast (needs 4.5)")
print(f"light: glass {gc_la:.2f} opaque, smoke {sm_la:.2f}; dark: glass {gc_da:.2f}, smoke {sm_da:.2f}, shade {shade_a:.2f}.  {note}\n")
for mode in ("light", "dark"):
    for kind in ("glass", "smoke"):
        col, al, sheen = PLATE[mode][kind]
        names = list(TEXT[mode][kind])
        print(f"{mode} {kind}" + " " * (14 - len(mode + kind)) + f"{'backdrop':34} " + " ".join(f"{n:>13}" for n in names))
        for bname, bg in backdrops[mode].items():
            c = over(sheen, (255, 255, 255), over(al, col, bg))
            vals = {n: ratio(v, c) for n, v in TEXT[mode][kind].items()}
            flag = ""
            for n, v in vals.items():
                if v < 4.5:
                    bad.append((mode + " " + kind, bname, n, v)); flag = "  <-- below 4.5"
            print(f"{'':14}{bname[:34]:34} " + " ".join(f"{v:13.2f}" for v in vals.values()) + flag)
        print()

if "--measure" in sys.argv:
    from io import BytesIO
    from playwright.sync_api import sync_playwright
    prev = ROOT / "preview" / "_shot.html"
    print("Measured in the browser (the preview with the photo embedded): brightest and darkest background pixel in a 4 px strip at the top of each plate")
    with sync_playwright() as p:
        for eng in ("chromium", "webkit"):
            b = p.chromium.launch(channel="chrome") if eng == "chromium" else p.webkit.launch()
            for scheme in ("light", "dark"):
                pg = b.new_context(viewport={"width": 1400, "height": 900}, color_scheme=scheme, reduced_motion="reduce").new_page()
                pg.goto(prev.as_uri() + "#dashboard")
                pg.reload()
                pg.wait_for_selector("#dashboard .grid")
                pg.wait_for_timeout(1200)
                worst = {}
                for sel in ("#topbar", "#dashboard .head", "#dashboard .p-price"):
                    r = pg.evaluate("(s) => { const e = document.querySelector(s); e.scrollIntoView({block: 'center'}); const q = e.getBoundingClientRect(); return [q.left, q.top, q.width, q.height]; }", sel)
                    pg.wait_for_timeout(300)
                    pg.add_style_tag(content=sel + "{ background: transparent !important; box-shadow: none !important; } " + sel + "::after { display: none !important; }")   # look at what is behind the plate
                    pg.wait_for_timeout(200)
                    png = pg.screenshot(clip={"x": r[0] + 20, "y": max(0, r[1] + 3), "width": max(10, r[2] - 40), "height": 4})
                    strip = np.asarray(Image.open(BytesIO(png)).convert("RGB")).reshape(-1, 3).astype(float)
                    ys = [lum(x) for x in strip]
                    worst[sel] = (tuple(strip[int(np.argmin(ys))]), tuple(strip[int(np.argmax(ys))]))
                    pg.reload()
                    pg.wait_for_selector("#dashboard .grid")
                    pg.wait_for_timeout(600)
                for sel, (dk, lt) in worst.items():
                    print(f"  {eng:9} {scheme:5} {sel:22} darkest {tuple(round(x) for x in dk)}  lightest {tuple(round(x) for x in lt)}")
            b.close()

if bad:
    print(f"GLASS CONTRAST FAILED: {len(bad)} pair(s) below 4.5:1")
    for x in bad:
        print("  -", x[0], "|", x[1], "|", x[2], f"{x[3]:.2f}")
    sys.exit(1)
print("GLASS CONTRAST PASSED: every pair is at least 4.5:1")
