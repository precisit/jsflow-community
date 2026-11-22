// jsflow example: a shared CodeMirror editor with cursors. Yjs keeps the document, y-jsflow syncs it between the
// peers in a jsflow room, y-codemirror.next draws the text and the cursors. No document server.
import * as Y from 'yjs';
import { join } from 'jsflow-sdk';
import { JsflowProvider } from 'y-jsflow';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { yCollab } from 'y-codemirror.next';
import { guest, people, roomName } from './logic.js';

// Your app's publishable key, from the dashboard. The page's address (for `npm run dev`, http://localhost:5173)
// must be one of the app's origins.
const APP = 'pk_YOUR_APP_KEY';

const $ = (id) => document.getElementById(id);
const random = (n) => crypto.getRandomValues(new Uint8Array(n));
if (APP === 'pk_YOUR_APP_KEY') $('note').hidden = false;

const roomId = roomName(location.hash, random(12));
if (location.hash.slice(1) !== roomId) location.hash = roomId;
$('room').textContent = roomId; $('share').href = location.href;

// A name and colour that a reload keeps (the tab's session storage, so a second tab is another guest).
function me() {
  try {
    const saved = JSON.parse(sessionStorage.getItem('guest') ?? 'null');
    if (saved) return saved;
    const g = guest(random(4)); sessionStorage.setItem('guest', JSON.stringify(g)); return g;
  } catch { return guest(random(4)); }
}

async function main() {
  // The app joins the room; the provider only syncs over it. Keys, join tickets, region and relay stay yours.
  const room = await join({ app: APP, room: roomId });
  room.on('state', (s) => { $('status').textContent = s; });
  $('status').textContent = room.state;

  const doc = new Y.Doc();
  const provider = new JsflowProvider(room, doc);
  provider.awareness.setLocalStateField('user', me());
  provider.on('synced', () => { $('sync').textContent = 'Up to date.'; });
  $('sync').textContent = 'Getting the document…';

  // Who is here: every peer's name, from its awareness state. A peer that leaves disappears from it.
  const list = $('who');
  const showPeople = () => {
    list.replaceChildren(...people(provider.awareness.getStates(), doc.clientID).map((p) => {
      const li = document.createElement('li');
      li.style.setProperty('--c', p.color);
      li.textContent = p.me ? `${p.name} (you)` : p.name;
      return li;
    }));
  };
  provider.awareness.on('change', showPeople); showPeople();

  // The document is one Y.Text. The binding turns every edit into a Yjs update and draws the others' cursors.
  const ytext = doc.getText('codemirror');
  new EditorView({
    state: EditorState.create({ doc: ytext.toString(), extensions: [basicSetup, EditorView.lineWrapping, yCollab(ytext, provider.awareness)] }),
    parent: $('editor'),
  });

  // Leaving cleanly removes this cursor at the others at once; a page that just vanishes loses it after leaveHoldMs.
  addEventListener('pagehide', (e) => { if (!e.persisted) { provider.destroy(); room.leave(); } });
}

main().catch((e) => { $('status').textContent = `could not join: ${e?.message ?? e}`; });
