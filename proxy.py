#!/usr/bin/env python3
"""
Proxy for Pioneer Amp Control — bypasses browser CORS restrictions.
Serves the app and forwards amp requests. Works locally and on a NAS/server.

Usage:
    python3 proxy.py <amp-ip> [port] [bind-host]

Examples:
    python3 proxy.py 192.168.68.60              # local only, port 8080
    python3 proxy.py 192.168.68.60 8080 0.0.0.0 # all devices on network

On a Synology NAS or home server, run with 0.0.0.0 so any device on the
local network can open the app — no installation needed on phones or other
computers, just open the URL in a browser.

Synology Task Scheduler command:
    python3 /path/to/proxy.py 192.168.68.60 8080 0.0.0.0
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

    amp_ip    = sys.argv[1]
    port      = int(sys.argv[2]) if len(sys.argv) > 2 else 8080
    bind_host = sys.argv[3] if len(sys.argv) > 3 else 'localhost'

    # Serve static files from the project root directory
    docs_dir = os.path.dirname(os.path.abspath(__file__))
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

    import socket
    hostname = socket.gethostname()
    try:
        local_ip = socket.gethostbyname(hostname)
    except Exception:
        local_ip = '(unknown)'

    print(f'Serving app from   : {docs_dir}')
    print(f'Forwarding amp at  : http://{amp_ip}/')
    if bind_host == '0.0.0.0':
        print(f'Open on this device: http://localhost:{port}/')
        print(f'Open on other devices: http://{local_ip}:{port}/')
    else:
        print(f'Open in browser    : http://localhost:{port}/')
    print()

    HTTPServer((bind_host, port), Handler).serve_forever()


if __name__ == '__main__':
    main()
