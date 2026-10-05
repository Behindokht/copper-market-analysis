"""Checks that docs/ is ready to be served by GitHub Pages (Settings, Pages, Deploy from a branch, folder /docs).
   python tools/check_pages.py [--online]
1. every relative link, script, stylesheet, image and font named in the HTML and the CSS exists; every #anchor of the single page is a view or a chapter that the app knows
2. nothing is loaded from outside the site (no CDN, no web font) and the external links are listed (--online also asks each one for its status)
3. no file in docs/ is over 5 MB, and the biggest ones are listed
4. nothing that must stay private is in docs/: no raw data file (csv, xlsx, pdf, db, zip), no LME series (tools/audit_public.py is run for the rest), no photo, and the CSS never asks for assets/
5. every page has a title, a description, a canonical link and an og:image that exists; .nojekyll and a 404 page are there
6. the IEA-derived files are listed, because the IEA terms are not confirmed (known issue) and the owner decides before anything is pushed
Exit code 1 if a check fails."""
import re
import subprocess
import sys
import urllib.request
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
problems, notes = [], []
pages = sorted(DOCS.glob("*.html"))
external = set()


def exists(base, ref):
    ref = unquote(ref.split("#")[0].split("?")[0])
    return ref == "" or (base.parent / ref).resolve().exists()


# 1 and 2: links in HTML, CSS and the literal links in the scripts
for pg in pages:
    t = pg.read_text(encoding="utf-8")
    for m in re.finditer(r'(?:href|src)="([^"]+)"', t):
        ref = m.group(1)
        if re.match(r"^(mailto:|javascript:|data:)", ref):
            continue
        if re.match(r"^https?://", ref):
            if "behindokht.github.io/copper-market-analysis" in ref:
                local = ref.split("copper-market-analysis/", 1)[1]
                if local and not (DOCS / local).exists():
                    problems.append(f"{pg.name}: absolute link to a file that is not in docs/: {ref}")
            else:
                external.add(ref)
            continue
        if ref.startswith("#"):
            continue
        if not exists(pg, ref):
            problems.append(f"{pg.name}: {ref} does not exist")
css = (DOCS / "css" / "site.css").read_text(encoding="utf-8")
for ref in re.findall(r'url\(\s*["\']?([^"\')]+)["\']?\s*\)', css):
    if ref.startswith(("data:", "%23", "#")):
        continue
    if re.match(r"^https?://", ref):
        problems.append(f"site.css loads {ref} from outside the site")
    elif not (DOCS / "css" / ref).resolve().exists():
        problems.append(f"site.css: {ref} does not exist")
js_text = {p: p.read_text(encoding="utf-8") for p in (DOCS / "js").rglob("*.js")}
for p, t in js_text.items():
    for m in re.finditer(r'href: "(https?://[^"]+)"', t):
        external.add(m.group(1))
    for m in re.finditer(r'href: "([\w\-./]+\.html)(#[\w\-]*)?"', t):
        if not (DOCS / m.group(1)).exists():
            problems.append(f"{p.name}: link to {m.group(1)} which does not exist")
strings = (DOCS / "js" / "strings.en.js").read_text(encoding="utf-8")
for m in re.finditer(r'"(?:repo_url|portfolio_url)": "([^"]+)"', strings):
    external.add(m.group(1))
for m in re.finditer(r'https?://[^\s"\')<>]+', strings):
    external.add(m.group(0).rstrip(".,;"))
for p in (DOCS / "data").glob("*.js"):
    for m in re.finditer(r'https?://[^\s"\')<>\\]+', p.read_text(encoding="utf-8")):
        external.add(m.group(0).rstrip(".,;"))
app = js_text[DOCS / "js" / "app.js"]
views = {"dashboard", "story", "quality", "method"} | set(re.findall(r'\["([\w-]+)", "\w+"\]', app))
for pg in pages:
    for m in re.finditer(r'href="[^"#]*#([\w\-?=&]+)"', pg.read_text(encoding="utf-8")):
        if m.group(1).split("?")[0] not in views and f'id="{m.group(1)}"' not in pg.read_text(encoding="utf-8"):
            problems.append(f"{pg.name}: anchor #{m.group(1)} is not a view or chapter")
for p, t in js_text.items():
    for m in re.finditer(r'href: "#([\w\-]+)"', t):
        if m.group(1) not in views and p.name not in ("app.js",):
            if not re.search(r'id: "%s"' % re.escape(m.group(1)), t) and m.group(1) not in ("main",):
                notes.append(f"{p.name}: anchor #{m.group(1)} is built from data or another file, not checked here")
# fonts: every file named is in docs/fonts and nothing is loaded from the web
for pg in pages:
    t = pg.read_text(encoding="utf-8")
    if re.search(r"fonts\.(googleapis|gstatic)\.com|cdnjs|jsdelivr|unpkg", t + css):
        problems.append("a web font or CDN is referenced")

# 3: sizes
files = [p for p in DOCS.rglob("*") if p.is_file()]
big = sorted(files, key=lambda p: -p.stat().st_size)[:5]
notes.append("largest files: " + ", ".join(f"{p.relative_to(DOCS).as_posix()} {p.stat().st_size // 1024} KB" for p in big))
for p in files:
    if p.stat().st_size > 5 * 1024 * 1024:
        problems.append(f"{p.relative_to(DOCS)} is over 5 MB")
notes.append(f"docs/ holds {len(files)} files, {sum(p.stat().st_size for p in files) // 1024} KB in all")

# 4: nothing private
for p in files:
    if p.suffix.lower() in (".csv", ".xlsx", ".xls", ".pdf", ".db", ".sqlite", ".zip", ".jpg", ".jpeg") or "patina" in p.name.lower() or "copper-plate" in p.name.lower():
        problems.append(f"{p.relative_to(DOCS)} must not be in docs/ (raw data or an unconfirmed photo)")
    if p.suffix.lower() == ".webp":
        problems.append(f"{p.relative_to(DOCS)}: a webp file is the photo format used for the unconfirmed background; it must not be in docs/")
if re.search(r"url\([^)]*assets/", css):
    problems.append("site.css asks for assets/ (the photo is local only, known issue K08)")
bg = js_text[DOCS / "js" / "bg.js"]
if 'location.protocol !== "file:"' not in bg:
    problems.append("bg.js may ask for the photo on a web host")
for p, t in js_text.items():
    if p.name != "bg.js" and "patina-background" in t:
        problems.append(f"{p.name} names the photo")
for p in files:
    if p.suffix in (".js", ".html", ".css", ".md") and re.search(r"HistoricalExport-lme", p.read_text(encoding="utf-8", errors="replace")):
        problems.append(f"{p.relative_to(DOCS)} mentions a raw LME file")
r = subprocess.run([sys.executable, str(ROOT / "tools" / "audit_public.py")], capture_output=True, text=True, encoding="utf-8", errors="replace")
if r.returncode != 0:
    problems.append("tools/audit_public.py fails:\n" + r.stdout[-800:])
else:
    notes.append("tools/audit_public.py: " + r.stdout.strip().splitlines()[-1])
iea = [l for l in r.stdout.splitlines() if "IEA" in l]

# 5: page metadata
for pg in pages:
    t = pg.read_text(encoding="utf-8")
    if pg.name == "404.html":
        continue
    for need, rx in (("title", r"<title>[^<]{8,}</title>"), ("description", r'<meta name="description" content="[^"]{60,}"'), ("canonical", r'<link rel="canonical" href="https://'), ("og:image", r'<meta property="og:image" content="https://[^"]+/img/[\w.-]+"')):
        if not re.search(rx, t):
            problems.append(f"{pg.name}: missing or too short: {need}")
    m = re.search(r'og:image" content="[^"]*/img/([\w.-]+)"', t)
    if m and not (DOCS / "img" / m.group(1)).exists():
        problems.append(f"{pg.name}: og:image file img/{m.group(1)} does not exist")
for need in (".nojekyll", "404.html", "robots.txt", "img/share.png", "img/favicon.svg"):
    if not (DOCS / need).exists():
        problems.append(f"docs/{need} is missing")

# the README and the site must not claim IEA permission (the owner has asked for it and has no reply yet; project release gate)
CLAIM = re.compile(r"(IEA|Rights@iea\.org)[^.\n]{0,60}(has |have )?(granted|given|confirmed|approved|agreed)[^.\n]{0,40}(permission|approval)|with (the )?IEA'?s? (permission|approval)|(permission|approval) (from|of) the IEA (was|has been) (granted|given)", re.I)
for f in [ROOT / "README.md", DOCS / "FACTS.md", DOCS / "js" / "strings.en.js"]:
    if f.exists() and CLAIM.search(f.read_text(encoding="utf-8")):
        problems.append(f"{f.name} claims IEA permission; the owner has not confirmed a reply (project release gate)")

# 6: the IEA list
iea_files = [p.relative_to(ROOT).as_posix() for p in files if re.search(r"iea", p.read_text(encoding="utf-8", errors="replace"), re.I) and p.suffix in (".js", ".md")]
notes.append("files in docs/ that mention the IEA (their terms are not confirmed, the owner decides before anything is pushed): " + ", ".join(iea_files))

if "--online" in sys.argv:
    for u in sorted(external):
        try:
            req = urllib.request.Request(u, method="HEAD", headers={"User-Agent": "Mozilla/5.0"})
            code = urllib.request.urlopen(req, timeout=15).status
        except Exception as e:
            code = getattr(e, "code", str(e)[:40])
        notes.append(f"external link {u[:90]}: {code}")
else:
    notes.append(f"{len(external)} external links found (run with --online to ask each one for its status)")

for n in notes:
    print("  -", n.encode("ascii", "replace").decode())
if problems:
    print(f"PAGES CHECK FAILED: {len(problems)} problem(s)")
    for x in problems:
        print("  -", x.encode("ascii", "replace").decode())
    sys.exit(1)
print("PAGES CHECK PASSED")
