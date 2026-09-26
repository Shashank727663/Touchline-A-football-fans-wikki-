"""Vercel Function for GET /api/headlines."""
from http.server import BaseHTTPRequestHandler
from server import Handler as AppHandler


class handler(BaseHTTPRequestHandler):
    def send_json(self, code, value):
        AppHandler.send_json(self, code, value)

    def do_GET(self):
        AppHandler.do_GET(self)

    def log_message(self, *args):
        pass
