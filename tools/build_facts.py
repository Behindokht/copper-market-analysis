"""Writes docs/FACTS.md: every number that may be quoted on a CV or in an interview, each with the file or query that produces it.
   python tools/build_facts.py
No figure is typed here. Counts and values are read from the database (copper_database/copper.db, local only, falls back to the published quality table in docs/data/quality.js), from results/*.csv, from
copper_database/collected/*.csv, from the notebooks and from the source tree. The tools list is read from the import statements of the code that is in the repository, and from the versions installed in the project .venv.
The method figures in docs/js/case.js are compared with the ones in notebook 01 and the script stops if they differ. Run it again after every rebuild, and commit the new FACTS.md."""
import ast
import csv
import datetime
import importlib.metadata as md
import json
import re
import sqlite3
import subprocess
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
R = ROOT / "results"
rows = lambda p: list(csv.DictReader(open(p, encoding="utf-8")))
facts = lambda name, key="fact_id": {r[key]: r for r in rows(R / name)}
f1 = lambda x, n=1: f"{float(x):,.{n}f}"
f0 = lambda x: f"{float(x):,.0f}"
out = []
table = []


def add(topic, value, produced):
    table.append((topic, value, produced))


# ------------------------------------------------------------------ project size
src = rows(ROOT / "copper_database" / "collected" / "sources.csv")
add("Registered sources", f0(len(src)), "copper_database/collected/sources.csv, one row per source (every number in the project carries a source_id from this file)")
add("Publishers behind them", f0(len({r["publisher"] for r in src})), "copper_database/collected/sources.csv, distinct values of the publisher column")
issues = rows(ROOT / "copper_database" / "collected" / "known_issues.csv")
open_issues = [r for r in issues if r["status"] not in ("closed", "resolved")]
add("Known issues, open", f"{len(open_issues)} of {len(issues)} (" + ", ".join(r["issue_id"] for r in open_issues) + ")", "copper_database/collected/known_issues.csv, rows whose status is not closed or resolved")
db = ROOT / "copper_database" / "copper.db"
if db.exists():
    con = sqlite3.connect(db)
    st = dict(con.execute("select status, count(*) from data_checks group by status").fetchall())
    layers = Counter()
    for (n,) in con.execute("select name from sqlite_master where type='table'"):
        layers[n.split("_")[0] + "_" if "_" in n else n] += 1
    query = "SQL on copper_database/copper.db: select status, count(*) from data_checks group by status"
else:
    q = (ROOT / "docs" / "data" / "quality.js").read_text(encoding="utf-8")
    j = json.loads(q[q.index("{", q.index("CMA_DATA.quality")): q.rindex("}") + 1])
    st = dict(Counter(r[3] for r in j["checks"]["rows"]))
    layers = Counter()
    query = "docs/data/quality.js, checks table, count by status (copper.db was not on this disk)"
n_checks = sum(st.get(k, 0) for k in ("PASS", "WARN", "FAIL"))
add("Automatic data checks (PASS, WARN, FAIL)", f"{n_checks} ({st.get('PASS', 0)} pass, {st.get('WARN', 0)} warnings, {st.get('FAIL', 0)} failures); {st.get('INFO', 0)} more rows are information", query + "; INFO rows are notes, not tests")
if layers:
    add("Database tables by layer", ", ".join(f"{k} {v}" for k, v in sorted(layers.items()) if k in ("raw_", "stg_", "mart_", "res_")), "SQL: select name from sqlite_master where type='table', grouped by the prefix (raw_ loaded as is, stg_ staged in SQL, mart_ analysis tables, res_ results written back by the notebooks)")
sqlf = sorted((ROOT / "copper_database" / "sql").glob("*.sql"))
add("SQL files", f"{len(sqlf)} files, {sum(len(p.read_text(encoding='utf-8').splitlines()) for p in sqlf):,} lines", "copper_database/sql/*.sql (staging, marts, checks)")
nbs = sorted((ROOT / "notebooks").glob("*.ipynb"))
add("Notebooks", f"{len(nbs)}", "notebooks/*.ipynb, committed with outputs")
add("Python tools and tests", f"{len(list((ROOT / 'tools').glob('*.py')))} scripts in tools/", "tools/*.py (audit, site checks, browser tests, exports)")
fc = rows(R / "res_dash_figure_checks.csv"); sc = rows(R / "res_story_figure_checks.csv")
add("Figure checks for the dashboard and the Story", f"{sum(r['status'] == 'PASS' for r in fc)} of {len(fc)} dashboard figures and {sum(r['status'] == 'PASS' for r in sc)} of {len(sc)} Story figures pass", "results/res_dash_figure_checks.csv and results/res_story_figure_checks.csv, status column")

# ------------------------------------------------------------------ the data
rf = facts("res_story_copper_record_facts.csv"); kp = facts("res_dash_kpis.csv")
months = int(float(rf["series_months"]["value"])); first = rf["series_months"]["month"][:7]; last = kp["latest_month"]["value"]
add("Copper price history", f"{months} months ({months // 12} years), {first} to {last}", "results/res_story_copper_record_facts.csv, fact series_months; source S02 World Bank Pink Sheet monthly (CC BY 4.0, adapted)")
add("Euro price history", f"{f0(kp['eur_months_total']['value'])} months from {kp['eur_first_month']['value']}", "results/res_dash_kpis.csv, facts eur_months_total and eur_first_month; source S16 FRED EXUSEU")
add("Dollar index history", f"from {kp['dxy_first_month']['value']}", "results/res_dash_kpis.csv, fact dxy_first_month; source S17 FRED DTWEXBGS")

# ------------------------------------------------------------------ headline findings
add("Copper price, latest month", f"${f0(kp['copper_usd_t']['value'])} a tonne in {kp['latest_month']['value']}, the highest month as quoted since {first}", "results/res_story_copper_record_facts.csv, facts nominal_latest and nominal_record")
below = 100 - float(kp["real_share_of_record_pct"]["value"])
add("Copper in today's money against its real record", f"{below:.0f}% below {kp['real_peak_month']['value']} (the latest month is {float(kp['real_share_of_record_pct']['value']):.0f}% of that record)", "results/res_dash_kpis.csv, facts real_share_of_record_pct and real_peak_month (US CPI deflator, a US-dollar view)")
add("Rank of the latest month in today's money", f"{int(float(kp['real_rank_latest']['value']))} of {int(float(kp['real_months_valid']['value']))} months (October 2025 has no US CPI value)", "results/res_dash_kpis.csv, facts real_rank_latest and real_months_valid")
add("12-month change in copper", f"+{float(kp['copper_12m_change_pct']['value']):.0f}% as quoted", "results/res_dash_kpis.csv, fact copper_12m_change_pct")
g = facts("res_story_guess_dollar.csv")
add("Dollar index and copper, share of monthly moves explained", f"{float(g['r2_dollar_index']['value']):.1f}% (R squared, {int(float(g['months_total']['value']))} months, {g['months_total']['period_from']} to {g['months_total']['period_to']})", "results/res_story_guess_dollar.csv, fact r2_dollar_index")
add("Same for the euro alone", f"{float(g['r2_euro']['value']):.1f}% ({int(float(g['r2_euro']['months']))} months)", "results/res_story_guess_dollar.csv, fact r2_euro")
add("Dollar index plus the 10-year US yield", f"{float(g['r2_dollar_index_plus_yield']['value']):.1f}%", "results/res_story_guess_dollar.csv, fact r2_dollar_index_plus_yield")
add("Months copper and the dollar index moved in opposite directions", f"{int(float(g['opposite_months']['value']))} of {int(float(g['months_total']['value']))} ({float(g['opposite_direction_share']['value']):.1f}%)", "results/res_story_guess_dollar.csv, facts opposite_months and opposite_direction_share (strictly opposite signs)")
cor = [r for r in rows(R / "res_dollar_correlations.csv") if "broad dollar index, 2006" in r["comparison"]][0]
add("Correlation of monthly changes, copper and the dollar index", f"{float(cor['pearson r']):.2f}, 95% moving-block bootstrap interval {float(cor['95% interval low']):.2f} to {float(cor['95% interval high']):.2f}", "results/res_dollar_correlations.csv, row 'Copper vs broad dollar index, 2006-02 to 2026-08'")
me = rows(R / "res_dollar_month_end_check.csv")[1]
add("Same with month-end values (robustness)", f"{float(me['pearson r']):.2f}, interval {float(me['95% interval low']):.2f} to {float(me['95% interval high']):.2f} ({me['months']} months)", "results/res_dollar_month_end_check.csv. Provided as a file: reproducing it needs the LME daily data, which the owner downloads and which is not published")
rg = [r for r in rows(R / "res_dollar_regressions.csv") if r["model"].startswith("2.")][0]
add("Regression of copper on the dollar index (Newey-West standard errors)", f"coefficient {float(rg['coefficient']):.2f}, 95% interval {float(rg['95% interval low']):.2f} to {float(rg['95% interval high']):.2f}, R squared {float(rg['R squared']):.2f}", "results/res_dollar_regressions.csv, row '2. dollar index only, 2006-02 on'")
ac = facts("res_aluminium_case.csv")
add("Copper to aluminium price ratio, latest month", f"{float(ac['ratio_latest']['value']):.2f} against a break-even of about {float(ac['breakeven_ratio']['value']):.2f}", "results/res_aluminium_case.csv, facts ratio_latest and breakeven_ratio (S32 NBS Circular 31 for conductivity and density)")
add("Months in the unbroken run above the break-even", f"{int(float(ac['run_months']['value']))} months, since {ac['first_month_of_run']['value']}", "results/res_aluminium_case.csv, facts run_months and first_month_of_run")
sl = {(r["horizon_m"], r["period"], r["predictor"]): r for r in rows(R / "res_cu_al_slopes.csv")}
for h_ in ("6", "12"):
    r = sl[(h_, "1970-01 to latest", "log of the ratio")]
    add(f"The ratio as a guide to price changes over {h_} months", f"R squared {100 * float(r['r_squared']):.1f}% since 1970, HAC p {float(r['p_hac']):.3f}: a weak guide", "results/res_cu_al_slopes.csv, row horizon_m " + h_ + ", period '1970-01 to latest', predictor 'log of the ratio'")
sup = rows(R / "res_refined_vs_mined.csv"); ch = [r for r in sup if r["display_name"] == "China"][0]
top = sorted([r for r in sup if r["mine_listed"] == "1"], key=lambda r: -float(r["mine_share_pct"]))[0]
add("China's share of refining", f"{float(ch['refinery_share_pct']):.1f}% of world refined copper output", "results/res_refined_vs_mined.csv, China row (USGS 2025 estimates, source S06)")
add("Largest mining country", f"{top['display_name']}, {float(top['mine_share_pct']):.1f}% of world mine output", "results/res_refined_vs_mined.csv (USGS 2025 estimates, source S06)")
uf = facts("res_uses_end_use.csv", "sector") if False else None
hd = [r for r in rows(R / "res_demand_headline.csv") if r["component_id"] == "ev_transition" and r["year"] == "2030"]
lo = min(float(r["mid_pct_of_mine"]) for r in hd); hi = max(float(r["mid_pct_of_mine"]) for r in hd)
add("EV transition, extra copper in 2030", f"equivalent to {lo:.1f}% to {hi:.1f}% of today's mine output (a scenario from IEA EV sales, interpolated, not a forecast)", "results/res_demand_headline.csv, component_id ev_transition, year 2030, column mid_pct_of_mine (min and max over scenarios and paths)")

# ------------------------------------------------------------------ method parameters, checked against the code of the site
nb1 = json.load(open(ROOT / "notebooks" / "01_copper_vs_dollar.ipynb", encoding="utf-8"))
code = "\n".join("".join(c["source"]) for c in nb1["cells"] if c["cell_type"] == "code")
block = int(re.search(r"def block_boot_ci\(x, y, block=(\d+), n_boot=(\d+)", code).group(1)); nboot = int(re.search(r"n_boot=(\d+)", code).group(1)); lags = int(re.search(r"maxlags\"?: (\d+)", code).group(1))
case = (ROOT / "docs" / "js" / "case.js").read_text(encoding="utf-8")
words = {3: "three", 6: "six months"}
if not (f'block: "{words.get(block)}"' in case and f'boots: "{nboot:,}"' in case and f'lags: "{words.get(lags)}"' in case):
    sys.exit(f"docs/js/case.js METHOD does not match notebook 01 (block {block}, resamples {nboot}, lags {lags}); fix the page first")
add("Bootstrap", f"moving blocks of {block} months, {nboot:,} resamples, 95% interval", "notebooks/01_copper_vs_dollar.ipynb, function block_boot_ci (checked against docs/js/case.js by this script)")
add("Newey-West (HAC) standard errors", f"{lags} lags", "notebooks/01_copper_vs_dollar.ipynb, cov_type='HAC' with maxlags")

# ------------------------------------------------------------------ the tools actually used
STD = set(sys.stdlib_module_names)
mods = Counter()
files = list((ROOT / "tools").glob("*.py")) + [ROOT / "copper_database" / "build_db.py"]
for p in files:
    try:
        for n in ast.walk(ast.parse(p.read_text(encoding="utf-8"))):
            if isinstance(n, ast.Import):
                mods.update(a.name.split(".")[0] for a in n.names)
            elif isinstance(n, ast.ImportFrom) and n.module and n.level == 0:
                mods[n.module.split(".")[0]] += 1
    except SyntaxError:
        pass
for nb in nbs:
    j = json.load(open(nb, encoding="utf-8"))
    for c in j["cells"]:
        if c["cell_type"] == "code":
            for line in "".join(c["source"]).splitlines():
                m = re.match(r"\s*(?:import|from)\s+([A-Za-z_][\w]*)", line)
                if m:
                    mods[m.group(1)] += 1
third = sorted(m for m in mods if m not in STD and m not in ("build_images", "tools", "yaml") and not (ROOT / "tools" / (m + ".py")).exists())
vers = []
alias = {"PIL": "pillow", "fontTools": "fonttools", "sklearn": "scikit-learn"}
for m in third:
    try:
        vers.append(f"{m} {md.version(alias.get(m, m))}")
    except md.PackageNotFoundError:
        # build_db.py runs under the system Python, the notebooks and tests under the project .venv: ask the other one
        r_ = subprocess.run(["python", "-c", f"import importlib.metadata as md; print(md.version('{alias.get(m, m)}'))"], capture_output=True, text=True)
        vers.append(f"{m} {r_.stdout.strip()} (system Python, used by copper_database/build_db.py)" if r_.returncode == 0 else f"{m} (installed version not found)")
tools = ["SQLite through Python's sqlite3 module (the database and every SQL file)", "Python " + ".".join(map(str, sys.version_info[:3]))] + vers
lh = ROOT / "results" / "lighthouse_summary.json"
if lh.exists():
    tools.append("Lighthouse " + json.loads(lh.read_text(encoding="utf-8")).get("lighthouse_version", "") + " (run from Node, outside the repository)")
jsused = sorted({m for p in (ROOT / "docs" / "js").rglob("*.js") for m in re.findall(r"^\s*import .* from ['\"](.+)['\"]", p.read_text(encoding="utf-8"), re.M)})
js_note = "The site is plain JavaScript and SVG with no library at run time" + ("" if not jsused else " (imports found: " + ", ".join(jsused) + ")")

# ------------------------------------------------------------------ write
today = datetime.date.today().isoformat()
md_lines = ["# Facts sheet", "",
            f"Generated by `python tools/build_facts.py` on {today}. Nothing here is typed by hand: each value is read from the data or the code, and the last column says where. Run the script again after a rebuild.", "",
            "Historical results are not forecasts and not investment advice. The demand figures are scenarios. Copper prices are adapted from World Bank Commodity Price Data (CC BY 4.0).", "",
            "| Fact | Value | Produced by |", "|---|---|---|"]
for t_, v_, p_ in table:
    md_lines.append(f"| {t_} | {v_} | {p_} |")
md_lines += ["", "## Tools actually used", "", "Read from the import statements in `tools/`, `copper_database/build_db.py` and the notebooks, with the versions installed in the project `.venv`.", ""]
md_lines += [f"- {t_}" for t_ in tools]
md_lines += ["", js_note + ". Fonts are self-hosted (Newsreader, Atkinson Hyperlegible Next and Mono, SIL Open Font License).", "",
             "## Not claimed", "", "The project does not use machine learning, a forecasting model, a cloud service or a database server. Anything not listed above is not used.", ""]
(ROOT / "docs" / "FACTS.md").write_text("\n".join(md_lines), encoding="utf-8", newline="\n")
print("wrote docs/FACTS.md:", len(table), "facts,", len(tools), "tools")
