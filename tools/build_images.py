"""Builds the public pictures from the built site, never from the local photo:
   docs/img/share.png            the 1200 x 630 share image (og:image): the title and the World Bank copper price line since 1960, on the CSS texture
   docs/img/readme-dashboard.png a screenshot of the dashboard (light)
   docs/img/readme-story.png     a screenshot of the Story opener
The site is served from docs/ over http on a free port, like GitHub Pages, so it draws the CSS texture and not the photo (assets/ is outside docs/ and its licence is open, known issue K08).
   python tools/build_images.py
Needs Playwright (the project .venv has it). Data: results/res_dash_series.csv and res_dash_kpis.csv (derived from the World Bank series, CC BY 4.0, adapted)."""
import csv
import functools
import http.server
import threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
IMG = DOCS / "img"


PAGES = {}          # extra pages served from memory (the share image page), so fonts load from the same origin


def serve():
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a, **k):
            pass

        def do_GET(self):
            if self.path in PAGES:
                body = PAGES[self.path].encode("utf-8")
                self.send_response(200); self.send_header("Content-Type", "text/html; charset=utf-8"); self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)
            else:
                super().do_GET()
    handler = functools.partial(Quiet, directory=str(DOCS))
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, httpd.server_address[1]


def share_html(port):
    rows = list(csv.DictReader(open(ROOT / "results" / "res_dash_series.csv", encoding="utf-8")))
    kp = {r["fact_id"]: r["value"] for r in csv.DictReader(open(ROOT / "results" / "res_dash_kpis.csv", encoding="utf-8"))}
    pts = [float(r["cu_usd"]) for r in rows if r.get("cu_usd") not in (None, "")]
    W, H, x0, y0, x1, y1 = 1200, 630, 64, 392, 1136, 560
    hi = max(pts)
    xy = [(x0 + i / (len(pts) - 1) * (x1 - x0), y1 - (v / (hi * 1.04)) * (y1 - y0)) for i, v in enumerate(pts)]
    d = "M" + " L".join("%.1f %.1f" % p for p in xy)
    area = d + " L%.1f %d L%.1f %d Z" % (xy[-1][0], y1, xy[0][0], y1)
    price = "${:,}".format(round(float(kp["copper_usd_t"])))
    return f"""<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/css/site.css">
<style>
html,body{{margin:0;width:{W}px;height:{H}px;overflow:hidden;background:#16201e}}
.bg{{display:block !important;position:absolute;inset:0;background-image:var(--bg-texture);background-size:cover}}
.card{{position:absolute;left:40px;top:40px;right:40px;bottom:40px;border-radius:14px;padding:44px 48px;box-sizing:border-box;color:#F4EFE6}}
h1{{margin:0;font:400 64px/1.04 'Newsreader',Georgia,serif;font-variation-settings:'opsz' 72;letter-spacing:-.01em;color:#F4EFE6;max-width:900px}}
h1 em{{color:#F0B88A}}
.k{{font:600 14px/1 'Atkinson Hyperlegible Next',sans-serif;letter-spacing:.06em;text-transform:uppercase;color:#D9CFC2;margin-bottom:18px}}
.p{{margin-top:22px;font:400 16px 'Atkinson Hyperlegible Next',sans-serif;color:#D9CFC2}}
.p b{{font:400 40px 'Newsreader',Georgia,serif;color:#F4EFE6;margin-right:12px}}
svg{{position:absolute;left:0;top:0}}
</style>
<body><div class="bg"></div>
<div class="card smoke"><div class="k">Data analysis portfolio · SQL and Python</div>
<h1><em>Copper</em> is at a record price. Is it as special as it looks?</h1>
<div class="p"><b>{price}</b>a tonne, World Bank monthly average, August 2026</div></div>
<svg width="{W}" height="{H}" viewBox="0 0 {W} {H}"><path d="{area}" fill="rgba(240,184,138,.14)"/><path d="{d}" fill="none" stroke="#E09A63" stroke-width="3" stroke-linejoin="round"/>
<circle cx="{xy[-1][0]:.1f}" cy="{xy[-1][1]:.1f}" r="6" fill="#F0B88A"/>
<text x="{x0}" y="{y1 + 22}" font-family="Atkinson Hyperlegible Mono, monospace" font-size="14" fill="#D9CFC2">1960</text>
<text x="{x1}" y="{y1 + 22}" text-anchor="end" font-family="Atkinson Hyperlegible Mono, monospace" font-size="14" fill="#D9CFC2">2026</text></svg></body>"""


def main():
    httpd, port = serve()
    base = f"http://127.0.0.1:{port}/"
    IMG.mkdir(exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch(channel="chrome")
        # the share image
        pg = b.new_context(viewport={"width": 1200, "height": 630}, color_scheme="dark").new_page()
        PAGES["/_share.html"] = share_html(port)
        pg.goto(base + "_share.html")
        pg.evaluate("Promise.all([document.fonts.load('64px Newsreader'), document.fonts.load('italic 64px Newsreader'), document.fonts.load('40px Newsreader'), document.fonts.load('16px \"Atkinson Hyperlegible Next\"'), document.fonts.load('14px \"Atkinson Hyperlegible Mono\"')])")
        pg.wait_for_timeout(1500)
        pg.screenshot(path=str(IMG / "share.png"))
        # the README pictures
        ctx = b.new_context(viewport={"width": 1400, "height": 900}, color_scheme="light", reduced_motion="reduce")
        pg = ctx.new_page()
        pg.goto(base + "index.html#dashboard")
        pg.wait_for_selector("#dashboard .grid")
        pg.wait_for_timeout(1800)
        pg.screenshot(path=str(IMG / "readme-dashboard.png"))
        pg.goto(base + "index.html#story")
        pg.reload()
        pg.wait_for_selector("#story .opener")
        pg.wait_for_timeout(1800)
        pg.screenshot(path=str(IMG / "readme-story.png"))
        b.close()
    httpd.shutdown()
    for n in ("share.png", "readme-dashboard.png", "readme-story.png"):
        print(n, (IMG / n).stat().st_size // 1024, "KB")


if __name__ == "__main__":
    main()
