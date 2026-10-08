"""Writes README.md (repository root) from the data, so its numbers cannot drift from the analysis.
   python tools/build_readme.py
Numbers come from results/*.csv, copper_database/collected/*.csv and the database (or the published quality table). The pictures are made by tools/build_images.py. Under 150 lines, no dashes as punctuation."""
import csv
import json
import sys
import re
import sqlite3
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
import iea_notice as IEA
R = ROOT / "results"
rd = lambda p: list(csv.DictReader(open(p, encoding="utf-8")))
fa = lambda name: {r["fact_id"]: r["value"] for r in rd(R / name)}
kp, g, ac, rf = fa("res_dash_kpis.csv"), fa("res_story_guess_dollar.csv"), fa("res_aluminium_case.csv"), fa("res_story_copper_record_facts.csv")
src = rd(ROOT / "copper_database" / "collected" / "sources.csv")
issues = [r for r in rd(ROOT / "copper_database" / "collected" / "known_issues.csv") if r["status"] not in ("closed", "resolved")]
db = ROOT / "copper_database" / "copper.db"
if db.exists():
    st = dict(sqlite3.connect(db).execute("select status, count(*) from data_checks group by status").fetchall())
else:
    q = (ROOT / "docs" / "data" / "quality.js").read_text(encoding="utf-8")
    st = dict(Counter(r[3] for r in json.loads(q[q.index("{", q.index("CMA_DATA.quality")): q.rindex("}") + 1])["checks"]["rows"]))
checks = st.get("PASS", 0) + st.get("WARN", 0) + st.get("FAIL", 0)
cor = [r for r in rd(R / "res_dollar_correlations.csv") if "broad dollar index, 2006" in r["comparison"]][0]
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
MONTH = lambda ym: MONTHS[int(ym[5:7]) - 1] + " " + ym[:4]
price = f"${float(kp['copper_usd_t']):,.0f}"
below = 100 - float(kp["real_share_of_record_pct"])
peak = kp["real_peak_month"]
months = int(float(rf["series_months"]))
URL = "https://behindokht.github.io/copper-market-analysis/"
LIC = {"S02": "World Bank Commodity Price Data (Pink Sheet), adapted: CC BY 4.0", "S16": "FRED: dollar index, euro rate, 10-year yield, US CPI, aluminium: public domain (citation requested), aluminium series under FRED and IMF terms",
       "S06": "USGS Mineral Commodity Summaries: US government work", "S31": "ICSG World Copper Factbook: cited, not republished", "S32": "NBS Circular 31 (wire tables): US government work",
       "S05": "IEA: report text and figures are CC BY 4.0 (attributed below). The EV data explorer and the data annex are not, and are not redistributed", "S29": "Natural Earth and world-atlas for the map: public domain and ISC",
       "S01": "LME copper daily: commercial, never published; only derived statistics are", "S35": "Background photo: licence not confirmed, kept out of the repository"}
L = []
add = L.append
add("# Copper market analysis")
add("")
add("A portfolio project by Behindokht Alipour. Copper is at a record price. Is it as special as it looks? SQL and Python, a static website, and every number traced to a source.")
add("")
add(f"Live site (after GitHub Pages is switched on): {URL}  ")
add(f"Short write-up: [case study]({URL}case-study.html) | Every number I may quote: [FACTS.md](docs/FACTS.md)")
add("")
add("![The dashboard](docs/img/readme-dashboard.png)")
add("")
add("![The Story opener](docs/img/readme-story.png)")
add("")
add("## The question")
add("")
add("Who needs copper, who supplies it, and what does the price do when they collide? I test three ideas: that the copper price moves against the US dollar, that a high copper to aluminium price ratio says something about later prices, and that EV and data-centre demand is a scenario and not a fact.")
add("")
add("## Three findings")
add("")
add(f"1. **Copper is at a record only as quoted.** {price} per metric ton in {MONTH(kp['latest_month'])}, the highest of {months} months. In today's money it is still {below:.0f}% below {MONTH(peak)}.")
add(f"2. **The dollar goes with about a third of copper's monthly moves.** The broad dollar index accounts for {float(g['r2_dollar_index']):.0f}% of them. In {int(float(g['opposite_months']))} of {int(float(g['months_total']))} months the two moved in opposite directions. The correlation is {float(cor['pearson r']):.2f} (95% bootstrap interval {float(cor['95% interval low']):.2f} to {float(cor['95% interval high']):.2f}). That is a link, not proof of a cause.")
add(f"3. **Aluminium has been the cheaper conductor metal for {int(float(ac['run_months']))} months.** Copper costs {float(ac['ratio_latest']):.2f} times aluminium and the break-even is about {float(ac['breakeven_ratio']):.2f}. As a guide to later price changes the ratio is weak, and I say so.")
add("")
add("Demand from EVs and data centres is shown as a share of today's mine output, never as a gap or a shortage, because there is no supply projection.")
add("")
add("## How it works")
add("")
add("```")
add("raw downloads (World Bank, FRED, USGS, ICSG, IEA, LME)")
add("   |  copper_database/build_db.py loads each file as it is")
add("raw_ tables")
add("   |  copper_database/sql/01_staging.sql: types, NULLs, duplicates")
add("stg_ tables")
add("   |  copper_database/sql/02_marts.sql: the analysis tables")
add("mart_ tables  --->  03_checks.sql  --->  data_checks (PASS, WARN, FAIL)")
add("   |  notebooks/01 to 07: statistics (pandas, statsmodels), figures")
add("results/res_*.csv  (also written back into the database)")
add("   |  tools/export_site_data.py: copies the results, calculates nothing")
add("docs/data/*.js  --->  docs/ static site (plain JavaScript and SVG)")
add("```")
add("")
add(f"Cleaning and joins are done in SQL, statistics and charts in Python. {len(src)} registered sources, {checks} automatic checks ({st.get('PASS', 0)} pass, {st.get('WARN', 0)} warnings, {st.get('FAIL', 0)} failures). Statistics use monthly changes, a moving-block bootstrap for intervals and Newey-West standard errors in the regressions.")
add("")
add("## Rebuild")
add("")
add("The raw downloads are not in this repository. Download them (the links are in `copper_database/collected/sources.csv`) into the repository root, then:")
add("")
add("```")
add("python -m venv .venv")
add(r".venv\Scripts\activate               # Windows. On macOS or Linux: source .venv/bin/activate")
add("pip install -r requirements.txt       # pandas, statsmodels, jupyter tools for the notebooks")
add("pip install openpyxl                  # build_db.py reads the Excel downloads")
add("python copper_database/build_db.py --raw .")
add("python -m jupyter nbconvert --to notebook --execute --inplace notebooks/06_story_brief_figures.ipynb")
add("python -m jupyter nbconvert --to notebook --execute --inplace notebooks/05_chapter_facts.ipynb")
add("python -m jupyter nbconvert --to notebook --execute --inplace notebooks/07_dashboard.ipynb")
add("python -m jupyter nbconvert --to notebook --execute --inplace notebooks/04_dashboard_exports.ipynb")
add("python copper_database/build_db.py --raw .      # reload the results into the database")
add("python tools/export_site_data.py")
add("python tools/build_provenance.py")
add("python tools/check_site.py")
add("python tools/audit_public.py")
add("python tools/serve_docs.py 8765               # then open http://127.0.0.1:8765/")
add("```")
add("")
add("The browser tests also need `pip install playwright pillow fonttools brotli` and Google Chrome.")
add("")
add("Notebooks 01 to 03 run the same way. The month-end robustness result needs LME daily data that I download myself and cannot publish: it is provided as a file (`results/res_dollar_month_end_check.csv`), so the project is not fully reproducible without that data.")
add("")
add("## Data sources and licences")
add("")
for sid in ("S02", "S16", "S06", "S31", "S32", "S05", "S29", "S01", "S35"):
    add(f"- {LIC[sid]} ({sid})")
add("")
add("Published series use the World Bank copper price, never the LME series. The full register, with a reliability rating for each source, is `copper_database/collected/sources.csv` and the appendix of the site.")
add("")
add("## IEA material")
add("")
add("Figures and wording from IEA reports are used under CC BY 4.0 and adapted: the Energy and AI report page (data-centre electricity) and the Global EV Outlook 2026 report text (scenario descriptions).")
add("")
for a_ in IEA.ATTRIBUTION:
    add("- " + a_)
add("")
add(IEA.ADAPTED + " " + IEA.NO_ENDORSEMENT + f" See the [IEA notice for CC-licensed content]({IEA.NOTICE_URL}).")
add("")
add(IEA.RAW_NOT_REDISTRIBUTED.replace(" in copper_database/collected/sources.csv", " in `copper_database/collected/sources.csv`") + " The demand results are my own calculation from that data: tonnes of copper and percentages of mine output, with the inputs left out.")
add("")
add("## Known issues (open)")
add("")
for r in issues:
    d = re.sub(r"\s+", " ", r["description"]).split(". ")[0]
    add(f"- **{r['issue_id']}** {d[:150]}{'...' if len(d) > 150 else ''}")
add("")
add("Each one is also a warning in `data_checks`. The site shows them in the data quality appendix.")
add("")
add("## Tests and publishing")
add("")
add("`tools/check_site.py` (text, fonts, contrast, links), `tools/audit_public.py` (nothing private is published), `tools/dashboard_test.py`, `tools/parity_test.py` and `tools/round4_test.py` (browser tests in Chromium and WebKit), `tools/check_pages.py` (GitHub Pages readiness) and `tools/run_lighthouse.py`. `tools/build_facts.py` and `tools/build_readme.py` write the facts sheet and this file from the data.")
add("")
add("## How this was made")
add("")
add("I defined the questions, chose the methods, checked the data and wrote the interpretation. I used Claude Code to help write and test code.")
add("")
add("## Not investment advice")
add("")
add("Historical results are not forecasts and not investment advice. A link between two series in a sample is not proof that one moves the other. The demand figures are scenarios.")
add("")
add("The code and my own text are under the MIT licence (`LICENSE`). The data is not: it stays under the terms of its original sources, listed above and in `copper_database/collected/sources.csv`. Fonts are SIL Open Font License, see `CREDITS.md`.")
text = "\n".join(L) + "\n"
assert "—" not in text and "–" not in text
assert len(L) < 150, len(L)
(ROOT / "README.md").write_text(text, encoding="utf-8", newline="\n")
print("wrote README.md,", len(L), "lines")
