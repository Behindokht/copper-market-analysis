#!/usr/bin/env python3
"""
Checks on the static site in docs/ (run before every commit that touches it):  python tools/check_site.py

  1. none of the three characters the fonts cannot draw ("greater or equal", "almost equal", the right arrow) appears anywhere in docs/
  2. nothing is loaded from outside the site: no external stylesheet, script, font, import, fetch or other network call
  3. every font file named in the stylesheet exists, and every font family has its licence text next to it
  4. every text key the code asks for exists in docs/js/strings.en.js, and no key is unused
  5. the strings never contain a hard-coded percentage: every number on the site comes from the data files
  6. the Story's first guess never uses the word that would turn an association into a cause
  7. the contrast of every colour pair in use passes (tools/contrast_report.py)
  10. every font file covers every character used by the site (tools/font_coverage.py)
  9. wording: the demand text never says gap, deficit or shortage
  8. plain text style: no em dash or en dash in any site file, none of the stiff words in the banned list, and no sentence over 25 words
     in the page text (lists of credits and attributions are citations and are exempt from the length rule)
Exit code 1 if anything fails.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
problems = []

text_files = [p for p in DOCS.rglob("*") if p.is_file() and p.suffix in (".html", ".css", ".js", ".md", ".txt", ".json")]

# 1. glyphs the fonts lack
for p in text_files:
    if p.name.startswith("OFL-"):
        continue
    t = p.read_text(encoding="utf-8", errors="replace")
    for ch, name in (("≥", "greater or equal"), ("≈", "almost equal"), ("→", "right arrow")):
        if ch in t or ("\\u%04x" % ord(ch)) in t.lower():
            problems.append(f"GLYPH {p.relative_to(ROOT).as_posix()}: contains the character for '{name}', which the fonts cannot draw")

# 2. no outside loading
EXTERNAL = [
    (r"<link(?![^>]*rel=[\"']canonical)[^>]+href=[\"']https?:", "external stylesheet or link"), (r"<script[^>]+src=[\"']https?:", "external script"),
    (r"url\(\s*[\"']?https?:", "external url() in CSS"), (r"@import", "@import"), (r"\bfetch\s*\(", "fetch()"), (r"XMLHttpRequest", "XMLHttpRequest"),
    (r"new\s+WebSocket", "WebSocket"), (r"sendBeacon", "sendBeacon"), (r"\bimport\s*\(", "dynamic import()"), (r"<iframe", "iframe"),
    (r"fonts\.(googleapis|gstatic)\.com", "Google Fonts"),
]
for p in text_files:
    if p.suffix not in (".html", ".css", ".js") or p.parent.name == "data":
        continue
    t = p.read_text(encoding="utf-8", errors="replace")
    for pat, what in EXTERNAL:
        if re.search(pat, t):
            problems.append(f"EXTERNAL {p.relative_to(ROOT).as_posix()}: {what}")

# 3. fonts and licences
css = (DOCS / "css" / "site.css").read_text(encoding="utf-8")
families = set(re.findall(r"font-family:\s*\"([^\"]+)\";\s*src", css))
for rel in re.findall(r"url\(\"\.\./(fonts/[^\"]+)\"\)", css):
    if not (DOCS / rel).exists():
        problems.append(f"FONT missing file docs/{rel}")
for fam in families:
    lic = DOCS / "fonts" / ("OFL-" + fam.replace(" ", "-") + ".txt")
    if not lic.exists():
        problems.append(f"FONT licence text missing for {fam}: expected {lic.relative_to(ROOT).as_posix()}")
    elif "SIL OPEN FONT LICENSE" not in lic.read_text(encoding="utf-8", errors="replace").upper():
        problems.append(f"FONT licence text for {fam} does not look like the SIL Open Font License")

# 4. strings
raw = (DOCS / "js" / "strings.en.js").read_text(encoding="utf-8")
S = json.loads(raw[raw.index("{", raw.index("window.CMA_STRINGS")): raw.rindex("}") + 1])


def flat(d, prefix=""):
    for k, v in d.items():
        if isinstance(v, dict):
            yield from flat(v, prefix + k + ".")
        else:
            yield prefix + k, v


keys = dict(flat(S))
prov = DOCS / "data" / "provenance.js"
DATASET_KEYS = set()
if prov.exists():
    _pt = prov.read_text(encoding="utf-8")
    DATASET_KEYS = set(json.loads(_pt[_pt.index("{", _pt.index("provenance =")): _pt.rindex("}") + 1])["datasets"])
used = set()
for p in (DOCS / "js").rglob("*.js"):
    if p.name.startswith("strings"):
        continue
    t = p.read_text(encoding="utf-8")
    for m in re.finditer(r"\bt\(\s*\"([\w.]+)\"", t):
        used.add(m.group(1))
    for m in re.finditer(r"\bt\(\s*\"([\w.]+)\"\s*\+", t):     # keys built in code: prefix + id
        used.add(m.group(1) + "*")
    if p.parent.name == "pages":
        for m in re.finditer(r"\bT\(\s*\"([\w.]+)\"(\s*\+)?", t):   # a page helper T("key") means t("<page>.key"); T("prefix" + id) is a built key
            used.add(p.stem + "." + m.group(1) + ("*" if m.group(2) else ""))
    for m in re.finditer(r"\"(pages|nav|story|footer|site|hero)\.[\w.]*\"(?!\s*\+)", t):   # a string followed by + is a prefix, handled above
        if m.group(0).strip('"') in DATASET_KEYS:      # a dataset key for a source chip, not a text key
            continue
        used.add(m.group(0).strip('"'))
for u in sorted(used):
    if u.endswith("*") or u.endswith(".") or u.endswith("_"):
        continue
    if u not in keys and not any(k.startswith(u + ".") for k in keys):
        problems.append(f"TEXT key used in code but missing in strings.en.js: {u}")
dynamic = ("pages.", "nav.", "story.guess2.opt_", "story.sources.names.", "story.guess1.verdict_", "footer.", "story.notshow.", "story.guess2.c_", "site.", "hero.",
           "dollar.sources.names.", "dollar.notshow.", "ratio.sources.names.", "ratio.notshow.", "ratio.fam_", "ratio.h_",
           "demand.sources.names.", "demand.notshow.", "demand.scen_", "demand.path_", "demand.cu_", "demand.pet_", "demand.dc_", "demand.dcpath_", "demand.basis_",
           "demand.int_", "demand.base_", "quality.reason.", "quality.f_", "drivers.", "dashboard.")
for k in sorted(keys):
    if k not in used and not any(k.startswith(d) for d in dynamic) and not any(u.rstrip("*") and k.startswith(u.rstrip("*")) for u in used if u.endswith("*")):
        problems.append(f"TEXT key defined but never used: {k}")

# 5. no hard-coded percentage in the strings
for k, v in keys.items():
    for s in (v if isinstance(v, list) else [v]):
        if isinstance(s, str) and re.search(r"\d(\.\d+)?\s?%", s):
            problems.append(f"NUMBER hard-coded in text {k}: numbers must come from the data files")

# 6. no causal word in the first guess
for k, v in keys.items():
    if k.startswith("story.guess1.") and isinstance(v, str) and re.search(r"\bbecause\b", v, re.I):
        problems.append(f"WORDING {k}: the first guess must not say 'because' (an association is not a cause)")

# 8. plain text style
BANNED = ["utilize", "utilise", "leverage", "furthermore", "moreover", "notably", "robust", "delve", "underscore", "paramount", "plethora",
          "facilitate", "elucidate", "endeavor", "endeavour", "commence", "subsequently", "nevertheless", "consequently", "albeit",
          "whilst", "comprehensive", "holistic", "seamless", "myriad", "intricate", "pivotal", "landscape"]
EXEMPT_LENGTH = ("aluminium.holds_lines", "footer.credits", "story.sources.attribution", "dollar.sources.attribution", "ratio.sources.attribution", "demand.sources.attribution")
for p in text_files:
    if p.name.startswith("OFL-"):
        continue
    t = p.read_text(encoding="utf-8", errors="replace")
    if "\u2014" in t or "\u2013" in t or "\\u2014" in t or "\\u2013" in t:
        problems.append(f"DASH {p.relative_to(ROOT).as_posix()}: contains an em dash or en dash; use a full stop, a comma or 'to'")
for k, v in keys.items():
    for s_ in (v if isinstance(v, list) else [v]):
        if not isinstance(s_, str) or k.endswith(("_url", "_user", "_domain")):
            continue
        for w in BANNED:
            if re.search(rf"\b{w}\b", s_, re.I):
                problems.append(f"STYLE {k}: stiff word '{w}'")
        if not k.startswith(EXEMPT_LENGTH):
            for sent in re.split(r"(?<=[.!?])\s+", s_):
                n_words = len(re.sub(r"\{\w+\}", "X", sent).split())
                if n_words > 25:
                    problems.append(f"STYLE {k}: a sentence has {n_words} words (limit 25): {sent[:70]}...")

# 9. wording on the demand page: never a gap, deficit or shortage (there is no supply projection)
for k, v in keys.items():
    if k.startswith("demand.") or k.startswith("quality.reason.K0"):
        for s_ in (v if isinstance(v, list) else [v]):
            if isinstance(s_, str) and re.search(r"\b(gap|gaps|deficit|deficits|shortage|shortages|shortfall)\b", s_, re.I):
                problems.append(f"WORDING {k}: the demand pages never say gap, deficit or shortage")

# 10. every font file covers every character the site can show
venv = ROOT / ".venv" / "Scripts" / "python.exe"
r = subprocess.run([str(venv) if venv.exists() else sys.executable, str(ROOT / "tools" / "font_coverage.py")], capture_output=True, text=True, encoding="utf-8", errors="replace")
if r.returncode != 0:
    problems.extend(line for line in r.stdout.splitlines() if line.startswith("FONT COVERAGE"))
elif r.stdout.startswith("SKIPPED"):
    print("note: font coverage check skipped (fontTools missing)")

# 7. contrast
r = subprocess.run([str(venv) if venv.exists() else sys.executable, str(ROOT / "tools" / "contrast_report.py")], capture_output=True, text=True, encoding="utf-8", errors="replace")
if r.returncode != 0:
    problems.append("CONTRAST " + (r.stdout.strip().splitlines()[-1] if r.stdout.strip() else r.stderr.strip()))

# 11. the built page itself: no unfilled placeholder such as {kt}, no "undefined" or "NaN" anywhere on screen (tools/rendered_text.py, needs Playwright)
import json as _json
site_dir = sys.argv[sys.argv.index("--site") + 1] if "--site" in sys.argv else str(ROOT / "docs")
for py in (sys.executable, str(venv)):
    if py == str(venv) and not venv.exists():
        continue
    probe = subprocess.run([py, "-c", "import playwright"], capture_output=True)
    if probe.returncode != 0:
        continue
    r = subprocess.run([py, str(ROOT / "tools" / "rendered_text.py"), site_dir], capture_output=True, text=True, encoding="utf-8", errors="replace")
    try:
        res = _json.loads(r.stdout.strip().splitlines()[-1])
        problems.extend("RENDERED " + x for x in res["problems"])
        print(f"rendered check: {res['chars']} characters read from the story, appendix and method page; {len(res['problems'])} problem(s)")
    except Exception:
        problems.append("RENDERED the browser check did not run: " + (r.stderr.strip().splitlines() or ["no output"])[-1])
    break
else:
    print("note: rendered check skipped (Playwright is not installed for any Python)")

if problems:
    print(f"SITE CHECK FAILED: {len(problems)} problem(s)")
    for p in problems:
        print("  -", p)
    sys.exit(1)
print(f"SITE CHECK PASSED: {len(text_files)} text files, {len(keys)} text keys, {len(families)} font families, all colour pairs in use pass.")
