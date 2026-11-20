"""A ticket endpoint in Python (standard library): POST /ticket {"room": "..."} -> {"ticket": "...", "expiresAt": ...}.
  JSFLOW_SECRET_KEY=sk_... JSFLOW_KEY_ID=key_... JSFLOW_APP=myapp python3 server.py
The secret key lives only on your server (an environment variable or your secrets store), never in a page.
"""
import json
import os
import sys
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

from ticket import mint_ticket

SECRET, KEY_ID, APP = (os.environ.get(k) for k in ("JSFLOW_SECRET_KEY", "JSFLOW_KEY_ID", "JSFLOW_APP"))
if not (SECRET and KEY_ID and APP):
    sys.exit("set JSFLOW_SECRET_KEY, JSFLOW_KEY_ID and JSFLOW_APP")


def current_user(handler):
    # REPLACE THIS with your own authentication: return the signed-in user's id, or None. The ticket makes jsflow
    # trust this id (peers read it with room.user(peerId)), so it must come from your session, never from the body.
    return handler.headers.get("x-demo-user")


class Handler(BaseHTTPRequestHandler):
    def _send(self, status, body):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        if self.path != "/ticket":
            return self._send(404, {"err": "not_found"})
        sub = current_user(self)
        if not sub:
            return self._send(401, {"err": "unauthorized"})
        try:
            length = int(self.headers.get("content-length", "0"))
            if length > 4096:
                return self._send(413, {"err": "too_large"})
            room = json.loads(self.rfile.read(length) or b"{}").get("room")
        except (ValueError, AttributeError):
            return self._send(400, {"err": "bad_json"})
        # Decide here whether this user may enter this room. The ticket is your yes.
        try:
            ticket = mint_ticket(SECRET, KEY_ID, APP, room, sub, ttl_seconds=300)
        except ValueError as e:
            return self._send(400, {"err": "bad_request", "message": str(e)})
        self._send(200, {"ticket": ticket, "expiresAt": int(time.time() * 1000) + 300_000})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8787"))
    print(f"ticket endpoint on http://127.0.0.1:{port}/ticket")
    HTTPServer(("127.0.0.1", port), Handler).serve_forever()
