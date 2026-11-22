// The parts of the page that are plain functions, so that they can be tested without a browser.

// The room name comes from the URL (#name), or a fresh random one. Anyone who knows a room's name can join it
// (with a key from an allowed origin), so make names hard to guess.
export function roomName(hash, random) {
  if (/^#[A-Za-z0-9_-]{1,64}$/.test(hash)) return hash.slice(1);
  return btoa(String.fromCharCode(...random)).replace(/\+/g, '-').replace(/\//g, '_');
}

// A name and a colour for this visitor, from random bytes: "Guest 417", a hue spread around the colour wheel.
// y-codemirror.next draws the cursor in `color` and the selection in `colorLight`.
export function guest(random) {
  const n = ((random[0] << 8) | random[1]) % 1000, hue = ((random[2] << 8) | random[3]) % 360;
  return { name: `Guest ${n}`, color: `hsl(${hue} 70% 45%)`, colorLight: `hsl(${hue} 70% 45% / 0.25)` };
}

// Who is in the document: the awareness states (client id -> state) as a list, me first, then by name.
// A state without a user (a peer that has not set one yet) is left out.
export function people(states, me) {
  return [...states]
    .filter(([, s]) => s && s.user && typeof s.user.name === 'string')
    .map(([id, s]) => ({ id, name: s.user.name, color: s.user.color, me: id === me }))
    .sort((a, b) => (b.me - a.me) || a.name.localeCompare(b.name) || a.id - b.id);
}
