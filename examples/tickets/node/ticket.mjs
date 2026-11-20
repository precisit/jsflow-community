// jsflow join tickets in Node, no dependencies. A ticket is an HS256 JWT signed with an app's SECRET key (sk_…):
//   header  { alg: "HS256", typ: "JWT", kid: <the key's id> }     (kid lets two keys be active while you rotate)
//   claims  { app, room, sub, iat, exp, region? }                  (sub: your user's id; exp: at most 10 minutes ahead)
// The HMAC key is the bytes of the full sk_… string. The service verifies the ticket; it never calls you.
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const b64url = (s) => Buffer.from(s, 'utf8').toString('base64url');

/**
 * @param {{ secretKey: string, keyId: string, app: string, room: string, sub: string,
 *           region?: string, ttlSeconds?: number, iat?: number }} p   iat: seconds since the epoch (default: now)
 * @returns {string} the ticket
 */
export function mintTicket({ secretKey, keyId, app, room, sub, region, ttlSeconds = 300, iat = Math.floor(Date.now() / 1000) }) {
  if (typeof secretKey !== 'string' || !secretKey.startsWith('sk_') || secretKey.length < 20) throw new Error('secretKey must be the app\'s sk_… secret key');
  if (typeof keyId !== 'string' || !keyId.startsWith('key_')) throw new Error('keyId must be the secret key\'s id (key_…)');
  if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(app)) throw new Error('app: lower case letters, digits and -, 1 to 32 characters');
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(room)) throw new Error('room: letters, digits, _ and -, 1 to 64 characters');
  if (typeof sub !== 'string' || sub.length < 1 || Buffer.byteLength(sub, 'utf8') > 256) throw new Error('sub: your user id, 1 to 256 bytes of UTF-8');
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 600) throw new Error('ttlSeconds: 1 to 600 (a ticket may live at most 10 minutes)');
  const header = { alg: 'HS256', typ: 'JWT', kid: keyId };
  const claims = { app, room, sub, iat, exp: iat + ttlSeconds, ...(region ? { region } : {}) };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  return `${signingInput}.${createHmac('sha256', secretKey).update(signingInput).digest('base64url')}`;
}

// `node ticket.mjs < input.json` prints a ticket for { secretKey, keyId, app, room, sub, region?, ttlSeconds?, iat? }.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { console.log(mintTicket(JSON.parse(readFileSync(0, 'utf8')))); } catch (e) { console.error(e.message); process.exit(1); }
}
