"""Tests the Story in two layers: a short read by default, the full analysis of each chapter in one fold.
   python tools/story_layers_test.py [--browser chromium|webkit|firefox|all] [--site docs]
It checks: the word budget with every fold closed, nothing lost against preview/story_baseline.json (made by tools/story_inventory.py before the change),
the numbers of the short layer against the result files, charts that have a size after the fold is opened (desktop and phone), the reading-mode switch
(with and without working storage), deep links into folds, the keyboard, the phone width, the guesses and their reveals, and the chart labels. Needs Playwright."""
import csv, json, re, sys
from pathlib import Path
from playwright.sync_api import sync_playwright

args = sys.argv[1:]
browser = args[args.index("--browser") + 1] if "--browser" in args else "chromium"
site = Path(args[args.index("--site") + 1]) if "--site" in args else Path("docs")
ROOT = Path(__file__).resolve().parent.parent
URL = (site / "index.html").resolve().as_uri() + "#story"
BASE = json.loads((ROOT / "preview" / "story_baseline.keep.json").read_text(encoding="utf-8"))
BUDGET_TOTAL, PROSE_MAX = 1300, 70
problems, passed = [], [0]


def ok(cond, msg):
    if cond:
        passed[0] += 1
    else:
        problems.append(msg)
        print("FAIL", msg)


def rows(name):
    with open(ROOT / "results" / name, encoding="utf-8") as f:
        return list(csv.DictReader(f))


def n0(x):
    return str(int(float(x) + 0.5))


def launch(p, engine):
    if engine == "chromium":
        return p.chromium.launch(channel="chrome")
    return p.firefox.launch() if engine == "firefox" else p.webkit.launch()


def open_story(b, w=1366, h=900, skip=True, init=None, storage=True):
    ctx = b.new_context(viewport={"width": w, "height": h}, reduced_motion="reduce")
    if init:
        ctx.add_init_script(init)
    pg = ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(URL)
    pg.wait_for_timeout(2200)
    if skip:
        skip_guesses(pg)
    return ctx, pg, errs


def revealed(pg, sel):
    # a scroll event can arrive late in a slow engine: wait up to four seconds for the answer
    try:
        pg.wait_for_function("(s) => !document.querySelector(s + ' .reveal').hidden", arg=sel, timeout=4000)
        return True
    except Exception:
        return False


def skip_guesses(pg):
    for _ in range(3):
        pg.evaluate("Array.from(document.querySelectorAll('#story .skiprow button')).filter(b => b.getClientRects().length).forEach(b => b.click())")
        pg.wait_for_timeout(450)


VIS = r"""() => {
  const words = s => (s.match(/\S+/g) || []).length, out = {}, prose = {};
  const closed = el => { for (let d = el.closest('details'); d; d = d.parentElement && d.parentElement.closest('details')) { if (!d.open && !(el.closest('summary') && el.closest('summary').parentElement === d)) return true; } return false; };
  const roots = Array.from(document.querySelectorAll('#story .opener, #story .story-wrap > section, #story .story-wrap > p.bridge, #story .closing'));
  let total = 0;
  for (const r of roots) {
    let n = 0;
    const w = document.createTreeWalker(r, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) {
      const el = w.currentNode.parentElement;
      if (!el || el.closest('svg, script, style, .sr') || !el.getClientRects().length || closed(el) || getComputedStyle(el).visibility === 'hidden') continue;
      n += words(w.currentNode.textContent);
    }
    const key = r.id || (r.classList.contains('bridge') ? 'bridge:' + r.textContent.slice(0, 12) : r.classList.contains('slim') ? 'sources' : r.className.split(' ')[0]);
    out[key] = n; total += n;
    if (r.classList.contains('chapter')) {
      // prose: visible sentences of the short layer, not chart text, not figure feet, not the guess controls
      let pw = 0;
      r.querySelectorAll('p').forEach(p => {
        if (closed(p) || !p.getClientRects().length || p.closest('.fig-foot, fieldset, .skiprow, .row, .bars, .stacks, .meter, .facts, .eu-wrap, .mapwrap, .limits, .found, summary, .sr')) return;
        if (p.classList.contains('hint') && p.parentElement.classList.contains('story-body')) return;
        pw += words(p.textContent);
      });
      prose[r.id] = pw;
    }
  }
  out.__total = total; out.__prose = prose; return out;
}"""

SKIP_AND_TEXT = "document.getElementById('story').textContent"


def norm(s):
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", s.lower())).strip()


# what the baseline has that the new page deliberately does not: the old "Show the details" wrapper label, the old link label, and the cut bridge sentences
ALLOWED_GONE = {
    "show the details",
    "the rest has to come from the metal itself who digs it up and who uses it",
    "on the demand side which new uses could need much more of it",
    "when copper costs this much why not carry the current with aluminium instead",
}


def run(engine):
    with sync_playwright() as p:
        b = launch(p, engine)
        tag = f"[{engine}]"

        # ------------------------------------------------ words and height, desktop
        ctx, pg, errs = open_story(b)
        v = pg.evaluate(VIS)
        total = v["__total"]
        height = pg.evaluate("document.documentElement.scrollHeight")
        print(f"{tag} visible words with every fold closed: {total}, page height {height} px")
        for k, n in v.items():
            if not k.startswith("__"):
                print(f"{tag}   {k:22} {n}")
        print(f"{tag}   short-layer prose per chapter: {v['__prose']}")
        ok(total <= BUDGET_TOTAL, f"{tag} the Story shows {total} words with every fold closed, the budget is {BUDGET_TOTAL}")
        for ch, n in v["__prose"].items():
            if ch != "summary":      # chapter 8 is the seven required sentences, one per chapter (reported, counted in the total)
                ok(n <= PROSE_MAX, f"{tag} chapter {ch}: {n} words of short-layer prose, the limit is {PROSE_MAX}")
        for k, n in v.items():
            if k.startswith("bridge:"):
                ok(n <= 20, f"{tag} a bridge caption has {n} words, the limit is 20 ({k})")
        ok(not errs, f"{tag} page errors: {errs}")
        ok(pg.evaluate("document.querySelectorAll('#story details.fullx').length") == 8, f"{tag} every chapter needs one Full analysis fold")
        ok(pg.evaluate("document.querySelectorAll('#story details.fullx[open]').length") == 0, f"{tag} the folds start closed")
        ok(pg.evaluate("document.querySelector('.readmode button[aria-pressed=true]').textContent") == "Short read", f"{tag} the default reading mode is Short read")

        # ------------------------------------------------ nothing lost
        newtext = norm(pg.evaluate(SKIP_AND_TEXT))
        missing = []
        for sec, d in BASE["sections"].items():
            for it in d["items"]:
                t = it["text"]
                if it["tag"] in ("td", "th") or len(t.split()) < 3:
                    continue
                t = re.sub(r"Go to the chapter$", "", t).strip()
                if norm(t) in newtext:
                    continue
                for sent in re.split(r"(?<=[.!?])\s+", t):
                    ns = norm(sent)
                    if ns and len(ns.split()) >= 2 and ns not in newtext and ns not in ALLOWED_GONE:
                        missing.append((sec, sent))
        for sec, sent in missing[:12]:
            print(f"{tag} MISSING in {sec}: {sent[:120]}")
        ok(not missing, f"{tag} {len(missing)} baseline sentences are missing from the new page")
        # every table cell of the baseline is still on the page
        newcells = set(pg.evaluate("Array.from(document.querySelectorAll('#story td, #story th')).map(c => c.textContent.replace(/ +/g, ' ').trim())"))
        oldcells = {it["text"] for d in BASE["sections"].values() for it in d["items"] if it["tag"] in ("td", "th")}
        ok(oldcells <= newcells, f"{tag} table cells lost: {sorted(oldcells - newcells)[:6]}")

        # ------------------------------------------------ the numbers of the short layer against the result files
        uf = {r["fact_id"]: float(r["value"]) for r in rows("res_context_facts.csv") if re.match(r"^-?[0-9.]+$", r["value"])}
        rec = {r["fact_id"]: float(r["value"]) for r in rows("res_story_copper_record_facts.csv") if re.match(r"^-?[0-9.]+$", r["value"])}
        g1 = {r["fact_id"]: float(r["value"]) for r in rows("res_story_guess_dollar.csv")}
        facts_b = pg.evaluate("Array.from(document.querySelectorAll('#uses .facts b')).map(e => e.textContent)")
        ok(facts_b[:2] == [n0(uf["F06"]) + "%", n0(uf["F01"]) + "%"], f"{tag} chapter 1 facts {facts_b} against {n0(uf['F06'])}% and {n0(uf['F01'])}%")
        ans2 = pg.evaluate("document.querySelector('#record .answer').textContent")
        ok(f"${int(rec['nominal_latest']):,}" in ans2 and f"{n0(rec['real_peak_vs_latest_pct'])}% higher" in ans2, f"{tag} chapter 2 answer does not match the data: {ans2[:90]}")
        names = {"copper": "Copper", "gold": "Gold", "tin": "Tin", "brent": "Brent oil", "aluminium": "Aluminium"}
        bars = pg.evaluate("Array.from(document.querySelectorAll('#just-copper .brow')).map(r => [r.querySelector('.bname').childNodes[0].textContent, r.querySelector('.bval').textContent])")
        want = {names[r["commodity"]]: f"{n0(r['latest_pct_of_real_peak'])}% of its record" for r in rows("res_interlude_records.csv")}
        ok(dict(bars) == want, f"{tag} chapter 3 bars {dict(bars)} against {want}")
        ok(pg.evaluate("document.querySelector('#dollar .bignum').textContent") == n0(g1["r2_dollar_index"]) + "%", f"{tag} chapter 4 big number")
        ok(("tracks about " + n0(g1["r2_dollar_index"]) + "%") in pg.evaluate("document.querySelector('#dollar .bigcap').textContent"), f"{tag} chapter 4 caption")
        sup = rows("res_supply_countries.csv")
        top2 = sorted([r for r in sup if r["placeable"] == "1"], key=lambda r: -float(r["production_2025e_kt"]))[:2]
        china_ref = [r for r in rows("res_refined_vs_mined.csv") if r["country"] == "China"][0]["refinery_share_pct"]
        ans5 = pg.evaluate("document.querySelector('#supply .answer').textContent")
        ok(f"mine {n0(sum(float(r['share_of_world_production_pct']) for r in top2))}%" in ans5 and f"China refines {n0(china_ref)}%" in ans5, f"{tag} chapter 5 answer {ans5}")
        ref = [r for r in rows("res_demand_sensitivity.csv") if r["bar_order"] == "0"][0]
        pct1 = f"{float(ref['headline_total_pct_of_mine']):.1f}%"
        ok(pct1 in pg.evaluate("document.querySelector('#demand .answer').textContent") and pct1 in pg.evaluate("document.querySelector('#demand .stacks').textContent"), f"{tag} chapter 6 answer and bar need {pct1}")
        ok(not re.search(r"\b(gap|deficit|shortage)\b", pg.evaluate("document.querySelector('#demand').textContent"), re.I), f"{tag} demand wording")
        links = pg.evaluate("Array.from(document.querySelectorAll('#summary .golink')).map(a => a.textContent + '|' + a.getAttribute('href'))")
        ok(links == [f"Chapter {i}|#{h}" for i, h in enumerate(["uses", "record", "just-copper", "dollar", "supply", "demand", "aluminium"], 1)], f"{tag} summary links {links}")
        inline = pg.evaluate("Array.from(document.querySelectorAll('#summary .found li')).every(li => { const a = li.querySelector('a'), r = a.getBoundingClientRect(), t = li.firstChild.nextSibling; const rg = document.createRange(); rg.selectNodeContents(li.firstChild); const lr = rg.getBoundingClientRect(); return a.getClientRects().length && Math.abs((r.bottom) - (lr.bottom)) < 30 && li.getBoundingClientRect().height < 80; })")
        ok(inline, f"{tag} each Chapter link sits at the end of its sentence line")

        # ------------------------------------------------ chapter 2 chart: no events in the short layer, nine in the full layer, labels clear
        ok(pg.evaluate("document.querySelectorAll('#record .shortlayer .evdot, #record .shortlayer .evline').length") == 0, f"{tag} the short price chart must have no event markers")
        pg.evaluate("document.querySelector('#record details.fullx > summary').click()"); pg.wait_for_timeout(700)
        ok(pg.evaluate("document.querySelectorAll('#record details.fullx .evdot').length") == 9, f"{tag} the full price chart shows nine numbered events")
        ok(pg.evaluate("document.querySelectorAll('#record details.fullx .eventlist li').length") == 9, f"{tag} the event list has nine entries")
        ctx.close()

        # chart labels do not overlap at several widths
        for w in (1366, 1100, 900, 768, 600):
            ctx, pg, _ = open_story(b, w, 900)
            res = pg.evaluate("""() => {
              const svg = document.querySelector('#record .shortlayer svg[role=img]');
              const T = Array.from(svg.querySelectorAll('text')).filter(t => /^(Nominal|Real)/.test(t.textContent) || /October 2025/.test(t.textContent));
              const bb = T.map(t => { const r = t.getBoundingClientRect(); return [t.textContent, r.left, r.top, r.right, r.bottom]; });
              const clash = [];
              for (let i = 0; i < bb.length; i++) for (let j = i + 1; j < bb.length; j++) {
                const a = bb[i], c = bb[j];
                if (a[1] < c[3] && a[3] > c[1] && a[2] < c[4] && a[4] > c[2]) clash.push([a[0], c[0]]);
              }
              return { n: bb.length, clash };
            }""")
            ok(not res["clash"], f"{tag} price chart labels overlap at {w}px: {res['clash']}")
            ctx.close()

        # ------------------------------------------------ the full layer: charts get a size on first open, desktop and phone
        for name, w, h in (("desktop", 1366, 900), ("phone", 390, 844)):
            ctx, pg, _ = open_story(b, w, h)
            want_min = {"record": 1, "dollar": 2, "aluminium": 1}
            for cid in ("uses", "record", "just-copper", "dollar", "supply", "demand", "aluminium", "summary"):
                pg.evaluate("(id) => document.querySelector('#' + id + ' details.fullx > summary').click()", cid)
                pg.wait_for_timeout(500)
                sizes = pg.evaluate("(id) => Array.from(document.querySelectorAll('#' + id + ' details.fullx svg[viewBox]')).map(s => { const r = s.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })", cid)
                ok(all(a > 40 and b > 40 for a, b in sizes), f"{tag} {name} {cid}: a chart in the fold has no size {sizes}")
                ok(len(sizes) >= want_min.get(cid, 0), f"{tag} {name} {cid}: expected at least {want_min.get(cid, 0)} charts in the fold, found {len(sizes)}")
            ok(pg.evaluate("document.documentElement.scrollWidth") <= w + 1, f"{tag} {name} full mode: horizontal scroll ({pg.evaluate('document.documentElement.scrollWidth')} > {w})")
            ctx.close()

        # ------------------------------------------------ phone: short layer fits
        ctx, pg, _ = open_story(b, 390, 844)
        ok(pg.evaluate("document.documentElement.scrollWidth") <= 391, f"{tag} phone short read: horizontal scroll")
        over = pg.evaluate("""() => Array.from(document.querySelectorAll('#story .chapter')).map(c => { const kids = Array.from(c.querySelector('.story-body').children).filter(e => e.getClientRects().length); let bad = 0; for (let i = 1; i < kids.length; i++) { if (kids[i].getBoundingClientRect().top < kids[i-1].getBoundingClientRect().bottom - 1) bad++; } return bad; })""")
        ok(sum(over) == 0, f"{tag} phone: blocks overlap in the chapters {over}")
        ctx.close()

        # ------------------------------------------------ reading mode
        ctx, pg, _ = open_story(b)
        pg.evaluate("document.querySelector('.readmode').scrollIntoView()")
        pg.get_by_role("button", name="Full analysis", exact=True).first.click(); pg.wait_for_timeout(700)
        ok(pg.evaluate("document.querySelectorAll('#story details.fullx[open]').length") == 8, f"{tag} Full analysis should open all eight folds")
        ok(pg.evaluate("document.querySelector('.readmode button[aria-pressed=true]').textContent") == "Full analysis", f"{tag} the switch shows the mode")
        pg.reload(); pg.wait_for_timeout(2500)
        ok(pg.evaluate("document.querySelectorAll('#story details.fullx[open]').length") == 8, f"{tag} the reading mode must survive a reload")
        skip_guesses(pg)
        sizes = pg.evaluate("Array.from(document.querySelectorAll('#record details.fullx svg[viewBox]')).map(s => s.getBoundingClientRect().width)")
        ok(sizes and all(s > 40 for s in sizes), f"{tag} charts restored in full mode need a size {sizes}")
        pg.get_by_role("button", name="Short read", exact=True).first.click(); pg.wait_for_timeout(500)
        ok(pg.evaluate("document.querySelectorAll('#story details.fullx[open]').length") == 0, f"{tag} Short read should close all folds")
        pg.reload(); pg.wait_for_timeout(2500)
        ok(pg.evaluate("document.querySelectorAll('#story details.fullx[open]').length") == 0, f"{tag} Short read must survive a reload")
        ctx.close()
        ctx, pg, errs = open_story(b, init="Object.defineProperty(window, 'localStorage', { get() { throw new Error('storage is blocked'); } });")
        ok(pg.evaluate("document.querySelectorAll('#story details.fullx').length") == 8 and not errs, f"{tag} the Story must load with blocked storage {errs}")
        pg.get_by_role("button", name="Full analysis", exact=True).first.click(); pg.wait_for_timeout(500)
        ok(pg.evaluate("document.querySelectorAll('#story details.fullx[open]').length") == 8, f"{tag} the switch must work with blocked storage")
        ctx.close()

        # ------------------------------------------------ deep links
        targets = ["ev-title", "events", "dollar-nums", "numbers", "mr-title", "al-wins", "al-holds", "just-notes", "dm-explorer"]
        for hid in targets:
            ctx, pg, errs = open_story(b, skip=False)
            pg.goto(URL.replace("#story", "#" + hid)); pg.reload(); pg.wait_for_timeout(2600)
            st = pg.evaluate("(id) => { const el = document.getElementById(id); if (!el) return null; const r = el.getBoundingClientRect(); const d = el.closest('details.fullx'); return { open: d ? d.open : null, top: r.top, bottom: r.bottom, vh: innerHeight, shown: r.height > 0 }; }", hid)
            ok(st and st["open"] and st["shown"] and -5 <= st["top"] < st["vh"], f"{tag} deep link on load #{hid}: {st}")
            ctx.close()
            ctx, pg, errs = open_story(b, skip=False)
            pg.evaluate("window.scrollTo(0, 0)")
            pg.evaluate("(id) => { location.hash = '#' + id; }", hid); pg.wait_for_timeout(1200)
            st = pg.evaluate("(id) => { const el = document.getElementById(id); const r = el.getBoundingClientRect(); const d = el.closest('details.fullx'); return { open: d.open, top: r.top, vh: innerHeight, focus: document.activeElement === el }; }", hid)
            ok(st["open"] and -5 <= st["top"] < st["vh"] and st["focus"], f"{tag} deep link after load #{hid}: {st}")
            ok(not errs, f"{tag} errors on deep link #{hid}: {errs}")
            ctx.close()

        # ------------------------------------------------ keyboard
        ctx, pg, _ = open_story(b)
        pg.evaluate("document.querySelector('#just-copper').scrollIntoView()")
        pg.locator("#just-copper .fig-foot details.chipx > summary").focus()
        pg.keyboard.press("Tab")
        info = pg.evaluate("(() => { const a = document.activeElement; return { sum: a.tagName === 'SUMMARY' && !!a.closest('details.fullx'), vis: a.matches(':focus-visible'), outline: getComputedStyle(a).outlineStyle }; })()")
        ok(info["sum"] and info["vis"] and info["outline"] != "none", f"{tag} Tab should reach the Full analysis summary with a visible focus {info}")
        pg.keyboard.press("Enter"); pg.wait_for_timeout(200)
        ok(pg.evaluate("document.querySelector('#just-copper details.fullx').open"), f"{tag} Enter should open the fold")
        pg.keyboard.press("Space"); pg.wait_for_timeout(200)
        ok(not pg.evaluate("document.querySelector('#just-copper details.fullx').open"), f"{tag} Space should close the fold")
        ctx.close()

        # ------------------------------------------------ the guesses still work and the recap updates
        ctx, pg, errs = open_story(b, skip=False)
        ok(not pg.evaluate("document.querySelector('#record .reveal').hidden === false"), f"{tag} the chapter 2 answer waits for the guess")
        pg.evaluate("document.querySelector('#record input[value=b]').click()"); pg.wait_for_timeout(700)
        ok(pg.evaluate("!document.querySelector('#record .reveal').hidden && !!document.querySelector('#record .reveal details.fullx')"), f"{tag} the chapter 2 reveal shows the answer and its fold")
        pg.evaluate("document.querySelector('#g1-slider').value = 40; document.querySelector('#g1-slider').dispatchEvent(new Event('input')); document.querySelector('#g1-lock').click()"); pg.wait_for_timeout(900)
        order = pg.evaluate("""() => {
          const q = s => document.querySelector('#dollar ' + s), seq = [q('.bignum'), q('.bigcap'), q('.verdict'), q('.chapterrest .answer'), q('.meter'), q('.result:last-of-type p')];
          const names = ['big', 'caption', 'verdict', 'answer', 'meter', 'caution'];
          const miss = names.filter((n, i) => !seq[i]);
          let inOrder = true;
          for (let i = 1; i < seq.length; i++) if (seq[i] && seq[i-1] && !(seq[i-1].compareDocumentPosition(seq[i]) & Node.DOCUMENT_POSITION_FOLLOWING)) inOrder = false;
          return { miss, inOrder, cap: q('.bigcap').textContent, caution: seq[5] ? seq[5].textContent : null, euro: !!q('.meter').getAttribute('aria-label') && /10/.test(q('.meter').textContent) };
        }""")
        ok(not order["miss"] and order["inOrder"], f"{tag} chapter 4 order after the reveal: {order}")
        ok(order["cap"] == f"The broad US dollar index tracks about {n0(g1['r2_dollar_index'])}% of copper's monthly moves.", f"{tag} chapter 4 caption is the first sentence only: {order['cap']}")
        ok(order["caution"] == "This is a link in one sample. It is not proof of cause.", f"{tag} chapter 4 caution {order['caution']}")
        ok(order["euro"], f"{tag} the euro-alone figure stays on the meter")
        pg.wait_for_timeout(300)
        recap = pg.evaluate("Array.from(document.querySelectorAll('#summary .guesses li')).map(l => l.textContent)")
        ok(len(recap) == 2, f"{tag} the summary recap should list both guesses: {recap}")
        ok(not errs, f"{tag} guess errors {errs}")
        ctx.close()
        # a reader who scrolls past a guess gets the answer
        ctx, pg, errs = open_story(b, skip=False)
        pg.evaluate("document.querySelector('#just-copper').scrollIntoView()"); pg.wait_for_timeout(900)
        pg.evaluate("window.scrollBy(0, 300)"); pg.wait_for_timeout(900)
        ok(revealed(pg, "#record"), f"{tag} scrolling past chapter 2 should reveal its answer")
        pg.evaluate("document.querySelector('#supply').scrollIntoView()"); pg.wait_for_timeout(900)
        pg.evaluate("window.scrollBy(0, 300)"); pg.wait_for_timeout(900)
        ok(revealed(pg, "#dollar"), f"{tag} scrolling past chapter 4 should reveal its answer")
        ctx.close()

        # ------------------------------------------------ find in page (reported, not a pass/fail on the engine)
        ctx, pg, _ = open_story(b)
        phrase = "block bootstrap"
        res = pg.evaluate("(q) => { const found = window.find ? window.find(q) : null; return { found, open: document.querySelector('#dollar details.fullx').open }; }", phrase)
        print(f"{tag} find in page for {phrase!r} with the fold closed: window.find says {res['found']}, the fold opened: {res['open']}")
        ctx.close()
        b.close()


engines = ["chromium", "webkit", "firefox"] if browser == "all" else [browser]
for eng in engines:
    print("---", eng)
    run(eng)
if problems:
    print(f"STORY LAYERS TEST FAILED: {len(problems)} problem(s), {passed[0]} checks passed")
    for m in problems[:40]:
        print("  -", m)
    sys.exit(1)
print(f"STORY LAYERS TEST PASSED: {passed[0]} checks, browser {browser}")
