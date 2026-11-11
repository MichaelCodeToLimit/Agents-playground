// Built-in single-player opponent: no network, no API key. It plays by the human rules
// (same speed cap, same view cone and line-of-sight checks) but is slightly slower and has a reaction delay.
import { AiBot } from './ai.js';
import { roleOf, canSee } from './rules.js';

export class CpuBot extends AiBot {
  constructor(sim, id) {
    super(sim, id, { key: '', model: '' });
    this.cpu = true; this.off = true; this.arrive = 0.12; // never calls the API; stops precisely on its hiding spot
    this.think = 0; this.t = 0; this.react = 0; this.lastSeen = null; this.angle = Math.random() * Math.PI * 2; this.spot = null;
  }
  update(dt) {
    const p = this.sim.players.get(this.id), m = this.sim.match;
    if (!p || !p.body || !m) return;
    if (m.phase !== 'prep' && m.phase !== 'seek') { Object.assign(p.input, { mx: 0, mz: 0, jump: false }); return; }
    this.t += dt; this.react -= dt; this.think -= dt;
    if (this.think <= 0) { this.think = 0.12; if (roleOf(m, p.team) === 'hider') this.hide(p, m); else this.seek(p, m); }
    this.drive(p, dt);
  }
  setGoto(pt) { const g = this.cmd.goto; if (!pt) this.cmd.goto = null; else if (!g || Math.hypot(g.x - pt.x, g.z - pt.z) > 0.3) this.cmd.goto = { x: pt.x, z: pt.z }; }
  // Pick a point near the object that the viewer at `from` cannot see (ray blocked), closest to us.
  coverSpot(p, from) {
    const o = this.sim.objs[0], A = this.sim.A, b = p.body.position; if (!o) return null;
    const ob = o.body.position; let best = null, bestScore = Infinity;
    for (let k = 0; k < 16; k++) for (const r of [1.5, 2.1]) {
      const a = k * Math.PI / 8, x = ob.x + Math.cos(a) * r, z = ob.z + Math.sin(a) * r;
      if (Math.abs(x) > A - 1 || Math.abs(z) > A - 1) continue;
      const hidden = this.sim.losBlocked(from.x, from.y ?? 1.0, from.z, x, 0.6, z);
      const score = Math.hypot(x - b.x, z - b.z) + (hidden ? 0 : 100);
      if (score < bestScore) { bestScore = score; best = { x, z }; }
    }
    return best;
  }
  hide(p, m) {
    const o = this.sim.objs[0]; if (!o || this.cmd.actions.length) return; // let a lock action finish
    const b = p.body.position, ob = o.body.position, A = this.sim.A;
    const sk = [...this.sim.players.values()].find(q => q.body && q.team !== p.team);
    this.speed = 0.78;
    if (m.phase === 'prep' && !o.locked) { // 1) lock the object so seekers cannot shove it
      const d = Math.hypot(ob.x - b.x, ob.z - b.z);
      if (d > 3) { this.setGoto({ x: ob.x + (b.x - ob.x) / d * 2.4, z: ob.z + (b.z - ob.z) / d * 2.4 }); this.cmd.face = null; }
      else this.cmd = { goto: null, face: { x: ob.x, z: ob.z }, actions: ['lock'], wait: 0 };
      return;
    }
    // 2) keep the object between us and the seekers (re-evaluated with a short reaction lag)
    const lead = 0.35, from = sk ? { x: sk.body.position.x + sk.body.velocity.x * lead, y: sk.body.position.y + 0.4, z: sk.body.position.z + sk.body.velocity.z * lead } : { x: ob.x, y: 1, z: A - 3 }; // seekers are frozen in prep, so we know where they stand
    if (!this.spot || this.react <= 0) { this.spot = this.coverSpot(p, from) || this.spot; this.react = m.phase === 'seek' ? 0.4 : 0.3; }
    this.cmd.face = null; this.setGoto(this.route(p, this.spot));
  }
  // Walk around the object (not through it): step along a ring until we are near the target angle.
  route(p, spot) {
    const o = this.sim.objs[0]; if (!o || !spot) return spot;
    const ob = o.body.position, b = p.body.position, ang = (x, z) => Math.atan2(z - ob.z, x - ob.x);
    const aB = ang(b.x, b.z), d = Math.atan2(Math.sin(ang(spot.x, spot.z) - aB), Math.cos(ang(spot.x, spot.z) - aB));
    if (Math.abs(d) < 0.7 || Math.hypot(b.x - ob.x, b.z - ob.z) > 5) return spot;
    const a = aB + Math.sign(d) * Math.min(Math.abs(d), 0.8), A = this.sim.A, cl = v => Math.max(-A + 1, Math.min(A - 1, v));
    return { x: cl(ob.x + Math.cos(a) * 2.4), z: cl(ob.z + Math.sin(a) * 2.4) };
  }
  seek(p, m) {
    if (m.phase !== 'seek') return;
    const hider = [...this.sim.players.values()].find(q => q.body && q.team !== p.team); if (!hider) return;
    const e = this.sim.eye(p), me = { x: e.x, y: e.y, z: e.z, yaw: p.input.yaw, pitch: p.input.pitch };
    this.speed = 0.92; this.cmd.face = null;
    if (canSee(me, hider.body.position, this.sim.blocked(p, hider))) {
      this.lastSeen = { x: hider.body.position.x, z: hider.body.position.z, t: this.t }; this.setGoto(this.lastSeen); return;
    }
    if (this.lastSeen && this.t - this.lastSeen.t < 5) { // go and look where we last saw them
      const b = p.body.position; if (Math.hypot(this.lastSeen.x - b.x, this.lastSeen.z - b.z) < 1) this.lastSeen = null; else this.setGoto(this.lastSeen);
      return;
    }
    if (!this.cmd.goto) { // otherwise circle the object, looking for hiders
      const o = this.sim.objs[0], c = o ? o.body.position : { x: 0, z: 0 }, A = this.sim.A;
      this.angle += 0.9 + Math.random() * 0.7;
      const r = 3.2 + Math.random() * 1.2, cl = v => Math.max(-A + 1.2, Math.min(A - 1.2, v));
      this.setGoto({ x: cl(c.x + Math.cos(this.angle) * r), z: cl(c.z + Math.sin(this.angle) * r) });
    }
  }
}
