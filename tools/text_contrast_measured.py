"""Measured text contrast on the real rendered page, over the real patina photo.
   python tools/text_contrast_measured.py [--preview preview/_shot.html] [--widths 1400,400]
The glass table (tools/glass_contrast.py) is a model. This test looks at what the browser draws: it makes every piece of text transparent (so the pixels behind it show), takes screenshots of the dashboard and of
the Story while scrolling (the photo is fixed to the window, as for a reader), and for each piece of text takes the worst pixel inside its box and computes the contrast of the text colour against it. Every piece of text
must reach 4.5:1 (3:1 for large text: 24 px, or 18.66 px and bold). Light and dark, Chromium. With --url BASE it tests the served public site instead (python tools/serve_docs.py, then --url http://127.0.0.1:8765): the CSS texture, no photo, and the case study too. Otherwise it needs the single-file preview with the photo embedded: python tools/build_preview.py --with-photo assets/patina-background.webp
(the photo is local only, so this test is not part of the public checks: it prints SKIPPED when the preview is missing). Exit code 1 if a piece of text is below its limit."""
import io
import sys
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
args = sys.argv[1:]
prev = Path(args[args.index("--preview") + 1]) if "--preview" in args else ROOT / "preview" / "copper-market-preview.html"
widths = [int(x) for x in (args[args.index("--widths") + 1] if "--widths" in args else "1400").split(",")]
BASE = args[args.index("--url") + 1].rstrip("/") + "/" if "--url" in args else None      # a served site (tools/serve_docs.py): the public look, with the CSS texture and no photo
if BASE is None and not prev.exists():
    print("SKIPPED: the preview with the photo is not on this disk")
    sys.exit(0)
if BASE is None:
    shot = ROOT / "preview" / "_shot.html"
    shot.write_text('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' + prev.read_text(encoding="utf-8"), encoding="utf-8")
    URL = shot.as_uri()
VIEWS = ("dashboard", "story") if BASE is None else ("dashboard", "story", "case")


def goto(pg, view):
    if BASE is None:
        pg.goto(URL + "#" + view)
        pg.reload()
    elif view == "case":
        pg.goto(BASE + "case-study.html")
    else:
        pg.goto(BASE + "index.html#" + view)
        pg.reload()


def lin(c):
    c /= 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def lum(c):
    return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2])


COLLECT = r"""() => {
  const out = [], seen = new Set(), w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const parse = s => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
  while (w.nextNode()) {
    const n = w.currentNode; if (!(n.textContent || '').trim()) continue;
    const el = n.parentElement; if (!el || seen.has(el)) continue; seen.add(el);
    if (el.closest('[hidden], script, style, .sr, dialog:not([open]), details:not([open]) > :not(summary)')) continue;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    const range = document.createRange(); range.selectNodeContents(n);
    const rects = Array.from(range.getClientRects()).filter(q => q.width >= 3 && q.height >= 3); if (!rects.length) continue;
    const chap = el.closest('.chap'); if (chap) { const cr = chap.getBoundingClientRect(); if (rects[0].left < cr.left || rects[0].right > cr.right) continue; }       // links scrolled out of sight in the chapter bar
    let col = parse(el instanceof SVGElement ? cs.fill : cs.color); if (!col) continue;
    let px = parseFloat(cs.fontSize); const svg = el.closest('svg');
    if (svg) { const vb = svg.viewBox && svg.viewBox.baseVal, sw = svg.getBoundingClientRect().width; if (vb && vb.width) px = px * sw / vb.width; }
    let op = 1; for (let e = el; e && e.nodeType === 1; e = e.parentElement) op *= parseFloat(getComputedStyle(e).opacity);
    el.setAttribute('data-mi', String(out.length));
    out.push({ s: (n.textContent || '').trim().slice(0, 36), rects: rects.map(q => [q.left + scrollX, q.top + scrollY, q.width, q.height]), c: col, px: px, bold: +cs.fontWeight >= 600, op: op, link: !!el.closest('a') });
  }
  return out;
}"""
RECTS = r"""() => {
  const out = {};
  document.querySelectorAll('[data-mi]').forEach(el => {
    for (const n of el.childNodes) {
      if (n.nodeType === 3 && (n.textContent || '').trim()) {
        const range = document.createRange(); range.selectNodeContents(n);
        out[el.getAttribute('data-mi')] = Array.from(range.getClientRects()).filter(q => q.width >= 3 && q.height >= 3).map(q => [q.left + scrollX, q.top + scrollY, q.width, q.height]);
        break;
      }
    }
  });
  return out;
}"""
HIDE = "* { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; text-decoration-color: transparent !important; caret-color: transparent !important; } svg text, svg tspan { fill: transparent !important; } ::selection { background: transparent }"

problems, checked = [], 0


def run(pw, w, scheme, view):
    b = pw.chromium.launch(channel="chrome")
    pg = b.new_context(viewport={"width": w, "height": 900 if w > 600 else 800}, color_scheme=scheme, reduced_motion="reduce").new_page()
    goto(pg, view)
    pg.wait_for_selector({"dashboard": "#dashboard .grid", "story": "#story .opener", "case": "#case h1"}[view])
    pg.wait_for_timeout(1500)
    if view == "story":
        for btn in pg.locator("button.linkbtn").all():
            try:
                btn.click(timeout=1500)
            except Exception:
                pass
        pg.wait_for_timeout(1200)
    items = pg.evaluate(COLLECT)
    hdr = pg.evaluate("(() => { const r = document.getElementById('topbar').getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; })()")
    pg.add_style_tag(content=HIDE)
    pg.wait_for_timeout(1200)
    H = pg.evaluate("document.documentElement.scrollHeight"); VH = pg.evaluate("innerHeight")
    shots = []
    y = 0
    while y < H:
        pg.evaluate("window.scrollTo(0, %d)" % y)
        pg.wait_for_timeout(300)
        sy = pg.evaluate("scrollY")
        im = Image.open(io.BytesIO(pg.screenshot())).convert("RGB")
        shots.append((sy, im, pg.evaluate(RECTS)))          # the boxes are read in this very scroll state, so charts that redraw or fold while scrolling cannot shift them
        H = max(H, pg.evaluate("document.documentElement.scrollHeight"))
        if sy + VH >= H:
            break
        y = sy + VH - 160
    b.close()
    global checked
    done = set()
    for sy, im, rn in shots:
        for k, it in enumerate(items):
            for ri, r in enumerate(rn.get(str(k)) or []):
                if (k, ri) in done:
                    continue
                x, y_, w_, h_ = r
                if len(it["s"]) <= 2:                       # a single glyph in a badge: keep the ring of the badge out of the box
                    x += w_ * 0.25; y_ += h_ * 0.25; w_ *= 0.5; h_ *= 0.5
                # header text is checked where the header really is (scroll 0); everything else in the strip of the viewport below the stuck header
                inh = y_ + sy < hdr[3] + 2 and x < hdr[2] and y_ + sy + h_ > hdr[1] - 2 and y_ + sy < 120
                top = (hdr[3] + 4) if sy > 0 else 0
                ya, yb = y_ - sy, y_ - sy + h_
                if inh and sy != 0:
                    continue
                if not ((ya >= top and yb <= VH - 2) or (inh and sy == 0)):
                    continue
                done.add((k, ri))
                x0, y0 = int(max(0, x + 1)), int(max(0, ya + 1)); x1, y1 = int(min(im.width, x + w_ - 1)), int(min(im.height, yb - 1))
                if x1 <= x0 or y1 <= y0:
                    continue
                crop = im.crop((x0, y0, x1, y1)).resize((max(1, min(40, x1 - x0)), max(1, min(12, y1 - y0))))
                worst = None
                a = it["c"][3] * it["op"]
                for px in list(crop.getdata()):
                    f = [a * it["c"][q] + (1 - a) * px[q] for q in range(3)]
                    la, lb = lum(f), lum(px)
                    rr = (max(la, lb) + 0.05) / (min(la, lb) + 0.05)
                    if worst is None or rr < worst:
                        worst = rr
                need = 3.0 if (it["px"] >= 24 or (it["px"] >= 18.66 and it["bold"])) else 4.5
                checked += 1
                if worst < need:
                    problems.append(f"{scheme} {w}px {view}: {it['s']!r} ({it['px']:.1f}px) contrast {worst:.2f} needs {need}")


with sync_playwright() as pw:
    for w in widths:
        for scheme in (("light", "dark") if "--scheme" not in args else [args[args.index("--scheme") + 1]]):
            for view in (VIEWS if "--only" not in args else [args[args.index("--only") + 1]]):
                run(pw, w, scheme, view)
if problems:
    print(f"MEASURED TEXT CONTRAST FAILED: {len(problems)} of {checked} pieces of text below their limit")
    for x in problems[:60]:
        print("  -", x.encode("ascii", "replace").decode())
    sys.exit(1)
print(f"MEASURED TEXT CONTRAST PASSED: {checked} pieces of text, light and dark, dashboard and Story, widths {widths}")
