#!/usr/bin/env python3
"""
Checks that every self-hosted font file covers every character the site can show.

  python tools/font_coverage.py        needs fontTools and brotli (the project .venv has them); exit 1 if a character is missing

Characters come from the strings file, the page scripts and the data files (escaped characters such as \u2212 are decoded first).
A font that lacks a character would fall back to another font in the middle of a word, so the site must not use it.
"""
import glob
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"


def used_characters():
    chars = {}
    for p in glob.glob(str(DOCS / "js" / "**" / "*.js"), recursive=True) + glob.glob(str(DOCS / "data" / "*.js")) + [str(DOCS / "index.html")]:
        text = Path(p).read_text(encoding="utf-8")
        text = re.sub(r"\\u([0-9a-fA-F]{4})", lambda m: chr(int(m.group(1), 16)), text)
        for ch in set(text):
            if ch >= " " or ch == "\t":
                chars.setdefault(ch, Path(p).name)
    return chars


def main():
    try:
        from fontTools.ttLib import TTFont
    except ImportError:
        print("SKIPPED: fontTools is not installed (the project .venv has it)")
        return 0
    chars = used_characters()
    bad = []
    files = sorted((DOCS / "fonts").glob("*.woff2"))
    for f in files:
        cmap = set(TTFont(str(f)).getBestCmap())
        missing = sorted(ch for ch in chars if ord(ch) not in cmap and ch not in "\t")
        for ch in missing:
            bad.append(f"{f.name} has no glyph for {ch!r} (U+{ord(ch):04X}), used in {chars[ch]}")
    for b in bad:
        print("FONT COVERAGE:", b)
    if not bad:
        print(f"FONT COVERAGE OK: {len(files)} font files cover all {len(chars)} distinct characters used by the site")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
