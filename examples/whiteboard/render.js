// Draws the board on a <canvas>: the dot grid, the shapes, the selections, the others' cursors and laser trails.
// Nothing here changes the board; main.js calls draw() whenever something on screen changed.
import { getStroke } from 'perfect-freehand';
import { bounds, handles } from './geom.js';

// Colours are stored on the board as names, so each device draws them for its own light or dark paper.
export const INKS = ['ink', 'red', 'orange', 'green', 'blue', 'purple'];
const LIGHT = { paper: '#fbfbfa', dot: '#d5d5d2', ink: '#1c1c1e', red: '#d93036', orange: '#e2620d', green: '#218358', blue: '#0b6bcb', purple: '#7d43b8', text: '#1c1c1e', select: '#0b6bcb' };
const DARK = { paper: '#18191b', dot: '#5c6066', ink: '#ededee', red: '#ff6369', orange: '#ff9f5a', green: '#4cc38a', blue: '#5eb1ef', purple: '#bf7af0', text: '#1c1c1e', select: '#5eb1ef' };
// Sticky notes: a pale fill of their colour, the same on light and dark paper (a note is a piece of paper).
const NOTE = { ink: '#fff1a8', red: '#ffd6d6', orange: '#ffe0c2', green: '#cff2dc', blue: '#d3e9ff', purple: '#ead9ff' };

export const palette = (dark) => (dark ? DARK : LIGHT);
export const inkColour = (pal, name) => pal[name] ?? pal.ink;
export const noteColour = (name) => NOTE[name] ?? NOTE.ink;
export const NOTE_FONT = 18;   // board units

// A freehand line's outline (perfect-freehand), cached per shape object: board.js gives a new object only when the
// shape changed, so an unchanged line is outlined once.
const outlines = new WeakMap();
function outline(s) {
  let p = outlines.get(s);
  if (p) return p;
  const pts = [];
  for (let i = 0; i + 2 < s.pts.length; i += 3) pts.push([s.pts[i], s.pts[i + 1], s.pts[i + 2] / 100]);
  const poly = getStroke(pts, { size: s.size ?? 4, thinning: s.pen ? 0.6 : 0.5, smoothing: 0.5, streamline: 0.4, simulatePressure: !s.pen, last: true });
  p = new Path2D();
  if (poly.length) {
    p.moveTo(poly[0][0], poly[0][1]);
    for (let i = 1; i < poly.length; i++) {
      const [x0, y0] = poly[i - 1], [x1, y1] = poly[i];
      p.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
    }
    p.closePath();
  }
  outlines.set(s, p);
  return p;
}

// Wraps a note's text into lines that fit `width`; a word wider than the note is cut.
export function wrap(ctx, text, width) {
  const out = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width <= width) { line = next; continue; }
      if (line) out.push(line);
      line = '';
      for (const ch of word) {
        if (line && ctx.measureText(line + ch).width > width) { out.push(line); line = ''; }
        line += ch;
      }
    }
    out.push(line);
  }
  return out;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
}

export function drawShape(ctx, s, pal, { editing = false } = {}) {
  const col = inkColour(pal, s.color);
  switch (s.type) {
    case 'line':
      ctx.save(); ctx.translate(s.x, s.y); ctx.fillStyle = col; ctx.fill(outline(s)); ctx.restore();
      break;
    case 'box': {
      const b = bounds(s);
      ctx.lineWidth = s.size ?? 3; ctx.strokeStyle = col; ctx.lineJoin = 'round';
      roundRect(ctx, b.x, b.y, b.w, b.h, 6); ctx.stroke();
      break;
    }
    case 'ellipse': {
      const b = bounds(s);
      ctx.lineWidth = s.size ?? 3; ctx.strokeStyle = col;
      ctx.beginPath(); ctx.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2, 0, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case 'arrow': {
      const x1 = s.x + s.w, y1 = s.y + s.h, len = Math.hypot(s.w, s.h);
      ctx.lineWidth = s.size ?? 3; ctx.strokeStyle = col; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(x1, y1); ctx.stroke();
      if (len > 1) {
        const a = Math.atan2(s.h, s.w), head = Math.min(18, len / 2);
        ctx.beginPath();
        ctx.moveTo(x1 - head * Math.cos(a - 0.45), y1 - head * Math.sin(a - 0.45));
        ctx.lineTo(x1, y1);
        ctx.lineTo(x1 - head * Math.cos(a + 0.45), y1 - head * Math.sin(a + 0.45));
        ctx.stroke();
      }
      break;
    }
    case 'note': {
      const b = bounds(s);
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.18)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 2;
      ctx.fillStyle = noteColour(s.color);
      roundRect(ctx, b.x, b.y, b.w, b.h, 4); ctx.fill();
      ctx.restore();
      if (!editing && s.text) {
        ctx.save();
        ctx.beginPath(); ctx.rect(b.x, b.y, b.w, b.h); ctx.clip();
        ctx.fillStyle = pal.text; ctx.font = `${NOTE_FONT}px system-ui, -apple-system, "Segoe UI", sans-serif`; ctx.textBaseline = 'top';
        const lines = wrap(ctx, s.text, b.w - 24);
        lines.forEach((l, i) => ctx.fillText(l, b.x + 12, b.y + 12 + i * NOTE_FONT * 1.3));
        ctx.restore();
      }
      break;
    }
  }
}

// The whole frame. `view` is { x, y, zoom }; `scr` the screen size in CSS pixels; `dpr` the device pixel ratio.
export function draw(ctx, { view, scr, dpr, pal, shapes, mine, others, editing, cursors, trails, now }) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = pal.paper; ctx.fillRect(0, 0, scr.w, scr.h);

  // the dot grid: every 24 board units, coarser when zoomed out so dots stay at least 12 px apart
  let step = 24; while (step * view.zoom < 12) step *= 2;
  ctx.fillStyle = pal.dot;
  const r = Math.max(1, Math.min(1.6, view.zoom * 1.2));
  for (let gx = Math.floor(view.x / step) * step; (gx - view.x) * view.zoom < scr.w; gx += step) {
    for (let gy = Math.floor(view.y / step) * step; (gy - view.y) * view.zoom < scr.h; gy += step) {
      ctx.fillRect((gx - view.x) * view.zoom - r / 2, (gy - view.y) * view.zoom - r / 2, r, r);
    }
  }

  ctx.setTransform(dpr * view.zoom, 0, 0, dpr * view.zoom, -view.x * view.zoom * dpr, -view.y * view.zoom * dpr);
  const vis = { x: view.x, y: view.y, w: scr.w / view.zoom, h: scr.h / view.zoom };
  for (const s of shapes) {
    const b = bounds(s);
    if (b.x > vis.x + vis.w || b.y > vis.y + vis.h || b.x + b.w < vis.x || b.y + b.h < vis.y) continue;
    drawShape(ctx, s, pal, { editing: s.id === editing });
  }

  // others' selections in their colour, then mine with handles
  const outlineBox = (s, colour, dash) => {
    const b = bounds(s), pad = 6 / view.zoom;
    ctx.lineWidth = 1.5 / view.zoom; ctx.strokeStyle = colour; ctx.setLineDash(dash ? [6 / view.zoom, 4 / view.zoom] : []);
    ctx.strokeRect(b.x - pad, b.y - pad, b.w + 2 * pad, b.h + 2 * pad);
    ctx.setLineDash([]);
  };
  const byId = new Map(shapes.map((s) => [s.id, s]));
  for (const o of others) for (const id of o.sel ?? []) { const s = byId.get(id); if (s) outlineBox(s, o.color, true); }
  const sel = [...mine].map((id) => byId.get(id)).filter(Boolean);
  for (const s of sel) outlineBox(s, pal.select, false);
  if (sel.length === 1) {
    const hs = 9 / view.zoom;
    for (const h of handles(sel[0])) {
      ctx.fillStyle = pal.paper; ctx.strokeStyle = pal.select; ctx.lineWidth = 1.5 / view.zoom;
      ctx.fillRect(h.x - hs / 2, h.y - hs / 2, hs, hs); ctx.strokeRect(h.x - hs / 2, h.y - hs / 2, hs, hs);
    }
  }

  // laser trails: the last second of each pointer, fading
  ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
  for (const t of trails) {
    const pts = t.pts.filter((p) => now - p.t < 1000);
    t.pts = pts;
    for (let i = 1; i < pts.length; i++) {
      const age = (now - pts[i].t) / 1000;
      ctx.strokeStyle = t.color; ctx.globalAlpha = Math.max(0, 1 - age);
      ctx.lineWidth = (6 * (1 - age) + 1) / view.zoom;
      ctx.beginPath(); ctx.moveTo(pts[i - 1].x, pts[i - 1].y); ctx.lineTo(pts[i].x, pts[i].y); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const head = pts.at(-1);
    if (head) { ctx.fillStyle = t.color; ctx.beginPath(); ctx.arc(head.x, head.y, 4.5 / view.zoom, 0, Math.PI * 2); ctx.fill(); }
  }

  // others' cursors: an arrow and a name tag, constant size on screen
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.font = '600 12px system-ui, -apple-system, "Segoe UI", sans-serif';
  for (const c of cursors) {
    const x = (c.x - view.x) * view.zoom, y = (c.y - view.y) * view.zoom;
    if (x < -50 || y < -50 || x > scr.w + 50 || y > scr.h + 50) continue;
    ctx.fillStyle = c.color; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 17); ctx.lineTo(x + 4.5, y + 13); ctx.lineTo(x + 11.5, y + 12.5); ctx.closePath();
    ctx.fill(); ctx.stroke();
    const w = ctx.measureText(c.name).width + 12;
    ctx.beginPath(); ctx.roundRect(x + 10, y + 16, w, 20, 10); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(c.name, x + 16, y + 26.5);
  }
}

// The board as a PNG: every shape, on paper, at twice the board's size. Resolves to a Blob, or null if empty.
export function png(shapes, pal, box) {
  if (!box) return Promise.resolve(null);
  const pad = 32, scale = Math.min(2, 8000 / Math.max(box.w + 2 * pad, box.h + 2 * pad));
  const c = document.createElement('canvas');
  c.width = Math.ceil((box.w + 2 * pad) * scale); c.height = Math.ceil((box.h + 2 * pad) * scale);
  const ctx = c.getContext('2d');
  ctx.fillStyle = pal.paper; ctx.fillRect(0, 0, c.width, c.height);
  ctx.setTransform(scale, 0, 0, scale, (pad - box.x) * scale, (pad - box.y) * scale);
  for (const s of shapes) drawShape(ctx, s, pal);
  return new Promise((res) => c.toBlob(res, 'image/png'));
}
