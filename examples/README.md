# jsflow examples

Small, complete pages that use the SDK, each in its own folder. Most are one `index.html` with no build step (below); `whiteboard/` and
`yjs-editor/` are projects you build with npm. The one-page examples load the SDK from the CDN at an exact version and use the shared demo key, which works on `http://localhost` and `http://127.0.0.1`
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
| `buzzers/` | a big screen hosts the round and shows a QR code; phones join and press a buzzer; the screen decides who was first and keeps the score, and sends the scoreboard to a phone that joins late or reloads |
| `whiteboard/` | a shared board for phones and computers: drawing, sticky notes, shapes and everyone's cursors, kept in each browser and merged when edits made offline return (Yjs through `y-jsflow`); a project, built with npm, with a live copy at https://jsflow.com/examples/whiteboard/ |
| `yjs-editor/` | a shared text editor with everyone's cursors (CodeMirror 6; Yjs through `y-jsflow`); a project, built with npm |

### `buzzers/` on phones

The shared demo key works on `localhost` only, and a phone cannot reach your computer's `localhost`, so this example has a placeholder
key (`APP` in the page; the page says so until you replace it). Make an app in the dashboard, put its publishable key in `APP`, and add the
address your phones will use to the app's origins, either:

- your computer's address on the same Wi-Fi: serve the folder as above, find your computer's address on that network (the one a phone
  would type), add `http://`, that address and `:8080` to the app's origins, and open the same address plus `/buzzers/` on the big screen; or
- the URL where you have deployed the page.

The screen shows a QR code and a link; scan it with a phone. The screen decides who pressed first and keeps the score, in its own page, and
a reload of the screen keeps it (it is saved in the tab's session storage).

`whiteboard/` and `yjs-editor/` each have their own README: `npm install`, put your publishable key in `APP` (the page says so until you do), then `npm run dev`.

`tickets/` has join-ticket backends in Node, Python and Go (standard library only; see its README); they work with the 1.0 SDK's `ticket` option.

Each page's script is checked on every change in the repository these examples are copied from: it must parse, pin the SDK
version that is current, load nothing but the CDN, and its logic (merge order, idle peers, history) is tested. Each example marks
its logic between `// --- logic ---` and `// --- end logic ---`. The three ticket backends are also checked against each other.
