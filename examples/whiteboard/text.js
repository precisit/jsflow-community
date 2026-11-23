// A note's text is a Y.Text, so two people typing in one note both keep their words. The page edits it through a
// plain <textarea>: these two functions turn the textarea's change into one Y.Text edit, and keep the caret in
// place when someone else's edit arrives.

// The one change from `before` to `after`: at `index`, delete `remove` characters and insert `insert`.
export function diff(before, after) {
  let start = 0;
  const max = Math.min(before.length, after.length);
  while (start < max && before[start] === after[start]) start++;
  let end = 0;
  while (end < max - start && before[before.length - 1 - end] === after[after.length - 1 - end]) end++;
  return { index: start, remove: before.length - start - end, insert: after.slice(start, after.length - end) };
}

// Where a caret at `pos` belongs after a Yjs text delta ([{ retain }, { insert }, { delete }]) from someone else.
export function moveCaret(pos, delta) {
  let at = 0, out = pos;   // `at` walks the text as it was before the delta, the coordinates `pos` is in
  for (const op of delta) {
    if (op.retain) at += op.retain;
    else if (op.insert) { if (at < pos) out += typeof op.insert === 'string' ? op.insert.length : 1; }
    else if (op.delete) { if (at < pos) out -= Math.min(op.delete, pos - at); at += op.delete; }
  }
  return Math.max(0, out);
}
