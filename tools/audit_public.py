#!/usr/bin/env python3
"""
Pre-publication audit.

  python tools/audit_public.py            full audit: every file git tracks or would track, plus the whole history
  python tools/audit_public.py --staged   only the files staged for the next commit (this is what the pre-commit hook runs)
  --quiet                                 print only problems (and one line when it passes)

It fails (exit 1) if:
  1. a forbidden file is tracked or staged: databases, generated csv/, LME downloads, raw downloads in the root, the LME and IEA
     migration proofs, article-sourced tables, .claude/, .venv/
  2. a file is larger than 5 MB
  3. a csv header, a data column in docs/data/*.js, or a notebook OUTPUT contains an LME series column (licensed LME data is never published)
  4. a text file or notebook output shows a local path (C:\\Users\\..., /Users/..., AppData)
  5. .gitignore fails to ignore a sample of the forbidden paths
  6. git history ever contained a forbidden file or a blob larger than 5 MB (full audit only)
  7. a data file (results/, collected/, baselines/, notebooks/, docs/data/) is not listed in tools/public_manifest.json, a csv with 100 or
     more rows is not marked large_ok there, or a dataset with 100 or more rows in docs/data/*.js is not listed under large_datasets
  8. a file the manifest flags as containing IEA-derived figures is missing from the IEA list in copper_database/README.md
  9. the Story's direction counts do not reconcile (opposite + same direction + unchanged must equal the months compared, opposite must equal
     the two conditional counts, and every share must equal its counts); checked in results/res_story_guess_dollar.csv and docs/data/story.js
  10. the Dollar page's euro-price and dollar-price swing figures are not over the same months: the months in res_copper_eur_variance_split must
     equal the months of the full-sample euro correlation and match its first and last month; checked in the results CSVs and docs/data/dollar.js
It also prints the files that contain IEA-derived figures (so the IEA terms can be confirmed), the files that carry figures from
secondary articles, and the e-mail addresses found in published files.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "tools" / "public_manifest.json"
README = ROOT / "copper_database" / "README.md"
MAX_BYTES = 5 * 1024 * 1024

FORBIDDEN = [
    (r"\.(db|sqlite3?)$", "database file"),
    (r"(^|/)HistoricalExport-lme", "LME download (commercial data)"),
    (r"^copper_database/csv/", "generated csv folder (contains the LME series and other raw data)"),
    (r"^\.claude/", "local tool settings"),
    (r"(^|/)\.venv/", "virtual environment"),
    (r"^[^/]+\.(csv|xlsx|pdf|xml|zip)$", "raw download in the project root"),
    (r"^copper_database/baselines/(lme_copper_daily|ev_data|datacentre_annex_world|datacentre_annex_regional)_python\.csv$",
     "migration proof that summarises LME or IEA data"),
    (r"^copper_database/collected/(company_production|mine_production)\.csv$", "table from secondary articles (replace with company reports first)"),
    (r"(^|/)(__pycache__|\.ipynb_checkpoints)/", "cache folder"),
]
# columns that belong to the licensed LME series; they must never appear as a data column or in a notebook output
LME_COLUMNS = ["cash_usd_t", "cash_unofficial_usd_t", "three_month_usd_t", "three_month_unofficial_usd_t", "fifteen_month_usd_t",
               "dec_1_usd_t", "dec_2_usd_t", "dec_3_usd_t", "inventory_t", "volume_as_exported",
               "copper_lme_cash_usd_t_avg", "copper_lme_cash_usd_t_month_end", "copper_lme_cash_month_end_date"]
PATH_LEAK = re.compile(r"[A-Za-z]:[\\/]+Users[\\/]|/Users/[^/\s]+|AppData|/home/[^/\s]+")
EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
SAMPLE_MUST_BE_IGNORED = [
    "copper_database/copper.db", "copper_database/csv/data_checks.csv",
    "HistoricalExport-lme-copper-lme-historical-summary-20250726-035636.csv", "EV data by country 2026.xlsx", "CMO-Historical-Data-Monthly (2).xlsx",
    "MCS2026_Commodities_Data.csv", "DTWEXBGS.csv", "Data_annex_Energy_and_AI.xlsx",
    "copper_database/baselines/lme_copper_daily_python.csv", "copper_database/baselines/ev_data_python.csv",
    "copper_database/baselines/datacentre_annex_world_python.csv", "copper_database/baselines/datacentre_annex_regional_python.csv",
    "copper_database/collected/company_production.csv", "copper_database/collected/mine_production.csv",
    ".claude/settings.local.json", ".venv/Scripts/python.exe",
]
DATA_DIRS = ("results/", "copper_database/collected/", "copper_database/baselines/", "notebooks/", "docs/data/")
SELF = ("tools/audit_public.py", "tools/public_manifest.json")  # they describe the patterns, so they are not scanned for them
BINARY = (".woff2", ".png", ".jpg", ".ico", ".svg", ".woff", ".ttf")


def git(*args, check=True, text=True):
    r = subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=text, **({"encoding": "utf-8", "errors": "replace"} if text else {}))
    if check and r.returncode != 0:
        raise SystemExit(f"git {' '.join(args)} failed: {r.stderr.strip() if text else r.stderr.decode(errors='replace')}")
    return r


def list_files(staged):
    if staged:
        out = git("diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z").stdout
    else:
        out = git("ls-files", "-z", "--cached", "--others", "--exclude-standard").stdout
    return sorted({p for p in out.split("\0") if p})


def read(path, staged):
    if staged:
        return git("show", f":{path}", check=False).stdout
    p = ROOT / path
    return p.read_text(encoding="utf-8", errors="replace") if p.exists() else ""


def size_of(path, staged):
    if staged:
        r = git("cat-file", "-s", f":{path}", check=False)
        return int(r.stdout.strip() or 0)
    p = ROOT / path
    return p.stat().st_size if p.exists() else 0


def notebook_outputs(text):
    nb = json.loads(text)
    chunks = []
    for c in nb.get("cells", []):
        for o in c.get("outputs", []):
            if "text" in o:
                chunks.append("".join(o["text"]) if isinstance(o["text"], list) else o["text"])
            for k in ("text/plain", "text/html"):
                v = o.get("data", {}).get(k)
                if v:
                    chunks.append("".join(v) if isinstance(v, list) else v)
            if "traceback" in o:
                chunks.append("\n".join(o["traceback"]))
    return "\n".join(chunks)


def js_datasets(text):
    """docs/data/*.js files are written as 'window.CMA_DATA.<page> = {...};' with datasets {"columns": [...], "rows": [...]}."""
    m = re.search(r"window\.CMA_DATA\.\w+\s*=\s*", text)
    if not m:
        raise ValueError("no 'window.CMA_DATA.<page> =' assignment found")
    return json.loads(text[m.end():].strip().rstrip(";"))


def story_reconciles(facts, where):
    """facts: {fact_id: (value, months)}. One definition, one sample: every count and share must tie out."""
    out = []
    try:
        v = {k: x[0] for k, x in facts.items()}
        n = v["months_total"]
        fell, rose = v["copper_fell_when_dollar_rose_months"], v["copper_rose_when_dollar_fell_months"]
        if v["opposite_months"] != fell + rose:
            out.append(f"STORY {where}: opposite_months {v['opposite_months']} is not {fell} + {rose}")
        if v["opposite_months"] + v["same_direction_months"] + v["unchanged_months"] != n:
            out.append(f"STORY {where}: opposite + same direction + unchanged = {v['opposite_months'] + v['same_direction_months'] + v['unchanged_months']}, not {n}")
        if v["dollar_rose_months"] + v["dollar_fell_months"] > n:
            out.append(f"STORY {where}: dollar rose + fell months exceed the months compared")
        for share, num, den in (("copper_fell_when_dollar_rose", fell, v["dollar_rose_months"]),
                                ("copper_rose_when_dollar_fell", rose, v["dollar_fell_months"]),
                                ("opposite_direction_share", v["opposite_months"], n)):
            if abs(v[share] - num / den * 100) > 0.01:
                out.append(f"STORY {where}: {share} {v[share]} does not equal {num}/{den} = {num / den * 100:.2f}")
        for r2 in ("r2_dollar_index", "r2_euro", "r2_dollar_index_plus_yield"):
            if not 0 <= v[r2] <= 100:
                out.append(f"STORY {where}: {r2} {v[r2]} is outside 0 to 100")
    except KeyError as e:
        out.append(f"STORY {where}: fact {e} is missing")
    return out


def main():
    staged = "--staged" in sys.argv
    quiet = "--quiet" in sys.argv
    problems, notes = [], []
    if not (ROOT / ".git").exists():
        raise SystemExit("No git repository here. Run `git init -b main` and commit .gitignore first.")
    files = list_files(staged)
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8")) if MANIFEST.exists() else {"files": {}}
    mf = manifest["files"]

    # 1, 2 forbidden and large files
    for f in files:
        for pat, why in FORBIDDEN:
            if re.search(pat, f):
                problems.append(f"FORBIDDEN  {f}: {why}")
        if size_of(f, staged) > MAX_BYTES:
            problems.append(f"TOO LARGE  {f}: {size_of(f, staged) / 1e6:.1f} MB")

    # 3, 4 content scans
    emails = {}
    for f in files:
        if f.lower().endswith(BINARY) or f in SELF:
            continue
        raw = read(f, staged)
        text = raw
        try:
            if f.endswith(".ipynb"):
                text = notebook_outputs(raw)
        except Exception as e:
            problems.append(f"UNREADABLE {f}: {e}")
            continue
        m = PATH_LEAK.search(text)
        if m:
            problems.append(f"LOCAL PATH {f}: {m.group(0)}")
        cols = []
        if f.endswith(".csv"):
            cols = raw.split("\n", 1)[0].strip().split(",")
        elif f.endswith(".ipynb"):
            cols = re.findall(r"[A-Za-z0-9_]+", text)
        elif f.startswith("docs/data/") and f.endswith(".js"):
            try:
                cols = [c for ds in js_datasets(raw).values() if isinstance(ds, dict) for c in ds.get("columns", [])]
            except Exception as e:
                problems.append(f"UNREADABLE {f}: not the expected data format ({e})")
        bad = [c for c in cols if c.strip().strip('"') in LME_COLUMNS]
        if bad:
            problems.append(f"LME COLUMN {f}: '{bad[0]}' appears as a data column or in a notebook output")
        for e in EMAIL.findall(raw):
            emails.setdefault(e, set()).add(f)

    # 5 .gitignore effectiveness
    for s in SAMPLE_MUST_BE_IGNORED:
        if git("check-ignore", "-q", s, check=False).returncode != 0:
            problems.append(f"NOT IGNORED {s}: .gitignore does not cover it")

    # 6 history (full audit only)
    seen = []
    if not staged:
        hist = git("log", "--all", "--name-only", "--pretty=format:", check=False).stdout.split("\n")
        seen = sorted({h for h in hist if h.strip()})
        for h in seen:
            for pat, why in FORBIDDEN:
                if re.search(pat, h):
                    problems.append(f"IN HISTORY {h}: {why}")
        objs = git("rev-list", "--objects", "--all", check=False).stdout
        if objs.strip():
            info = subprocess.run(["git", "cat-file", "--batch-check=%(objecttype) %(objectsize) %(rest)"], cwd=ROOT, input=objs, capture_output=True,
                                  text=True, encoding="utf-8", errors="replace").stdout
            for line in info.split("\n"):
                parts = line.split(" ", 2)
                if len(parts) == 3 and parts[0] == "blob" and parts[1].isdigit() and int(parts[1]) > MAX_BYTES:
                    problems.append(f"IN HISTORY large blob {parts[2]}: {int(parts[1]) / 1e6:.1f} MB")

    # 7 manifest
    for f in files:
        if f.startswith(DATA_DIRS) and f not in mf and not f.lower().endswith(BINARY):
            problems.append(f"NOT IN MANIFEST {f}: add it to tools/public_manifest.json with its sources and licence note")
        if f.endswith(".csv") and f.startswith(DATA_DIRS):
            rows = read(f, staged).count("\n") - 1
            if rows >= 100 and not mf.get(f, {}).get("large_ok"):
                problems.append(f"LARGE CSV {f}: {rows} rows and not marked large_ok in the manifest (confirm it is a derived series)")
        if f.startswith("docs/data/") and f.endswith(".js"):
            try:
                for name, ds in js_datasets(read(f, staged)).items():
                    if isinstance(ds, dict) and len(ds.get("rows", [])) >= 100 and name not in mf.get(f, {}).get("large_datasets", []):
                        problems.append(f"LARGE DATASET {f}: '{name}' has {len(ds['rows'])} rows and is not listed under large_datasets in the manifest")
            except Exception:
                pass
    if not staged:
        for f in mf:
            if f not in files and not (ROOT / f).exists():
                notes.append(f"manifest lists {f}, which does not exist (yet)")

    # 8 README lists every IEA file
    iea_all = sorted(f for f in mf if mf[f].get("iea_figures"))
    readme = README.read_text(encoding="utf-8") if README.exists() else ""
    for f in iea_all:
        if (ROOT / f).exists() and f not in readme:
            problems.append(f"README IEA LIST {f}: flagged as IEA-derived in the manifest but missing from the IEA list in copper_database/README.md")

    # 9 Story figures reconcile
    sj = ROOT / "results" / "res_story_guess_dollar.csv"
    if sj.exists() and (not staged or "results/res_story_guess_dollar.csv" in files):
        import csv as _csv
        rows = list(_csv.DictReader(sj.open(encoding="utf-8")))
        problems += story_reconciles({r["fact_id"]: (float(r["value"]), r["months"]) for r in rows}, "results/res_story_guess_dollar.csv")
    sjs = ROOT / "docs" / "data" / "story.js"
    if sjs.exists() and (not staged or "docs/data/story.js" in files):
        ds = js_datasets(read("docs/data/story.js", False))["guess_dollar"]
        cols = ds["columns"]
        problems += story_reconciles({r[cols.index("fact_id")]: (float(r[cols.index("value")]), r[cols.index("months")]) for r in ds["rows"]}, "docs/data/story.js")

    # 10 euro-price and dollar-price swing over the same months
    def swing_check(var_rows, corr_rows, where):
        v = {r[0]: float(r[1]) for r in var_rows}
        try:
            n, a, z = int(v["months"]), str(int(v["first month (YYYYMM)"])), str(int(v["last month (YYYYMM)"]))
        except KeyError as e:
            return [f"SWING {where}: {e} is missing from the variance table"]
        c = [r for r in corr_rows if r[0].startswith("Copper vs euros per dollar, 1999")]
        if not c:
            return [f"SWING {where}: the full-sample euro correlation row is missing"]
        m = re.search(r"(\d{4})-(\d{2}) to (\d{4})-(\d{2})", c[0][0])
        if int(c[0][1]) != n or m.group(1) + m.group(2) != a or m.group(3) + m.group(4) != z:
            return [f"SWING {where}: swing months {a} to {z} ({n}) differ from the euro correlation sample '{c[0][0]}' ({c[0][1]})"]
        return []
    rv, rc = ROOT / "results" / "res_copper_eur_variance_split.csv", ROOT / "results" / "res_dollar_correlations.csv"
    if rv.exists() and rc.exists() and (not staged or any(x in files for x in ("results/res_copper_eur_variance_split.csv", "results/res_dollar_correlations.csv"))):
        import csv as _csv
        vr = [(r[0], r[1]) for r in list(_csv.reader(rv.open(encoding="utf-8")))[1:]]
        cr = [(r[0], r[1]) for r in list(_csv.reader(rc.open(encoding="utf-8")))[1:]]
        problems += swing_check(vr, cr, "results")
    djs = ROOT / "docs" / "data" / "dollar.js"
    if djs.exists() and (not staged or "docs/data/dollar.js" in files):
        dd_ = js_datasets(read("docs/data/dollar.js", False))
        problems += swing_check(dd_["eur_variance"]["rows"], [(r[0], r[1]) for r in dd_["correlations"]["rows"]], "docs/data/dollar.js")

    # report
    iea = sorted(f for f in files if mf.get(f, {}).get("iea_figures"))
    if not quiet:
        print(f"Audit of {len(files)} files that are {'staged' if staged else 'tracked or would be tracked'}"
              + ("" if staged else f", and {len(seen)} files in history") + ".\n")
        print("Files with IEA-derived figures (confirm the IEA terms before the repo goes public):")
        for f in iea:
            print(f"   {f}   [{', '.join(mf[f].get('sources', []))}] {mf[f].get('note', '')}")
        ro = sorted(f for f in files if mf.get(f, {}).get("iea_results_only"))
        if ro:
            print("\nFiles with results derived from IEA scenarios (tonnes and percentages only, after tools/trim_iea.py):")
            for f in ro:
                print(f"   {f}")
        print("\nFiles that only quote short IEA wording or describe IEA files (no IEA figures):")
        for f in sorted(f for f in files if mf.get(f, {}).get("iea_quotes")):
            print(f"   {f}")
        print("\nFiles with figures from secondary articles (attributed; S11 and S13):")
        for f in sorted(f for f in files if mf.get(f, {}).get("secondary_article_figures")):
            print(f"   {f}   [{', '.join(mf[f].get('sources', []))}]")
        print("\nFiles with statistics derived from LME data (no LME series values):")
        for f in sorted(f for f in files if mf.get(f, {}).get("lme_statistics_only")):
            print(f"   {f}   {mf[f].get('note', '')}")
        print("\nE-mail addresses found in published files:")
        for e, fs in sorted(emails.items()):
            print(f"   {e}: {', '.join(sorted(fs))}")
        for n in notes:
            print("note:", n)
        print()
    if problems:
        print(f"AUDIT FAILED: {len(problems)} problem(s)")
        for pr in problems:
            print("  -", pr)
        sys.exit(1)
    print(f"AUDIT PASSED ({'staged files' if staged else 'full'}): nothing forbidden, no LME series or local path in published files, every data file has a manifest entry"
          + ("" if quiet else "."))


if __name__ == "__main__":
    main()
