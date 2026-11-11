// Built-in opponent / teammate: no network, no API key. It plays by the human rules
// (same speed cap, view cone and line-of-sight checks) but is slightly slower and has a reaction delay.
import { AiBot } from './ai.js';
import { roleOf, canSee } from './rules.js';
import { findPath, randomFreePoint } from './path.js';

export class CpuBot extends AiBot {
  constructor(sim, id) {
    super(sim, id, { key: '', model: '' });
    this.cpu = true; this.off = true; // never calls the API
    this.think = 0; this.t = 0; this.react = 0; this.lastSeen = null; this.spot = null; this.cover = null;
    this.target = null; this.path = null; this.pathAge = 99; this.visits = new Map(); this.blockedFor = 0; this.lastPos = null;
  }
  update(dt) {
    const p = this.sim.players.get(this.id), m = this.sim.match;
    if (!p || !p.body || !m) return;
    if (m.phase !== 'prep' && m.phase !== 'seek') { Object.assign(p.input, { mx: 0, mz: 0, jump: false }); this.target = null; return; }
    this.t += dt; this.react -= dt; this.think -= dt; this.pathAge += dt;
    const b = p.body.position, moved = this.lastPos ? Math.hypot(b.x - this.lastPos.x, b.z - this.lastPos.z) : 1; this.lastPos = { x: b.x, z: b.z };
    this.blockedFor = this.cmd.goto && moved < 0.5 * dt ? this.blockedFor + dt : 0;
    if (this.think <= 0) { this.think = 0.12; if (roleOf(m, p.team) === 'hider') this.hide(p, m); else this.seek(p, m); this.follow(p); }
    this.drive(p, dt);
  }
  // ---- movement: walk to `target` through doorways (A*), cutting corners when the way is clear -------------
  go(pt) { if (!pt) { this.target = null; this.cmd.goto = null; return; } if (!this.target || Math.hypot(this.target.x - pt.x, this.target.z - pt.z) > 0.2) { this.target = { x: pt.x, z: pt.z }; this.pathAge = 99; } }
  follow(p) {
    const t = this.target; if (!t) { this.cmd.goto = null; return; }
    const b = p.body.position, d = Math.hypot(t.x - b.x, t.z - b.z);
    if (d < (this.final ?? 0.12) + 0.02) { this.cmd.goto = null; if (!this.keepTarget) this.target = null; return; }
    const clear = !this.sim.losBlocked(b.x, 0.45, b.z, t.x, 0.45, t.z) && !this.sim.losBlocked(b.x + 0.4, 0.45, b.z, t.x + 0.4, 0.45, t.z) && !this.sim.losBlocked(b.x - 0.4, 0.45, b.z, t.x - 0.4, 0.45, t.z);
    // near cover we steer directly (ring routing): the grid ignores movable objects
    if ((clear && d < 12) || (this.direct && d < 6)) { this.arrive = this.final ?? 0.12; this.cmd.goto = { x: t.x, z: t.z }; return; }
    if (this.pathAge > 0.9 || this.blockedFor > 1.2) { this.path = findPath(this.sim, { x: b.x, z: b.z }, t); this.pathAge = 0; this.blockedFor = 0; }
    if (!this.path) { this.cmd.goto = { x: t.x, z: t.z }; this.arrive = this.final ?? 0.12; return; }
    while (this.path.length > 1 && Math.hypot(this.path[0].x - b.x, this.path[0].z - b.z) < 0.7) this.path.shift();
    let wp = this.path[0]; // string-pull: head for the furthest waypoint we can see
    for (let k = this.path.length - 1; k > 0; k--) { const q = this.path[k]; if (Math.hypot(q.x - b.x, q.z - b.z) < 9 && !this.sim.losBlocked(b.x, 0.45, b.z, q.x, 0.45, q.z)) { wp = q; break; } }
    this.cmd.goto = { x: wp.x, z: wp.z }; this.arrive = wp === this.path[this.path.length - 1] ? (this.final ?? 0.12) : 0.5;
  }
  // ---- choosing where to hide ---------------------------------------------------------------
  pickCover(p) {
    const b = p.body.position, mate = this.sim.team ? null : null;
    let best = null, score = Infinity;
    for (const o of this.sim.objs) {
      if ((o.locked && o.lockedBy !== p.team) || (o.heldBy && o.heldBy !== p) || o.type === 'ramp' && this.sim.objs.length > 1) continue;
      const big = o.type === 'plank' || o.type === 'wall' ? -2.5 : 0, d = Math.hypot(o.body.position.x - b.x, o.body.position.z - b.z);
      if (d + big < score) { score = d + big; best = o; }
    }
    return best || this.sim.objs[0] || null;
  }
  coverSpot(p, from, o) {
    const A = this.sim.A, b = p.body.position, ob = o.body.position; let best = null, bestScore = Infinity;
    const rs = o.type === 'plank' ? [1.5, 2.2] : [1.5, 2.1];
    for (let k = 0; k < 20; k++) for (const r of rs) {
      const a = k * Math.PI / 10, x = ob.x + Math.cos(a) * r, z = ob.z + Math.sin(a) * r;
      if (Math.abs(x) > A - 1.2 || Math.abs(z) > A - 1.2) continue;
      if (this.sim.statics.some(st => st.y >= 0 && st.sy <= 5 && Math.abs(x - st.x) < st.sx / 2 + 0.7 && Math.abs(z - st.z) < st.sz / 2 + 0.7)) continue;
      const hidden = this.sim.losBlocked(from.x, from.y ?? 1.0, from.z, x, 0.6, z);
      const score = Math.hypot(x - b.x, z - b.z) + (hidden ? 0 : 100);
      if (score < bestScore) { bestScore = score; best = { x, z }; }
    }
    return best;
  }
  // Walk around the object (not through it): step along a ring until we are near the target angle.
  route(p, spot, o) {
    if (!o || !spot) return spot;
    const ob = o.body.position, b = p.body.position, ang = (x, z) => Math.atan2(z - ob.z, x - ob.x);
    const aB = ang(b.x, b.z), d = Math.atan2(Math.sin(ang(spot.x, spot.z) - aB), Math.cos(ang(spot.x, spot.z) - aB));
    if (Math.abs(d) < 0.7 || Math.hypot(b.x - ob.x, b.z - ob.z) > 4) return spot;
    const a = aB + Math.sign(d) * Math.min(Math.abs(d), 0.8), A = this.sim.A, cl = v => Math.max(-A + 1.3, Math.min(A - 1.3, v));
    return { x: cl(ob.x + Math.cos(a) * 2.4), z: cl(ob.z + Math.sin(a) * 2.4) };
  }
  hide(p, m) {
    if (this.cmd.actions.length) return; // let a lock action finish
    this.speed = 0.78; this.final = 0.12; this.keepTarget = true; this.direct = true;
    if (!this.cover || (this.cover.locked && this.cover.lockedBy !== p.team) || (this.cover.heldBy && this.cover.heldBy !== p)) this.cover = this.pickCover(p);
    const o = this.cover; if (!o) return;
    const b = p.body.position, ob = o.body.position, A = this.sim.A;
    const sk = [...this.sim.players.values()].find(q => q.body && q.team !== p.team);
    if (m.phase === 'prep' && !o.locked) { // 1) lock the object so seekers cannot shove it
      const d = Math.hypot(ob.x - b.x, ob.z - b.z);
      if (d > 3) { this.final = 0.5; this.go({ x: ob.x + (b.x - ob.x) / d * 2.4, z: ob.z + (b.z - ob.z) / d * 2.4 }); this.cmd.face = null; }
      else { this.go(null); this.cmd = { goto: null, face: { x: ob.x, z: ob.z }, actions: ['lock'], wait: 0 }; }
      return;
    }
    // 2) keep the object between us and the seekers (re-evaluated with a short reaction lag)
    const lead = 0.35, from = sk ? { x: sk.body.position.x + sk.body.velocity.x * lead, y: sk.body.position.y + 0.4, z: sk.body.position.z + sk.body.velocity.z * lead } : { x: ob.x, y: 1, z: A - 3 };
    if (!this.spot || this.react <= 0) { this.spot = this.coverSpot(p, from, o) || this.spot; this.react = m.phase === 'seek' ? 0.4 : 0.3; }
    this.cmd.face = null; if (this.spot) this.go(this.route(p, this.spot, o));
  }
  // ---- seeking -------------------------------------------------------------------------------------
  patrolPoint(p) { // prefer corners of the map we have visited least
    const b = p.body.position; let best = null, bs = Infinity;
    for (let k = 0; k < 8; k++) {
      const q = randomFreePoint(this.sim), key = Math.round(q.x / 4) + ',' + Math.round(q.z / 4);
      const s = (this.visits.get(key) || 0) * 6 - Math.hypot(q.x - b.x, q.z - b.z) * 0.15 + Math.random();
      if (s < bs) { bs = s; best = { q, key }; }
    }
    this.visits.set(best.key, (this.visits.get(best.key) || 0) + 1); return best.q;
  }
  seek(p, m) {
    if (m.phase !== 'seek') return;
    this.keepTarget = false; this.final = 0.6; this.direct = false;
    const hider = [...this.sim.players.values()].find(q => q.body && q.team !== p.team); if (!hider) return;
    const e = this.sim.eye(p), me = { x: e.x, y: e.y, z: e.z, yaw: p.input.yaw, pitch: p.input.pitch };
    this.speed = 0.92; this.cmd.face = null;
    if (canSee(me, hider.body.position, this.sim.blocked(p, hider))) {
      const hx = hider.body.position.x, hz = hider.body.position.z, b = p.body.position, d = Math.hypot(hx - b.x, hz - b.z);
      this.lastSeen = { x: hx, z: hz, t: this.t };
      // scoring only needs line of sight: close in to about 2 m, then stand and keep looking (never shove the player)
      if (d > 2.4) this.go({ x: hx - (hx - b.x) / d * 1.9, z: hz - (hz - b.z) / d * 1.9 }); else { this.go(null); this.cmd.face = { x: hx, z: hz }; }
      return;
    }
    if (this.lastSeen && this.t - this.lastSeen.t < 6) { // go and look where we last saw them
      const b = p.body.position; if (Math.hypot(this.lastSeen.x - b.x, this.lastSeen.z - b.z) < 1.2) this.lastSeen = null; else this.go(this.lastSeen);
      return;
    }
    if (!this.target) this.go(this.sim.mode === 'small' && this.sim.objs[0] ? this.ringPoint() : this.patrolPoint(p));
  }
  ringPoint() { // small arena: circle the single object, looking for hiders
    const o = this.sim.objs[0].body.position, A = this.sim.A, cl = v => Math.max(-A + 1.2, Math.min(A - 1.2, v));
    this.angle = (this.angle ?? Math.random() * 6.28) + 0.9 + Math.random() * 0.7; const r = 3.2 + Math.random() * 1.2;
    return { x: cl(o.x + Math.cos(this.angle) * r), z: cl(o.z + Math.sin(this.angle) * r) };
  }
}
