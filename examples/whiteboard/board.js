// The board as Yjs data. Everything on it lives in one Y.Map, `shapes`, keyed by a random id:
//
//   shapes: Y.Map
//     <id>: Y.Map { type, x, y, w, h, color, z, … }       type: 'line' | 'box' | 'ellipse' | 'arrow' | 'note'
//       pts:  Y.Array of integers (a freehand line: x, y, pressure per point, relative to x, y)
//       text: Y.Text (a note)
//
// Each shape is its own Y.Map, so two people changing different things about one shape both keep their change, and
// two people changing the same thing (both dragging one note) end with one result on every screen. A line's points
// are appended while it is drawn, so the others see it grow. Undo takes back this page's own changes only.
import * as Y from 'yjs';
import { above, byOrder } from './order.js';

// The origin of every change this page makes: Y.UndoManager tracks only these.
export const LOCAL = 'local';

const FIELDS = ['type', 'x', 'y', 'w', 'h', 'color', 'size', 'z', 'pen'];

export function newId(random = (n) => crypto.getRandomValues(new Uint8Array(n))) {
  return [...random(8)].map((b) => (b % 36).toString(36)).join('');
}

export class Board {
  constructor(doc, { random } = {}) {
    this.doc = doc;
    this.shapes = doc.getMap('shapes');
    this.random = random;
    this.undoManager = new Y.UndoManager(this.shapes, { trackedOrigins: new Set([LOCAL]), captureTimeout: 400 });
    this._cache = new Map();          // id -> plain shape, rebuilt when that shape changes
    this._list = null;                // all shapes in draw order, rebuilt when any changes
    this._listeners = new Set();
    this.shapes.observeDeep((events, tr) => {
      const ids = new Set();
      for (const e of events) {
        if (e.target === this.shapes) for (const k of e.keysChanged) ids.add(k);
        else ids.add(e.path[0]);
      }
      for (const id of ids) this._cache.delete(id);
      this._list = null;
      for (const f of this._listeners) f(ids, tr.origin, tr.local);
    });
  }

  // f(ids, origin, local) after every change: which shapes changed, and who made it (LOCAL for this page's own).
  onChange(f) { this._listeners.add(f); return () => this._listeners.delete(f); }

  _t(f) { this.doc.transact(f, LOCAL); }

  // Adds a shape on top of the others and returns its id. A line may start with points; a note with text.
  add({ pts, text, ...props }) {
    const id = newId(this.random);
    this._t(() => {
      const m = new Y.Map();
      for (const k of FIELDS) if (props[k] !== undefined) m.set(k, props[k]);
      m.set('z', above(this.list().map((s) => s.z)));
      if (props.type === 'line') { const a = new Y.Array(); if (pts?.length) a.push(pts.map(Math.round)); m.set('pts', a); }
      if (props.type === 'note') m.set('text', new Y.Text(text ?? ''));
      this.shapes.set(id, m);
    });
    return id;
  }

  // Appends points (x, y, pressure, …, relative to the line's origin) to a line being drawn.
  append(id, pts) {
    const a = this.shapes.get(id)?.get('pts');
    if (a && pts.length) this._t(() => a.push(pts.map(Math.round)));
  }

  // Sets fields of one shape (x, y, w, h, color, …). Ids that are gone (someone deleted them) are skipped.
  set(id, fields) {
    const m = this.shapes.get(id);
    if (!m) return;
    this._t(() => { for (const [k, v] of Object.entries(fields)) if (m.get(k) !== v) m.set(k, typeof v === 'number' ? Math.round(v) : v); });
  }

  // Moves shapes by (dx, dy) from where they were in `from` (id -> { x, y }), in one change.
  moveFrom(from, dx, dy) {
    this._t(() => {
      for (const [id, p] of from) {
        const m = this.shapes.get(id);
        if (m) { m.set('x', Math.round(p.x + dx)); m.set('y', Math.round(p.y + dy)); }
      }
    });
  }

  remove(ids) { this._t(() => { for (const id of ids) this.shapes.delete(id); }); }

  toFront(ids) {
    this._t(() => {
      let keys = this.list().map((s) => s.z);
      for (const id of ids) {
        const m = this.shapes.get(id);
        if (!m) continue;
        const z = above(keys); m.set('z', z); keys = [...keys, z];
      }
    });
  }

  text(id) { return this.shapes.get(id)?.get('text') ?? null; }

  // Applies one textarea change to a note's Y.Text (see text.js diff()).
  editText(id, { index, remove, insert }) {
    const t = this.text(id);
    if (!t) return;
    this._t(() => { if (remove) t.delete(index, remove); if (insert) t.insert(index, insert); });
  }

  // One shape as a plain object, or null.
  get(id) {
    let s = this._cache.get(id);
    if (s) return s;
    const m = this.shapes.get(id);
    if (!(m instanceof Y.Map)) return null;
    s = { id };
    for (const k of FIELDS) { const v = m.get(k); if (v !== undefined) s[k] = v; }
    s.x ??= 0; s.y ??= 0; s.w ??= 0; s.h ??= 0; s.z ??= 0;
    const pts = m.get('pts'); if (pts) s.pts = pts.toArray();
    const text = m.get('text'); if (text) s.text = text.toString();
    this._cache.set(id, s);
    return s;
  }

  // Every shape in draw order (bottom first).
  list() {
    if (!this._list) this._list = [...this.shapes.keys()].map((id) => this.get(id)).filter(Boolean).sort(byOrder);
    return this._list;
  }

  undo() { this.undoManager.undo(); }
  redo() { this.undoManager.redo(); }
  // Starts a new undo step (at the start of each gesture), so two quick lines undo one at a time.
  step() { this.undoManager.stopCapturing(); }
}

// The board's whole state as bytes (a board file), and back. Loading merges into what is there.
export const save = (doc) => Y.encodeStateAsUpdate(doc);
export const load = (doc, bytes) => Y.applyUpdate(doc, bytes, 'file');

// A short fingerprint of the board's content, equal on two devices exactly when they show the same board. The lab
// tests compare it across peers (the Yjs encoding itself can differ in order between two equal documents).
export function digest(board) {
  const s = JSON.stringify(board.list().map((x) => [x.id, x.type, x.x, x.y, x.w, x.h, x.color, x.size ?? null, x.z, x.pts ?? null, x.text ?? null]));
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return `${board.list().length}:${(h >>> 0).toString(16).padStart(8, '0')}`;
}
