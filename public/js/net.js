// Thin PeerJS wrapper. Peer-to-peer: the public PeerJS broker is used only for the WebRTC handshake.
// Override broker with ?ph=host&pp=port&ps=1 (e.g. a local `npm run signal` server).
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ';
const code4 = () => Array.from({ length: 4 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join('');
function opts() {
  const q = new URLSearchParams(location.search), o = {};
  if (q.get('ph')) Object.assign(o, { host: q.get('ph'), port: +(q.get('pp') || 9000), path: '/', secure: q.get('ps') === '1' });
  return o;
}

export function hostRoom(h, tries = 5) {
  const code = code4(), peer = new window.Peer('hns-' + code, opts()), conns = new Map();
  peer.on('open', () => h.ready(code));
  peer.on('error', e => {
    if (e.type === 'unavailable-id' && tries > 0) { peer.destroy(); return hostRoom(h, tries - 1); }
    h.error(e);
  });
  peer.on('connection', c => {
    c.on('open', () => { conns.set(c.peer, c); h.join(c.peer); });
    c.on('data', d => h.data(c.peer, d));
    c.on('close', () => { if (conns.delete(c.peer)) h.leave(c.peer); });
    c.on('error', () => { if (conns.delete(c.peer)) h.leave(c.peer); });
  });
  return {
    send: (id, m) => { const c = conns.get(id); if (c && c.open) c.send(m); },
    broadcast: m => conns.forEach(c => c.open && c.send(m)),
    close: () => peer.destroy(),
  };
}

export function joinRoom(code, h) {
  const peer = new window.Peer(opts());
  let conn, opened = false;
  const timer = setTimeout(() => { if (!opened) h.error({ type: 'timeout' }); }, 12000);
  peer.on('open', () => {
    conn = peer.connect('hns-' + code.trim().toUpperCase().replace(/^HNS-/, ''), { reliable: true });
    conn.on('open', () => { opened = true; clearTimeout(timer); h.open(); });
    conn.on('data', h.data);
    conn.on('close', h.close);
    conn.on('error', h.error);
  });
  peer.on('error', e => { clearTimeout(timer); h.error(e); });
  return { send: m => conn && conn.open && conn.send(m), close: () => peer.destroy() };
}
