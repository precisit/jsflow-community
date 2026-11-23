// jsflow's QR code encoder (ISO/IEC 18004), types erased, no dependencies. Generated: do not edit.
// A small QR code encoder (ISO/IEC 18004): byte mode, error correction level M, versions 1 to 6 (up to 106 bytes,
// enough for the demo's link). Reed-Solomon over GF(256), the mask chosen by the standard's four penalty rules.
// No dependencies. Tested by qr.test.mjs (node --test). Only erasable TypeScript, so Node runs it as is.

/** Error correction level M per version: EC codewords per block, and the data codewords of each block. */
const VERSIONS                                                           = [
  { ec: 0, blocks: [] },
  { ec: 10, blocks: [16] },
  { ec: 16, blocks: [28] },
  { ec: 26, blocks: [44] },
  { ec: 18, blocks: [32, 32] },
  { ec: 24, blocks: [43, 43] },
  { ec: 16, blocks: [27, 27, 27, 27] },
];
/** Alignment pattern centres per version. */
const ALIGN                                   = [[], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34]];
export const MAX_VERSION = 6;
/** Level M's two format bits. */
const EC_M = 0b00;

/* ---------- GF(256), primitive polynomial x^8 + x^4 + x^3 + x^2 + 1 ---------- */
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) {
  EXP[i] = x;
  LOG[x] = i;
  x <<= 1;
  if (x & 0x100) x ^= 0x11d;
}
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
export const gfMul = (a        , b        ) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
export const gfExp = (i        ) => EXP[i % 255];

/** The generator polynomial (x - a^0)(x - a^1)...(x - a^(n-1)), highest power first. */
function generator(n        )           {
  let g = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array        (g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) {
      next[j] ^= g[j];
      next[j + 1] ^= gfMul(g[j], EXP[i]);
    }
    g = next;
  }
  return g;
}

/** The n EC codewords for data: the remainder of data(x) * x^n divided by the generator. */
export function rsEncode(data                   , n        )           {
  const g = generator(n);
  const r = new Array        (n).fill(0);
  for (const d of data) {
    const f = d ^ r[0];
    r.shift();
    r.push(0);
    for (let j = 0; j < n; j++) r[j] ^= gfMul(g[j + 1], f);
  }
  return r;
}

/* ---------- the format information: 5 bits, BCH(15,5), masked ---------- */
export function formatBits(mask        )         {
  const data = (EC_M << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | (rem & 0x3ff)) ^ 0x5412;
}

/* ---------- data codewords ---------- */
const dataCapacity = (v        ) => VERSIONS[v].blocks.reduce((a, b) => a + b, 0);
/** Bytes that fit in version v at level M (byte mode, 8-bit count). */
export const byteCapacity = (v        ) => Math.floor((dataCapacity(v) * 8 - 12) / 8);

function codewords(bytes            , v        )           {
  const cap = dataCapacity(v) * 8;
  const bits           = [];
  const put = (val        , len        ) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  put(0b0100, 4);
  put(bytes.length, 8);
  for (const b of bytes) put(b, 8);
  put(0, Math.min(4, cap - bits.length));
  put(0, (8 - (bits.length % 8)) % 8);
  const out           = [];
  for (let i = 0; i < bits.length; i += 8) out.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  for (let pad = 0xec; out.length < dataCapacity(v); pad ^= 0xec ^ 0x11) out.push(pad);
  // Split into blocks, add each block's EC codewords, then interleave: data column by column, then EC.
  const { ec, blocks } = VERSIONS[v];
  const data             = [];
  let k = 0;
  for (const n of blocks) { data.push(out.slice(k, k + n)); k += n; }
  const ecc = data.map((d) => rsEncode(d, ec));
  const res           = [];
  for (let i = 0; i < Math.max(...blocks); i++) for (const d of data) if (i < d.length) res.push(d[i]);
  for (let i = 0; i < ec; i++) for (const e of ecc) res.push(e[i]);
  return res;
}

/* ---------- the matrix ---------- */
                     
                  
               
               
                                    
                       
 

const MASKS                                                   = [
  (y, x) => (y + x) % 2 === 0,
  (y) => y % 2 === 0,
  (_y, x) => x % 3 === 0,
  (y, x) => (y + x) % 3 === 0,
  (y, x) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0,
  (y, x) => ((y * x) % 2) + ((y * x) % 3) === 0,
  (y, x) => (((y * x) % 2) + ((y * x) % 3)) % 2 === 0,
  (y, x) => (((y + x) % 2) + ((y * x) % 3)) % 2 === 0,
];

function base(v        ) {
  const size = 17 + 4 * v;
  const m = Array.from({ length: size }, () => new Array         (size).fill(false));
  const fn = Array.from({ length: size }, () => new Array         (size).fill(false));
  const set = (x        , y        , dark         ) => { m[y][x] = dark; fn[y][x] = true; };
  // Timing patterns.
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  // Finder patterns with their separators.
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      set(x, y, d !== 2 && d !== 4);
    }
  }
  // Alignment patterns, except where they would overlap a finder.
  const al = ALIGN[v], last = al.length - 1;
  for (let i = 0; i <= last; i++) for (let j = 0; j <= last; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  // Reserve the format areas (drawn per mask) and the dark module.
  drawFormat(m, fn, 0);
  return { size, m, fn };
}

function drawFormat(m             , fn             , mask        ) {
  const size = m.length;
  const bits = formatBits(mask);
  const bit = (i        ) => ((bits >>> i) & 1) === 1;
  const set = (x        , y        , dark         ) => { m[y][x] = dark; fn[y][x] = true; };
  for (let i = 0; i <= 5; i++) set(8, i, bit(i));
  set(8, 7, bit(6));
  set(8, 8, bit(7));
  set(7, 8, bit(8));
  for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
  for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
  set(8, size - 8, true);
}

/** The order data modules are filled in: two columns at a time from the right, up then down, skipping column 6. */
export function dataPositions(fn             )                          {
  const size = fn.length, out                          = [];
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    const up = ((right + 1) & 2) === 0;
    for (let v = 0; v < size; v++) for (let j = 0; j < 2; j++) {
      const x = right - j, y = up ? size - 1 - v : v;
      if (!fn[y][x]) out.push([x, y]);
    }
  }
  return out;
}

/** The standard's penalty score (rules N1 to N4, weights 3, 3, 40, 10). Lower is better. */
export function penalty(m             )         {
  const n = m.length;
  let p = 0;
  const at = (x        , y        , horiz         ) => (horiz ? m[y][x] : m[x][y]);
  for (const horiz of [true, false]) {
    for (let y = 0; y < n; y++) {
      // N1: runs of five or more modules of one colour.
      let run = 1;
      for (let x = 1; x < n; x++) {
        if (at(x, y, horiz) === at(x - 1, y, horiz)) run++;
        else { if (run >= 5) p += 3 + run - 5; run = 1; }
      }
      if (run >= 5) p += 3 + run - 5;
      // N3: 1:1:3:1:1 (dark-light-dark-dark-dark-light-dark) with four light modules on one side.
      for (let x = 0; x + 7 <= n; x++) {
        const pat = [true, false, true, true, true, false, true].every((d, k) => at(x + k, y, horiz) === d);
        if (!pat) continue;
        const lightRun = (a        ) => { for (let k = a; k < a + 4; k++) if (k < 0 || k >= n || at(k, y, horiz)) return false; return true; };
        if ((x - 4 >= 0 && lightRun(x - 4)) || (x + 11 <= n && lightRun(x + 7))) p += 40;
      }
    }
  }
  // N2: 2 x 2 blocks of one colour.
  for (let y = 0; y + 1 < n; y++) for (let x = 0; x + 1 < n; x++) {
    const c = m[y][x];
    if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) p += 3;
  }
  // N4: how far the dark share is from 50%, in steps of 5%.
  let dark = 0;
  for (const row of m) for (const c of row) if (c) dark++;
  p += Math.floor((Math.abs(dark * 2 - n * n) * 10) / (n * n)) * 10;
  return p;
}

/** Encodes text (as UTF-8) at level M in the smallest version that holds it. `forceMask` is for tests. */
export function encode(text        , forceMask         )     {
  const bytes = new TextEncoder().encode(text);
  let v = 1;
  while (v <= MAX_VERSION && byteCapacity(v) < bytes.length) v++;
  if (v > MAX_VERSION) throw new RangeError(`qr: ${bytes.length} bytes do not fit version ${MAX_VERSION}-M (${byteCapacity(MAX_VERSION)} bytes)`);
  const cw = codewords(bytes, v);
  const { size, m, fn } = base(v);
  const pos = dataPositions(fn);
  pos.forEach(([x, y], i) => { m[y][x] = i < cw.length * 8 && ((cw[i >>> 3] >>> (7 - (i & 7))) & 1) === 1; });
  let best                     = null, bestMask = 0, bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    if (forceMask !== undefined && mask !== forceMask) continue;
    const t = m.map((r) => r.slice()), tf = fn.map((r) => r.slice());
    for (const [x, y] of pos) if (MASKS[mask](y, x)) t[y][x] = !t[y][x];
    drawFormat(t, tf, mask);
    const s = penalty(t);
    if (s < bestScore) { best = t; bestMask = mask; bestScore = s; }
  }
  return { version: v, mask: bestMask, size, modules: best  };
}

/**
 * The code as SVG markup: dark modules as one path of horizontal runs (rectangles), in currentColor, with a
 * 4-module quiet zone inside the viewBox. The light colour is the container's background.
 */
export function toSvg(q    , label        , quiet = 4)         {
  const n = q.size + 2 * quiet;
  let d = '';
  q.modules.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (!row[x]) continue;
      let w = 1;
      while (x + w < row.length && row[x + w]) w++;
      d += `M${x + quiet} ${y + quiet}h${w}v1h-${w}z`;
      x += w - 1;
    }
  });
  const esc = label.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" width="${n * 4}" height="${n * 4}" shape-rendering="crispEdges" role="img" aria-label="${esc}"><path fill="currentColor" d="${d}"/></svg>`;
}
