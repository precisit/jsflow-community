import { test } from 'node:test';
import assert from 'node:assert/strict';
import { above, byOrder } from '../order.js';
import { toBoard, toScreen, zoomAt, fit, bounds, union, hit, topAt, handles, handleAt, resize, box } from '../geom.js';
import { throttle, batcher, smooth } from '../rate.js';
import { boardName, guest, cleanName, people, touch, forget, boardList, parseIndex, ago, offlineNote, mergeNote, shareLink, PEOPLE_COLOURS } from '../logic.js';
import { diff, moveCaret } from '../text.js';

test('order: a new shape goes on top; equal z is decided by id', () => {
  assert.equal(above([]), 1);
  assert.equal(above([3, 1, 7, 'x', undefined]), 8);
  assert.deepEqual([{ z: 2, id: '2' }, { z: 1, id: '9' }, { z: 2, id: '1' }].sort(byOrder).map((s) => s.id), ['9', '1', '2']);
});

test('geom: the view maps screen to board and back; zoom keeps the point under the pointer', () => {
  const v = { x: 100, y: -50, zoom: 2 };
  const p = toBoard(v, 40, 60);
  assert.deepEqual(p, { x: 120, y: -20 });
  assert.deepEqual(toScreen(v, p.x, p.y), { x: 40, y: 60 });
  const z = zoomAt(v, 40, 60, 1.5);
  assert.equal(z.zoom, 3);
  const q = toBoard(z, 40, 60);
  assert.ok(Math.abs(q.x - 120) < 1e-9 && Math.abs(q.y + 20) < 1e-9);
  assert.equal(zoomAt(v, 0, 0, 1000).zoom, 8);
  assert.equal(zoomAt(v, 0, 0, 0.0001).zoom, 0.1);
  const f = fit({ x: 0, y: 0, w: 100, h: 100 }, 800, 600);
  assert.equal(f.zoom, 1);
  assert.deepEqual(toScreen(f, 50, 50), { x: 400, y: 300 });
  assert.ok(fit({ x: 0, y: 0, w: 4000, h: 100 }, 800, 600).zoom < 1);
});

test('geom: bounds, hits and the topmost shape', () => {
  const line = { type: 'line', x: 10, y: 10, size: 4, pts: [0, 0, 50, 100, 0, 50, 100, 100, 50] };
  assert.deepEqual(bounds(line), { x: 8, y: 8, w: 104, h: 104 });
  assert.ok(hit(line, 60, 10));          // on the first segment
  assert.ok(hit(line, 110, 60));         // on the second
  assert.ok(!hit(line, 60, 60));         // in the corner's empty middle
  const arrow = { type: 'arrow', x: 100, y: 100, w: -100, h: 0 };
  assert.deepEqual(bounds(arrow), { x: 0, y: 100, w: 100, h: 0 });
  assert.ok(hit(arrow, 50, 103) && !hit(arrow, 50, 120));
  const ell = { type: 'ellipse', x: 0, y: 0, w: 100, h: 50 };
  assert.ok(hit(ell, 50, 25) && !hit(ell, 2, 2, 0));
  const note = { type: 'note', x: 0, y: 0, w: 100, h: 100 };
  assert.ok(hit(note, 50, 50));
  assert.equal(topAt([note, ell], 50, 25).type, 'ellipse');
  assert.equal(topAt([note, ell], 50, 90).type, 'note');
  assert.equal(topAt([note], 500, 500), null);
  assert.deepEqual(union([{ x: 0, y: 0, w: 10, h: 10 }, { x: -5, y: 5, w: 10, h: 20 }]), { x: -5, y: 0, w: 15, h: 25 });
  assert.equal(union([]), null);
});

test('geom: handles and resizing keep the opposite corner; an arrow moves one end', () => {
  const b = { type: 'box', x: 0, y: 0, w: 100, h: 50 };
  assert.equal(handles(b).length, 4);
  assert.equal(handles({ type: 'line', pts: [] }).length, 0);
  assert.equal(handleAt(b, 99, 51, 4), 'se');
  assert.equal(handleAt(b, 50, 25, 4), null);
  assert.deepEqual(resize(b, 'se', 200, 80), { x: 0, y: 0, w: 200, h: 80 });
  assert.deepEqual(resize(b, 'nw', 50, 10), { x: 50, y: 10, w: 50, h: 40 });
  assert.deepEqual(resize(b, 'se', -40, -20), { x: -40, y: -20, w: 40, h: 20 });   // dragged past the fixed corner
  assert.deepEqual(resize(b, 'se', 2, 2), { x: 0, y: 0, w: 8, h: 8 });            // never below the minimum
  const a = { type: 'arrow', x: 0, y: 0, w: 100, h: 0 };
  assert.deepEqual(resize(a, 'end', 50, 50), { x: 0, y: 0, w: 50, h: 50 });
  assert.deepEqual(resize(a, 'start', 20, 20), { x: 20, y: 20, w: 80, h: -20 });
  assert.deepEqual(box(10, 10, 0, 30), { x: 0, y: 10, w: 10, h: 20 });
});

test('rate: the throttle sends the first value at once, then the latest at most every ms', () => {
  let t = 0; const timers = []; const sent = [];
  const opts = { now: () => t, later: (f, ms) => timers.push([t + ms, f]) };
  const send = throttle((v) => sent.push(v), 40, opts);
  send(1); send(2); send(3);
  assert.deepEqual(sent, [1]);
  assert.equal(timers.length, 1);
  t = 40; timers.shift()[1]();
  assert.deepEqual(sent, [1, 3]);   // the latest, not every one
  t = 100; send(4);
  assert.deepEqual(sent, [1, 3, 4]);
  // over one simulated second of moves every 4 ms, at most 26 sends
  sent.length = 0; t = 1000;
  for (let i = 0; i < 250; i++) { t += 4; while (timers.length && timers[0][0] <= t) timers.shift()[1](); send(i); }
  assert.ok(sent.length <= 26, `${sent.length} sends`);
  assert.equal(timers.length ? timers[0][1]() ?? sent.at(-1) : sent.at(-1), 249);   // the last value arrives
});

test('rate: the batcher groups points and drains the rest', () => {
  let t = 0; const timers = []; const out = [];
  const add = batcher((b) => out.push(b), 33, { now: () => t, later: (f, ms) => timers.push(f) });
  add(1, 2, 3); add(4, 5, 6); add(7, 8, 9);
  assert.deepEqual(out, [[1, 2, 3]]);
  add.drain();
  assert.deepEqual(out, [[1, 2, 3], [4, 5, 6, 7, 8, 9]]);
  t = 33; timers.shift()();
  assert.equal(out.length, 2);   // nothing left: no empty batch
});

test('rate: smoothing approaches the target and jumps when far', () => {
  const a = smooth({ x: 0, y: 0 }, { x: 100, y: 0 }, 45);
  assert.ok(a.x > 60 && a.x < 66);
  assert.deepEqual(smooth(null, { x: 5, y: 5 }, 16), { x: 5, y: 5 });
  assert.deepEqual(smooth({ x: 0, y: 0 }, { x: 5000, y: 0 }, 16), { x: 5000, y: 0 });
});

test('logic: board names, guests, names and who is here', () => {
  assert.equal(boardName('#abc_D-9', []), 'abc_D-9');
  const n = boardName('', new Uint8Array(12).fill(250));
  assert.match(n, /^[A-Za-z0-9_-]{16}$/);
  assert.equal(boardName('#bad name', new Uint8Array(12)).length, 16);
  const g = guest([1, 2, 3, 4]);
  assert.equal(g.name, 'Guest 258');
  assert.ok(PEOPLE_COLOURS.includes(g.color));
  assert.equal(cleanName('  Ada \n Lovelace  '), 'Ada Lovelace');
  assert.equal(cleanName('   '), null);
  assert.equal(cleanName('x'.repeat(40)).length, 24);
  const states = new Map([
    [7, { user: { name: 'Bo', color: '#f00', peer: 'p7' } }],
    [3, { user: { name: 'Ada', color: '#0f0', peer: 'p3' } }],
    [9, { user: { name: 'Me', color: '#00f', peer: 'p9' } }],
    [4, {}],
  ]);
  const list = people(states, 9, (p) => (p === 'p3' ? 'direct' : 'relay'));
  assert.deepEqual(list.map((p) => [p.name, p.me, p.path]), [['Me', true, null], ['Ada', false, 'direct'], ['Bo', false, 'relay']]);
});

test('logic: the boards kept in this browser', () => {
  let ix = touch({}, 'a', 1000);
  ix = touch(ix, 'b', 2000);
  ix = touch(ix, 'a', 3000);
  assert.deepEqual(ix.a, { created: 1000, edited: 3000 });
  assert.deepEqual(boardList(ix).map((b) => b.name), ['a', 'b']);
  assert.deepEqual(Object.keys(forget(ix, 'a')), ['b']);
  assert.deepEqual(parseIndex('not json'), {});
  assert.deepEqual(parseIndex('[1]'), {});
  assert.deepEqual(parseIndex(null), {});
  assert.deepEqual(Object.keys(parseIndex(JSON.stringify({ ...ix, bad: { edited: 'x' } }))), ['a', 'b']);
  const now = Date.UTC(2026, 10, 22, 12);
  assert.equal(ago(now - 5000, now), 'just now');
  assert.equal(ago(now - 5 * 60000, now), '5 min ago');
  assert.equal(ago(now - 3 * 3600000, now), '3 h ago');
  assert.equal(ago(now - 30 * 3600000, now), 'yesterday');
  assert.equal(ago(now - 4 * 86400000, now), '4 days ago');
  assert.equal(ago(now - 40 * 86400000, now), '2026-10-13');
});

test('logic: the offline notes and the share link', () => {
  assert.match(offlineNote(0), /stay on this device/);
  assert.equal(offlineNote(1), 'Offline: 1 shape changed, waiting to be sent.');
  assert.equal(mergeNote(2, 1), 'Back online: sent 2 shapes, got 1 shape.');
  assert.match(mergeNote(0, 0), /Nothing changed/);
  assert.equal(shareLink('http://localhost:5173/?x=1#old', 'abc'), 'http://localhost:5173/#abc');
});

test('text: one change from a textarea edit; the caret follows the others\' edits', () => {
  assert.deepEqual(diff('hello', 'help'), { index: 3, remove: 2, insert: 'p' });
  assert.deepEqual(diff('abc', 'abXc'), { index: 2, remove: 0, insert: 'X' });
  assert.deepEqual(diff('aaa', 'aa'), { index: 2, remove: 1, insert: '' });
  assert.deepEqual(diff('same', 'same'), { index: 4, remove: 0, insert: '' });
  // applying the diff gives the new text, for many random pairs
  let r = 7; const rnd = (n) => (r = (r * 48271) % 2147483647) % n;
  for (let i = 0; i < 500; i++) {
    const s = () => Array.from({ length: rnd(8) }, () => 'ab'[rnd(2)]).join('');
    const a = s(), b = s(), d = diff(a, b);
    assert.equal(a.slice(0, d.index) + d.insert + a.slice(d.index + d.remove), b, `${a} -> ${b}`);
  }
  assert.equal(moveCaret(5, [{ retain: 2 }, { insert: 'xyz' }]), 8);    // typed before the caret
  assert.equal(moveCaret(1, [{ retain: 2 }, { insert: 'xyz' }]), 1);    // after it
  assert.equal(moveCaret(5, [{ retain: 1 }, { delete: 2 }]), 3);       // deleted before it
  assert.equal(moveCaret(2, [{ retain: 1 }, { delete: 4 }]), 1);       // a deletion around it
  assert.equal(moveCaret(5, [{ delete: 1 }, { insert: 'ab' }]), 6);
});

test('render: note text wraps at the note\'s width and cuts a word that is too long', async () => {
  const { wrap } = await import('../render.js');
  const ctx = { measureText: (t) => ({ width: t.length * 10 }) };
  assert.deepEqual(wrap(ctx, 'the plan for monday', 80), ['the plan', 'for', 'monday']);
  assert.deepEqual(wrap(ctx, 'a\n\nb', 80), ['a', '', 'b']);
  assert.deepEqual(wrap(ctx, 'abcdefghijkl x', 50), ['abcde', 'fghij', 'kl x']);
  assert.deepEqual(wrap(ctx, '', 50), ['']);
});

test('logic: one colour per person, settled by the lower client id; initials', async () => {
  const { freeColour, initials, PEOPLE_COLOURS: C } = await import('../logic.js');
  const states = new Map([[5, { user: { color: C[0] } }], [9, { user: { color: C[0] } }], [7, { user: { color: C[1] } }]]);
  assert.equal(freeColour(states, 5, C[0]), C[0]);   // the lower id keeps it
  assert.equal(freeColour(states, 9, C[0]), C[2]);   // the higher moves to the first free colour
  assert.equal(freeColour(states, 7, C[1]), C[1]);
  assert.equal(freeColour(new Map([[1, {}]]), 1, C[3]), C[3]);
  assert.equal(initials('Guest 767'), 'G7');
  assert.equal(initials(' Ada  Lovelace King'), 'AL');
  assert.equal(initials('bo'), 'B');
});

test('logic: a board\'s title is its first note\'s first line, kept when a later change has none', async () => {
  const { titleOf, touch } = await import('../logic.js');
  assert.equal(titleOf([{ type: 'line' }, { type: 'note', text: '  ' }, { type: 'note', text: 'Plan\nmore' }]), 'Plan');
  assert.equal(titleOf([{ type: 'box' }]), null);
  assert.deepEqual(touch(touch({}, 'b', 1, 'Old'), 'b', 2, null).b, { created: 1, edited: 2 });
  assert.equal(titleOf([{ type: 'note', text: 'x'.repeat(60) }]).length, 40);
  let ix = touch({}, 'a', 1, 'Plan');
  ix = touch(ix, 'a', 2, undefined);
  assert.deepEqual(ix.a, { created: 1, edited: 2, title: 'Plan' });
});
