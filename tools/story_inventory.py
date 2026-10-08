"""Saves a text inventory of the Story page: every sentence per chapter, visible or folded, with word counts.
   python tools/story_inventory.py [OUT.json] [--site docs] [--browser chromium|webkit|firefox]
Guesses are skipped (the answers shown), then every <details> is opened and each text block is listed with where it sits: the layer it is in (open on load, or inside a fold)."""
import json, re, sys
from pathlib import Path
from playwright.sync_api import sync_playwright

args = sys.argv[1:]
out = Path(next((a for a in args if a.endswith(".json")), "preview/story_baseline.json"))
site = Path(args[args.index("--site") + 1]) if "--site" in args else Path("docs")
browser = args[args.index("--browser") + 1] if "--browser" in args else "chromium"
URL = (site / "index.html").resolve().as_uri() + "#story"

JS = r"""
() => {
  const BLOCK = 'p.bridge,h1,h2,h3,h4,p,li,figcaption,summary,legend,label,button.linkbtn,a.btn,td,th,.bignum,.bigcap,.verdict,.kicker,.ch,.cap,.src,.note,div.sub,div.t';
  const words = s => (s.match(/\S+/g) || []).length;
  const chapters = Array.from(document.querySelectorAll('#story section.chapter'));
  const secs = [['opener', document.querySelector('#story .opener')], ['drivers', document.querySelector('#story .story-wrap > section.sheet:not(.chapter)')]]
    .concat(chapters.map((c, i) => [c.id, c]))
    .concat(Array.from(document.querySelectorAll('#story .story-wrap > p.bridge')).map((b, i) => ['bridge' + (i + 1), b]))
    .concat([['sources', document.querySelector('#story .sheet.slim')], ['closing', document.querySelector('#story .closing')]]);
  const res = {};
  for (const [id, root] of secs) {
    if (!root) continue;
    const items = [], seen = new Set();
    root.querySelectorAll(BLOCK).forEach(el => {
      if (el.closest('svg')) return;
      if (el.closest('.sr, [hidden]') && !el.closest('details')) { /* screen-reader-only or hidden text still counts as content */ }
      // skip a block that holds other blocks (its children are listed on their own)
      if (el.querySelector(BLOCK.split(',').filter(s => !/^(label|button.linkbtn)$/.test(s)).join(','))) return;
      const text = el.textContent.replace(/\s+/g, ' ').trim();
      if (!text) return;
      const det = el.closest('details');
      const sr = !!el.closest('.sr');
      const key = text + '|' + (det ? 'f' : 'o');
      if (seen.has(key)) return; seen.add(key);
      items.push({ text, words: words(text), fold: det ? (det.querySelector('summary') ? det.querySelector('summary').textContent.replace(/\s+/g, ' ').trim().slice(0, 50) : 'details') : null, sr, tag: el.tagName.toLowerCase() });
    });
    const svgWords = Array.from(root.querySelectorAll('svg text')).reduce((n, t) => n + words(t.textContent), 0);
    res[id] = { items, svg_text_words: svgWords, details: Array.from(root.querySelectorAll('details')).map(d => ({ summary: (d.querySelector('summary') || {}).textContent, open: d.open, id: d.id || null })) };
  }
  return res;
}
"""

with sync_playwright() as p:
    b = {"chromium": lambda: p.chromium.launch(channel="chrome"), "webkit": p.webkit.launch, "firefox": p.firefox.launch}[browser]()
    ctx = b.new_context(viewport={"width": 1366, "height": 900}, reduced_motion="reduce")
    pg = ctx.new_page()
    pg.goto(URL); pg.wait_for_timeout(2500)
    # one pass with the guesses skipped and nothing opened by hand: the "visible by default" state
    for _ in range(4):
        pg.evaluate("Array.from(document.querySelectorAll('#story .skiprow button')).filter(b => b.getClientRects().length).forEach(b => b.click())"); pg.wait_for_timeout(500)
    pg.wait_for_timeout(800)
    metrics = pg.evaluate("() => ({ height: document.documentElement.scrollHeight, openDetails: Array.from(document.querySelectorAll('#story details')).filter(d => d.open).length, details: document.querySelectorAll('#story details').length })")
    data = pg.evaluate(JS)
    # visible words: the blocks that are rendered (not inside a closed details, not hidden) and not screen-reader only
    vis = pg.evaluate(r"""() => {
      const out = {};
      const words = s => (s.match(/\S+/g) || []).length;
      const roots = Array.from(document.querySelectorAll('#story .opener, #story .story-wrap > section, #story .story-wrap > p.bridge, #story .closing'));
      let total = 0;
      for (const r of roots) {
        let n = 0;
        const walker = document.createTreeWalker(r, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          const t = walker.currentNode, el = t.parentElement;
          if (!el || el.closest('svg, script, style, .sr')) continue;
          if (!el.getClientRects().length) continue;
          let closed = false;
          for (let d = el.closest('details'); d; d = d.parentElement && d.parentElement.closest('details')) { if (!d.open && !(el.closest('summary') && el.closest('summary').parentElement === d)) { closed = true; break; } }
          if (closed) continue;
          const cs = getComputedStyle(el);
          if (cs.visibility === 'hidden') continue;
          n += words(t.textContent);
        }
        out[r.id || (r.getAttribute('aria-labelledby') === 'h-drv' ? 'drivers' : r.classList.contains('slim') ? 'sources' : r.classList.contains('bridge') ? 'bridge:' + r.textContent.slice(0, 18) : r.className.split(' ')[0] || r.tagName)] = n; total += n;
      }
      out.__total = total; return out;
    }""")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"browser": browser, "viewport": "1366x900", "guesses": "skipped", "metrics": metrics, "visible_words": vis, "sections": data}, indent=1, ensure_ascii=False), encoding="utf-8")
    print(browser, metrics, "visible words", vis["__total"])
    for k, v in vis.items():
        if k != "__total": print(f"  {k:14} {v}")
    b.close()
