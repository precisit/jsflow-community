# jsflow examples

Small, complete pages that use the SDK, each in its own folder as one `index.html` with no build step. They load the
SDK from the CDN at an exact version and use the shared demo key, which works on `http://localhost` and `http://127.0.0.1`
only. For your own app, replace the key with the one from the dashboard.

Serve this folder over HTTP (a `file://` page has no origin the service accepts) and open an example in two tabs:

```sh
cd examples && python3 -m http.server 8080
# http://localhost:8080/hello/   then the same URL (with its #room) in a second tab or browser
```

| example | what it shows |
|---|---|
| `hello/` | join a room, list peers, send to everyone, a reliable round trip |
| `presence/` | who is here and where, with a heartbeat that repairs lost broadcasts, and a snapshot for late joiners |
| `shared-state/` | shared fields as last-writer-wins registers, with digests and a reliable fetch to converge |
| `reliable-chat/` | `sendReliable` to each peer, history for late joiners, the `undelivered` event |

`tickets/` has join-ticket backends in Node, Python and Go (standard library only; see its README); they work with the 1.0 SDK's `ticket` option.

Coming with the 1.0 SDK: React and a Node bot.

Each page's script is checked on every change in the repository these examples are copied from: it must parse, pin the SDK
version that is current, load nothing but the CDN, and its logic (merge order, idle peers, history) is tested. Each example marks
its logic between `// --- logic ---` and `// --- end logic ---`. The three ticket backends are also checked against each other.
