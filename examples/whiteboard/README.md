# whiteboard

A shared whiteboard for phones and computers: freehand drawing, sticky notes, boxes, ellipses and arrows, everyone's
cursor, a laser pointer, and a QR code to bring others in. [Yjs](https://yjs.dev) keeps the board,
[y-jsflow](https://www.npmjs.com/package/y-jsflow) syncs it between the peers in a jsflow room, and
[y-indexeddb](https://github.com/yjs/y-indexeddb) keeps a copy in each browser. No server of your own: the browsers
talk to each other.

What it teaches: a CRDT board with no server, edits made offline merging on return, and the split between what is
kept (the board) and what only travels (cursors, the laser).

## Run it

1. **Make an app** and copy its publishable key (it starts with `pk_`): in the [dashboard](https://app.jsflow.com),
   with `http://localhost:5173` among its origins, or with `npx jsflow-cli@1.1.0 apps create whiteboard --dev`.
2. **Put the key in the page:** replace `pk_YOUR_APP_KEY` in `main.js`. The page tells you until you do.
3. **Install and start:**

   ```sh
   cd examples/whiteboard
   npm install
   npm run dev
   ```

4. **Open it twice.** Open `http://localhost:5173/`: it starts a new board and adds its name to the address
   (`#…`). Open that address in a second window and draw in either one. **Share** shows a QR code and a link.

A phone can't reach your `localhost`. To try one, serve the page where the phone can reach it (`npm run build`
makes a static site in `dist/`), add that address to the app's origins, and scan the QR code.

## How it works

| file | |
|---|---|
| `main.js` | joins the room, creates the `Y.Doc`, `IndexeddbPersistence` and `JsflowProvider`, and turns pointer input into board changes |
| `board.js` | the board as Yjs data: a `Y.Map` of shapes, each its own `Y.Map`; a line's points in a `Y.Array`, a note's text in a `Y.Text`; undo with `Y.UndoManager` |
| `render.js` | draws the board on a `<canvas>`, freehand lines with [perfect-freehand](https://github.com/steveruizok/perfect-freehand) |
| `geom.js`, `order.js`, `rate.js`, `text.js`, `logic.js` | plain functions, tested with `npm test`: hit tests and resizing, stacking order, the send rates, note text edits, names and the list of boards |

- **The board** is one Yjs document. Two people changing different things about one shape both keep their
  change; two dragging the same note end with it in one place on every screen. A line's points are appended while
  it is drawn, so the others see it grow.
- **The room** carries the changes. A small change travels as one datagram to everyone; a joiner gets the whole
  board from one peer over a reliable stream. The people list shows how you reach each person: direct, via relay,
  or via the others (`room.path()`). Add `?relay=1` to the address to send every link through the relay, as on a
  network that blocks direct links.
- **Cursors, names, selections and the laser** are Yjs awareness: sent at most 25 times a second, smoothed at the
  receiver, never stored.
- **Offline:** the status button (Online/Offline) leaves the room and keeps your changes on this device. Back
  online, each side sends exactly what the other lacks, and the page says how many shapes went each way. A
  phone page that was hidden comes back the same way.

## What is kept, and where

jsflow keeps no room state. A board lives in the browsers that opened it (IndexedDB, under `whiteboard-<name>`):
a reload shows it at once, and when the last person leaves, it is still in each of their browsers. Whoever opens
the link next has their copy; when others join, the copies merge. A browser that clears its site data loses its
copy. **Download board file** saves the whole board to a file, which **Open a board file** on the start page
opens as a new board.

Anyone with a board's address can open it, so a new board's name is 16 random characters.

## Change it next

- **Keep boards on your server too:** save `Y.encodeStateAsUpdate(doc)` from `board.js`'s `save()` to your backend
  every few seconds while the board changes, and apply it with `load()` before the provider is created.
- **A new shape:** add a type in `board.js` (its fields), `render.js` (`drawShape`) and `geom.js` (`hit`, `bounds`),
  and a button in `index.html` with a case in `main.js`'s `begin()`.
- **Who may join:** give the app join tickets from your server, and pass `ticket` to `join()` in `main.js`.

## Limits

- Up to your plan's peers per room (20 on Free, 50 on Pro and up).
- Keep a board to a few megabytes: a joiner receives it all from one peer. A thousand freehand lines are about
  1 MB as Yjs encodes them.
- When a page closes, the others see its cursor for up to about 3 more seconds (`leaveHoldMs` in `main.js`).
- The page needs the network to open (no service worker). Once open, it keeps working without one.
- Devices on a board link directly when they can, so each can see the others' IP addresses; the page says so
  when you share a board and when you open one someone shared. `?relay=1` sends everything through the relay instead.
