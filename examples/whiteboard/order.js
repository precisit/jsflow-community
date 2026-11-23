// Stacking order: each shape has a number, z, and shapes are drawn by z, then by id. A new shape, or one brought to
// the front, gets one more than the highest z on the board, so it changes only that shape. Two people doing it at
// the same moment give two shapes the same z; the id then decides, the same way on every screen.

// The z that puts a shape on top of shapes with these z values.
export function above(zs) {
  let top = 0;
  for (const z of zs) if (typeof z === 'number' && z > top) top = z;
  return top + 1;
}

// Draw order: by z, then by id.
export const byOrder = (s, t) => (s.z - t.z) || (s.id < t.id ? -1 : s.id > t.id ? 1 : 0);
