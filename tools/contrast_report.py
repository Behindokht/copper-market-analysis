#!/usr/bin/env python3
"""
Contrast report for the site's colours.

  python tools/contrast_report.py                        print the report; exit 1 if a required pair fails
  python tools/contrast_report.py --write                also write docs/DESIGN.md
  python tools/contrast_report.py --validator PATH       also run the data-viz palette validator (validate_palette.py) on the chart colours

It reads the colour tokens from the :root block of docs/css/site.css, so the numbers cannot drift from the real styles.
Required: normal text 4.5:1, large text 3:1, chart marks and focus rings 3:1 (WCAG 2.2 AA).
"""
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CSS = ROOT / "docs" / "css" / "site.css"


def tokens():
    root_block = re.search(r":root\s*\{(.*?)\n\}", CSS.read_text(encoding="utf-8"), flags=re.S).group(1)
    return {m.group(1): m.group(2).upper() for m in re.finditer(r"--([\w-]+):\s*(#[0-9A-Fa-f]{6})", root_block)}


def lin(c):
    c /= 255
    return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4


def lum(h):
    h = h.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)


def ratio(a, b):
    la, lb = lum(a), lum(b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)


# (what it is, foreground token, background token, required ratio, kind)
PAIRS = [
    ("Body and heading text on the page", "forest", "cream", 4.5, "text"),
    ("Body and heading text on a card", "forest", "card", 4.5, "text"),
    ("Body text on a chip or the meter track", "forest", "chip", 4.5, "text"),
    ("Secondary text on the page", "forest-muted", "cream", 4.5, "text"),
    ("Secondary text on a card", "forest-muted", "card", 4.5, "text"),
    ("Secondary text on a chip", "forest-muted", "chip", 4.5, "text"),
    ("Inline link on the page", "link", "cream", 4.5, "text"),
    ("Inline link on a card", "link", "card", 4.5, "text"),
    ("Small cream text on the deep green hero band", "cream", "forest", 4.5, "text"),
    ("Button text (cream on deep green)", "cream", "forest", 4.5, "text"),
    ("Hero title, copper lettering on the deep green band (large text only)", "copper-hero", "forest", 3.0, "large text"),
    ("Footer text (cream on oxblood)", "cream", "oxblood", 4.5, "text"),
    ("Chart mark: copper on a card", "copper", "card", 3.0, "mark"),
    ("Chart mark: copper on the page", "copper", "cream", 3.0, "mark"),
    ("Chart mark: data green on a card", "green", "card", 3.0, "mark"),
    ("Chart mark: data green on the page", "green", "cream", 3.0, "mark"),
    ("Chart mark: copper on the meter track", "copper", "chip", 3.0, "mark"),
    ("Chart mark: data green on the meter track", "green", "chip", 3.0, "mark"),
    ("Axis lines and the chart crosshair on a card", "forest-muted", "card", 3.0, "mark"),
    ("Focus ring on the page", "oxblood-accent", "cream", 3.0, "mark"),
    ("Focus ring on a card", "oxblood-accent", "card", 3.0, "mark"),
]
# colours that are allowed as fills and tints only; shown for information
INFO = [
    ("Light copper tint on a card (fills only)", "copper-tint", "card"),
    ("Teal tint on a card (fills only)", "teal-tint", "card"),
    ("Copper as TEXT on the page (not used: below 4.5:1)", "copper", "cream"),
]


def run_validator(path):
    out = []
    for name, surf in (("page", "cream"), ("card", "card")):
        r = subprocess.run([sys.executable, str(path), f"{T['copper']},{T['green']}", "--mode", "light", "--surface", T[surf]],
                           capture_output=True, text=True, encoding="utf-8", errors="replace")
        lines = [l.strip().replace("\u2013", " to ") for l in r.stdout.splitlines() if re.match(r"\s*\[(PASS|WARN|FAIL)\]", l)]
        out.append((f"copper {T['copper']} + data green {T['green']} on the {name} ({T[surf]})", lines, r.returncode == 0))
    return out


T = tokens()


def main():
    rows, failed = [], []
    for what, fg, bg, need, kind in PAIRS:
        r = ratio(T[fg], T[bg])
        ok = r >= need
        rows.append((what, T[fg], T[bg], r, need, kind, ok))
        if not ok:
            failed.append(what)
    md = ["| Pair | Foreground | Background | Contrast | Needed | Result |", "|---|---|---|---|---|---|"]
    for what, fg, bg, r, need, kind, ok in rows:
        md.append(f"| {what} | `{fg}` | `{bg}` | {r:.2f}:1 | {need:g}:1 ({kind}) | {'pass' if ok else 'FAIL'} |")
    info = ["| Colour use | Foreground | Background | Contrast |", "|---|---|---|---|"]
    for what, fg, bg in INFO:
        info.append(f"| {what} | `{T[fg]}` | `{T[bg]}` | {ratio(T[fg], T[bg]):.2f}:1 |")
    val_md, val_ok = [], True
    if "--validator" in sys.argv:
        for title, lines, ok in run_validator(sys.argv[sys.argv.index("--validator") + 1]):
            val_md.append(f"**{title}**\n\n```\n" + "\n".join(lines) + "\n```\n")
            val_ok = val_ok and ok
    tok = ["| Token | Value | Use |", "|---|---|---|"]
    use = {"cream": "page background (with a faint grain behind the content only)", "card": "solid cards for charts, tooltips and notes",
           "chip": "chips and the meter track", "forest": "headings and body text, the hero band", "forest-muted": "secondary text, axes",
           "link": "inline links (oxblood accent)", "copper": "chart marks for the copper price", "green": "chart marks for the comparison series",
           "copper-hero": "large hero lettering on the deep green band only", "copper-tint": "fills and tints only, never text or a series",
           "teal-tint": "fills and tints only, never text or a series", "oxblood": "footer", "oxblood-accent": "small accents, links, focus ring",
           "rule": "borders (decoration)", "grid": "chart grid lines (decoration)"}
    for k, v in T.items():
        tok.append(f"| `--{k}` | `{v}` | {use.get(k, '')} |")
    text = "\n".join([
        "# Design notes", "",
        "Generated by `tools/contrast_report.py` from the tokens in `docs/css/site.css`. Do not edit by hand.", "",
        "## Colour tokens", "", *tok, "",
        "Rules: copper is never used as text (3.45:1 on the page is below the 4.5:1 needed); the two tints are fills only; "
        "the hero lettering is large text only; text on a copper fill is not used.", "",
        "## Contrast of every pair in use", "", "Required: normal text 4.5:1, large text 3:1, chart marks and focus rings 3:1 (WCAG 2.2 AA). "
        "The contrast is computed against the flat colour; the paper grain is very faint and does not change the result in practice.", "", *md, "",
        "### For information", "", *info, "",
        "## Palette check for the chart colours", "",
        *(val_md if val_md else ["Run `python tools/contrast_report.py --validator <path to validate_palette.py> --write` to add the data-viz palette validator result "
                                 "(lightness band, chroma, colour-blind separation, normal-vision separation, contrast)."]), "",
        "## Fonts", "",
        "Merriweather (headings, 400 and 700) and Open Sans (text, 400, 600 and 700), Latin subsets, self-hosted in `docs/fonts/`. Both are licensed under the "
        "SIL Open Font License 1.1 (texts in `docs/fonts/OFL-*.txt`). Nothing is loaded from the web at runtime. "
        "The subsets lack the characters for 'greater or equal', 'almost equal' and the right arrow, so the site never uses them.", ""])
    print("\n".join(md))
    print()
    print("\n".join(info))
    for t in val_md:
        print(t)
    if "--write" in sys.argv:
        (ROOT / "docs" / "DESIGN.md").write_text(text, encoding="utf-8", newline="\n")
        print("wrote docs/DESIGN.md")
    if failed or not val_ok:
        print("FAILED:", failed or "palette validator")
        sys.exit(1)
    print(f"All {len(rows)} required pairs pass.")


if __name__ == "__main__":
    main()
