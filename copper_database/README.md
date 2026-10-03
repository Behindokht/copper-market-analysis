# Copper database

The data behind the copper dashboard: one SQLite database, one CSV per table, and a sources register. Everything is rebuilt from the raw downloads and the collected CSVs by a single script, so nothing is typed into the database by hand. Reproducibility has one limit: see "Reproducing this project" below. The month-end robustness result needs licensed LME data that is not in the repository.

## Folder layout

```
Copper analysis/                    raw downloads (LME csv files, World Bank xlsx, FRED csv files, IEA xlsx files, USGS csv)
  copper_database/
    build_db.py                     loads raw files into raw_ tables, runs the SQL files, writes checks and csv
    sql/                            01_staging.sql (cleaning), 02_marts.sql (panel and changes), 03_checks.sql (checks)
    baselines/                      frozen output of the old Python cleaning, used to prove each SQL migration
    copper.db                       the database (SQLite; open with DB Browser for SQLite or Python; for Power BI, import the CSVs from csv/)
    collected/                      tables collected by hand, one CSV each
      sources.csv                   the sources register (the one list of sources)
    csv/                            generated: one CSV for every table and view, plus data_checks
    README.md
tools/
  audit_public.py                   pre-push audit of everything that would be public
  public_manifest.json              every published data file, its sources and licence flags
  export_site_data.py               results/*.csv to docs/data/*.js (calculates nothing)
  check_site.py                     checks on the website (no outside loading, text keys, glyphs, contrast)
  contrast_report.py                contrast of every colour pair, reads the tokens in docs/css/site.css
  build_preview.py                  one-file private preview of the site
docs/                               the static website (GitHub Pages): index.html, css/, js/, fonts/, data/, DESIGN.md
```

Rule: `collected/` and the raw downloads are the inputs. `copper.db` and `csv/` are outputs and are overwritten on every build, so never edit them.

## Tables

Raw downloads, cleaned (the script reads the files you downloaded):

| Table | What it holds | Source |
|---|---|---|
| raw_lme_copper_daily | The 28 LME export files as loaded: every data line as text with its file and line number, including each file's yearly Averages line (6,992 lines), no cleaning | S01 |
| stg_lme_copper_daily | Same data cleaned in SQL: LME copper cash, 3-month, 15-month prices, warehouse stocks and volume, daily, 1998-01-05 to 2025-07-25 (6,964 days) | S01 |
| baseline_lme_copper_daily | Frozen per-column and per-year summary of the old Python-cleaned LME table (290 summaries) | S01 |
| raw_wb_prices_monthly | World Bank Pink Sheet 'Monthly Prices' sheet as loaded: every cell as text with its Excel row (56,800 cells), no cleaning | S02 |
| stg_wb_prices_monthly | Same data cleaned in SQL (sql/01_staging.sql): 71 commodities, 1960 to 2026-08, nominal USD, 50,383 values | S02 |
| baseline_wb_prices_monthly | Frozen per-commodity summary of the old Python-cleaned table; check 03 proves the SQL staging reproduces it | S02 |
| raw_fred_palumusdm, raw_fred_cpiaucsl | FRED aluminium price (IMF) and US consumer price index as loaded (text, no cleaning) | S03, S04 |
| stg_fred_monthly | The four monthly FRED series in long format, cleaned in SQL: aluminium, US CPI, USD per euro, 10-year US yield (series_id, date, value) | S03, S04, S16, S18 |
| stg_fred_dtwexbgs_daily | Broad dollar index, daily, 2006-01-02 to 2026-09-25, blank holidays removed (5,198 days) | S17 |
| mart_monthly_panel | The analysis panel: one row per month, 1999-01 to 2026-08 (332 rows). Copper and aluminium (World Bank), USD per euro, copper in euros, broad dollar index (average and month-end), 10-year US yield, US CPI. Columns ending _avg are monthly averages, columns ending _month_end are last-day values (dollar index; LME copper cash for complete months only, 1999-01 to 2025-06); do not mix them in one test | S02, S04, S16, S17, S18 |
| mart_monthly_changes | Monthly changes from the panel: log returns (_logret_m, used for statistics), simple percent changes (_pct_m, used for charts and labels), 10-year rate change in percentage points, inflation-adjusted copper | same |
| res_* (derived result tables) | Derived results of notebooks 01 to 04. Notebook 01: correlations, regressions, stability by period, rolling correlation, lead-lag, copper in euros vs dollars, inflation-gap sensitivity, month-end check. Notebook 02: res_cu_al_threshold_table (one row per rule and horizon), res_cu_al_slopes, res_cu_al_episodes, res_cu_al_scenario_today. Notebook 03: res_demand_headline, res_demand_sensitivity, res_demand_assumptions, res_demand_context. Notebook 04 (dashboard exports): res_story_* tables, res_ratio_series and res_ratio_facts (World Bank copper and aluminium prices, their ratio, and facts about today's ratio), res_demand_* grids and ranges, res_dashboard_* (checks, sources, known issues, pipeline). The CSVs in `results/` are the master copy; a build reloads them here | S02, S04, S16, S17, S18 |
| mart_cu_al_ratio | Copper-to-aluminium price ratio (World Bank monthly averages, 1960-01 to 2026-08, 800 months), its percentile within its own past (all earlier months and previous 10 years, from 1970-01) and the forward 6 and 12 month changes of the ratio, copper and aluminium. The forward columns are outcomes, never inputs | S02 |
| mart_cu_al_rules, mart_cu_al_signal_months | The 17 signal rules (fixed ratio levels, percentile thresholds) and, per rule and horizon, every month from 1970-01 with a known outcome, whether the signal was on, and an episode id (signal months whose forward windows overlap count as one episode) | S02 |
| stg_datacentre_capacity_scenarios | IEA annex installed data-centre capacity (GW), total and IT, for the Base, Lift-Off, High Efficiency and Headwinds cases (2030, 2035 exploratory) and the 2020, 2023, 2024 estimates (22 rows) | S15 |
| mart_scenario_inputs, mart_demand_assumptions | Demand-scenario inputs (copper per car and per MW, project assumptions) and the assumption register with source and reliability | S05, S06, S11, S13, S15, S20 |
| mart_ev_sales_path | World EV car sales (BEV, PHEV), EV share and derived total sales: 2025 actual, 2035 IEA CPS and STEPS, 2030 interpolated two ways, with the IEA rounding band | S05, S20 |
| mart_ev_copper_cases | 972 EV copper cases: transition term (extra EVs x (EV copper - petrol-car copper)) and car-market growth term (change in total sales x petrol-car copper), kept apart | S05, S11, S20 |
| mart_dc_capacity_path, mart_dc_copper_cases | Data-centre capacity additions and the build in 2030 or 2035 under an even and a constant-growth path (256 copper cases); negative extras carry a note (a slower build than the base year, not negative demand) | S13, S15, S20 |
| mart_demand_context, mart_demand_headline, mart_demand_sensitivity | USGS 2025e world mine output (the base), every component as tonnes and percent of it for 2030 (main) and 2035, and the one-at-a-time sensitivity of the 2030 headline total | S05, S06, S11, S13, S15, S20 |
| baseline_fred_monthly | Frozen per-series summary of the old Python-cleaned aluminium and CPI table | S03, S04 |
| raw_ev_data | IEA Global EV Outlook 2026 data sheet as loaded: every row as text (49,375 rows), no filtering or cleaning | S05 |
| stg_ev_data | Cleaned in SQL: EV sales, sales share and stock by country, vehicle type and drivetrain, with two projection scenarios to 2035 (18,371 rows) | S05 |
| baseline_ev_data | Frozen column and group summaries of the old Python-cleaned table | S05 |
| raw_usgs_commodities | USGS MCS 2026 data release as loaded: every line of every commodity as text (8,886 lines), no filtering or cleaning | S06 |
| stg_usgs_copper | Cleaned in SQL: everything USGS publishes on copper in that release: world mine and refinery production, reserves, US statistics, import sources (194 rows) | S06 |
| baseline_usgs_copper | Frozen column and group summaries of the old Python-cleaned table | S06 |
| raw_iea_annex_cells | IEA data annex as loaded: every non-empty cell of the World Data and Regional Data sheets with sheet, Excel row, column and cell type (656 cells) | S15 |
| stg_datacentre_annex_world | Read from the sheet layout in SQL: world data-centre capacity, efficiency, load factor and electricity use by segment, 2020 to 2035 (120 rows) | S15 |
| stg_datacentre_annex_regional | Same by region, 2020 to 2030 (216 rows) | S15 |
| baseline_datacentre_annex_world, baseline_datacentre_annex_regional | Frozen column and group summaries of the old Python-parsed annex tables | S15 |
| raw_fred_exuseu | FRED USD per euro, monthly, 1999-01 to 2026-08, loaded as downloaded (text) | S16 |
| raw_fred_dtwexbgs | FRED nominal broad US dollar index, daily, 2006-01-02 to 2026-09-25 (5,410 rows, 212 blank holidays), loaded as downloaded | S17 |
| raw_fred_gs10 | FRED 10-year US Treasury yield (%), monthly, 1953-04 to 2026-08, loaded as downloaded | S18 |

Collected by hand (every row has a `source_id`):

| Table | What it holds | Source |
|---|---|---|
| usgs_mine_production_country | Mine production by country from MCS 2025 (2023, 2024e), kept to show later revisions | S07 |
| company_production | Company copper production, with the basis and whether each figure is used | S08, S09 |
| mine_production | Top 20 mines with owners | S10 |
| copper_intensity_vehicle | Copper per vehicle by drivetrain, low and high in kg | S11 |
| datacentre_electricity_iea | IEA 2024 estimate and the 2035 sensitivity scenarios (not in the annex) | S12 |
| datacentre_growth_by_region | Growth to 2030 read from the IEA page, kept as a cross-check | S12 |
| datacentre_copper_assumptions | Reported S&P Global copper estimates for data centres (assumptions and forecasts) | S13 |
| scenario_assumptions | Project modelling assumptions for the demand scenario (source S20, marked as assumptions, not data) | S20 |
| known_issues | Register of unresolved issues and limitations; unresolved ones show as WARN and limitations as INFO in data_checks | S05, S11, S13 |

Reference tables: `sources` (the register), `data_checks` (every check the build ran), `tables_catalog` (description, grain, date range and publishing note for each table).

Views (ready for charts): `v_price_monthly` (built on stg_wb_prices_monthly; copper, aluminium, gold, Brent side by side), `v_cu_al_ratio` (copper-to-aluminium price ratio), `v_price_real` (copper and aluminium in August 2026 dollars, using US inflation; it has no row for 2025-10, see limitations), `v_lme_monthly` (monthly averages of the daily LME data, including the 3-month-minus-cash spread and stocks), `v_usgs_latest` (country mine production and share), `v_usgs_reserves` (reserves by country), `v_datacentre_growth_2024_2030` (data-centre electricity growth by region, from the IEA annex), `v_copper_intensity_mid`.

The `raw_fred_*` tables are the first of the new analysis path: raw as loaded, no cleaning. SQL staging, marts and checks will be built on them (see CLAUDE.md for the plan). Migration status: World Bank, FRED and LME are done (raw, staging, and a check against the old Python output; the three new FRED series have no old output to compare with, so they get range, gap and duplicate checks instead). IEA (EV data and the data-centre annex) and USGS are done too, so every raw source now follows raw, staging and a comparison against the frozen old output (the annex tables are read from the sheet layout in SQL, which was the hardest part). Python no longer cleans anything; it only loads raw files as they are and runs the SQL.

## Notebooks and results

- `notebooks/01_copper_vs_dollar.ipynb`: tests whether copper moves against the dollar (H1). It reads only the marts, never the raw LME series, includes a month-end robustness check (LME copper and the dollar index), and is committed with its outputs.
- `notebooks/02_copper_vs_aluminium_ratio.ipynb`: a price question only (does a high copper-to-aluminium ratio say anything about the relative price over the next 6 and 12 months?), by threshold, with independent episodes counted. No demand data, so substitution is not tested.
- `notebooks/03_demand_scenario.ipynb`: scenario arithmetic for EV and data-centre demand against 2025e world mine output (main year 2030, 2035 beside it). EV transition and car-market growth are kept apart; data centres use capacity (total and IT), with the copper in new capacity (always positive) as the main figure and the extra over the 2024 build as the secondary one; the EV transition and data-centre results are separate bars, and their total is labelled "the two effects together, on their own baselines" (EV vs 2025, data centres vs the 2024 build); a tornado shows each assumption. Scenario, not a forecast; every input has a source and reliability.
- `notebooks/04_dashboard_exports.ipynb`: prepares the dashboard-only tables (the two Story facts, the World Bank copper series nominal and real, the demand case grids and ranges, the data-quality tables). It never writes an LME series and withholds check details that mention LME.
- `tools/export_site_data.py`: turns the derived tables in `results/` into the website's data files in `docs/data/*.js`. It calculates nothing, and `tools/audit_public.py` checks the files it writes.
- `results/`: derived result tables (CSV) and nothing raw. `build_db.py` reloads `res_*.csv` into the database so a rebuild does not lose them.
- Python environment for the notebooks: `.venv` with the versions in `requirements.txt`.

## Reproducing this project

**What is in the public repository:** the scripts (`build_db.py`, `sql/`), the hand-collected tables that are not taken from secondary articles, the derived results in `results/`, the notebooks with their outputs, and the audit tools. **What is not, and why:**

| Not in the repository | Why |
|---|---|
| LME downloads and `copper.db` and `csv/` | The LME series is commercial data. The database and the generated CSVs contain it |
| Raw downloads (World Bank, FRED, IEA, USGS files) | Download them yourself from the `url` column of `collected/sources.csv` into the project root |
| Migration proofs for LME and IEA (`baselines/`) | They summarise LME or IEA data (the LME licence is commercial; the IEA terms are not confirmed yet) |
| `company_production.csv`, `mine_production.csv` | Figures from secondary articles ("do not republish"); to be replaced with company annual reports |

**To rebuild:** download the raw files, then run `python copper_database/build_db.py --raw .` (Python with pandas and openpyxl). The notebooks use the environment in `requirements.txt`. Without the LME files the build skips the LME steps and the checks that need them or the missing proofs; each skip is logged as INFO in `data_checks`, and the LME columns of the panel stay empty. This was tested on a copy containing only the public files plus the non-LME downloads: the build has no FAIL, all four notebooks run, and the analysis result files come out identical to the full run (only the two files that describe the build itself differ: the data checks, which has fewer rows without LME and the missing proofs, and the table counts per layer).

**The one result that needs licensed data:** the month-end robustness result is provided as a file (`results/res_dollar_month_end_check.csv`); reproducing it needs LME historical data that I download myself, which is licensed and is not in this repository. The LME-versus-World-Bank cross-check in `data_checks` needs it too. Everything else can be rebuilt from the public downloads, but the project is not fully reproducible without that LME data.

**Checks before anything is committed or pushed.** `python tools/audit_public.py` is the full audit. It fails if a forbidden file is tracked or was ever committed, if an LME series column or a local path shows up in a published file, if a data file has no entry (sources and licence) in `tools/public_manifest.json`, or if a file flagged as IEA-derived is missing from the list below. To make it automatic, install the git pre-commit hook once per clone: `python tools/install_hook.py`. From then on every commit runs the audit on the staged files and is blocked if a forbidden file, an LME column or a local path is staged. (`git commit --no-verify` skips the hook, so run the full audit before every push.)

## Files with IEA-derived figures (the IEA terms are not confirmed yet)

These published files contain figures taken from or derived from IEA data. The repository stays private until the IEA terms and the World Bank licence line are confirmed. The audit keeps this list in step with `tools/public_manifest.json`.

**If the IEA terms turn out to be restrictive:** run `python tools/trim_iea.py` (a dry run that changes nothing) and then `python tools/trim_iea.py --apply`. The step stops tracking and git-ignores the IEA volumes and report figures (electric-car sales and shares, data-centre capacity in GW, IEA page figures: `res_demand_ev_paths`, `res_demand_dc_capacity`, `res_demand_dc_paths`, `res_demand_headline`, and two collected IEA tables), drops the car-sales and gigawatt columns and the IEA input rows from three result files, withholds the detail text of the data checks on IEA tables, clears the saved outputs of notebook 03, and updates the manifest and this list. The files stay on your disk. What it leaves for you to decide is printed at the end: the base-year data-centre build in `scenario_assumptions.csv` (computed from IEA capacity), the K01 wording (percentages computed from the annex) and the IEA scenario names used as labels. The Demand page reads only tonnes, percentages and copper per car and per MW, so it works unchanged after the step.

- `copper_database/collected/datacentre_electricity_iea.csv` (IEA report-page figures (data-centre electricity))
- `copper_database/collected/datacentre_growth_by_region.csv` (IEA report-page figures (growth by region))
- `copper_database/collected/known_issues.csv` (known issues; K01 states IT-vs-total differences computed from the IEA annex)
- `copper_database/collected/scenario_assumptions.csv` (project assumptions; the base-year build (14 GW, 9.25 GW) is computed from IEA capacity numbers)
- `docs/data/demand.js` (scenario results and case grids derived from IEA EV sales and capacity; copper per car and per MW from secondary articles)
- `docs/data/quality.js` (data checks (LME details withheld, IEA headline numbers in some details), the sources register and known issues)
- `notebooks/03_demand_scenario.ipynb` (outputs show IEA headline figures, scenario results and copper per car and per MW)
- `notebooks/04_dashboard_exports.ipynb` (outputs show derived counts and the demand ranges (IEA-derived percentages); no LME values)
- `results/res_dashboard_checks.csv` (the data checks; details that mention LME are withheld except the LME-versus-World-Bank agreement; some details quote IEA headline numbers)
- `results/res_dashboard_known_issues.csv` (the known issues register; K01 quotes IEA-derived percentages)
- `results/res_demand_assumptions.csv` (assumption register: IEA headline values (EV sales, capacity), USGS output, copper per car (S11) and per MW (S13))
- `results/res_demand_context.csv` (USGS mine and refinery output; S13 reported figures; model figure built from an IEA capacity number)
- `results/res_demand_dc_capacity.csv` (IEA data-centre capacity by case, total and IT)
- `results/res_demand_dc_cases.csv` (256 data-centre cases derived from IEA capacity (grid for the selectors))
- `results/res_demand_dc_paths.csv` (data-centre capacity additions and build paths derived from IEA capacity)
- `results/res_demand_ev_cases.csv` (972 EV cases derived from IEA EV sales and shares (grid for the interactive selectors))
- `results/res_demand_ev_paths.csv` (IEA EV sales 2025 and 2035 and the interpolated 2030 paths)
- `results/res_demand_headline.csv` (scenario results derived from IEA EV sales and capacity)
- `results/res_demand_ranges.csv` (the one-at-a-time range and the all-assumptions-at-an-extreme range, derived from IEA scenarios)
- `results/res_demand_sensitivity.csv` (sensitivity results derived from IEA scenarios)

`copper_database/collected/sources.csv` only quotes short IEA wording and describes IEA files.

## The dashboard (`docs/`)

A static website (plain HTML, CSS and JavaScript, no server and no build step; open `docs/index.html` in a browser). It reads only the data files in `docs/data/*.js`, which `tools/export_site_data.py` writes from the derived tables in `results/`. It never opens the database and never shows an LME series. All five pages are built (Story, Dollar vs copper, Copper vs aluminium, Demand scenario, Data quality).

- **Text** lives in one file, `docs/js/strings.en.js`, with `{placeholders}`; every number on a page comes from a data file, so text and numbers cannot drift apart. Another language is a second strings file with the same keys.
- **Look:** a dark opener (the copper plate photo under an ink scrim when `docs/img/copper-plate.jpg` exists, plain ink if not) with a smoked-glass nav bar and price plaque, then neutral paper with solid cards for charts and tables; copper for the main series, dashed verdigris for the second; Newsreader for titles, IBM Plex Sans for text and IBM Plex Mono for labels, all self-hosted (SIL Open Font License, texts in `docs/fonts/`). Glass is used on the nav bar and the plaque only. Nothing is loaded from the web. `docs/DESIGN.md` has the tokens and the contrast of every colour pair in use, including the text on the glass over the photo. The reference for the look (`design_reference/`) is git-ignored and never published.
- **Checks:** `python tools/check_site.py` before every commit that touches `docs/` (no outside loading, every text key exists, no hard-coded percentage in the text, no characters the fonts cannot draw, contrast passes), and `python tools/audit_public.py` before every commit or push.
- **Credits:** `CREDITS.md` and the footer of the site.

## How to update

1. New or updated raw download: save it in the Copper analysis folder (same file name pattern) and run `python build_db.py`.
2. New hand-collected data: add rows to the matching CSV in `collected/`, or add a new CSV there. Every row needs a `source_id`. If the source is new, add it to `collected/sources.csv` first.
3. Run `python build_db.py` (needs Python with pandas and openpyxl). Then open `csv/data_checks.csv`: nothing should say FAIL, and every WARN should be understood.

## Source rules

- Every collected row carries a `source_id` that exists in `sources.csv`. The build checks this.
- The `reliability` column in the register says how far to trust a source: high (primary), medium or low (secondary articles).
- Prefer primary files over figures read from web pages. The USGS and IEA figures started as web-page readings and were replaced by the official files; the readings now serve only as cross-checks.
- Licences: LME data is commercial, so publish derived results only (spreads, ratios, returns, scenario outputs). For the World Bank, FRED/IMF, IEA and USGS files, confirm the terms before publishing raw series (USGS is a US government work). The `publish_note` column in `tables_catalog` repeats this per table.

## Checks that back the numbers

- World Bank copper vs your LME monthly averages: correlation 1.00, average gap 0.09%.
- USGS annual LME cash price vs your LME daily averages, 2021 to 2024: within 0.2% every year.
- FRED (IMF) aluminium vs World Bank aluminium: average gap 0.12%.
- USGS country figures add up to the world totals for mine production and reserves; IEA segments and regions add up to their totals; the IEA page figures match the annex.

## Known limitations

- Demand scenario (see `known_issues` and notebook 03): the IEA EV file has no 2030 (2030 is interpolated); the IEA rounds to two significant figures so derived total car sales have a band of several million; hybrids cannot be split out of the non-EV group; vans, buses, trucks and two- and three-wheelers are excluded; it is unresolved whether the 30-40 t/MW (S13) refer to total or IT capacity, and S13's 1.1 Mt for 2025 is about 2.0 to 2.6 times what the model gives for the 2024 build (unreconciled). The reference case is a convenience choice, not the most likely case.
- US CPI has no value for 2025-10, so the data_checks WARN "CPIAUCSL: no missing months" is expected. Reason (BLS, S19): federal agencies were shut down or at reduced staffing from 2025-10-01 to 2025-11-12, BLS could not collect October 2025 survey data and cannot collect it retroactively, and no all-items October 2025 index was published. BLS also states that November 2025 indexes were calculated against carried-forward October prices, so the November 2025 CPI level and the change into it are affected too. In this database the October value stays NULL and is never interpolated: real prices for 2025-10 and the CPI changes for 2025-10 and 2025-11 are NULL. Any analysis using inflation-adjusted changes must be run once with and once without these months.
- Two DTWEXBGS downloads exist; the loader uses the longest (`DTWEXBGS (1).csv`) and logs the other as ignored. The units and monthly averaging of EXUSEU and GS10 are taken from the FRED series pages and still need confirming (see notes in sources.csv).
- Publishing: `copper.db`, `csv/` and the raw downloads are excluded from git by `.gitignore` because they contain the commercial LME series.
- LME copper ends on 2025-07-25, while the World Bank monthly series runs to 2026-08. Use `v_price_monthly` for the latest months. The LME 15-month price stops in April 2012, volume starts in October 2006, and the unofficial price runs 2003 to February 2024.
- The LME `volume_as_exported` column keeps the unit as exported; the file does not state it.
- USGS 2025 values are USGS estimates (2025e); the `is_estimate` column marks them. The MCS 2025 table is text-extracted and only used for the revision comparison.
- The 2035 world values in the IEA annex are exploratory scenarios (the IEA says so); do not present them as forecasts.
- Company production figures come from two articles that disagree, and only the one that states its basis (attributable production, 2025) is marked `used`. BHP, Freeport-McMoRan and KGHM differ by more than 20% between the two articles, which suggests different bases. Replace these with company annual reports before publishing.
- Mine production (top 20 mines) is unverified: the period label was extracted from the page and not checked.
- Vehicle copper intensity and data-centre copper figures are assumptions from secondary sources, not measurements. Treat them as scenario inputs, show the source next to them, and look for a second source for each.
- Not collected yet: an events timeline and miner share prices.
