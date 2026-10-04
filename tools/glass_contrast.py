"""Contrast of text on every glass tier, over the lightest and darkest 1 percent of the patina photo (read from assets/patina-background.webp when it is on this disk), light and dark.
   python tools/glass_contrast.py [--measure]
Tiers (docs/css/site.css, Round 4, after design_reference/glass-type-study.html):
  clear glass   the header (denser fill) and the small controls: text is ink (light) or ivory (dark), nothing paler: the brand word is ink or ivory too, and copper only marks the current page.
  reading glass every panel and sheet that holds charts or text: ink, muted, copper text, verdigris.
  smoked glass  the dark reading glass of the opener, bridges, closing panel and footer, the same in both themes: ivory, ivory-2, bright copper.
The model of one pixel behind text: the photo, blurred (the plate blurs it 14 or 30 px), then the plate's saturate and brightness, then (dark mode) the dark shade is already in the photo layer, then the rim gradient (white, its
strongest stop is used: it lies under the translucent fill all over the plate), then the fill gradient (each end tested), then the specular highlight as soft-light white at its opacity, then a small white allowance for the inset glow.
Every pair must reach 4.5:1; exit code 1 otherwise. A pair that fails is fixed by raising that tier's fill, never by darkening the text colour. Without the photo the table uses plain paper as the backdrop.
--measure also loads the dashboard in Chromium and WebKit and prints the brightest and darkest background pixel in strips behind the real plates (the preview with the photo embedded)."""
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
    r, g, b = (lin(max(0, min(255, x))) for x in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def ratio(a, b):
    hi, lo = max(lum(a), lum(b)), min(lum(a), lum(b))
    return (hi + 0.05) / (lo + 0.05)


def over(alpha, fg, bg):
    return tuple(alpha * f + (1 - alpha) * b for f, b in zip(fg, bg))


def stops(text):
    """All rgba() stops of a gradient: [((r, g, b), alpha), ...]"""
    return [((float(m[0]), float(m[1]), float(m[2])), float(m[3])) for m in re.findall(r"rgba\(([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\)", text)]


def saturate(c, s):
    r, g, b = c
    return (r * (0.213 + 0.787 * s) + g * (0.715 - 0.715 * s) + b * (0.072 - 0.072 * s),
            r * (0.213 - 0.213 * s) + g * (0.715 + 0.285 * s) + b * (0.072 - 0.072 * s),
            r * (0.213 - 0.213 * s) + g * (0.715 - 0.715 * s) + b * (0.072 + 0.928 * s))


def bf(c, s, br):
    return tuple(max(0, min(255, x * br)) for x in saturate(c, s))


def token_block(start_marker):
    i = css.index(start_marker)
    return css[i:css.index("\n}", i) if start_marker.startswith(":root {") else css.index("}", i)]


root_block = token_block(":root {\n  --bg-photo")
dark_block = css[css.index('@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"]) body.has-bg {'):]
dark_block = dark_block[:dark_block.index("\n}\n")]
light_scope = css[css.index("body.has-bg { --copper-text:"):]
light_scope = light_scope[:light_scope.index("}")]


def var_in(block, name):
    m = re.search(r"--" + name + r":\s*(.+?);\s*(?=--|\n|$)", block, re.S)
    return m.group(1).strip()


def num_bf(v):
    sat = re.search(r"saturate\(([\d.]+)%\)", v); br = re.search(r"brightness\(([\d.]+)\)", v)
    return (float(sat.group(1)) / 100 if sat else 1.0), (float(br.group(1)) if br else 1.0)


tok = {}
for m in re.finditer(r"--([\w-]+):\s*(#[0-9A-Fa-f]{6})\s*;", css):
    tok.setdefault(m.group(1), m.group(2))
dv = lambda n: hexrgb(re.search(r"--" + n + r":\s*(#[0-9A-Fa-f]{6})", dark_block).group(1))
copper_text_l = hexrgb(re.search(r"--copper-text:\s*(#[0-9A-Fa-f]{6})", light_scope).group(1))
shade = stops(var_in(dark_block, "tex-shade"))[0]
IVORY, IVORY2, CUB = hexrgb(tok["ivory"]), hexrgb("#D9CFC2"), hexrgb(tok["cu-bright"])

TIERS = {
    "light": {
        "clear (header)": dict(fill=stops(var_in(root_block, "top-fill")), rim=stops(var_in(root_block, "clear-rim")), bf=num_bf(var_in(root_block, "clear-bf")), spec=0.55, glow=0.10,
                               text={"ink": hexrgb(tok["ink"])}),
        "clear (controls)": dict(fill=stops(var_in(root_block, "clear-fill")), rim=stops(var_in(root_block, "clear-rim")), bf=num_bf(var_in(root_block, "clear-bf")), spec=0.55, glow=0.10,
                                 text={"ink": hexrgb(tok["ink"])}, on_panel=True),
        "reading": dict(fill=stops(var_in(root_block, "read-fill")), rim=stops(var_in(root_block, "read-rim")), bf=num_bf(var_in(root_block, "read-bf")), spec=0.55, glow=0.08,
                        text={"ink": hexrgb(tok["ink"]), "muted": hexrgb(tok["muted"]), "copper text": copper_text_l, "verdigris": hexrgb(tok["verdigris-text"])}),
        "smoked": dict(fill=stops(var_in(root_block, "smoke-fill")), rim=stops(var_in(root_block, "smoke-rim")), bf=num_bf(var_in(root_block, "smoke-bf")), spec=0.30, glow=0.02,
                       text={"ivory": IVORY, "ivory-2": IVORY2, "bright copper": CUB}),
    },
    "dark": {
        "clear (header)": dict(fill=stops(var_in(dark_block, "top-fill")), rim=stops(var_in(dark_block, "clear-rim")), bf=num_bf(var_in(dark_block, "clear-bf")), spec=0.30, glow=0.03,
                               text={"ivory": hexrgb("#F4EFE6")}),
        "clear (controls)": dict(fill=stops(var_in(dark_block, "clear-fill")), rim=stops(var_in(dark_block, "clear-rim")), bf=num_bf(var_in(dark_block, "clear-bf")), spec=0.30, glow=0.03,
                                 text={"ivory": hexrgb("#F4EFE6")}, on_panel=True),
        "reading": dict(fill=stops(var_in(dark_block, "read-fill")), rim=stops(var_in(dark_block, "read-rim")), bf=num_bf(var_in(dark_block, "read-bf")), spec=0.30, glow=0.02,
                        text={"ink": dv("ink"), "muted": dv("muted"), "copper text": dv("copper-text"), "verdigris": dv("verdigris-text")}),
        "smoked": dict(fill=stops(var_in(dark_block, "read-fill")), rim=stops(var_in(root_block, "smoke-rim")), bf=num_bf(var_in(root_block, "smoke-bf")), spec=0.30, glow=0.02,
                       text={"ivory": IVORY, "ivory-2": IVORY2, "bright copper": CUB}),
    },
}

backdrops = {"light": {}, "dark": {}}
photo = ROOT / "assets" / "patina-background.webp"
note = "assets/patina-background.webp is not on this disk: plain paper is used as the backdrop"
try:
    from PIL import Image, ImageFilter
    import numpy as np
    if photo.exists():
        im = Image.open(photo).convert("RGB")
        im = im.filter(ImageFilter.GaussianBlur(14 * im.size[0] / 1400))          # the lightest tier blurs by 14 px at a 1400 px wide screen (the reading tier blurs more, which narrows the extremes)
        a = np.asarray(im).astype(float).reshape(-1, 3)
        Y = 0.2126 * np.vectorize(lin)(a[:, 0]) + 0.7152 * np.vectorize(lin)(a[:, 1]) + 0.0722 * np.vectorize(lin)(a[:, 2])
        idx = np.argsort(Y)
        k = max(1, len(Y) // 100)
        dark1 = tuple(float(x) for x in a[idx[:k]].mean(axis=0)); light1 = tuple(float(x) for x in a[idx[-k:]].mean(axis=0))
        d0 = tuple(float(x) for x in a[idx[0]]); l0 = tuple(float(x) for x in a[idx[-1]])
        for mode in ("light", "dark"):
            sh = (lambda c: over(shade[1], shade[0], c)) if mode == "dark" else (lambda c: c)
            backdrops[mode]["photo, darkest 1% (mean)"] = sh(dark1)
            backdrops[mode]["photo, lightest 1% (mean)"] = sh(light1)
            backdrops[mode]["photo, darkest single pixel"] = sh(d0)
            backdrops[mode]["photo, lightest single pixel"] = sh(l0)
        note = f"photo (blurred 14 px): darkest 1% mean {tuple(round(x) for x in dark1)}, lightest 1% mean {tuple(round(x) for x in light1)}"
except Exception as e:
    note = f"photo rows skipped ({e})"
if not backdrops["light"]:
    for mode in ("light", "dark"):
        backdrops[mode]["pure black (bound)"] = (0, 0, 0) if mode == "light" else over(shade[1], shade[0], (0, 0, 0))
        backdrops[mode]["pure white (bound)"] = (255, 255, 255) if mode == "light" else over(shade[1], shade[0], (255, 255, 255))
for mode in ("light", "dark"):
    backdrops[mode]["no photo: plain paper"] = hexrgb(tok["paper"]) if mode == "light" else (22, 17, 14)
card_dark = hexrgb("#1A1F1E")


def softlight_white(c, a):
    """The faint specular highlight is soft-light white at opacity a: each channel c (0..1) becomes c + (D(c) - c) for a white source, mixed in with weight a."""
    out = []
    for x in c:
        v = max(0.0, min(1.0, x / 255))
        d = ((16 * v - 12) * v + 4) * v if v <= 0.25 else v ** 0.5
        out.append(255 * ((1 - a) * v + a * d))
    return tuple(out)


def behind(t, bg, mode):
    """The worst pixel behind text for the lightest-vs-darkest question: the strongest rim stop, each fill end, the veil. Returns the list of candidate backgrounds."""
    sat, br = t["bf"]
    b0 = bf(bg, sat, br)
    out = []
    rim_a = max(a for _, a in t["rim"])
    for fc, fa in t["fill"]:
        for ra in (0.0, rim_a):                                                        # the middle of the plate (rim faint) and the bright corner (rim at its strongest stop)
            c = over(ra, (255, 255, 255), b0)
            c = over(fa, fc, c)
            c = softlight_white(c, t["spec"])
            out.append(over(t["glow"], (255, 255, 255), c))
    return out


bad = []
print("Glass tiers, text contrast (needs 4.5)")
print(f"{note}\n")
for mode in ("light", "dark"):
    for tier, t in TIERS[mode].items():
        names = list(t["text"])
        print(f"{mode} {tier}".ljust(26) + f"{'backdrop':32} " + " ".join(f"{n:>13}" for n in names))
        for bname, bgc in backdrops[mode].items():
            if t.get("on_panel"):
                # a small control sits on a panel: its backdrop is the reading glass behind it (light: warm white, dark: the cool near-black), so the worst case is that plate
                rd = TIERS[mode]["reading"]
                cands = []
                for panel in behind(rd, bgc, mode):
                    cands += behind(t, panel, mode)
            else:
                cands = behind(t, bgc, mode)
            vals = {}
            for n, v in t["text"].items():
                vals[n] = min(ratio(v, c) for c in cands)
            flag = ""
            for n, v in vals.items():
                if v < 4.5:
                    bad.append((mode + " " + tier, bname, n, v)); flag = "  <-- below 4.5"
            print(" " * 26 + f"{bname[:32]:32} " + " ".join(f"{v:13.2f}" for v in vals.values()) + flag)
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
