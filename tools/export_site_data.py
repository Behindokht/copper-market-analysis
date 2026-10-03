#!/usr/bin/env python3
"""
Export the derived result tables in results/*.csv to the dashboard's data files in docs/data/*.js.

  python tools/export_site_data.py

- Reads ONLY results/res_*.csv (the derived tables written by the notebooks). It never opens copper.db, the raw downloads or any LME file.
- Calculates nothing: it only reads, converts types, leaves out the columns and rows the pages do not use (DROP_COLUMNS, DROP_ROWS) and writes. Every number on the website is a number from a results file.
- One file per dashboard page. A file looks like:  window.CMA_DATA.<page> = {"<dataset>": {"columns": [...], "rows": [[...], ...]}, ...};
  (JavaScript, not JSON, so the site also works when opened from a file and needs no server).
- Stops if a dataset has a column that belongs to the licensed LME series. tools/audit_public.py checks the written files again.
"""
import csv
import datetime
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "data"

LME_COLUMNS = {"cash_usd_t", "cash_unofficial_usd_t", "three_month_usd_t", "three_month_unofficial_usd_t", "fifteen_month_usd_t", "dec_1_usd_t",
               "dec_2_usd_t", "dec_3_usd_t", "inventory_t", "volume_as_exported", "copper_lme_cash_usd_t_avg",
               "copper_lme_cash_usd_t_month_end", "copper_lme_cash_month_end_date"}

PAGES = {
    "story": {
        "guess_dollar": "res_story_guess_dollar",
        "copper_series": "res_story_copper_series",
        "record_facts": "res_story_copper_record_facts",
    },
    "chapters": {
        "records": "res_interlude_records",
        "euro": "res_euro_record",
        "events": "res_events",
    },
    "supply": {
        "countries": "res_supply_countries",
    },
    "dollar": {
        "correlations": "res_dollar_correlations",
        "regressions": "res_dollar_regressions",
        "stability": "res_dollar_stability_by_period",
        "rolling": "res_dollar_rolling_correlation_36m",
        "lead_lag": "res_dollar_lead_lag",
        "eur_cumulative": "res_copper_eur_vs_usd_cumulative",
        "eur_variance": "res_copper_eur_variance_split",
        "cpi_sensitivity": "res_dollar_cpi_sensitivity",
        "month_end": "res_dollar_month_end_check",
        "series": "res_dollar_series",
    },
    "ratio": {
        "threshold": "res_cu_al_threshold_table",
        "episodes": "res_cu_al_episodes",
        "slopes": "res_cu_al_slopes",
        "scenario_today": "res_cu_al_scenario_today",
        "series": "res_ratio_series",
        "facts": "res_ratio_facts",
    },
    "demand": {
        "sensitivity": "res_demand_sensitivity",
        "assumptions": "res_demand_assumptions",
        "context": "res_demand_context",
        "ranges": "res_demand_ranges",
        "ev_cases": "res_demand_ev_cases",
        "dc_cases": "res_demand_dc_cases",
    },
    "quality": {
        "checks": "res_dashboard_checks",
        "sources": "res_dashboard_sources",
        "known_issues": "res_dashboard_known_issues",
        "pipeline": "res_dashboard_pipeline",
    },
}

# The demand page needs tonnes, percentages and copper per car or per MW, not the IEA's own volumes. These columns and rows are left out
# of the site data on purpose (car sales in the case grids, gigawatts in the data-centre grids, the IEA input rows of the assumption register).
DROP_COLUMNS = {
    "res_demand_ev_cases": ["extra_bev", "extra_phev", "delta_total_sales"],
    "res_demand_dc_cases": ["build_in_target_year_gw", "base_build_gw"],
}
DROP_ROWS = {"res_demand_assumptions": ("kind", "IEA")}      # rows whose 'kind' contains this text

INT = re.compile(r"^-?\d+$")
FLOAT = re.compile(r"^-?(\d+\.\d*|\.\d+|\d+)([eE][-+]?\d+)?$")


def convert(cell):
    if cell == "":
        return None
    if INT.match(cell) and not (len(cell.lstrip("-")) > 1 and cell.lstrip("-").startswith("0")):
        return int(cell)
    if FLOAT.match(cell):
        x = round(float(cell), 6)
        return int(x) if x == int(x) and abs(x) < 1e15 else x
    return cell


def load(name):
    path = ROOT / "results" / f"{name}.csv"
    if not path.exists():
        raise SystemExit(f"Missing {path.relative_to(ROOT)}. Run the notebooks first (04_dashboard_exports needs notebooks 01 to 03).")
    with path.open(encoding="utf-8", newline="") as f:
        rows = list(csv.reader(f))
    cols, body = rows[0], rows[1:]
    bad = LME_COLUMNS & set(cols)
    if bad:
        raise SystemExit(f"{name}: LME series column(s) {sorted(bad)} must never be exported")
    keep = [i for i, c in enumerate(cols) if c not in DROP_COLUMNS.get(name, [])]
    if name in DROP_ROWS:
        col, text = DROP_ROWS[name]
        body = [r for r in body if text not in r[cols.index(col)]]
    return {"columns": [cols[i] for i in keep], "rows": [[convert(r[i]) for i in keep] for r in body]}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    today = datetime.date.today().isoformat()
    report = []
    for page, datasets in PAGES.items():
        payload = {"_meta": {"page": page, "generated": today, "source_tables": sorted(datasets.values())}}
        for key, table in datasets.items():
            payload[key] = load(table)
        text = ("// Generated by tools/export_site_data.py from the derived tables in results/. Do not edit by hand.\n"
                "window.CMA_DATA = window.CMA_DATA || {};\n"
                f"window.CMA_DATA.{page} = " + json.dumps(payload, separators=(",", ":"), ensure_ascii=True) + ";\n")
        path = OUT / f"{page}.js"
        path.write_text(text, encoding="utf-8", newline="\n")
        report.append((path, len(text.encode("utf-8")), {k: len(v["rows"]) for k, v in payload.items() if k != "_meta"}))
    total = sum(r[1] for r in report)
    print("Wrote the dashboard data files:")
    for path, size, ds in report:
        print(f"  {path.relative_to(ROOT).as_posix():24s} {size / 1024:7.1f} KB   " + ", ".join(f"{k} {n}" for k, n in ds.items()))
    print(f"  {'total':24s} {total / 1024:7.1f} KB")


if __name__ == "__main__":
    code = main()
    sys.path.insert(0, str(ROOT / "tools"))
    import photo_flag
    photo_flag.write()
    sys.exit(code)
