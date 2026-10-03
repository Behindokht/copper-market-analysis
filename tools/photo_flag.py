#!/usr/bin/env python3
"""
Write docs/js/photo.js: tells the opener whether the photo exists.

  python tools/photo_flag.py

The opener uses docs/img/copper-plate.jpg when that file exists and falls back to plain ink (#1B1410) when it does not. A page cannot ask
"does this file exist" without a failed request, so this small file records the answer. tools/export_site_data.py and tools/build_preview.py
run it. The photo is not in the repository until its licence is confirmed (design_reference/ is git-ignored).
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PHOTO = ROOT / "docs" / "img" / "copper-plate.jpg"


def write():
    value = '"img/copper-plate.jpg"' if PHOTO.exists() else "null"
    (ROOT / "docs" / "js" / "photo.js").write_text(
        "// Written by tools/photo_flag.py. The opener uses the photo when docs/img/copper-plate.jpg exists, plain ink if not.\n"
        f"window.CMA_PHOTO = {value};\n", encoding="utf-8", newline="\n")
    return value != "null"


if __name__ == "__main__":
    print("photo found: the opener will use it" if write() else "no photo in docs/img: the opener uses plain ink")
