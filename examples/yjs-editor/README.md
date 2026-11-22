# yjs-editor

A shared text editor with each person's cursor, in one small page: [Yjs](https://yjs.dev) keeps the document,
[y-jsflow](https://www.npmjs.com/package/y-jsflow) syncs it between the peers in a jsflow room, and
[y-codemirror.next](https://github.com/yjs/y-codemirror.next) draws the text and the cursors in CodeMirror 6.
No document server is involved: the browsers talk to each other.

Unlike the other examples this one has a build step, because CodeMirror and Yjs come from npm. Five minutes:

1. **Make an app.** In the [dashboard](https://app.jsflow.com), create an app and copy its publishable key
   (it starts with `pk_`). Add `http://localhost:5173` to the app's origins.
2. **Put the key in the page.** In `main.js`, replace `pk_YOUR_APP_KEY` in `APP`. The page tells you until you do.
3. **Install and run.**

   ```sh
   cd examples/yjs-editor
   npm install
   npm run dev
   ```

4. **Open it twice.** Open the address it prints (`http://localhost:5173/`) in one tab. It adds `#<room>` to the
   address; open that same address in a second tab or window. Type in either: the text and the other's cursor
   appear in both. Close a tab and its cursor goes.

A third tab joins as a late joiner: it asks one of the others for the document and shows "Up to date" when it has it.

## What is where

| file | |
|---|---|
| `main.js` | joins the room, creates the `Y.Doc` and the `JsflowProvider`, sets this tab's name and colour on `provider.awareness`, and gives the document and the awareness to CodeMirror (`yCollab`) |
| `logic.js` | three small functions: the room name from the address, a name and colour for a visitor, and the list of who is here |
| `index.html` | the page |

The two lines that matter:

```js
const provider = new JsflowProvider(room, doc);
// … and in the editor's extensions:
yCollab(ytext, provider.awareness)
```

## It does not keep the document

jsflow keeps no room state. When the last tab closes, the document is gone. To keep it, save it where your app keeps
things: in each browser with `y-indexeddb`, or on your backend with `Y.encodeStateAsUpdate(doc)`. The guide
[Collaborative documents with Yjs](https://jsflow.com/docs/guides/yjs/) shows both.

## Not on localhost

Another device cannot reach your `localhost`. Add the address it will use (your computer's address on the same
network, or where you deployed the page) to the app's origins, and open that address instead.

`npm run build` makes a static site in `dist/`, which any web host serves.
