#!/usr/bin/env python3
"""
Trim the public project to its own scenario results, in one step, if the IEA terms turn out to be restrictive.

  python tools/trim_iea.py            dry run: print what would be changed (default, changes nothing)
  python tools/trim_iea.py --apply    do it

"Our own scenario results" means: tonnes of copper and percentages of mine output computed by the project, the copper per car and per MW inputs
(secondary sources), the project assumptions, the USGS figures, and the checks. It does NOT include the IEA's own volumes (electric-car sales and
shares, data-centre capacity in GW, IEA report figures).

What the step does
  1. Stops tracking, and git-ignores, the files that are IEA volumes or IEA report figures. The files stay on your disk, so your own rebuild still works.
  2. Rewrites three result files without the IEA volumes: car sales columns in the EV case grid, gigawatt columns in the data-centre case grid,
     the IEA input rows of the assumption register. (The site data already leaves these out; see DROP_COLUMNS in tools/export_site_data.py.)
  3. Replaces the detail text of the data checks that read IEA tables, because some of those quote IEA numbers.
  4. Clears the saved outputs of notebook 03 (its code stays; running it locally brings the outputs back), because they print IEA volumes.
  5. Updates tools/public_manifest.json and the IEA list in copper_database/README.md, then re-exports docs/data/*.js.
  6. Prints what it leaves for you to decide (see LEFT_FOR_YOU): two inputs and one issue text that quote IEA-derived figures.

Run it after the notebooks, before committing. The notebooks write the full result files again when they are re-run, so run this step last.
tools/audit_public.py keeps listing the IEA-derived files until you tell it otherwise by running this step.
"""
import csv
import io
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "tools" / "public_manifest.json"
README = ROOT / "copper_database" / "README.md"
GITIGNORE = ROOT / ".gitignore"

UNTRACK = [   # IEA volumes and IEA report figures (the files stay on disk)
    "results/res_demand_ev_paths.csv",           # IEA electric-car sales 2025 and 2035 and the interpolated 2030 paths
    "results/res_demand_dc_capacity.csv",        # IEA data-centre capacity by case, total and IT (GW)
    "results/res_demand_dc_paths.csv",           # data-centre additions and build paths in GW, derived from IEA capacity
    "results/res_demand_headline.csv",           # the long headline table: not used by the site; the sensitivity and range tables carry the results
    "copper_database/collected/datacentre_electricity_iea.csv",
    "copper_database/collected/datacentre_growth_by_region.csv",
]
DROP_COLUMNS = {
    "results/res_demand_ev_cases.csv": ["extra_bev", "extra_phev", "delta_total_sales"],
    "results/res_demand_dc_cases.csv": ["build_in_target_year_gw", "base_build_gw"],
}
DROP_ROWS = {"results/res_demand_assumptions.csv": ("kind", "IEA")}
IEA_TABLES = re.compile(r"^(raw_ev_data|stg_ev_data|raw_iea_annex_cells|stg_datacentre_|datacentre_electricity_iea|datacentre_growth_by_region|mart_dc_|mart_demand_|mart_ev_|res_demand_)")
KEEP_DETAIL = re.compile(r"^known issue K0")      # the two open-issue checks keep their wording (see LEFT_FOR_YOU)
WITHHELD = "details withheld: the IEA terms are not confirmed"
NOTEBOOK = "notebooks/03_demand_scenario.ipynb"
RESULTS_ONLY = [   # published files that stay, because they hold only tonnes, percentages and our own inputs
    "results/res_demand_sensitivity.csv", "results/res_demand_ranges.csv", "results/res_demand_context.csv", "results/res_demand_ev_cases.csv",
    "results/res_demand_dc_cases.csv", "results/res_demand_assumptions.csv", "results/res_dashboard_checks.csv", "docs/data/demand.js",
    "docs/data/quality.js", "notebooks/04_dashboard_exports.ipynb",
]
LEFT_FOR_YOU = [
    ("copper_database/collected/scenario_assumptions.csv", "the base-year data-centre build (14 GW and 9.25 GW) is computed from IEA capacity numbers; it is an input of the model, so it cannot be blanked without changing the results"),
    ("copper_database/collected/known_issues.csv", "K01 quotes percentages computed from the IEA annex (IT versus total capacity); the same text is in results/res_dashboard_known_issues.csv and on the Demand and Data quality pages"),
    ("docs/js/strings.en.js", "names the IEA scenarios (CPS, STEPS, Base Case, Lift-Off, High Efficiency, Headwinds) as labels; these are names, not data"),
]


def read_csv(path):
    with path.open(encoding="utf-8", newline="") as f:
        return list(csv.reader(f))


def write_csv(path, rows):
    buf = io.StringIO(newline="")
    csv.writer(buf, lineterminator="\n").writerows(rows)
    path.write_text(buf.getvalue(), encoding="utf-8", newline="\n")


def git(*args):
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, encoding="utf-8", errors="replace")


def main():
    apply = "--apply" in sys.argv
    plan = []
    in_git = git("rev-parse", "--is-inside-work-tree").stdout.strip() == "true"
    tracked = set(git("ls-files").stdout.split()) if in_git else set()

    for f in UNTRACK:
        if (ROOT / f).exists() or f in tracked:
            plan.append(("untrack + ignore", f, "stays on disk, leaves the repository"))
    for f, cols in DROP_COLUMNS.items():
        if (ROOT / f).exists():
            header = read_csv(ROOT / f)[0]
            present = [c for c in cols if c in header]
            if present:
                plan.append(("drop columns", f, ", ".join(present)))
    for f, (col, text) in DROP_ROWS.items():
        if (ROOT / f).exists():
            rows = read_csv(ROOT / f)
            ci = rows[0].index(col)
            n = sum(1 for r in rows[1:] if text in r[ci])
            if n:
                plan.append(("drop rows", f, f"{n} rows whose {col} contains '{text}'"))
    chk = ROOT / "results" / "res_dashboard_checks.csv"
    if chk.exists():
        rows = read_csv(chk)
        ti, di = rows[0].index("table_name"), rows[0].index("detail")
        ds = rows[0].index("description")
        n = sum(1 for r in rows[1:] if IEA_TABLES.match(r[ti]) and not KEEP_DETAIL.match(r[ds]) and r[di] != WITHHELD)
        if n:
            plan.append(("withhold check details", "results/res_dashboard_checks.csv", f"{n} checks on IEA tables (the check and its result stay)"))
    nb = ROOT / NOTEBOOK
    if nb.exists():
        data = json.loads(nb.read_text(encoding="utf-8"))
        n = sum(1 for c in data["cells"] if c["cell_type"] == "code" and c.get("outputs"))
        if n:
            plan.append(("clear outputs", NOTEBOOK, f"{n} code cells (the code stays)"))

    print(("APPLYING" if apply else "DRY RUN (nothing is changed; add --apply to do it)") + "\n")
    if not plan:
        print("Nothing to trim: the project is already trimmed.")
    for what, f, why in plan:
        print(f"  {what:<24} {f}\n  {'':<24} {why}")
    print("\nStays in the repository (tonnes, percentages and our own inputs only):")
    for f in RESULTS_ONLY:
        print(f"  {f}")
    print("\nNOT changed by this step; your decision (they quote IEA-derived figures or names):")
    for f, why in LEFT_FOR_YOU:
        print(f"  {f}\n  {'':<2}{why}")
    if not apply:
        return

    # 1 untrack and ignore
    ignore_lines = ["", "# IEA trim (tools/trim_iea.py --apply): IEA volumes and report figures stay on the local disk only"]
    for f in UNTRACK:
        if f in tracked:
            git("rm", "--cached", "-q", f)
        ignore_lines.append("/" + f)
    gi = GITIGNORE.read_text(encoding="utf-8")
    if "# IEA trim" not in gi:
        GITIGNORE.write_text(gi.rstrip("\n") + "\n" + "\n".join(ignore_lines) + "\n", encoding="utf-8", newline="\n")
    # 2 columns and rows
    for f, cols in DROP_COLUMNS.items():
        path = ROOT / f
        if path.exists():
            rows = read_csv(path)
            keep = [i for i, c in enumerate(rows[0]) if c not in cols]
            write_csv(path, [[r[i] for i in keep] for r in rows])
    for f, (col, text) in DROP_ROWS.items():
        path = ROOT / f
        if path.exists():
            rows = read_csv(path)
            ci = rows[0].index(col)
            write_csv(path, [rows[0]] + [r for r in rows[1:] if text not in r[ci]])
    # 3 check details
    if chk.exists():
        rows = read_csv(chk)
        ti, di, ds = rows[0].index("table_name"), rows[0].index("detail"), rows[0].index("description")
        for r in rows[1:]:
            if IEA_TABLES.match(r[ti]) and not KEEP_DETAIL.match(r[ds]):
                r[di] = WITHHELD
        write_csv(chk, rows)
    # 4 notebook outputs
    if nb.exists():
        data = json.loads(nb.read_text(encoding="utf-8"))
        for c in data["cells"]:
            if c["cell_type"] == "code":
                c["outputs"] = []
                c["execution_count"] = None
        nb.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
    # 5 manifest and README list
    m = json.loads(MANIFEST.read_text(encoding="utf-8"))
    files = m["files"]
    for f in UNTRACK:
        files.pop(f, None)
    if NOTEBOOK in files:
        files[NOTEBOOK]["iea_figures"] = False
        files[NOTEBOOK]["note"] = "outputs cleared (they printed IEA volumes); run the notebook locally to see them"
    for f in RESULTS_ONLY:
        if f in files:
            files[f]["iea_figures"] = False
            files[f]["iea_results_only"] = True
    MANIFEST.write_text(json.dumps(m, indent=1, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
    remaining = sorted(f for f, v in files.items() if v.get("iea_figures"))
    results_only = sorted(f for f, v in files.items() if v.get("iea_results_only"))
    text = README.read_text(encoding="utf-8")
    head = "## Files with IEA-derived figures"
    start = text.index(head)
    end = text.index("\n## ", start + 5)
    block = (head + " (trimmed; the IEA terms are not confirmed yet)\n\n"
             "`tools/trim_iea.py --apply` was run. The IEA's own volumes (electric-car sales and shares, data-centre capacity, IEA report figures) were removed from "
             "the public files. These files still contain figures derived from IEA data and are on the audit list until the terms are confirmed:\n\n"
             + "\n".join(f"- `{f}` ({files[f].get('note', '')})" for f in remaining)
             + "\n\nThese files hold only results computed by this project (tonnes of copper and percentages of mine output), the copper per car and per MW inputs, "
             "and the data checks:\n\n" + "\n".join(f"- `{f}`" for f in results_only) + "\n")
    README.write_text(text[:start] + block + text[end:], encoding="utf-8", newline="\n")
    # 6 re-export the site data
    r = subprocess.run([sys.executable, str(ROOT / "tools" / "export_site_data.py")], cwd=ROOT, capture_output=True, text=True)
    print("\n" + (r.stdout.strip().splitlines()[-1] if r.stdout.strip() else r.stderr.strip()))
    print("Done. Now run: python tools/check_site.py, python tools/audit_public.py, then commit.")


if __name__ == "__main__":
    main()
