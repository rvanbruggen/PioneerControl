#!/usr/bin/env python3
"""
Proxy for Pioneer Amp Control — bypasses browser CORS restrictions.
Serves the app and forwards amp requests. Works locally and on a NAS/server.

Commands and status are both sent via HTTP to the amp's built-in web interface
(EventHandler.asp and StatusHandler.asp), matching the same headers used by
Pioneer's own Interactive Operating Guide.

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
import ssl
import sys
import socket
import urllib.parse
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

    cert_file = os.path.join(docs_dir, 'cert.pem')
    key_file  = os.path.join(docs_dir, 'key.pem')
    use_https = os.path.exists(cert_file) and os.path.exists(key_file)

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
                if self.path.split('?')[0] == '/EventHandler.asp':
                    self._command(body)
                else:
                    self._proxy('POST', body)
            else:
                self.send_error(404)

        # ------------------------------------------------------------------ #
        def _is_amp_path(self):
            # Match /EventHandler.asp and /StatusHandler.asp (ignore query string)
            path = self.path.split('?')[0]
            return any(path == p for p in self.AMP_PATHS)

        def _command(self, body):
            """Forward a WebToHostItem command via HTTP to the amp,
            using the same headers as Pioneer's own web interface."""
            cmd = ''
            if body:
                try:
                    params = urllib.parse.parse_qs(
                        body.decode('utf-8', errors='replace')
                    )
                    cmd = params.get('WebToHostItem', [''])[0]
                except Exception:
                    pass

            target = 'http://' + amp_ip + '/EventHandler.asp'
            req = urllib.request.Request(target, data=body, method='POST')
            # Match Pioneer's Interactive Operating Guide headers exactly.
            # Content-Type must be text/plain — the amp rejects other types
            # for some zone commands (e.g. Zone 2 input select).
            req.add_header('Content-Type',      'text/plain;charset=UTF-8')
            req.add_header('If-Modified-Since', 'Thu, 1 Jan 1970 00:00:00 GMT')
            req.add_header('Pragma',            'no-cache')
            req.add_header('Cache-Control',     'no-cache')
            req.add_header('Connection',        'keep-alive')
            req.add_header('Origin',            'http://' + amp_ip)
            req.add_header('Referer',           'http://' + amp_ip + '/index.html')

            try:
                with urllib.request.urlopen(req, timeout=5) as resp:
                    resp_body = resp.read()
                    print(f'[CMD] {cmd!r} → HTTP {resp.status}')
                    self._cors_headers(resp.status)
                    self.send_header('Content-Length', str(len(resp_body)))
                    self.end_headers()
                    self.wfile.write(resp_body)
            except Exception as exc:
                print(f'[CMD] {cmd!r} → error: {exc}')
                self.send_error(502, str(exc))

        def _proxy(self, method, body=None):
            target = 'http://' + amp_ip + self.path
            req = urllib.request.Request(target, data=body, method=method)
            if body:
                req.add_header('Content-Type', 'text/plain;charset=UTF-8')
            req.add_header('Pragma', 'no-cache')
            req.add_header('Cache-Control', 'no-cache')

            try:
                with urllib.request.urlopen(req, timeout=5) as resp:
                    data         = resp.read()
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

    hostname = socket.gethostname()
    try:
        local_ip = socket.gethostbyname(hostname)
    except Exception:
        local_ip = '(unknown)'

    protocol = 'https' if use_https else 'http'
    print(f'Serving app from   : {docs_dir}')
    print(f'Forwarding amp at  : http://{amp_ip}/')
    if use_https:
        print(f'TLS certificate    : {cert_file}')
    if bind_host == '0.0.0.0':
        print(f'Open on this device: {protocol}://localhost:{port}/')
        print(f'Open on other devices: {protocol}://{local_ip}:{port}/')
    else:
        print(f'Open in browser    : {protocol}://localhost:{port}/')
    if use_https:
        print('NOTE: First visit will show a browser security warning — click')
        print('      "Advanced" → "Proceed" to accept the self-signed certificate.')
    print()

    server = HTTPServer((bind_host, port), Handler)
    if use_https:
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.load_cert_chain(cert_file, key_file)
        server.socket = ctx.wrap_socket(server.socket, server_side=True)
    server.serve_forever()


if __name__ == '__main__':
    main()
