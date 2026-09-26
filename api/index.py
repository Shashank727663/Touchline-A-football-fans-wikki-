"""Catch-all Vercel Function for the app's /api/* endpoints."""
from http.server import BaseHTTPRequestHandler
from server import Handler as AppHandler


class handler(BaseHTTPRequestHandler):
    """Vercel entry point; delegate to the shared local API implementation."""
    def send_json(self, code, value):
        AppHandler.send_json(self, code, value)

    def do_GET(self):
        AppHandler.do_GET(self)

    def do_POST(self):
        AppHandler.do_POST(self)

    def log_message(self, *args):
        pass
