"""Serves docs/ the way GitHub Pages does, for Lighthouse and the browser checks: gzip for text files and Cache-Control max-age=600.
   python tools/serve_docs.py [port]        (default 8765; stop with Ctrl+C)
The page is served over http, so docs/js/bg.js draws the CSS texture and never asks for the photo (assets/ is outside docs/)."""
import functools
import gzip
import http.server
import mimetypes
import sys
from pathlib import Path

DOCS = Path(__file__).resolve().parent.parent / "docs"
TEXT = (".html", ".css", ".js", ".json", ".svg", ".md", ".txt")


class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a, **k):
        pass

    def do_GET(self):
        path = self.translate_path(self.path.split("?")[0])
        p = Path(path)
        if p.is_dir():
            p = p / "index.html"
        if not p.exists():
            return super().do_GET()
        body = p.read_bytes()
        ctype = mimetypes.guess_type(str(p))[0] or "application/octet-stream"
        if p.suffix == ".js":
            ctype = "text/javascript"
        self.send_response(200)
        self.send_header("Content-Type", ctype + ("; charset=utf-8" if p.suffix in TEXT else ""))
        if p.suffix in TEXT and "gzip" in self.headers.get("Accept-Encoding", ""):
            body = gzip.compress(body, 6)
            self.send_header("Content-Encoding", "gzip")
        self.send_header("Cache-Control", "max-age=600")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    http.server.ThreadingHTTPServer(("127.0.0.1", port), functools.partial(Handler, directory=str(DOCS))).serve_forever()
