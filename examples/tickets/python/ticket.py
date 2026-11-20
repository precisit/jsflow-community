"""jsflow join tickets in Python, standard library only. A ticket is an HS256 JWT signed with an app's SECRET key (sk_...):
  header  {alg: "HS256", typ: "JWT", kid: <the key's id>}     (kid lets two keys be active while you rotate)
  claims  {app, room, sub, iat, exp, region?}                  (sub: your user's id; exp: at most 10 minutes ahead)
The HMAC key is the bytes of the full sk_... string. The service verifies the ticket; it never calls you.
"""
import base64
import hashlib
import hmac
import json
import re
import sys
import time


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _json(obj) -> bytes:
    # Compact, in the order given, and UTF-8 as is (not \u escapes): the same bytes as the Node and Go examples.
    return json.dumps(obj, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def mint_ticket(secret_key, key_id, app, room, sub, region=None, ttl_seconds=300, iat=None):
    if not isinstance(secret_key, str) or not secret_key.startswith("sk_") or len(secret_key) < 20:
        raise ValueError("secret_key must be the app's sk_... secret key")
    if not isinstance(key_id, str) or not key_id.startswith("key_"):
        raise ValueError("key_id must be the secret key's id (key_...)")
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,31}", app or ""):
        raise ValueError("app: lower case letters, digits and -, 1 to 32 characters")
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", room or ""):
        raise ValueError("room: letters, digits, _ and -, 1 to 64 characters")
    if not isinstance(sub, str) or not 1 <= len(sub.encode("utf-8")) <= 256:
        raise ValueError("sub: your user id, 1 to 256 bytes of UTF-8")
    if not isinstance(ttl_seconds, int) or not 1 <= ttl_seconds <= 600:
        raise ValueError("ttl_seconds: 1 to 600 (a ticket may live at most 10 minutes)")
    iat = int(time.time()) if iat is None else iat
    header = {"alg": "HS256", "typ": "JWT", "kid": key_id}
    claims = {"app": app, "room": room, "sub": sub, "iat": iat, "exp": iat + ttl_seconds}
    if region:
        claims["region"] = region
    signing_input = f"{_b64url(_json(header))}.{_b64url(_json(claims))}"
    mac = hmac.new(secret_key.encode("utf-8"), signing_input.encode("ascii"), hashlib.sha256).digest()
    return f"{signing_input}.{_b64url(mac)}"


if __name__ == "__main__":
    # `python3 ticket.py < input.json` prints a ticket for {secretKey, keyId, app, room, sub, region?, ttlSeconds?, iat?}.
    try:
        i = json.load(sys.stdin)
        print(mint_ticket(i.get("secretKey"), i.get("keyId"), i.get("app"), i.get("room"), i.get("sub"),
                          i.get("region"), i.get("ttlSeconds", 300), i.get("iat")))
    except (ValueError, KeyError, json.JSONDecodeError) as e:
        print(e, file=sys.stderr)
        sys.exit(1)
