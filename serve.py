#!/usr/bin/env python3
"""Optional developer tool: local server for Bethany's Collage Studio.

Regular users don't need this — just double-click "OPEN COLLAGE STUDIO.html".

Usage:
    python3 serve.py [port]     # defaults to port 5500

Serves the app directory with caching disabled so edits to the
HTML/CSS/JS show up on a plain refresh.
"""

import http.server
import os
import socketserver
import sys
import webbrowser

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5500
ROOT = os.path.dirname(os.path.abspath(__file__))


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write("  %s - %s\n" % (self.address_string(), fmt % args))


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def main():
    url = f"http://localhost:{PORT}"
    with Server(("127.0.0.1", PORT), NoCacheHandler) as httpd:
        print(f"Collage Studio running at {url}  (Ctrl+C to stop)")
        if "--open" in sys.argv:
            webbrowser.open(url)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")


if __name__ == "__main__":
    main()
