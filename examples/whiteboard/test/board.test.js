import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import { Board, LOCAL, save, load, digest, newId } from '../board.js';

// Two devices; `link` sends every update from each to the other at once (online), or holds it (offline).
function pair() {
  const a = new Board(new Y.Doc()), b = new Board(new Y.Doc());
  const wire = { online: true, held: [] };
  const relay = (from, to) => from.doc.on('update', (u, origin) => {
    if (origin === 'wire') return;
    if (wire.online) Y.applyUpdate(to.doc, u, 'wire'); else wire.held.push([to, u]);
  });
  relay(a, b); relay(b, a);
  wire.reconnect = () => {
    wire.online = true;
    // what y-jsflow does on return: each side sends what the other's state vector lacks
    Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc, Y.encodeStateVector(b.doc)), 'wire');
    Y.applyUpdate(a.doc, Y.encodeStateAsUpdate(b.doc, Y.encodeStateVector(a.doc)), 'wire');
    wire.held = [];
  };
  return { a, b, wire };
}

test('board: shapes appear at the other device, in the same order, with the same digest', () => {
  const { a, b } = pair();
  const box = a.add({ type: 'box', x: 10, y: 20, w: 100, h: 50, color: 'blue' });
  const line = b.add({ type: 'line', x: 0, y: 0, color: 'ink', size: 4, pts: [0, 0, 50] });
  a.append(line, [10, 10, 50, 20.4, 20, 50]);
  const note = a.add({ type: 'note', x: 300, y: 0, w: 160, h: 120, color: 'yellow', text: 'Ideas' });
  assert.deepEqual(b.get(box), a.get(box));
  assert.deepEqual(b.get(line).pts, [0, 0, 50, 10, 10, 50, 20, 20, 50]);
  assert.equal(b.get(note).text, 'Ideas');
  assert.deepEqual(a.list().map((s) => s.id), [box, line, note]);
  assert.deepEqual(b.list().map((s) => s.id), [box, line, note]);
  assert.equal(digest(a), digest(b));
  b.toFront([box]);
  assert.deepEqual(a.list().map((s) => s.id), [line, note, box]);
});

test('board: two people drag the same note at once and it lands in one place on both', () => {
  const { a, b, wire } = pair();
  const note = a.add({ type: 'note', x: 0, y: 0, w: 100, h: 100, color: 'yellow' });
  wire.online = false;
  a.moveFrom(new Map([[note, { x: 0, y: 0 }]]), 200, 0);
  b.moveFrom(new Map([[note, { x: 0, y: 0 }]]), 0, 300);
  wire.reconnect();
  const pa = a.get(note), pb = b.get(note);
  assert.deepEqual([pa.x, pa.y], [pb.x, pb.y]);
  assert.ok((pa.x === 200 && pa.y === 0) || (pa.x === 0 && pa.y === 300), `one of the two moves wins whole: ${pa.x},${pa.y}`);
  assert.equal(digest(a), digest(b));
});

test('board: edits made offline on both sides merge on return', () => {
  const { a, b, wire } = pair();
  const shared = a.add({ type: 'box', x: 0, y: 0, w: 50, h: 50, color: 'ink' });
  wire.online = false;
  const mine = a.add({ type: 'ellipse', x: 100, y: 0, w: 50, h: 50, color: 'red' });
  const theirs = b.add({ type: 'line', x: 0, y: 100, pts: [0, 0, 50, 5, 5, 50] });
  b.set(shared, { color: 'green' });
  a.set(shared, { w: 80 });
  assert.notEqual(digest(a), digest(b));
  wire.reconnect();
  assert.equal(digest(a), digest(b));
  assert.ok(a.get(mine) && a.get(theirs) && b.get(mine) && b.get(theirs));
  assert.deepEqual([a.get(shared).color, a.get(shared).w], ['green', 80]);   // different fields: both kept
});

test('board: two people typing in one note both keep their words', () => {
  const { a, b, wire } = pair();
  const note = a.add({ type: 'note', x: 0, y: 0, w: 100, h: 100, text: 'plan' });
  wire.online = false;
  a.editText(note, { index: 0, remove: 0, insert: 'The ' });
  b.editText(note, { index: 4, remove: 0, insert: ' for Monday' });
  wire.reconnect();
  assert.equal(a.get(note).text, 'The plan for Monday');
  assert.equal(b.get(note).text, 'The plan for Monday');
});

test('board: undo takes back only this device\'s changes, one gesture at a time', () => {
  const { a, b } = pair();
  a.step(); const one = a.add({ type: 'box', x: 0, y: 0, w: 10, h: 10 });
  a.step(); const two = a.add({ type: 'box', x: 20, y: 0, w: 10, h: 10 });
  const other = b.add({ type: 'box', x: 40, y: 0, w: 10, h: 10 });
  a.undo();
  assert.ok(a.get(one) && !a.get(two) && a.get(other));
  assert.ok(!b.get(two) && b.get(other));
  a.redo();
  assert.ok(b.get(two));
  // a line drawn over many appends undoes as one step
  a.step(); const line = a.add({ type: 'line', x: 0, y: 0, pts: [0, 0, 50] });
  for (let i = 1; i < 20; i++) a.append(line, [i, i, 50]);
  a.undo();
  assert.equal(a.get(line), null);
  assert.ok(a.get(two));
});

test('board: deleted shapes are skipped by later edits; change events name the shapes', () => {
  const { a, b } = pair();
  const seen = [];
  b.onChange((ids, origin) => seen.push([[...ids], origin === LOCAL]));
  const id = a.add({ type: 'box', x: 0, y: 0, w: 10, h: 10 });
  a.set(id, { x: 5 });
  b.remove([id]);
  a.set(id, { x: 9 });
  a.moveFrom(new Map([[id, { x: 0, y: 0 }]]), 1, 1);
  assert.equal(a.get(id), null);
  assert.deepEqual(seen, [[[id], false], [[id], false], [[id], true]]);
});

test('board: a board file loads into an empty board, and into one that has diverged', () => {
  const a = new Board(new Y.Doc());
  a.add({ type: 'box', x: 0, y: 0, w: 10, h: 10 });
  const file = save(a.doc);
  const c = new Board(new Y.Doc());
  load(c.doc, file);
  assert.equal(digest(c), digest(a));
  c.add({ type: 'ellipse', x: 5, y: 5, w: 10, h: 10 });
  load(c.doc, file);   // loading again changes nothing
  assert.equal(c.list().length, 2);
});

test('board: ids are 8 characters of a-z0-9', () => {
  assert.match(newId(), /^[a-z0-9]{8}$/);
  assert.equal(newId(() => new Uint8Array(8)), '00000000');
});
