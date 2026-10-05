"""Verifies a rewritten history: the removed IEA paths are gone from every commit, no probe string from the removed files or the annex values is left in any commit, notebooks 03 and 04 hold no outputs, and every author and committer email is the noreply one.
   python tools/verify_history.py REPO_DIR ORIGINAL_REPO_DIR [NOREPLY_EMAIL]
The probes are read from the files as they were in the original repository (every data row of the three removed files, the withheld annex strings, and the EV sales figures as bare numbers). ORIGINAL_REPO_DIR needs a checkout with those files, such as a clone of the backup bundle."""
import csv
import io
import json
import re
import subprocess
import sys
from pathlib import Path

repo, orig = Path(sys.argv[1]), Path(sys.argv[2])
email = sys.argv[3] if len(sys.argv) > 3 else None
sh = lambda cwd, *a: subprocess.run(a, cwd=cwd, capture_output=True, text=True, encoding="utf-8", errors="replace").stdout
bad = []
REMOVED = ["results/res_demand_ev_paths.csv", "results/res_demand_dc_capacity.csv", "results/res_demand_dc_paths.csv"]
for p in REMOVED:
    if sh(repo, "git", "log", "--all", "--oneline", "--", p).strip():
        bad.append(f"{p} still appears in the history")
probes = set()          # nothing is typed in this file: every probe is read from the original checkout (a clone of the backup bundle at the commit before the scrub)
for line in sh(orig, "git", "show", "HEAD:results/res_dashboard_checks.csv").splitlines()[1:]:
    cells = next(csv.reader([line]), [])
    if len(cells) > 4 and re.match(r"^(raw_ev_data|stg_ev_data|raw_iea_annex_cells|stg_datacentre_|datacentre_electricity_iea|datacentre_growth_by_region)", cells[1]) and len(cells[4]) > 12 and "withheld" not in cells[4]:
        probes.add(cells[4])         # the detail texts of the checks on the raw IEA tables
for p in REMOVED:
    rows = sh(orig, "git", "show", f"HEAD:{p}").splitlines()[1:]
    probes.update(r for r in rows if len(r) > 25)
toks = set()      # every EV sales figure of one million or more in the removed file, and the figures the old hand-calculation check typed (read from the original SQL)
old_sql = sh(orig, "git", "show", "HEAD:copper_database/sql/03_checks.sql")
m = re.search(r"\(\(([0-9.]+) - ([0-9.]+)\) \* \(86\.5 - 20\.0\) \+ \(([0-9.]+) - ([0-9.]+)\)", old_sql)
if m:
    toks.update(re.sub(r"\.0+$", "", g) for g in m.groups())
for r in csv.DictReader(io.StringIO(sh(orig, "git", "show", "HEAD:results/res_demand_ev_paths.csv"))):
    for k in ("bev", "phev", "ev", "total_sales_central", "total_sales_min", "total_sales_max", "non_ev_sales_central"):
        if r.get(k) and float(r[k]) >= 1e6:
            toks.add(re.sub(r"\.0+$", "", r[k]))
revs = sh(repo, "git", "rev-list", "--all").split()
print(len(revs), "commits;", len(probes), "probe strings;", len(toks), "number literals")
hits = {}
for pr in sorted(probes):
    out = sh(repo, "git", "grep", "-l", "-F", "-e", pr, *revs)
    if out.strip():
        hits[pr] = sorted({l.partition(":")[2] for l in out.splitlines()})
for t in sorted(toks):
    out = sh(repo, "git", "grep", "-l", "-E", r"(^|[^0-9.])" + re.escape(t) + r"([^0-9]|$)", *revs)
    if out.strip():
        hits["literal " + t] = sorted({l.partition(":")[2] for l in out.splitlines()})
for pr, paths in hits.items():
    bad.append(f"probe {pr[:60]!r} found in {paths}")
for r in revs:
    for nb in ("notebooks/03_demand_scenario.ipynb", "notebooks/04_dashboard_exports.ipynb"):
        t = sh(repo, "git", "show", f"{r}:{nb}")
        if t.strip():
            j = json.loads(t)
            if any(c.get("outputs") for c in j["cells"] if c["cell_type"] == "code"):
                bad.append(f"{r[:7]} {nb} has outputs")
if email:
    emails = set(sh(repo, "git", "log", "--all", "--format=%ae%n%ce").split())
    if emails != {email}:
        bad.append(f"author or committer emails in the history: {sorted(emails)}")
print("VERIFY FAILED" if bad else "VERIFY PASSED: removed paths absent, probes absent, notebook outputs empty" + (", one author email" if email else ""))
for b in bad[:30]:
    print("  -", b)
sys.exit(1 if bad else 0)
