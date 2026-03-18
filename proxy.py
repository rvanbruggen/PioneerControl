#!/usr/bin/env python3
"""
Local proxy for Pioneer Amp Control — bypasses browser CORS restrictions.

Usage:
    python3 proxy.py <amp-ip> [port]

Example:
    python3 proxy.py 192.168.68.60 8080

Then open http://localhost:8080/ in your browser.
In the app, enter  localhost:8080  as the amp IP.

How it works:
    Requests to /EventHandler.asp and /StatusHandler.asp are forwarded to
    the real amp. All other requests are served from the docs/ directory.
    Because everything is on the same origin (localhost), the browser
    raises no CORS errors.
"""

import os
import sys
import urllib.request
import urllib.error
from http.server import HTTPServer, SimpleHTTPRequestHandler

# ---------------------------------------------------------------------------

def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    amp_ip = sys.argv[1]
    port   = int(sys.argv[2]) if len(sys.argv) > 2 else 8080

    # Serve static files from the docs/ directory
    docs_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'docs')
    os.chdir(docs_dir)

    class Handler(SimpleHTTPRequestHandler):

        AMP_PATHS = ('/EventHandler.asp', '/StatusHandler.asp')

        # ------------------------------------------------------------------ #
        def do_OPTIONS(self):
            # Respond to CORS preflight (belt-and-suspenders)
            self._cors_headers(200)
            self.end_headers()

        def do_GET(self):
            if self._is_amp_path():
                self._proxy('GET')
            else:
                super().do_GET()

        def do_POST(self):
            if self._is_amp_path():
                length = int(self.headers.get('Content-Length', 0))
                body   = self.rfile.read(length) if length else None
                self._proxy('POST', body)
            else:
                self.send_error(404)

        # ------------------------------------------------------------------ #
        def _is_amp_path(self):
            # Match /EventHandler.asp and /StatusHandler.asp (ignore query string)
            path = self.path.split('?')[0]
            return any(path == p for p in self.AMP_PATHS)

        def _proxy(self, method, body=None):
            target = 'http://' + amp_ip + self.path
            req = urllib.request.Request(target, data=body, method=method)
            if body:
                req.add_header(
                    'Content-Type',
                    self.headers.get('Content-Type',
                                     'application/x-www-form-urlencoded')
                )
            req.add_header('Pragma', 'no-cache')
            req.add_header('Cache-Control', 'no-cache')

            try:
                with urllib.request.urlopen(req, timeout=5) as resp:
                    data        = resp.read()
                    content_type = resp.headers.get('Content-Type', 'text/plain')
                    self._cors_headers(resp.status)
                    self.send_header('Content-Type', content_type)
                    self.send_header('Content-Length', str(len(data)))
                    self.end_headers()
                    self.wfile.write(data)
            except urllib.error.URLError as exc:
                self.send_error(502, 'Amp unreachable: ' + str(exc.reason))
            except Exception as exc:
                self.send_error(500, str(exc))

        def _cors_headers(self, status):
            self.send_response(status)
            self.send_header('Access-Control-Allow-Origin',  '*')
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', '*')

        def log_message(self, fmt, *args):
            print('[%s] %s' % ('amp' if self._is_amp_path() else 'web', fmt % args))

    # ---------------------------------------------------------------------------

    print(f'Serving app from   : {docs_dir}')
    print(f'Forwarding amp at  : http://{amp_ip}/')
    print(f'Open in browser    : http://localhost:{port}/')
    print(f'Use as amp IP      : localhost:{port}')
    print()

    HTTPServer(('localhost', port), Handler).serve_forever()


if __name__ == '__main__':
    main()
