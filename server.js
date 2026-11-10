// Static file server for the game. Pass --signal to also run a local PeerJS signaling server on :9000
// (then open the game with ?ph=localhost&pp=9000). Normal play needs only a static host.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const port = +(process.env.PORT || 8080);
http.createServer((req, res) => {
  let p = path.normalize(decodeURIComponent(req.url.split('?')[0])); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root)) { res.writeHead(403).end(); return; }
  fs.readFile(f, (e, d) => e ? res.writeHead(404).end('not found') : res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }).end(d));
}).listen(port, () => console.log('Game on http://localhost:' + port));
if (process.argv.includes('--signal')) {
  const { PeerServer } = await import('peer');
  PeerServer({ port: 9000, path: '/', host: '0.0.0.0' }); console.log('Signaling on :9000  -> open with ?ph=localhost&pp=9000');
}
