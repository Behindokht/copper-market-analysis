"""Removes the raw IEA data that is not under the CC BY 4.0 licence from a copy of the project tree (the current tree, or the checkout of one commit during a history rewrite).
   python tools/scrub_iea_raw.py [TREE]          TREE defaults to the current folder; the script is idempotent and changes only what it finds
The decision (owner, after the classification table): the IEA data explorer and data annex values are not redistributed; derived results, the 14 and 9.25 GW inputs, the K01 percentages and the
report figures under CC BY 4.0 (Energy and AI report page, Global EV Outlook 2026 report text) stay. What it does:
  1. deletes the files that hold the IEA volumes: res_demand_ev_paths.csv (EV sales and shares), res_demand_dc_capacity.csv and res_demand_dc_paths.csv (data-centre capacity in GW)
  2. drops the volume columns from res_demand_ev_cases.csv and res_demand_dc_cases.csv, and the rows of the assumption register that are IEA inputs
  3. removes the datasets ev_paths, dc_capacity and dc_paths from docs/data/demand.js, the same volume columns from its case grids and the IEA input rows from its assumptions
  4. withholds the detail text of the checks that read the raw IEA tables (they quoted annex cell values), in results/res_dashboard_checks.csv and docs/data/quality.js
  5. clears the saved outputs of notebooks 03 and 04 (they printed the volumes)
  6. replaces the hand-calculation check in copper_database/sql/03_checks.sql that typed five rounded IEA EV figures with a sum of parts that reads them from the mart
  7. removes the deleted files from tools/public_manifest.json
Used by tools/rewrite_history.sh for every commit, and run once on the current tree."""
import csv
import io
import json
import re
import sys
from pathlib import Path

ROOT = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path.cwd()
REMOVE = ["results/res_demand_ev_paths.csv", "results/res_demand_dc_capacity.csv", "results/res_demand_dc_paths.csv"]
DROP_COLUMNS = {
    "results/res_demand_ev_cases.csv": ["extra_bev", "extra_phev", "delta_total_sales"],
    "results/res_demand_dc_cases.csv": ["build_in_target_year_gw", "base_build_gw"],
}
JS_DROP_DATASETS = ["ev_paths", "dc_capacity", "dc_paths"]
JS_DROP_COLUMNS = {"ev_cases": DROP_COLUMNS["results/res_demand_ev_cases.csv"], "dc_cases": DROP_COLUMNS["results/res_demand_dc_cases.csv"]}
RAW_IEA_TABLES = re.compile(r"^(raw_ev_data|stg_ev_data|raw_iea_annex_cells|stg_datacentre_|datacentre_electricity_iea|datacentre_growth_by_region)")
WITHHELD = "details withheld: raw IEA data is not redistributed"
NOTEBOOKS = ["notebooks/03_demand_scenario.ipynb", "notebooks/04_dashboard_exports.ipynb"]
changed = []


def rd(p):
    return list(csv.reader(io.StringIO(p.read_text(encoding="utf-8"), newline="")))


def wr(p, rows):
    buf = io.StringIO(newline="")
    csv.writer(buf, lineterminator="\n").writerows(rows)
    p.write_text(buf.getvalue(), encoding="utf-8", newline="\n")


for f in REMOVE:
    p = ROOT / f
    if p.exists():
        p.unlink(); changed.append("deleted " + f)

for f, cols in DROP_COLUMNS.items():
    p = ROOT / f
    if p.exists():
        rows = rd(p)
        keep = [i for i, c in enumerate(rows[0]) if c not in cols]
        if len(keep) != len(rows[0]):
            wr(p, [[r[i] for i in keep] for r in rows]); changed.append("columns " + f)

p = ROOT / "results/res_demand_assumptions.csv"
if p.exists():
    rows = rd(p)
    ci = rows[0].index("kind")
    out = [rows[0]] + [r for r in rows[1:] if "IEA" not in r[ci]]
    if len(out) != len(rows):
        wr(p, out); changed.append("rows results/res_demand_assumptions.csv")

p = ROOT / "results/res_dashboard_checks.csv"
if p.exists():
    rows = rd(p)
    ti, di = rows[0].index("table_name"), rows[0].index("detail")
    n = 0
    for r in rows[1:]:
        if RAW_IEA_TABLES.match(r[ti]) and r[di] != WITHHELD:
            r[di] = WITHHELD; n += 1
    if n:
        wr(p, rows); changed.append("check details results/res_dashboard_checks.csv")


def js_obj(path, name):
    raw = path.read_text(encoding="utf-8")
    head = f"window.CMA_DATA.{name} = "
    i = raw.index(head) + len(head)
    j = raw.rindex("}")
    return raw, i, j, json.loads(raw[i:j + 1])


p = ROOT / "docs/data/demand.js"
if p.exists():
    raw, i, j, o = js_obj(p, "demand")
    n = 0
    for k in JS_DROP_DATASETS:
        if k in o:
            del o[k]; n += 1
    d = o.get("assumptions")
    if d and "kind" in d["columns"]:
        ki = d["columns"].index("kind")
        keep_rows = [r for r in d["rows"] if "IEA" not in str(r[ki])]
        if len(keep_rows) != len(d["rows"]):
            d["rows"] = keep_rows; n += 1
    for k, cols in JS_DROP_COLUMNS.items():
        d = o.get(k)
        if d and any(c in d["columns"] for c in cols):
            keep = [x for x, c in enumerate(d["columns"]) if c not in cols]
            d["columns"] = [d["columns"][x] for x in keep]
            d["rows"] = [[r[x] for x in keep] for r in d["rows"]]
            n += 1
    if n:
        p.write_text(raw[:i] + json.dumps(o, separators=(",", ":"), ensure_ascii=False) + raw[j + 1:], encoding="utf-8", newline="\n"); changed.append("docs/data/demand.js")

p = ROOT / "docs/data/quality.js"
if p.exists():
    raw, i, j, o = js_obj(p, "quality")
    d = o.get("checks")
    n = 0
    if d:
        ti, di = d["columns"].index("table_name"), d["columns"].index("detail")
        for r in d["rows"]:
            if RAW_IEA_TABLES.match(str(r[ti])) and r[di] != WITHHELD:
                r[di] = WITHHELD; n += 1
    if n:
        p.write_text(raw[:i] + json.dumps(o, separators=(",", ":"), ensure_ascii=False) + raw[j + 1:], encoding="utf-8", newline="\n"); changed.append("docs/data/quality.js")

for f in NOTEBOOKS:
    p = ROOT / f
    if p.exists():
        nb = json.loads(p.read_text(encoding="utf-8"))
        n = 0
        for c in nb["cells"]:
            if c["cell_type"] == "code" and (c.get("outputs") or c.get("execution_count") is not None):
                c["outputs"] = []; c["execution_count"] = None; n += 1
        if n:
            p.write_text(json.dumps(nb, indent=1, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n"); changed.append("outputs " + f)

SQL_START = "-- check: kilograms to tonnes arithmetic"
SQL_END = "-- check: data-centre path arithmetic"
SQL_NEW = "-- check: kilograms to tonnes arithmetic, recomputed as a sum of parts for one case. No source figures are typed here: the extra cars are read from mart_ev_sales_path (2030 linear path minus the 2025 actuals), and the copper per car are the middle values of S11 (BEV 86.5, PHEV 63.5, mid-size petrol 20 kg)\nSELECT 'mart_ev_copper_cases', 'CPS 2030 linear, mid copper per car: transition = (extra BEV x (BEV kg - petrol kg) + extra PHEV x (PHEV kg - petrol kg)) / 1000 tonnes, extra cars read from mart_ev_sales_path',\n       CASE WHEN ABS(c.transition_t - ((p30.bev - p25.bev) * (86.5 - 20.0) + (p30.phev - p25.phev) * (63.5 - 20.0)) / 1000.0) < 1 THEN 'PASS' ELSE 'FAIL' END,\n       printf('%,d', CAST(c.transition_t AS INTEGER)) || ' t'\nFROM mart_ev_copper_cases c\nJOIN mart_ev_sales_path p30 ON p30.iea_scenario = c.iea_scenario AND p30.year = 2030 AND p30.path_method = 'linear'\nJOIN mart_ev_sales_path p25 ON p25.iea_scenario = c.iea_scenario AND p25.year = 2025 AND p25.path_method = 'direct'\nWHERE c.iea_scenario = 'CPS' AND c.year = 2030 AND c.path_method = 'linear' AND c.bev_case = 'mid' AND c.phev_case = 'mid' AND c.petrol_case = 'midsize_mid' AND c.growth_case = 'central';\n\n"
p = ROOT / "copper_database/sql/03_checks.sql"
if p.exists():
    t = p.read_text(encoding="utf-8")
    if "-- check: kilograms to tonnes arithmetic, independent recomputation for one case" in t:       # the old hand calculation typed rounded IEA EV figures; it becomes a sum of parts that reads them from the mart
        i, j = t.index(SQL_START), t.index(SQL_END)
        p.write_text(t[:i] + SQL_NEW + t[j:], encoding="utf-8", newline="\n"); changed.append("copper_database/sql/03_checks.sql")

p = ROOT / "tools/public_manifest.json"
if p.exists():
    raw = p.read_text(encoding="utf-8")
    m = json.loads(raw)
    n = sum(1 for f in REMOVE if m["files"].pop(f, None) is not None)
    if n:
        p.write_text(json.dumps(m, indent=1, ensure_ascii=False) + ("\n" if raw.endswith("\n") else ""), encoding="utf-8", newline="\n"); changed.append("tools/public_manifest.json")

print("; ".join(changed) if changed else "nothing to scrub")
