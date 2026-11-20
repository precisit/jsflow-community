# Join tickets: backends in Node, Python and Go

A **join ticket** proves to jsflow that *your* server let this user into this room. It is an HS256 JWT that your backend
signs with the app's **secret key** (`sk_…`); jsflow verifies it and never calls you. With "require join tickets" on, a join
without a valid ticket is refused, and the ticket's `sub` (your user id) becomes `room.user(peerId)` for every peer.

| field | |
|---|---|
| header | `{"alg": "HS256", "typ": "JWT", "kid": "<the secret key's id>"}`: `kid` lets two keys be active while you rotate |
| claim `app` | your app id |
| claim `room` | the room this ticket is for (`[A-Za-z0-9_-]`, 1 to 64) |
| claim `sub` | your user's id: opaque to jsflow, 1 to 256 **bytes** of UTF-8 (not characters: 128 accented letters are already 256 bytes) |
| claim `iat`, `exp` | seconds since the epoch; `exp` at most 10 minutes after `iat` (60 s of clock skew is allowed) |
| claim `region` | optional: ask for a region |
| signature | HMAC-SHA-256 over `base64url(header).base64url(claims)`, keyed with the bytes of the full `sk_…` string |

Each folder has a `ticket` module with one function, and a small endpoint, using only the standard library:

| | mint | endpoint | run |
|---|---|---|---|
| `node/` | `mintTicket({...})` in `ticket.mjs` | `server.mjs` | `node server.mjs` |
| `python/` | `mint_ticket(...)` in `ticket.py` | `server.py` | `python3 server.py` |
| `go/` | `MintTicket(Params{...})` in `ticket.go` | `main.go` | `go run .` |

```sh
JSFLOW_SECRET_KEY=sk_… JSFLOW_KEY_ID=key_… JSFLOW_APP=myapp node server.mjs
curl -s -X POST localhost:8787/ticket -H 'x-demo-user: user-42' -d '{"room":"team-7"}'
```

The endpoints read the user from a stand-in header. **Replace `currentUser` with your own authentication**: the ticket
makes jsflow trust the id, so it must come from your session, never from the request. Decide in the endpoint whether the
user may enter the room: the ticket is your yes. Keep the secret key in an environment variable or a secrets store, never in
a page or a repository.

In the page (SDK 1.0), pass a function so every `join()` call gets a fresh ticket (tickets live at most 10 minutes):

```js
const room = await join({
  app: 'pk_…',
  room: 'team-7',
  ticket: async () => (await fetch('/ticket', { method: 'POST', body: JSON.stringify({ room: 'team-7' }) })).json().then((r) => r.ticket),
});
```

All three implementations produce the same bytes for the same input. The repository these examples are copied from checks that on every change, against an independent reference, including accents and `& < >` in the user id.
