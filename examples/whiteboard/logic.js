// The parts of the page around the board that are plain functions: the board's name, a visitor's name and colour,
// who is here, the list of boards kept in this browser, and the offline counts. Tested without a browser.

// The board's name is the room's name, from the address (#name) or fresh and random. Anyone who knows it can join
// (with a key from an allowed origin), so a new one is 16 random characters.
export function boardName(hash, random) {
  if (/^#[A-Za-z0-9_-]{1,64}$/.test(hash)) return hash.slice(1);
  return btoa(String.fromCharCode(...random)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// One colour per person, the same on every screen (cursor, name, selection). Chosen to read on light and dark paper.
export const PEOPLE_COLOURS = ['#e5484d', '#0091ff', '#30a46c', '#f76b15', '#8e4ec6', '#12a594', '#d6409f', '#ad7f58'];

// A name and a colour for a visitor, from random bytes: "Guest 417" and one of PEOPLE_COLOURS.
export function guest(random) {
  const n = ((random[0] << 8) | random[1]) % 1000;
  return { name: `Guest ${n}`, color: PEOPLE_COLOURS[random[2] % PEOPLE_COLOURS.length] };
}

// One colour per person (S51 in the brand's terms: a peer keeps one colour on every screen). Colours are picked at
// random, so two people can draw the same one: then the one with the higher Yjs client id moves to the first colour
// nobody has. Everyone applies the same rule, so it settles after one change.
export function freeColour(states, me, mine) {
  const others = [...states].filter(([id, s]) => id !== me && s?.user);
  if (!others.some(([id, s]) => id < me && s.user.color === mine)) return mine;
  const taken = new Set(others.map(([, s]) => s.user.color));
  return PEOPLE_COLOURS.find((c) => !taken.has(c)) ?? mine;
}

// The letters in a person's dot: "Guest 767" -> "G7", "Ada Lovelace" -> "AL", "Bo" -> "B".
export function initials(name) {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => [...w][0] ?? '').join('').toUpperCase();
}

// A name someone typed: trimmed, one line, at most 24 characters; null if nothing is left.
export function cleanName(s) {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, 24);
  return t || null;
}

// Who is on the board: the awareness states (client id -> state) as a list, me first, then by name. `pathOf(peer)`
// says how this page reaches that peer ('direct', 'relay', 'mesh' or null, from room.path()).
export function people(states, me, pathOf = () => null) {
  return [...states]
    .filter(([, s]) => s && s.user && typeof s.user.name === 'string')
    .map(([id, s]) => ({ id, name: s.user.name, color: s.user.color, me: id === me, path: id === me ? null : (s.user.peer ? pathOf(s.user.peer) : null) }))
    .sort((a, b) => (b.me - a.me) || a.name.localeCompare(b.name) || a.id - b.id);
}

// The boards kept in this browser: { [name]: { edited, created } } (times in ms). The board itself lives in
// IndexedDB under its name; this small index only remembers which names exist and when they changed.
export function touch(index, name, now, title) {
  const b = index[name];
  const t = title === undefined ? b?.title : title;   // undefined keeps the title, null clears it
  return { ...index, [name]: { created: b?.created ?? now, edited: now, ...(t ? { title: t } : {}) } };
}

// A board's title for the list: the first line of the first note that has text (in draw order), at most 40
// characters; null when no note has text.
export function titleOf(shapes) {
  const n = shapes.find((s) => s.type === 'note' && s.text?.trim());
  if (!n) return null;
  const line = n.text.trim().split('\n')[0].trim();
  return line.length > 40 ? `${line.slice(0, 39)}…` : line;
}
export function forget(index, name) {
  const { [name]: _, ...rest } = index;
  return rest;
}
export function boardList(index) {
  return Object.entries(index).map(([name, b]) => ({ name, ...b })).sort((a, b) => b.edited - a.edited || (a.name < b.name ? -1 : 1));
}
// Reads the index from a stored string, tolerating anything broken.
export function parseIndex(text) {
  try {
    const o = JSON.parse(text ?? '{}');
    if (!o || typeof o !== 'object' || Array.isArray(o)) return {};
    return Object.fromEntries(Object.entries(o).filter(([, b]) => b && Number.isFinite(b.edited) && Number.isFinite(b.created))
      .map(([k, b]) => [k, typeof b.title === 'string' ? b : { created: b.created, edited: b.edited }]));
  } catch { return {}; }
}

// "just now", "5 min ago", "3 h ago", "yesterday", "4 days ago", then a date.
export function ago(ms, now) {
  const s = Math.max(0, (now - ms) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 2 * 86400) return 'yesterday';
  if (s < 14 * 86400) return `${Math.floor(s / 86400)} days ago`;
  return new Date(ms).toISOString().slice(0, 10);
}

// What the Online/Offline switch reports. While offline, the shapes you changed are counted; back online, the
// shapes the others changed while you were away are counted as they arrive.
export function offlineNote(mine) {
  return mine === 0 ? 'Offline. Your changes stay on this device.' : `Offline: ${mine} ${mine === 1 ? 'shape' : 'shapes'} changed, waiting to be sent.`;
}
export function mergeNote(sent, got) {
  const n = (k) => `${k} ${k === 1 ? 'shape' : 'shapes'}`;
  if (sent === 0 && got === 0) return 'Back online. Nothing changed while you were away.';
  return `Back online: sent ${n(sent)}, got ${n(got)}.`;
}

// The address to share: this page, with the board's name and nothing else.
export function shareLink(href, name) {
  const u = new URL(href);
  u.search = ''; u.hash = name;
  return u.toString();
}
