"""Serve web/dist like Cloudflare Pages does: /mission -> mission.html, plus _redirects.
Usage: python3 scripts/serve-dist.py [port]   (default 5311)"""
import http.server
import os
import sys
from functools import partial

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "web", "dist")


class Handler(http.server.SimpleHTTPRequestHandler):
    def send_head(self):
        path = self.path.split("?", 1)[0].split("#", 1)[0]
        if path == "/credits":
            self.send_response(301)
            self.send_header("Location", "/about#credits")
            self.end_headers()
            return None
        fs = self.translate_path(path)
        if not os.path.exists(fs) and os.path.exists(fs + ".html"):
            self.path = path + ".html" + (self.path[len(path):] if len(self.path) > len(path) else "")
        return super().send_head()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5311
    http.server.ThreadingHTTPServer(("127.0.0.1", port), partial(Handler, directory=ROOT)).serve_forever()
