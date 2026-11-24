// jsflow example: a shared whiteboard for phones and computers.
//   - Yjs keeps the board (board.js); y-jsflow syncs it between the peers in a jsflow room; y-indexeddb keeps a copy
//     in each browser, so a board opens at once and edits made offline merge on return.
//   - Cursors, names, selections and the laser pointer travel as Yjs awareness: best-effort datagrams, never stored.
//   - No server of our own: the room carries the changes, the browsers keep the board.
import * as Y from 'yjs';
import { join } from 'jsflow-sdk';
import { JsflowProvider } from 'y-jsflow';
import { Awareness } from 'y-protocols/awareness';
import { IndexeddbPersistence } from 'y-indexeddb';
import { Board, LOCAL, save, load, digest } from './board.js';
import { toBoard, zoomAt, fit, bounds, union, topAt, handleAt, resize, box, hit, MIN_ZOOM, MAX_ZOOM } from './geom.js';
import { throttle, batcher, smooth } from './rate.js';
import { boardName, guest, cleanName, freeColour, initials, titleOf, people, touch, forget, boardList, parseIndex, ago, offlineNote, mergeNote, shareLink } from './logic.js';
import { diff, moveCaret } from './text.js';
import { draw, palette, png, INKS, inkColour, NOTE_FONT } from './render.js';
import { encode, toSvg } from './qr.js';

// Your app's publishable key, from the dashboard. The page's address (for `npm run dev`, http://localhost:5173)
// must be one of the app's origins.
const APP = 'pk_YOUR_APP_KEY';

// `?relay=1` in the address sends every link through the relay (TURN), as on a network that blocks direct links.
const RELAY = new URLSearchParams(location.search).has('relay');

const $ = (id) => document.getElementById(id);
const random = (n) => crypto.getRandomValues(new Uint8Array(n));
if (APP === 'pk_YOUR_APP_KEY') $('keynote').hidden = false;

// ---- storage in this browser: the list of boards (small, localStorage), the boards themselves (IndexedDB) ----

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode: the list is not kept */ } },
};
const INDEX = 'whiteboard-boards';
const readIndex = () => parseIndex(store.get(INDEX));
const writeIndex = (ix) => store.set(INDEX, JSON.stringify(ix));
const dbName = (name) => `whiteboard-${name}`;

// Who I am: a guest name and colour per tab (so two tabs are two people), or the name typed in "Your name".
function me() {
  let g = null;
  try { g = JSON.parse(sessionStorage.getItem('whiteboard-guest') ?? 'null'); } catch { /* none */ }
  if (!g) { g = guest(random(4)); try { sessionStorage.setItem('whiteboard-guest', JSON.stringify(g)); } catch { /* none */ } }
  const typed = cleanName(store.get('whiteboard-name'));
  return typed ? { ...g, name: typed } : g;
}

// ---- pages: the start page (#) and a board (#name) ----

let s = null;              // the open board: { name, doc, board, local, room, provider, … }
let pendingFile = null;    // a board file to load into the next new board
let madeHere = null;       // the board this page just created: opening any other board new to this browser joins someone else's

function route(first) {
  if (s) closeBoard();
  if (/^#[A-Za-z0-9_-]{1,64}$/.test(location.hash)) return openBoard(location.hash.slice(1));
  if (first && !boardList(readIndex()).length) return location.replace(`#${(madeHere = boardName('', random(12)))}`);
  showStart();
}
addEventListener('hashchange', () => route(false));

function showStart() {
  $('board').hidden = true; $('start').hidden = false;
  const list = boardList(readIndex()), now = Date.now();
  $('no-boards').hidden = list.length > 0;
  $('boards').replaceChildren(...list.map((b) => {
    const li = document.createElement('li');
    const a = document.createElement('a'); a.href = `#${b.name}`;
    const label = document.createElement('span'); label.className = 'label';
    const title = document.createElement('strong'); title.textContent = b.title ?? 'Untitled board';
    const code = document.createElement('code'); code.textContent = b.name;
    label.append(title, code);
    const when = document.createElement('small'); when.textContent = ago(b.edited, now);
    a.append(label, when);
    const del = document.createElement('button'); del.className = 'forget'; del.textContent = 'Remove'; del.title = 'Remove this board from this browser';
    del.onclick = () => { writeIndex(forget(readIndex(), b.name)); try { indexedDB.deleteDatabase(dbName(b.name)); } catch { /* none */ } showStart(); };
    li.append(a, del);
    return li;
  }));
}
$('new-board').onclick = () => { location.hash = madeHere = boardName('', random(12)); };
$('open-file').onchange = async (e) => {
  const f = e.target.files?.[0]; e.target.value = '';
  if (!f) return;
  pendingFile = new Uint8Array(await f.arrayBuffer());
  location.hash = madeHere = boardName('', random(12));
};
$('home').onclick = () => { location.hash = ''; };

// ---- a board ----

const canvas = $('canvas'), ctx = canvas.getContext('2d');
const scr = { w: 0, h: 0 }, dpr = () => Math.min(window.devicePixelRatio || 1, 3);
const dark = matchMedia('(prefers-color-scheme: dark)');
let pal = palette(dark.matches);
dark.addEventListener('change', () => { pal = palette(dark.matches); frame(); });

const ui = { tool: 'pen', color: 'ink' };

async function openBoard(name) {
  $('start').hidden = true; $('board').hidden = false;
  const doc = new Y.Doc();
  const b = { name, doc, board: new Board(doc), view: { x: 0, y: 0, zoom: 1 }, viewMoved: false, sel: new Set(), editing: null,
    room: null, provider: null, offline: false, synced: false, waiting: new Set(), merge: null, remote: new Map(), trails: new Map(),
    me: { user: me(), cursor: null, tool: ui.tool, sel: [], laser: false } };
  s = b;
  sizeCanvas(); b.view = fit(null, scr.w, scr.h);
  status();

  // The copy kept in this browser first: the board shows at once, before anyone else is online.
  // One awareness for the board's whole visit, handed to each provider: its clock keeps counting across Offline and
  // Online, so the others accept my state when I return (a new Awareness would start again at 0, below what they saw).
  b.awareness = new Awareness(doc);
  b.awareness.on('change', () => {
    if (!b.provider) return;
    const c = freeColour(b.awareness.getStates(), b.doc.clientID, b.me.user.color);
    if (c !== b.me.user.color) {
      b.me.user = { ...b.me.user, color: c }; sendMe();
      try { sessionStorage.setItem('whiteboard-guest', JSON.stringify({ name: b.me.user.name, color: c })); } catch { /* none */ }
    }
    peopleButton(); if (!$('people-pop').hidden) peopleList(); frame(); });

  b.local = new IndexeddbPersistence(dbName(name), doc);
  await b.local.whenSynced;
  if (s !== b) return;
  if (pendingFile) { try { load(doc, pendingFile); } catch { toast('That file is not a board file.'); } pendingFile = null; }
  // A board someone else shared, opened here for the first time: say who can see what (the words of jsflow.com/try/).
  if (!Object.hasOwn(readIndex(), name) && name !== madeHere) {
    toast(JOIN_NOTICE, true);
    setTimeout(() => { if ($('toast').textContent === JOIN_NOTICE) $('toast').hidden = true; }, 10000);
  }
  writeIndex(touch(readIndex(), name, Date.now(), titleOf(b.board.list())));
  showAll(false);

  let saveIndex = null;
  b.board.onChange((ids, origin) => {
    if (origin === LOCAL && b.offline) { for (const id of ids) b.waiting.add(id); toast(offlineNote(b.waiting.size), true); }
    if (b.merge && origin === b.provider) for (const id of ids) b.merge.got.add(id);
    for (const id of [...b.sel]) if (!b.board.get(id)) b.sel.delete(id);
    if (b.editing && !b.board.get(b.editing)) stopEditing();
    clearTimeout(saveIndex); saveIndex = setTimeout(() => writeIndex(touch(readIndex(), name, Date.now(), titleOf(b.board.list()))), 1000);
    tools(); frame();
  });
  connect(b);
}

function closeBoard() {
  const b = s; s = null;
  stopEditing();
  disconnect(b);
  b.local?.destroy();
  b.awareness.destroy();
  b.doc.destroy();
  $('share').hidden = true; closePops(); $('toast').hidden = true;
}

// ---- the room ----

async function connect(b) {
  b.synced = false; status();
  let room;
  try {
    // The app joins the room; the provider only syncs over it. Keys, join tickets, region and relay stay yours.
    room = await join({ app: APP, room: b.name, ...(RELAY ? { iceTransportPolicy: 'relay' } : {}) });
  } catch (e) {
    status(`Could not join (${e?.code ?? e?.message ?? e})`);
    return;
  }
  if (s !== b || b.offline) { room.leave(); return; }
  // leaveHoldMs: how long a peer that went unreachable keeps its cursor. A closed tab can't say goodbye over the room,
  // so its cursor stays this long; a phone page hidden for longer loses its cursor until it is shown again.
  const provider = new JsflowProvider(room, b.doc, { awareness: b.awareness, leaveHoldMs: 2000 });
  b.room = room; b.provider = provider;
  b.me.user = { ...b.me.user, peer: room.id };   // so the others can show how they reach me (room.path)
  provider.awareness.setLocalState({ ...b.me });
  room.on('state', () => status());
  room.on('path', () => { if (!$('people-pop').hidden) peopleList(); });
  provider.on('synced', () => {
    b.synced = true; status();
    if (!b.viewMoved) showAll(false);
    if (b.merge) setTimeout(() => {   // count what arrives in the next moments too, then report
      if (s !== b || !b.merge) return;
      toast(mergeNote(b.merge.sent, b.merge.got.size)); b.merge = null;
    }, 1500);
  });
  peopleButton();
}

function disconnect(b) {
  if (b.provider) { b.provider.destroy(); b.provider = null; }   // removes my cursor at the others at once
  // forget the others entirely (their state and its clock): when we meet again, their next update is taken as new
  for (const id of [...b.awareness.states.keys()]) if (id !== b.doc.clientID) { b.awareness.states.delete(id); b.awareness.meta.delete(id); }
  if (b.room) { b.room.leave(); b.room = null; }
  b.remote.clear(); b.trails.clear();
}

// The Online/Offline switch: offline leaves the room and keeps drawing on this device; online joins again, and
// y-jsflow exchanges state vectors both ways, so each side gets exactly what it lacks.
function setOffline(off) {
  const b = s; if (!b || b.offline === off) return;
  b.offline = off;
  if (off) { disconnect(b); b.waiting = new Set(); toast(offlineNote(0), true); }
  else { b.merge = { sent: b.waiting.size, got: new Set() }; b.waiting = new Set(); $('toast').hidden = true; connect(b); }
  status(); peopleButton(); frame();
}
$('status').onclick = () => setOffline(!s?.offline);
$('online-toggle').onclick = () => { closePops(); setOffline(!s?.offline); };

function status(error) {
  const b = s; if (!b) return;
  const el = $('status');
  let st = 'connecting', text = 'Connecting…';
  if (error) { st = 'offline'; text = error; }
  else if (b.offline) { st = 'offline'; text = 'Offline'; }
  else if (b.room) {
    const r = b.room.state;
    // 'joining' lasts while nobody else is here: alone on a board, once synced, you are online
    if (r === 'connected' || (r === 'joining' && b.synced)) { st = b.synced ? 'online' : 'connecting'; text = b.synced ? 'Online' : 'Getting the board…'; }
    else if (r === 'away') text = 'Reconnecting…';
    else if (r === 'joining') text = 'Joining…';
    else { st = 'offline'; text = r[0].toUpperCase() + r.slice(1); }
  }
  el.dataset.s = st; $('status-text').textContent = text;
  el.title = b.offline ? 'Go online' : 'Go offline';
  $('online-toggle').textContent = b.offline ? 'Go online' : 'Go offline';
}

// ---- what the others see of me: awareness, at most 25 updates a second ----

const sendMe = throttle(() => { if (s?.provider) s.provider.awareness.setLocalState({ ...s.me, sel: [...s.sel].slice(0, 50) }); }, 40);

function others() {
  const b = s; if (!b?.provider) return [];
  const out = [];
  for (const [id, st] of b.provider.awareness.getStates()) if (id !== b.doc.clientID && st?.user) out.push({ id, ...st });
  return out;
}

// ---- drawing the frame ----

let raf = 0, lastFrame = performance.now();
function frame() { if (!raf) raf = requestAnimationFrame(paint); }
function paint(now) {
  raf = 0;
  const b = s; if (!b) return;
  const dt = Math.min(100, now - lastFrame); lastFrame = now;
  let moving = false;
  const cursors = [], seen = new Set(), list = others();
  for (const o of list) {
    seen.add(o.id);
    if (!o.cursor) { b.remote.delete(o.id); continue; }
    const cur = smooth(b.remote.get(o.id), o.cursor, dt);
    b.remote.set(o.id, cur);
    if (Math.hypot(cur.x - o.cursor.x, cur.y - o.cursor.y) > 0.5) moving = true;
    cursors.push({ ...cur, color: o.user.color, name: o.user.name });
    if (o.laser) { const t = b.trails.get(o.id) ?? { color: o.user.color, pts: [] }; t.pts.push({ x: cur.x, y: cur.y, t: now }); b.trails.set(o.id, t); }
  }
  for (const id of b.remote.keys()) if (!seen.has(id)) b.remote.delete(id);
  if (b.me.laser && b.me.cursor) { const t = b.trails.get('me') ?? { color: b.me.user.color, pts: [] }; t.pts.push({ x: b.me.cursor.x, y: b.me.cursor.y, t: now }); b.trails.set('me', t); }
  const trails = [...b.trails.values()];
  draw(ctx, { view: b.view, scr, dpr: dpr(), pal, shapes: b.board.list(), mine: b.sel, others: list, editing: b.editing, cursors, trails, now });
  for (const [k, t] of b.trails) if (!t.pts.length) b.trails.delete(k);
  if (b.editing) placeEditor();
  if (moving || b.trails.size) frame();
}

function sizeCanvas() {
  const r = canvas.getBoundingClientRect();
  scr.w = r.width; scr.h = r.height;
  canvas.width = Math.round(r.width * dpr()); canvas.height = Math.round(r.height * dpr());
  frame();
}
new ResizeObserver(sizeCanvas).observe(canvas);

// Shows every shape (or the middle of an empty board).
function showAll(moved = true) {
  const b = s; if (!b) return;
  b.view = fit(union(b.board.list().map(bounds)), scr.w, scr.h, 64);
  if (moved) b.viewMoved = true;
  frame();
}
$('fit').onclick = () => { closePops(); showAll(); };

// ---- input: one pointer draws or moves; two pointers pan and zoom ----

const pointers = new Map();
let g = null;              // the gesture in progress
let space = false;         // space held: drag pans

const pos = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
const at = (p) => toBoard(s.view, p.x, p.y);
const tol = () => 8 / s.view.zoom;

canvas.addEventListener('pointerdown', (e) => {
  const b = s; if (!b) return;
  closePops();
  if (b.editing) stopEditing();
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, pos(e));
  if (pointers.size === 2) { cancel(); pinchStart(); return; }
  if (pointers.size > 2) return;
  const info = { pen: e.pointerType === 'pen', pressure: e.pressure, shift: e.shiftKey, touch: e.pointerType === 'touch' };
  if (e.button === 1 || space) { g = { kind: 'pan', last: pos(e) }; return; }
  if (e.button > 0) return;
  // A finger waits a moment: if a second finger follows, it is a pinch, not a dot.
  if (info.touch) { g = { kind: 'wait', p: pos(e), info, timer: setTimeout(() => { if (g?.kind === 'wait') begin(g.p, g.info); }, 70) }; return; }
  begin(pos(e), info);
});

canvas.addEventListener('pointermove', (e) => {
  const b = s; if (!b) return;
  const p = pos(e);
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, p);
  const bp = at(p);
  if (e.pointerType !== 'touch' || pointers.has(e.pointerId)) { b.me.cursor = { x: Math.round(bp.x), y: Math.round(bp.y) }; sendMe(); }
  if (!g) { hover(bp); return; }
  if (g.kind === 'pinch') { pinchMove(); return; }
  if (g.kind === 'wait') {
    if (Math.hypot(p.x - g.p.x, p.y - g.p.y) < 6) return;
    clearTimeout(g.timer); const w = g; begin(w.p, w.info);
  }
  const events = e.getCoalescedEvents?.() ?? [];
  move(p, events.length ? events.map((c) => ({ p: pos(c), pressure: c.pressure })) : [{ p, pressure: e.pressure }]);
});

const up = (e) => {
  if (!pointers.delete(e.pointerId)) return;
  if (!s) return;
  if (g?.kind === 'pinch') { if (pointers.size === 0) g = null; return; }
  if (g?.kind === 'wait') { clearTimeout(g.timer); const w = g; begin(w.p, w.info); }
  if (g) end(e.type === 'pointercancel');
  if (e.pointerType === 'touch') { s.me.cursor = null; sendMe(); }
};
canvas.addEventListener('pointerup', up);
canvas.addEventListener('pointercancel', up);
canvas.addEventListener('pointerleave', (e) => { if (s && e.pointerType === 'mouse' && !pointers.size) { s.me.cursor = null; sendMe(); } });

let lastTap = { id: null, t: 0 };

function begin(p, info) {
  const b = s, board = b.board, bp = at(p);
  const x = Math.round(bp.x), y = Math.round(bp.y);
  switch (ui.tool) {
    case 'pen': {
      board.step();
      const pr = info.pen ? Math.round(info.pressure * 100) : 50;
      const id = board.add({ type: 'line', x, y, color: ui.color, size: 4, pen: info.pen ? 1 : 0, pts: [0, 0, pr] });
      g = { kind: 'pen', id, x, y, pen: info.pen, last: [0, 0], add: batcher((pts) => board.append(id, pts), 33) };
      break;
    }
    case 'eraser': board.step(); g = { kind: 'erase', prev: bp }; erase(bp, bp); break;
    case 'box': case 'ellipse': case 'arrow': {
      board.step();
      const id = board.add({ type: ui.tool, x, y, w: 0, h: 0, color: ui.color, size: 3 });
      g = { kind: 'shape', id, type: ui.tool, x, y, set: throttle((v) => board.set(id, v), 33) };
      break;
    }
    case 'note': {
      board.step();
      const id = board.add({ type: 'note', x: x - 90, y: y - 70, w: 180, h: 140, color: ui.color });
      b.sel = new Set([id]); sendMe();
      g = { kind: 'note', id };
      break;
    }
    case 'laser': b.me.laser = true; sendMe(); g = { kind: 'laser' }; break;
    default: {   // select
      const one = b.sel.size === 1 ? board.get([...b.sel][0]) : null;
      const handle = one && handleAt(one, bp.x, bp.y, 10 / b.view.zoom);
      if (handle) { board.step(); g = { kind: 'resize', id: one.id, start: { ...one }, handle, set: throttle((v) => board.set(one.id, v), 33) }; break; }
      const shape = topAt(board.list(), bp.x, bp.y, tol());
      if (!shape) { if (!info.shift) b.sel = new Set(); sendMe(); tools(); g = { kind: 'pan', last: p }; break; }
      const now = performance.now();
      if (shape.type === 'note' && lastTap.id === shape.id && now - lastTap.t < 400) { lastTap = { id: null, t: 0 }; g = null; editNote(shape.id); return; }
      lastTap = { id: shape.id, t: now };
      if (info.shift) { b.sel.has(shape.id) ? b.sel.delete(shape.id) : b.sel.add(shape.id); }
      else if (!b.sel.has(shape.id)) b.sel = new Set([shape.id]);
      sendMe(); tools();
      board.step();
      const from = new Map([...b.sel].map((id) => board.get(id)).filter(Boolean).map((t) => [t.id, { x: t.x, y: t.y }]));
      g = { kind: 'move', from, start: bp, moved: false, set: throttle(([dx, dy]) => board.moveFrom(from, dx, dy), 33) };
    }
  }
  frame();
}

function move(p, samples) {
  const b = s, bp = at(p);
  switch (g.kind) {
    case 'pen':
      for (const c of samples) {
        const q = at(c.p), px = Math.round(q.x - g.x), py = Math.round(q.y - g.y);
        if (px === g.last[0] && py === g.last[1]) continue;
        g.last = [px, py];
        g.add(px, py, g.pen ? Math.round(c.pressure * 100) : 50);
      }
      break;
    case 'erase': erase(g.prev, bp); g.prev = bp; break;
    case 'shape': g.set(g.type === 'arrow' ? { x: g.x, y: g.y, w: bp.x - g.x, h: bp.y - g.y } : box(g.x, g.y, bp.x, bp.y)); break;
    case 'resize': g.set(resize(g.start, g.handle, bp.x, bp.y)); break;
    case 'move': {
      const dx = bp.x - g.start.x, dy = bp.y - g.start.y;
      if (!g.moved && Math.hypot(dx, dy) * b.view.zoom < 3) break;
      g.moved = true; g.d = [dx, dy]; g.set(g.d);
      break;
    }
    case 'pan':
      b.view = { ...b.view, x: b.view.x - (p.x - g.last.x) / b.view.zoom, y: b.view.y - (p.y - g.last.y) / b.view.zoom };
      g.last = p; b.viewMoved = true;
      break;
  }
  frame();
}

function end(cancelled) {
  const b = s, board = b.board, k = g; g = null;
  switch (k.kind) {
    case 'pen': k.add.drain(); break;
    case 'shape': {
      k.set.flush();
      const t = board.get(k.id);
      if (!t) break;
      if (Math.abs(t.w) < 6 && Math.abs(t.h) < 6) {
        if (k.type === 'arrow' || cancelled) board.remove([k.id]);
        else board.set(k.id, { x: k.x - 80, y: k.y - 50, w: 160, h: 100 });   // a tap makes a shape of a standard size
      }
      break;
    }
    case 'resize': k.set.flush(); break;
    case 'move': if (k.moved) { k.set.flush(); board.moveFrom(k.from, Math.round(k.d[0]), Math.round(k.d[1])); } break;
    case 'note': if (!cancelled) editNote(k.id); break;
    case 'laser': b.me.laser = false; sendMe(); break;
  }
  tools(); frame();
}

function cancel() {
  if (!g) return;
  if (g.kind === 'wait') clearTimeout(g.timer);
  else end(true);
  g = null;
}

// The eraser removes whatever it passes over, sampling along the way so a fast swipe misses nothing.
function erase(a, c) {
  const b = s, list = b.board.list(), hits = new Set();
  const n = Math.max(1, Math.ceil(Math.hypot(c.x - a.x, c.y - a.y) / (4 / b.view.zoom)));
  for (let i = 0; i <= n; i++) {
    const x = a.x + ((c.x - a.x) * i) / n, y = a.y + ((c.y - a.y) * i) / n;
    for (const t of list) if (hit(t, x, y, tol())) hits.add(t.id);
  }
  if (hits.size) b.board.remove([...hits]);
}

function hover(bp) {
  const b = s;
  let cur = 'crosshair';
  if (ui.tool === 'select') {
    const one = b.sel.size === 1 ? b.board.get([...b.sel][0]) : null;
    const h = one && handleAt(one, bp.x, bp.y, 10 / b.view.zoom);
    cur = h ? (h === 'nw' || h === 'se' ? 'nwse-resize' : h === 'ne' || h === 'sw' ? 'nesw-resize' : 'move') : topAt(b.board.list(), bp.x, bp.y, tol()) ? 'move' : 'grab';
  } else if (ui.tool === 'laser') cur = 'none';
  if (space) cur = 'grab';
  canvas.style.cursor = cur;
}

// Two fingers: the board point under their midpoint stays under it, and the spread zooms.
function pinchStart() {
  const [a, c] = [...pointers.values()];
  g = { kind: 'pinch', view: { ...s.view }, mid: { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 }, dist: Math.max(1, Math.hypot(a.x - c.x, a.y - c.y)) };
}
function pinchMove() {
  const [a, c] = [...pointers.values()];
  if (!a || !c) return;
  const mid = { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 }, dist = Math.hypot(a.x - c.x, a.y - c.y);
  const p0 = toBoard(g.view, g.mid.x, g.mid.y);
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, g.view.zoom * (dist / g.dist)));
  s.view = { x: p0.x - mid.x / zoom, y: p0.y - mid.y / zoom, zoom };
  s.viewMoved = true;
  frame();
}

// A wheel or trackpad scroll pans; a pinch on a trackpad (or Ctrl and the wheel) zooms about the pointer.
canvas.addEventListener('wheel', (e) => {
  if (!s) return;
  e.preventDefault();
  const p = pos(e);
  if (e.ctrlKey || e.metaKey) s.view = zoomAt(s.view, p.x, p.y, Math.exp(-e.deltaY * 0.01));
  else s.view = { ...s.view, x: s.view.x + e.deltaX / s.view.zoom, y: s.view.y + e.deltaY / s.view.zoom };
  s.viewMoved = true;
  frame();
}, { passive: false });
// Safari's own trackpad pinch: stop it zooming the page.
for (const ev of ['gesturestart', 'gesturechange']) document.addEventListener(ev, (e) => e.preventDefault());

// ---- a note's text: a textarea over the note while it is edited, bound to the note's Y.Text ----

const ta = $('note-edit');
let textBinding = null;

function editNote(id) {
  const b = s, t = b.board.text(id);
  if (!t) return;
  stopEditing();
  b.editing = id; b.sel = new Set([id]); sendMe(); tools();
  ta.value = t.toString();
  let last = ta.value;
  const onRemote = (ev, tr) => {
    if (tr.origin === LOCAL) return;
    const a = moveCaret(ta.selectionStart, ev.delta), c = moveCaret(ta.selectionEnd, ev.delta);
    ta.value = t.toString(); last = ta.value; ta.setSelectionRange(a, c);
  };
  t.observe(onRemote);
  ta.oninput = () => { b.board.editText(id, diff(last, ta.value)); last = ta.value; };
  textBinding = () => t.unobserve(onRemote);
  ta.hidden = false; placeEditor(); ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);
  frame();
}
function stopEditing() {
  if (!textBinding) return;
  textBinding(); textBinding = null;
  ta.hidden = true; ta.oninput = null;
  if (s) { s.editing = null; if (ui.tool !== 'select') { s.sel = new Set(); sendMe(); tools(); } frame(); }
}
function placeEditor() {
  const n = s.board.get(s.editing);
  if (!n) return stopEditing();
  const v = s.view;
  Object.assign(ta.style, {
    left: '0px', top: '0px', width: `${n.w}px`, height: `${n.h}px`, fontSize: `${NOTE_FONT}px`,
    transform: `translate(${(n.x - v.x) * v.zoom}px, ${(n.y - v.y) * v.zoom}px) scale(${v.zoom})`,
  });
}
ta.addEventListener('blur', stopEditing);
ta.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); ta.blur(); } });

// ---- the toolbar ----

const toolButtons = [...document.querySelectorAll('[data-tool]')];
function setTool(t) {
  ui.tool = t;
  if (s) { s.me.tool = t; if (t !== 'select' && !s.editing) { s.sel = new Set(); frame(); } sendMe(); }
  tools();
}
for (const btn of toolButtons) btn.onclick = () => setTool(btn.dataset.tool);

$('swatches').replaceChildren(...INKS.map((name) => {
  const btn = document.createElement('button');
  btn.className = 'swatch'; btn.dataset.color = name; btn.title = name === 'ink' ? 'Ink' : name[0].toUpperCase() + name.slice(1);
  const dot = document.createElement('span'); btn.append(dot);
  btn.onclick = () => {
    ui.color = name;
    if (s?.sel.size) { s.board.step(); for (const id of s.sel) s.board.set(id, { color: name }); }   // also recolours the selection
    tools();
  };
  return btn;
}));

function tools() {
  for (const btn of toolButtons) btn.setAttribute('aria-pressed', String(btn.dataset.tool === ui.tool));
  for (const btn of document.querySelectorAll('.swatch')) {
    btn.setAttribute('aria-pressed', String(btn.dataset.color === ui.color));
    btn.style.setProperty('--c', inkColour(pal, btn.dataset.color));
  }
  $('delete').disabled = !s?.sel.size;
  $('undo').disabled = !s?.board.undoManager.undoStack.length;
  $('redo').disabled = !s?.board.undoManager.redoStack.length;
}
dark.addEventListener('change', tools);
const deleteSelection = () => { if (!s?.sel.size) return; s.board.step(); s.board.remove([...s.sel]); s.sel = new Set(); sendMe(); tools(); };
$('undo').onclick = () => { s?.board.undo(); tools(); };
$('redo').onclick = () => { s?.board.redo(); tools(); };
$('delete').onclick = deleteSelection;

const KEYS = { v: 'select', p: 'pen', e: 'eraser', r: 'box', o: 'ellipse', a: 'arrow', n: 'note', l: 'laser' };
addEventListener('keydown', (e) => {
  if (!s || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? s.board.redo() : s.board.undo(); tools(); return; }
  if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); s.board.redo(); tools(); return; }
  if (mod) return;
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelection(); return; }
  if (e.key === 'Escape') { s.sel = new Set(); sendMe(); closePops(); $('share').hidden = true; tools(); frame(); return; }
  if (e.key === ' ' && !e.repeat) { space = true; canvas.style.cursor = 'grab'; return; }
  if (e.key === 'Enter' && s.sel.size === 1) { const id = [...s.sel][0]; if (s.board.get(id)?.type === 'note') { e.preventDefault(); editNote(id); } return; }
  const t = KEYS[e.key.toLowerCase()];
  if (t) setTool(t);
});
addEventListener('keyup', (e) => { if (e.key === ' ') space = false; });

// ---- who is here ----

function peopleButton() {
  const b = s; if (!b) return;
  const list = b.provider ? people(b.provider.awareness.getStates(), b.doc.clientID) : [{ ...b.me.user, me: true }];
  const dots = list.slice(0, 4).map((p) => {
    const d = document.createElement('span'); d.className = 'dot'; d.style.background = p.color;
    d.textContent = initials(p.name); d.title = p.name;
    return d;
  });
  const n = document.createElement('span'); n.className = 'count';
  n.textContent = b.offline ? 'only you' : `${list.length} here`;
  $('people').replaceChildren(...dots, n);
}
const PATH = { direct: 'direct', relay: 'via relay', mesh: 'via others' };
function peopleList() {
  const b = s; if (!b) return;
  const list = b.provider ? people(b.provider.awareness.getStates(), b.doc.clientID, (peer) => b.room?.path(peer) ?? null) : [{ ...b.me.user, me: true }];
  $('who').replaceChildren(...list.map((p) => {
    const li = document.createElement('li'); li.style.setProperty('--c', p.color);
    const i = document.createElement('i'); const name = document.createElement('span'); name.textContent = p.me ? `${p.name} (you)` : p.name;
    const how = document.createElement('small'); how.textContent = p.me ? '' : PATH[p.path] ?? 'connecting';
    li.append(i, name, how);
    return li;
  }));
}
$('people').onclick = (e) => { e.stopPropagation(); const open = $('people-pop').hidden; closePops(); if (open) { peopleList(); $('my-name').value = s?.me.user.name ?? ''; $('people-pop').hidden = false; } };
$('my-name').onchange = () => {
  const n = cleanName($('my-name').value); if (!n || !s) return;
  store.set('whiteboard-name', n);
  s.me.user = { ...s.me.user, name: n }; sendMe(); peopleButton(); peopleList();
};
$('menu-open').onclick = (e) => { e.stopPropagation(); const open = $('menu').hidden; closePops(); $('menu').hidden = !open; };
function closePops() { $('menu').hidden = true; $('people-pop').hidden = true; }
document.addEventListener('pointerdown', (e) => { if (!e.target.closest('.pop, #people, #menu-open')) closePops(); });

// ---- share: a QR code and the link, for anyone on the board to show ----

$('share-open').onclick = () => {
  const link = shareLink(location.href, s.name);
  $('link-text').textContent = link;
  try { $('qr').innerHTML = toSvg(encode(link), 'QR code to join this board'); $('qr').hidden = false; } catch { $('qr').hidden = true; }
  $('copy').textContent = 'Copy link';
  $('share').hidden = false;
};
$('copy').onclick = async () => {
  try { await navigator.clipboard.writeText($('link-text').textContent); $('copy').textContent = 'Copied'; }
  catch { getSelection().selectAllChildren($('link-text')); }
};
$('share-close').onclick = () => { $('share').hidden = true; };
$('share').onclick = (e) => { if (e.target === $('share')) $('share').hidden = true; };

// ---- export ----

function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
$('export-png').onclick = async () => {
  closePops();
  const list = s.board.list(), blob = await png(list, pal, union(list.map(bounds)));
  if (blob) download(blob, `whiteboard-${s.name}.png`); else toast('The board is empty.');
};
$('export-file').onclick = () => {
  closePops();
  download(new Blob([save(s.doc)], { type: 'application/octet-stream' }), `${s.name}.whiteboard`);
};

// ---- messages ----

let toastTimer = 0;
const JOIN_NOTICE = 'This joins a room you or someone else shared. Others in the room can see your IP address.';
function toast(text, sticky = false) {
  const t = $('toast'); t.textContent = text; t.hidden = false;
  clearTimeout(toastTimer);
  if (!sticky) toastTimer = setTimeout(() => { t.hidden = true; }, 4000);
}

// Leaving cleanly removes my cursor at the others at once; a page that just vanishes loses it after a few seconds.
addEventListener('pagehide', (e) => { if (!e.persisted && s) disconnect(s); });

// For the lab tests: the board's fingerprint and the connection state, read by the test driver.
globalThis.whiteboard = {
  digest: () => (s ? digest(s.board) : null),
  state: () => (s ? { name: s.name, room: s.room?.state ?? null, synced: s.synced, offline: s.offline, shapes: s.board.list().length, peers: s.room?.peers().length ?? 0 } : null),
  setOffline,
  board: () => s?.board ?? null,
  room: () => s?.room ?? null,
  awareness: () => s?.provider?.awareness ?? null,
  bytes: () => (s ? save(s.doc).length : null),
  // where a note with this text is on screen (its middle), for the test driver's pointer
  noteScreen: (text) => {
    const n = s?.board.list().find((x) => x.type === 'note' && x.text === text);
    return n ? { x: (n.x + n.w / 2 - s.view.x) * s.view.zoom, y: (n.y + n.h / 2 - s.view.y) * s.view.zoom } : null;
  },
};

setTool(ui.tool);
route(true);

// iOS can leave the page scrolled after lifting a focused field above the keyboard. The page itself never scrolls (#start scrolls
// inside), so it goes back to 0,0 once no visible field has focus. Here, not inline in index.html: the hosted page's CSP blocks inline
// scripts. After the last line, because docs/demos/whiteboard/video-notes.md quotes this file by line number.
const typing = () => { const el = document.activeElement; return !!el?.matches('input, textarea') && el.getClientRects().length > 0; };
const settlePage = () => { if (!typing() && (scrollX || scrollY)) scrollTo(0, 0); };
addEventListener('focusout', () => setTimeout(settlePage));
globalThis.visualViewport?.addEventListener('resize', settlePage);
