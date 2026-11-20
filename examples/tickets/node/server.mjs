// A ticket endpoint in Node (no dependencies): POST /ticket {"room": "..."} → {"ticket": "...", "expiresAt": ...}.
//   JSFLOW_SECRET_KEY=sk_… JSFLOW_KEY_ID=key_… JSFLOW_APP=myapp node server.mjs
// The secret key lives only on your server (an environment variable or your secrets store), never in a page.
import { createServer } from 'node:http';
import { mintTicket } from './ticket.mjs';

const { JSFLOW_SECRET_KEY: secretKey, JSFLOW_KEY_ID: keyId, JSFLOW_APP: app, PORT = '8787' } = process.env;
if (!secretKey || !keyId || !app) { console.error('set JSFLOW_SECRET_KEY, JSFLOW_KEY_ID and JSFLOW_APP'); process.exit(1); }

// REPLACE THIS with your own authentication: return the signed-in user's id, or null. The ticket makes jsflow
// trust this id (peers read it with room.user(peerId)), so it must come from your session, never from the request body.
const currentUser = (req) => req.headers['x-demo-user'] ?? null;

createServer(async (req, res) => {
  const send = (status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
  if (req.method !== 'POST' || req.url !== '/ticket') return send(404, { err: 'not_found' });
  const sub = currentUser(req);
  if (!sub) return send(401, { err: 'unauthorized' });
  let body = ''; for await (const c of req) { body += c; if (body.length > 4096) return send(413, { err: 'too_large' }); }
  let room; try { room = JSON.parse(body).room; } catch { return send(400, { err: 'bad_json' }); }
  // Decide here whether this user may enter this room. The ticket is your yes.
  try {
    const ticket = mintTicket({ secretKey, keyId, app, room, sub, ttlSeconds: 300 });
    send(200, { ticket, expiresAt: Date.now() + 300_000 });
  } catch (e) { send(400, { err: 'bad_request', message: e.message }); }
}).listen(Number(PORT), '127.0.0.1', () => console.log(`ticket endpoint on http://127.0.0.1:${PORT}/ticket`));
