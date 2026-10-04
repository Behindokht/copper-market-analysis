#!/usr/bin/env python3
"""
Build a private single-file preview of the site: one HTML fragment with the styles, the fonts (as data: URIs), the scripts and the
data it needs, so it can be opened or published as one file and loads nothing from the web.

  python tools/build_preview.py [--out preview/copper-market-preview.html] [--start ratio] [--with-photo PATH]

The fragment starts with <title> and <style> and has no <html>, <head> or <body> tags (the format the artifact viewer expects).
Only the data files that the built pages need are included. The preview folder is ignored by git.
"""
import base64
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
SCRIPTS = ["js/strings.en.js", "js/photo.js", "data/story.js", "data/chapters.js", "data/quality.js", "data/dollar.js", "data/ratio.js", "data/dash.js", "data/uses.js", "data/supply.js", "data/map.js", "data/demand.js", "data/provenance.js",
           "js/util.js", "js/glass.js", "js/charts.js", "js/dashchart.js", "js/dashdonut.js", "js/pages/drivers.js", "js/pages/uses.js", "js/pages/record.js", "js/pages/just.js", "js/pages/dollar.js", "js/pages/ratio.js", "js/pages/aluminium.js", "js/pages/supply.js",
           "js/pages/demand.js", "js/pages/summary.js", "js/pages/dashboard.js", "js/pages/story.js", "js/pages/quality.js", "js/pages/method.js", "js/app.js"]


def esc(js):
    return js.replace("</script", "<\\/script")


def main():
    sys.path.insert(0, str(ROOT / "tools"))
    import photo_flag
    photo_flag.write()
    out = Path(sys.argv[sys.argv.index("--out") + 1]) if "--out" in sys.argv else ROOT / "preview" / "copper-market-preview.html"
    out.parent.mkdir(parents=True, exist_ok=True)
    css = (DOCS / "css" / "site.css").read_text(encoding="utf-8")

    def font(m):
        data = base64.b64encode((DOCS / "css" / m.group(1)).resolve().read_bytes()).decode("ascii")
        return f"url(data:font/woff2;base64,{data})"
    css = re.sub(r'url\("(\.\./fonts/[^"]+\.woff2)"\)', font, css)

    html = (DOCS / "index.html").read_text(encoding="utf-8")
    body = html.split("<body>", 1)[1]
    body = body[: body.index("<script")]
    title = re.search(r"<title>(.*?)</title>", html).group(1)

    parts = [f"<title>{title}</title>", "<style>", css, "</style>", body.strip()]
    start = sys.argv[sys.argv.index("--start") + 1] if "--start" in sys.argv else None   # open on this page, for example: --start ratio
    for rel in SCRIPTS:
        if start and rel == "js/app.js":
            parts += ["<script>", f'if (!location.hash) {{ location.hash = "#{start}"; }}', "</script>"]
        code = (DOCS / rel).read_text(encoding="utf-8")
        if rel == "js/photo.js" and "--with-photo" in sys.argv:
            # private previews only: embed a photo that is not in docs/ (its licence is not confirmed), so the look can be judged
            photo = Path(sys.argv[sys.argv.index("--with-photo") + 1])
            code = code.replace("null", '"data:image/jpeg;base64,' + base64.b64encode(photo.read_bytes()).decode("ascii") + '"')
        parts += ["<script>", esc(code), "</script>"]
    out.write_text("\n".join(parts) + "\n", encoding="utf-8", newline="\n")
    print(f"wrote {out} ({out.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
