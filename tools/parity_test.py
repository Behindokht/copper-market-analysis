"""Parity test: the browser's period changes and rebased values on the Dashboard must match the Python table results/res_dash_changes.csv (notebook 07).
Twelve filter combinations are tested: four periods (1Y, 5Y, 20Y, All) by USD as quoted, EUR as quoted and USD in today's money.
It also checks that the figures printed in the KPI band equal the Python latest-month figures (results/res_dash_kpis.csv) and that the data-health counts equal the checks file.
  python tools/parity_test.py [--browser chromium|webkit|both] [--site docs]
Tolerance: 0.01 (percentage points for changes, index points for rebased values). Exit code 1 if anything differs. Needs Playwright (the project .venv)."""
import csv
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
TOL = 0.01
args = sys.argv[1:]
browser = args[args.index("--browser") + 1] if "--browser" in args else "chromium"
site = Path(args[args.index("--site") + 1]).resolve() if "--site" in args else ROOT / "docs"
url = (site / "index.html").as_uri()

ref = {(r["period"], r["currency"], r["prices"]): r for r in csv.DictReader((ROOT / "results" / "res_dash_changes.csv").open(encoding="utf-8"))}
kp = {r["fact_id"]: r["value"] for r in csv.DictReader((ROOT / "results" / "res_dash_kpis.csv").open(encoding="utf-8"))}
checks = list(csv.DictReader((ROOT / "results" / "res_dashboard_checks.csv").open(encoding="utf-8")))
health = {s: sum(1 for c in checks if c["status"] == s) for s in ("PASS", "WARN", "FAIL")}

last_row = list(csv.DictReader((ROOT / "results" / "res_dash_series.csv").open(encoding="utf-8")))[-1]
problems, n_compared = [], 0


def close(a, b):
    return abs(float(a) - float(b)) <= TOL


def run(engine):
    global n_compared
    with sync_playwright() as p:
        b = p.chromium.launch(channel="chrome") if engine == "chromium" else p.webkit.launch()
        pg = b.new_page(viewport={"width": 1280, "height": 900}, reduced_motion="reduce")
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        for period in ("1y", "5y", "20y", "all"):
            for cur, prices in (("usd", "nominal"), ("eur", "nominal"), ("usd", "real")):
                pg.goto(url + f"#dashboard?p={period}&c={cur}&v={prices}")
                pg.reload()
                pg.wait_for_selector("#dashboard .grid")
                snap = pg.evaluate("window.CMA.dash.snapshot()")
                r = ref[(period, cur, prices)]
                tag = f"[{engine}] {period} {cur} {prices}"
                s = snap["snap"]
                if s["start_month"] != r["start_month"]:
                    problems.append(f"{tag}: start month {s['start_month']} vs Python {r['start_month']}")
                if not close(s["copper_change_pct"], r["copper_change_pct"]):
                    problems.append(f"{tag}: copper change {s['copper_change_pct']:.4f} vs Python {r['copper_change_pct']}")
                n_compared += 2
                if s["dxy_start_month"] != r["dxy_start_month"] or not close(s["dxy_change_pct"], r["dxy_change_pct"]):
                    problems.append(f"{tag}: dollar index change {s['dxy_start_month']} {s['dxy_change_pct']:.4f} vs Python {r['dxy_start_month']} {r['dxy_change_pct']}")
                if not close(s["ratio_start"], r["ratio_start"]):
                    problems.append(f"{tag}: ratio at the start {s['ratio_start']} vs Python {r['ratio_start']}")
                n_compared += 2
                for k in ("dollar_rose_n", "copper_fell_when_rose_n", "dollar_fell_n", "copper_rose_when_fell_n"):
                    n_compared += 1
                    if int(s[k]) != int(r[k]):
                        problems.append(f"{tag}: {k} {s[k]} vs Python {r[k]}")
        # each metal's share of its own real record in the latest month (the small multiples)
        pg.goto(url + "#dashboard")
        pg.reload()
        pg.wait_for_selector("#dashboard .grid")
        snap = pg.evaluate("window.CMA.dash.snapshot()")
        for k in ("cu", "al", "gold", "tin", "brent"):
            n_compared += 1
            if not close(snap["snap"]["rec_latest"][k], last_row[k + "_rec_pct"]):
                problems.append(f"[{engine}] share of own record, {k}: {snap['snap']['rec_latest'][k]:.4f} vs Python {last_row[k + '_rec_pct']}")
        # the figures as printed in the band of key figures (the latest month; the euro figure does not depend on the filters) and in the status line
        for q in ("", "?p=1y&c=eur&v=nominal"):
            pg.goto(url + "#dashboard" + q)
            pg.reload()
            pg.wait_for_selector("#dashboard .grid")
            txt = lambda k: pg.locator(f'#dashboard .kpi[data-k="{k}"] .k-v').inner_text().strip()
            chip = lambda k: pg.locator(f'#dashboard .kpi[data-k="{k}"] .chip2').inner_text().strip().replace("\u2212", "-")
            want = {"cu": "$" + format(round(float(kp["copper_usd_t"])), ",") + "/t", "eur": "\u20ac" + format(round(float(kp["copper_eur_t"])), ",") + "/t",
                    "real": str(round(float(kp["real_share_of_record_pct"]))) + "%", "ratio": f"{float(kp['ratio_latest']):.2f}\u00d7", "dxy": f"{float(kp['dxy_latest']):.1f}"}
            for k, v in want.items():
                n_compared += 1
                if txt(k) != v:
                    problems.append(f"[{engine}] key figure {k} ({q or 'default'}): page shows {txt(k)!r}, Python gives {v!r}")
            for k, fact in (("cu", "copper_12m_change_pct"), ("dxy", "dxy_12m_change_pct")):
                n_compared += 1
                w = ("+" if float(kp[fact]) >= 0 else "-") + f"{abs(float(kp[fact])):.1f}%"
                if chip(k) != w:
                    problems.append(f"[{engine}] change chip {k}: page shows {chip(k)!r}, Python gives {w!r}")
            n_compared += 1
            ctx = pg.locator('#dashboard .kpi[data-k="real"] .k-c').inner_text()
            if f"{int(float(kp['real_rank_latest']))}" not in ctx or f"out of {int(float(kp['real_months_valid']))}" not in ctx:
                problems.append(f"[{engine}] today's money context: page shows {ctx!r}, Python gives rank {kp['real_rank_latest']} of {kp['real_months_valid']}")
        st = " ".join(pg.locator("#status").inner_text().split())
        n_compared += 1
        if f"{health['PASS']} checks passed" not in st or f"{health['FAIL']} failures" not in st or f"{health['WARN']} warnings" not in st:
            problems.append(f"[{engine}] status line: page shows {st!r}, the checks file gives {health}")
        problems.extend(f"[{engine}] script error: {e}" for e in errs)
        b.close()


for eng in (["chromium", "webkit"] if browser == "both" else [browser]):
    run(eng)

if problems:
    print(f"PARITY FAILED: {len(problems)} difference(s) in {n_compared} comparisons")
    for x in problems:
        print("  -", x)
    sys.exit(1)
print(f"PARITY PASSED: {n_compared} comparisons, tolerance {TOL}, browser {browser}")
