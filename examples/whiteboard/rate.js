// Rate limits for what a page sends while a pointer moves. A mouse or pen reports up to 240 moves a second; sending
// each would flood a room of 16. Cursors go at most every 40 ms (25 a second), the points of a line being drawn in
// batches every 33 ms, and the receiver smooths the cursor between updates.

// Calls send(value) at most once every `ms`: the first value at once, then the latest value at the end of each wait,
// so the last position always arrives. `now` and `later` are injectable for tests.
export function throttle(send, ms, { now = () => performance.now(), later = (f, t) => setTimeout(f, t) } = {}) {
  let last = -Infinity, pending = false, value;
  const fire = () => { pending = false; last = now(); send(value); };
  const t = (v) => {
    value = v;
    if (pending) return;
    const wait = last + ms - now();
    if (wait <= 0) fire();
    else { pending = true; later(() => { if (pending) fire(); }, wait); }
  };
  // Sends a waiting value now (at the end of a gesture), so no late send overwrites what follows.
  t.flush = () => { if (pending) fire(); };
  return t;
}

// Collects items and hands them to flush(items) in one batch every `ms` (the first item at once).
export function batcher(flush, ms, opts) {
  let items = [];
  const t = throttle(() => { const b = items; items = []; if (b.length) flush(b); }, ms, opts);
  const add = (...xs) => { items.push(...xs); t(); };
  add.drain = () => { const b = items; items = []; if (b.length) flush(b); };   // at pointer up: send the rest now
  return add;
}

// Moves `cur` toward `target` for `dt` ms, covering about 63 % of the gap every `tau` ms. A far jump (a cursor's
// first update, or one after a pause) lands at once instead of sliding across the board.
export function smooth(cur, target, dt, tau = 45, jump = 600) {
  if (!cur || Math.hypot(target.x - cur.x, target.y - cur.y) > jump) return { x: target.x, y: target.y };
  const k = 1 - Math.exp(-dt / tau);
  return { x: cur.x + (target.x - cur.x) * k, y: cur.y + (target.y - cur.y) * k };
}
