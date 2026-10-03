#!/usr/bin/env python3
"""
Contrast report for the site's colours.

  python tools/contrast_report.py                        print the report; exit 1 if a required pair fails
  python tools/contrast_report.py --write                also write docs/DESIGN.md
  python tools/contrast_report.py --photo PATH           measure the glass over this photo (default: docs/img/copper-plate.jpg, else design_reference/copper-plate.jpg)
  python tools/contrast_report.py --validator PATH       also run the data-viz palette validator (validate_palette.py) on the chart colours

It reads the colour tokens from the :root block of docs/css/site.css, so the numbers cannot drift from the real styles.
Required: normal text 4.5:1, large text 3:1, chart marks and focus rings 3:1 (WCAG 2.2 AA).

Glass (the nav bar and the opener plaque): light text sits on smoked glass over a photo, so the contrast depends on what is behind. The report measures
the worst case: the brightest pixel of the photo behind the glass, with no blur (blur only averages the backdrop, so this is the safe side).
Without a photo the backdrop is the ink opener or the paper, which is also measured.
"""
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CSS = ROOT / "docs" / "css" / "site.css"

# the glass layers, as in the stylesheet
NAV_ALPHA = 0.86           # .nav-bar
PLAQUE_ALPHA = 0.5         # .glass (plaque)
SCRIM_RIGHT = 0.38         # opener scrim at its right edge, where the plaque sits


def tokens():
    root_block = re.search(r":root\s*\{(.*?)\n\}", CSS.read_text(encoding="utf-8"), flags=re.S).group(1)
    return {m.group(1): m.group(2).upper() for m in re.finditer(r"--([\w-]+):\s*(#[0-9A-Fa-f]{6})", root_block)}


def lin(c):
    c /= 255
    return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4


def rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def lum(c):
    r, g, b = c if isinstance(c, tuple) else rgb(c)
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)


def ratio(a, b):
    la, lb = lum(a), lum(b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)


def mix(top, alpha, below):
    """top colour at the given opacity over the colour below"""
    return tuple(alpha * t + (1 - alpha) * u for t, u in zip(top, below))


T = tokens()

# (what it is, foreground token, background token, required ratio, kind)
PAIRS = [
    ("Body and heading text on paper", "ink", "paper", 4.5, "text"),
    ("Body and heading text on a card", "ink", "card", 4.5, "text"),
    ("Body text on a bar track, chip or table header", "ink", "track", 4.5, "text"),
    ("Secondary text on paper", "muted", "paper", 4.5, "text"),
    ("Secondary text on a card", "muted", "card", 4.5, "text"),
    ("Secondary text on a track or chip", "muted", "track", 4.5, "text"),
    ("Link and copper-coloured text on paper", "copper-text", "paper", 4.5, "text"),
    ("Link and copper-coloured text on a card", "copper-text", "card", 4.5, "text"),
    ("Verdigris text on a card (pass pill)", "verdigris", "card", 4.5, "text"),
    ("Verdigris text on paper", "verdigris", "paper", 4.5, "text"),
    ("Button text (ivory on ink)", "ivory", "ink", 4.5, "text"),
    ("Text on the ink opener and footer", "ivory", "ink", 4.5, "text"),
    ("Secondary text on the ink opener and footer", "ivory-dim", "ink", 4.5, "text"),
    ("Italic title word, brand and nav underline on ink", "copper-bright", "ink", 4.5, "text"),
    ("Text on the glass fallback (reduced transparency)", "ivory", "ink-2", 4.5, "text"),
    ("Secondary text on the glass fallback", "ivory-dim", "ink-2", 4.5, "text"),
    ("Chart mark: copper on a card", "copper", "card", 3.0, "mark"),
    ("Chart mark: copper on paper", "copper", "paper", 3.0, "mark"),
    ("Chart mark: copper on a track", "copper", "track", 3.0, "mark"),
    ("Chart mark: verdigris on a card (always dashed)", "verdigris", "card", 3.0, "mark"),
    ("Chart mark: verdigris on paper", "verdigris", "paper", 3.0, "mark"),
    ("Chart mark: verdigris on a track", "verdigris", "track", 3.0, "mark"),
    ("Axis lines, zero lines and the verdigris plain-answer rule use ink or verdigris on paper", "ink", "paper", 3.0, "mark"),
    ("Axis ticks and leader lines (muted) on a card", "muted", "card", 3.0, "mark"),
    ("Focus ring on paper", "copper-text", "paper", 3.0, "mark"),
    ("Focus ring on a card", "copper-text", "card", 3.0, "mark"),
    ("Focus ring on ink (nav, opener, footer)", "copper-bright", "ink", 3.0, "mark"),
]
# not allowed for text; shown for information
INFO = [
    ("Copper mark colour as TEXT on paper (not used: use copper-text)", "copper", "paper"),
    ("Copper-bright as TEXT on paper (not used: for ink backgrounds only)", "copper-bright", "paper"),
    ("Ink on a bar fill of copper at half strength (not used for text)", "ink", "card"),
]


def brightest(path):
    """Brightest pixel (max luminance) and the 99.5th percentile pixel of the photo, as RGB tuples; None if unavailable."""
    try:
        from PIL import Image
    except ImportError:
        return None, "PIL is not installed (the project .venv has it)"
    p = Path(path)
    if not p.exists():
        return None, f"no photo at {path}"
    im = Image.open(p).convert("RGB")
    im.thumbnail((600, 600))
    data = im.get_flattened_data() if hasattr(im, "get_flattened_data") else im.getdata()
    px = sorted(data, key=lum)
    return (px[-1], px[int(len(px) * 0.995)]), p.name


def glass_rows(photo_arg):
    """[(what, fg token, composite colour, required, passes)] for the nav and the plaque, over the real backdrops."""
    ink, paper = rgb(T["ink"]), rgb(T["paper"])
    rows = []

    def add(what, fgs, comp):
        for fg in fgs:
            r = ratio(T[fg], comp)
            need = 4.5
            rows.append((f"{what}: {fg}", T[fg], "#%02X%02X%02X" % tuple(round(x) for x in comp), r, need, r >= need))

    add("Nav bar over the ink opener", ["ivory", "ivory-dim", "copper-bright"], mix(ink, NAV_ALPHA, ink))
    add("Nav bar over paper (pages without an opener, scrolled page)", ["ivory", "ivory-dim", "copper-bright"], mix(ink, NAV_ALPHA, paper))
    add("Plaque over the ink opener (no photo)", ["ivory", "ivory-dim"], mix(ink, PLAQUE_ALPHA, mix(ink, SCRIM_RIGHT, ink)))
    pix, note = brightest(photo_arg)
    if pix:
        for label, p in (("brightest pixel", pix[0]), ("99.5th percentile pixel", pix[1])):
            add(f"Nav bar over the photo, {label}", ["ivory", "ivory-dim", "copper-bright"], mix(ink, NAV_ALPHA, p))
            add(f"Plaque over the photo under the scrim, {label}", ["ivory", "ivory-dim"], mix(ink, PLAQUE_ALPHA, mix(ink, SCRIM_RIGHT, p)))
    return rows, note, pix


def run_validator(path):
    out = []
    for name, surf in (("paper", "paper"), ("card", "card")):
        r = subprocess.run([sys.executable, str(path), f"{T['copper']},{T['verdigris']}", "--mode", "light", "--surface", T[surf]],
                           capture_output=True, text=True, encoding="utf-8", errors="replace")
        lines = [l.strip().replace("–", " to ") for l in r.stdout.splitlines() if re.match(r"\s*\[(PASS|WARN|FAIL)\]", l)]
        out.append((f"copper {T['copper']} + verdigris {T['verdigris']} on the {name} ({T[surf]})", lines, r.returncode == 0))
    return out


def main():
    photo_arg = None
    if "--photo" in sys.argv:
        photo_arg = sys.argv[sys.argv.index("--photo") + 1]
    else:
        for cand in (ROOT / "docs" / "img" / "copper-plate.jpg", ROOT / "design_reference" / "copper-plate.jpg"):
            if cand.exists():
                photo_arg = str(cand)
                break
    rows, failed = [], []
    for what, fg, bg, need, kind in PAIRS:
        r = ratio(T[fg], T[bg])
        ok = r >= need
        rows.append((what, T[fg], T[bg], r, need, kind, ok))
        if not ok:
            failed.append(what)
    grows, gnote, pix = glass_rows(photo_arg or "")
    for what, fgc, comp, r, need, ok in grows:
        if not ok and "99.5th" not in what and "brightest pixel" not in what:
            failed.append(what)
        elif not ok and "brightest pixel" in what:
            failed.append(what)        # the safe side: the brightest pixel must pass too
    md = ["| Pair | Foreground | Background | Contrast | Needed | Result |", "|---|---|---|---|---|---|"]
    for what, fg, bg, r, need, kind, ok in rows:
        md.append(f"| {what} | `{fg}` | `{bg}` | {r:.2f}:1 | {need:g}:1 ({kind}) | {'pass' if ok else 'FAIL'} |")
    gmd = ["| Text on glass | Text colour | Backdrop under the text (glass composited) | Contrast | Needed | Result |", "|---|---|---|---|---|---|"]
    for what, fgc, comp, r, need, ok in grows:
        gmd.append(f"| {what} | `{fgc}` | `{comp}` | {r:.2f}:1 | {need:g}:1 (text) | {'pass' if ok else 'FAIL'} |")
    info = ["| Colour use | Foreground | Background | Contrast |", "|---|---|---|---|"]
    for what, fg, bg in INFO[:2]:
        info.append(f"| {what} | `{T[fg]}` | `{T[bg]}` | {ratio(T[fg], T[bg]):.2f}:1 |")
    val_md, val_ok = [], True
    if "--validator" in sys.argv:
        for title, lines, ok in run_validator(sys.argv[sys.argv.index("--validator") + 1]):
            val_md.append(f"**{title}**\n\n```\n" + "\n".join(lines) + "\n```\n")
            val_ok = val_ok and ok
    use = {"ink": "text on paper, the opener background, the footer", "ink-2": "glass fallback", "ivory": "text on ink and on glass", "ivory-dim": "secondary text on ink",
           "paper": "page background of the reading section (with a faint grain behind the content only)", "card": "chart and table cards: always solid",
           "track": "bar tracks, chips and table headers (a step between paper and the rules; not in the brief, added for tracks)", "rule": "hairlines, card borders, grid lines",
           "muted": "secondary text on paper", "copper": "data marks (main series) and accents", "copper-text": "copper-coloured text, links and labels on paper",
           "copper-bright": "accent on ink only: title word, brand, nav underline, spark", "verdigris": "second data series (always dashed), the plain-answer rule"}
    tok = ["| Token | Value | Use |", "|---|---|---|"]
    for k, v in T.items():
        tok.append(f"| `--{k}` | `{v}` | {use.get(k, '')} |")
    photo_text = (f"Photo used for the glass measurement: `{gnote}`." if pix else f"No photo was measured ({gnote}); the glass rows over the photo are missing, "
                  "so run this again with the photo in `docs/img/`.")
    text = "\n".join([
        "# Design notes", "",
        "Generated by `tools/contrast_report.py` from the tokens in `docs/css/site.css`. Do not edit by hand.", "",
        "The look: a dark opener (the copper plate photo under an ink scrim, or plain ink when `docs/img/copper-plate.jpg` is missing), an ivory Newsreader title with the word "
        "*Copper* in italic bright copper, a smoked-glass nav bar and plaque; then a neutral paper reading section where charts and tables sit on solid cards. "
        "Every colour is a state of copper. Glass is used on the nav bar and the opener plaque only.", "",
        "## Colour tokens", "", *tok, "",
        "Rules: use `--copper-text`, never `--copper`, for copper-coloured text; `--copper-bright` is for ink backgrounds only; the verdigris series is always dashed and lines are labelled directly, "
        "so colour is never the only cue (copper and verdigris differ mostly in hue, about 1.3:1 in lightness). Radii: 3 to 4 px on paper, 10 px for glass only. No pills, no glow, no gradient bars.", "",
        "## Contrast of every pair in use", "", "Required: normal text 4.5:1, large text 3:1, chart marks and focus rings 3:1 (WCAG 2.2 AA). "
        "The contrast is computed against the flat colour; the paper grain is very faint and does not change the result in practice.", "", *md, "",
        "### Text on the glass (nav bar and plaque)", "",
        f"The nav bar is ink at {NAV_ALPHA:g} opacity and the plaque ink at {PLAQUE_ALPHA:g}, over the opener (the plaque also sits under the scrim, at {SCRIM_RIGHT:g} opacity at its right edge). "
        "Each row composites the glass over the brightest pixel of the photo with no blur, which is the worst case (blur only averages the backdrop). " + photo_text, "", *gmd, "",
        "### For information", "", *info, "",
        "## Palette check for the chart colours", "",
        *(val_md if val_md else ["Run `python tools/contrast_report.py --validator <path to validate_palette.py> --write` to add the data-viz palette validator result "
                                 "(lightness band, chroma, colour-blind separation, normal-vision separation, contrast)."]), "",
        "## Fonts", "",
        "Newsreader (variable, optical size and weight axes, normal and italic) for titles, questions and big figures; IBM Plex Sans 400, 500 and 600 for text and chart labels; "
        "IBM Plex Mono 400 and 500 for eyebrows, axis ticks and units (uppercase, 0.06em tracking, never running text). Latin subsets, self-hosted in `docs/fonts/`, all under the SIL Open Font License 1.1 "
        "(texts in `docs/fonts/OFL-*.txt`). Nothing is loaded from the web at runtime. `tools/font_coverage.py` checks that every character the site uses (including the minus sign) is in every font file.", "",
        "## Motion", "",
        "Everything plays once and nothing loops: a 640 ms rise of the opener, a spark of nine hard-edged rays from the word *Copper* about a second after load, charts that reveal once from the left "
        "when scrolled into view with a smaller spark at the latest point. The resting state is fully visible if scripts or the observer fail. With reduced motion there is no animation at all; "
        "with reduced transparency the glass becomes solid.", ""])
    print("\n".join(md))
    print()
    print("\n".join(gmd))
    print()
    print("\n".join(info))
    print(photo_text)
    for t in val_md:
        print(t)
    if "--write" in sys.argv:
        (ROOT / "docs" / "DESIGN.md").write_text(text, encoding="utf-8", newline="\n")
        print("wrote docs/DESIGN.md")
    if failed or not val_ok:
        print("FAILED:", failed or "palette validator")
        sys.exit(1)
    print(f"All {len(rows)} required pairs and {len(grows)} glass measurements pass.")


if __name__ == "__main__":
    main()
