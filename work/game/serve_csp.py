"""Static server with an artifact-like CSP so texture-loading failures show up locally.  python3 serve_csp.py [port]"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
CSP = ("default-src 'self'; img-src 'self' data:; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
       "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self'")
class H(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Content-Security-Policy", CSP); super().end_headers()
ThreadingHTTPServer(("", int(sys.argv[1]) if len(sys.argv) > 1 else 8766), H).serve_forever()
