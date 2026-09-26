"""Vercel Function for POST /api/predict."""
from http.server import BaseHTTPRequestHandler
from server import Handler as AppHandler


class handler(BaseHTTPRequestHandler):
    def send_json(self, code, value):
        AppHandler.send_json(self, code, value)

    def do_POST(self):
        AppHandler.do_POST(self)

    def log_message(self, *args):
        pass
