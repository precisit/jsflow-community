// Geometry for the board: the view (pan and zoom), shape bounds, hit tests and resizing. Plain functions on plain
// shapes ({ type, x, y, w, h, pts, size }), so they are tested without a browser.
//
// A shape's x, y is its origin on the board. Boxes, ellipses and notes span w by h from it. An arrow runs from
// (x, y) to (x + w, y + h), so w and h may be negative. A freehand line keeps its points relative to (x, y), as a
// flat list x0, y0, p0, x1, y1, p1, … (p is pen pressure, 0–100).

export const MIN_ZOOM = 0.1, MAX_ZOOM = 8;

// The view: the board point at the screen's top left corner, and the zoom. screen = (board - view) * zoom.
export const toBoard = (v, sx, sy) => ({ x: v.x + sx / v.zoom, y: v.y + sy / v.zoom });
export const toScreen = (v, bx, by) => ({ x: (bx - v.x) * v.zoom, y: (by - v.y) * v.zoom });

// Zoom by `factor` about the screen point (sx, sy), which stays over the same board point.
export function zoomAt(v, sx, sy, factor) {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * factor));
  const p = toBoard(v, sx, sy);
  return { x: p.x - sx / zoom, y: p.y - sy / zoom, zoom };
}

// The view that shows `box` (board units) in a screen of width by height, with a margin, never above zoom 1.
export function fit(box, width, height, margin = 40) {
  if (!box) return { x: -width / 2, y: -height / 2, zoom: 1 };
  const zoom = Math.min(1, Math.max(MIN_ZOOM, Math.min((width - 2 * margin) / Math.max(box.w, 1), (height - 2 * margin) / Math.max(box.h, 1))));
  return { x: box.x + box.w / 2 - width / 2 / zoom, y: box.y + box.h / 2 - height / 2 / zoom, zoom };
}

// The smallest box around a shape, with w and h never negative.
export function bounds(s) {
  if (s.type === 'line') {
    const p = s.pts;
    if (p.length < 3) return { x: s.x, y: s.y, w: 0, h: 0 };
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i + 1 < p.length; i += 3) {
      if (p[i] < x0) x0 = p[i]; if (p[i] > x1) x1 = p[i];
      if (p[i + 1] < y0) y0 = p[i + 1]; if (p[i + 1] > y1) y1 = p[i + 1];
    }
    const r = (s.size ?? 4) / 2;
    return { x: s.x + x0 - r, y: s.y + y0 - r, w: x1 - x0 + 2 * r, h: y1 - y0 + 2 * r };
  }
  return { x: Math.min(s.x, s.x + s.w), y: Math.min(s.y, s.y + s.h), w: Math.abs(s.w), h: Math.abs(s.h) };
}

export function union(boxes) {
  let b = null;
  for (const c of boxes) {
    if (!b) { b = { ...c }; continue; }
    const x = Math.min(b.x, c.x), y = Math.min(b.y, c.y);
    b = { x, y, w: Math.max(b.x + b.w, c.x + c.w) - x, h: Math.max(b.y + b.h, c.y + c.h) - y };
  }
  return b;
}

const inside = (b, px, py, pad = 0) => px >= b.x - pad && px <= b.x + b.w + pad && py >= b.y - pad && py <= b.y + b.h + pad;

export function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// Is the board point (px, py) on the shape, within `tol` board units? Boxes, ellipses and notes count inside too,
// so a tap anywhere on one selects it; lines and arrows count near the line.
export function hit(s, px, py, tol = 6) {
  switch (s.type) {
    case 'line': {
      const p = s.pts, r = (s.size ?? 4) / 2 + tol;
      if (!inside(bounds(s), px, py, tol)) return false;
      if (p.length < 6) return p.length >= 3 && Math.hypot(px - s.x - p[0], py - s.y - p[1]) <= r;
      for (let i = 0; i + 4 < p.length; i += 3) {
        if (distToSegment(px - s.x, py - s.y, p[i], p[i + 1], p[i + 3], p[i + 4]) <= r) return true;
      }
      return false;
    }
    case 'arrow': return distToSegment(px, py, s.x, s.y, s.x + s.w, s.y + s.h) <= tol + (s.size ?? 4) / 2;
    case 'ellipse': {
      const b = bounds(s), rx = b.w / 2 + tol, ry = b.h / 2 + tol;
      const dx = px - (b.x + b.w / 2), dy = py - (b.y + b.h / 2);
      return rx > 0 && ry > 0 && (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1;
    }
    default: return inside(bounds(s), px, py, tol);
  }
}

// The topmost shape at a point, from shapes in draw order (bottom first).
export function topAt(shapes, px, py, tol) {
  for (let i = shapes.length - 1; i >= 0; i--) if (hit(shapes[i], px, py, tol)) return shapes[i];
  return null;
}

// The handles of one selected shape: an arrow's two ends, a box's four corners. Lines have none (they move only).
export function handles(s) {
  if (s.type === 'line') return [];
  if (s.type === 'arrow') return [{ id: 'start', x: s.x, y: s.y }, { id: 'end', x: s.x + s.w, y: s.y + s.h }];
  const b = bounds(s);
  return [
    { id: 'nw', x: b.x, y: b.y }, { id: 'ne', x: b.x + b.w, y: b.y },
    { id: 'sw', x: b.x, y: b.y + b.h }, { id: 'se', x: b.x + b.w, y: b.y + b.h },
  ];
}

// The handle at a board point, within `tol`.
export function handleAt(s, px, py, tol) {
  return handles(s).find((h) => Math.abs(h.x - px) <= tol && Math.abs(h.y - py) <= tol)?.id ?? null;
}

// The new x, y, w, h after dragging `handle` to the board point (px, py). `start` is the shape when the drag began.
// A box keeps the opposite corner where it was and never gets smaller than `min`.
export function resize(start, handle, px, py, min = 8) {
  if (start.type === 'arrow') {
    if (handle === 'start') return { x: px, y: py, w: start.x + start.w - px, h: start.y + start.h - py };
    return { x: start.x, y: start.y, w: px - start.x, h: py - start.y };
  }
  const b = bounds(start);
  const fx = handle.includes('w') ? b.x + b.w : b.x;   // the fixed corner
  const fy = handle.includes('n') ? b.y + b.h : b.y;
  let w = Math.max(min, Math.abs(px - fx)), h = Math.max(min, Math.abs(py - fy));
  const x = px < fx ? fx - w : fx, y = py < fy ? fy - h : fy;
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}

// A box from two corners, normalised (for drawing a new box, ellipse or note).
export function box(ax, ay, bx, by) {
  return { x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay) };
}
