"""Runs Lighthouse (desktop and mobile) on the dashboard and the case study and writes results/lighthouse_summary.json.
   python tools/serve_docs.py 8765 &        (the site as GitHub Pages serves it: gzip, 10 minute cache)
   python tools/run_lighthouse.py [--node PATH_TO_NODE_DIR] [--lighthouse PATH_TO_lighthouse_package] [--port 8765]
Lighthouse needs Node, which is not part of this project: install Node and run `npm install lighthouse` in any folder, then pass that folder with --lighthouse (the one holding node_modules).
A performance score of null means Lighthouse found no largest contentful paint: without a graphics card the glass plates take seconds to draw, which is a limit of the test machine as much as of the page.
Chrome is found from CHROME_PATH or the usual install folder. The scores depend on the machine (software rendering in a headless browser makes blur and filters slow), so read them as a guide."""
import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
args = sys.argv[1:]
arg = lambda k, d: args[args.index(k) + 1] if k in args else d
node_dir = Path(arg("--node", ""))
lh_dir = Path(arg("--lighthouse", "."))
port = arg("--port", "8765")
env = dict(os.environ)
if str(node_dir) != ".":
    env["PATH"] = str(node_dir) + os.pathsep + env["PATH"]
env.setdefault("CHROME_PATH", r"C:\Program Files\Google\Chrome\Application\chrome.exe")
cli = lh_dir / "node_modules" / "lighthouse" / "cli" / "index.js"
tmp = ROOT / "preview" / "lh"
tmp.mkdir(parents=True, exist_ok=True)
pages = {"dashboard": "index.html#dashboard", "story": "index.html#story", "case study": "case-study.html"}
summary = {"lighthouse_version": "", "pages": {}}
for name, path in pages.items():
    for mode in ("desktop", "mobile"):
        out = tmp / f"{name.replace(' ', '_')}_{mode}.json"
        cmd = [str(node_dir / "node.exe") if str(node_dir) != "." else "node", str(cli), f"http://127.0.0.1:{port}/{path}", "--only-categories=" + ("accessibility,best-practices,seo" if name == "story" else "performance,accessibility,best-practices,seo"), "--chrome-flags=--headless=new --no-sandbox", "--output=json", f"--output-path={out}", "--quiet"]
        if mode == "desktop":
            cmd.append("--preset=desktop")
        if out.exists():
            out.unlink()
        # the Story is one very long page: Chrome times out on its final screenshot when it is rendered in software, after the audits have run and the report is written; so the Story gets no performance score
        subprocess.run(cmd, env=env, check=(name != "story"))
        if not out.exists():
            continue
        j = json.loads(out.read_text(encoding="utf-8"))
        summary["lighthouse_version"] = j["lighthouseVersion"]
        summary["pages"][f"{name} ({mode})"] = {k: (None if v["score"] is None else round(v["score"] * 100)) for k, v in j["categories"].items()}
        extra = j["audits"]
        summary["pages"][f"{name} ({mode})"]["metrics"] = {} if name == "story" else {k: extra[k].get("displayValue") for k in ("first-contentful-paint", "largest-contentful-paint", "total-blocking-time", "cumulative-layout-shift", "speed-index") if k in extra}
(ROOT / "results" / "lighthouse_summary.json").write_text(json.dumps(summary, indent=1), encoding="utf-8")
for k, v in summary["pages"].items():
    print(k, {a: b for a, b in v.items() if a != "metrics"}, v.get("metrics"))
