// Host-authoritative simulation: physics (cannon-es) + rules. Runs in browser (host) and Node (tests).
import * as C from '../vendor/cannon-es.js';
import { findPath } from './path.js';
import { createMatch, tick, canSee, canUnlock, canLock, roleOf, forward, CFG } from './rules.js';

export const ARENA = 20, SMALL_ARENA = 8, SMALL_SEQ = ['box', 'ramp', 'wall', 'box'], WALL_H = 2.6, EYE = 0.9, SPEED = 6, JUMP = 8;
export const OBJ_TYPES = {
  box:  { size: [1.2, 1.2, 1.2], mass: 3 },
  wall: { size: [3, 1.8, 0.3], mass: 4 },
  ramp: { size: [2, 1.5, 3], mass: 4 }, // wedge: high end at +z
  plank: { size: [5, 1.2, 0.35], mass: 5 }, // long, thin gold plank (the video's shelter walls)
};
const G_OBS = 1, G_PLAYER = 2;
const r2 = v => Math.round(v * 100) / 100;

function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

export function wedgeShape([w, h, l]) {
  const x = w / 2, y = h / 2, z = l / 2;
  const v = [[-x,-y,-z],[x,-y,-z],[x,-y,z],[-x,-y,z],[-x,y,z],[x,y,z]].map(p => new C.Vec3(...p));
  const f = [[0,1,2,3],[3,2,5,4],[0,3,4],[1,5,2].reverse(),[0,1,5,4].reverse()];
  // fix winding so each face normal points outward from the centroid
  const faces = f.map(face => {
    const a = v[face[0]], b = v[face[1]], c = v[face[2]];
    const n = b.vsub(a).cross(c.vsub(a));
    const centre = a.vadd(b).vadd(c).scale(1 / 3);
    return n.dot(centre) < 0 ? face.slice().reverse() : face;
  });
  return new C.ConvexPolyhedron({ vertices: v, faces });
}

export class Sim {
  constructor(seed = 1, mode = 'full') {
    this.seed = seed; this.mode = mode; this.A = mode === 'small' ? SMALL_ARENA : ARENA; this.players = new Map(); this.match = null; this.objs = []; this.statics = [];
    this.world = new C.World({ gravity: new C.Vec3(0, -25, 0) });
    this.world.allowSleep = true; this.world.solver.iterations = 14; // objects sleep when still, so stacks stay put
    const mObj = new C.Material('obj'), mPlayer = new C.Material('player');
    this.mObj = mObj; this.mPlayer = mPlayer;
    this.world.defaultContactMaterial.friction = 0.5;
    this.world.addContactMaterial(new C.ContactMaterial(mPlayer, mObj, { friction: 0, restitution: 0 }));
    this.world.addContactMaterial(new C.ContactMaterial(mObj, mObj, { friction: 0.65, restitution: 0.02 }));
    this.events = [];
    this.buildLevel(0);
  }

  // ---- level -------------------------------------------------------------
  clearLevel() {
    this.version = (this.version || 0) + 1; // lets pathfinding caches know the walls changed
    for (const o of this.objs) this.world.removeBody(o.body);
    for (const s of this.statics) this.world.removeBody(s.body);
    this.objs = []; this.statics = [];
  }
  addStatic(x, y, z, sx, sy, sz) {
    const body = new C.Body({ mass: 0, material: this.mObj, collisionFilterGroup: G_OBS, collisionFilterMask: G_OBS | G_PLAYER });
    body.addShape(new C.Box(new C.Vec3(sx / 2, sy / 2, sz / 2)));
    body.position.set(x, y, z); this.world.addBody(body);
    this.statics.push({ x, y, z, sx, sy, sz, body });
  }
  addObj(id, type, x, y, z, yaw = 0) {
    const def = OBJ_TYPES[type];
    const body = new C.Body({ mass: def.mass, material: this.mObj, linearDamping: 0.2, angularDamping: 0.6, collisionFilterGroup: G_OBS, collisionFilterMask: G_OBS | G_PLAYER });
    body.allowSleep = true; body.sleepSpeedLimit = 0.25; body.sleepTimeLimit = 0.5;
    body.addShape(type === 'ramp' ? wedgeShape(def.size) : new C.Box(new C.Vec3(def.size[0] / 2, def.size[1] / 2, def.size[2] / 2)));
    body.position.set(x, y, z); body.quaternion.setFromAxisAngle(new C.Vec3(0, 1, 0), yaw);
    this.world.addBody(body);
    const o = { id, type, body, mass: def.mass, locked: false, lockedBy: null, heldBy: null };
    this.objs.push(o); return o;
  }
  // 'small' = tiny arena with a single movable object (a different one each round); 'full' = the big arena
  setMode(mode) {
    if (this.match || mode === this.mode) return;
    this.mode = mode; this.A = mode === 'small' ? SMALL_ARENA : ARENA; this.buildLevel(0); this.events.push('layout'); // 'random' picks its own size per round
  }
  buildLevel(round) {
    this.clearLevel();
    const rand = rng(this.seed * 1000 + round);
    if (this.mode === 'random') this.A = 12 + Math.floor(rand() * 10); // 12..21
    const A = this.A, T = 1;
    this.addStatic(0, -0.5, 0, A * 2 + 4, 1, A * 2 + 4);                 // floor
    this.addStatic(0, 3, -A - T / 2, A * 2 + 2, 6, T); this.addStatic(0, 3, A + T / 2, A * 2 + 2, 6, T);
    this.addStatic(-A - T / 2, 3, 0, T, 6, A * 2); this.addStatic(A + T / 2, 3, 0, T, 6, A * 2);
    if (this.mode === 'small') {
      this.addObj(1, SMALL_SEQ[round % SMALL_SEQ.length], (rand() - 0.5) * 3, 1, (rand() - 0.5) * 2, rand() * Math.PI);
      return;
    }
    if (this.mode === 'random') return this.buildRandom(rand, A);
    // divider at z=0 with a doorway
    const door = (rand() - 0.5) * 20, dw = 5;
    const left = door - dw / 2 + A, right = A - (door + dw / 2);
    this.addStatic(-A + left / 2, WALL_H / 2, 0, left, WALL_H, 0.6);
    this.addStatic(A - right / 2, WALL_H / 2, 0, right, WALL_H, 0.6);
    for (let i = 0; i < 3; i++) this.addStatic((rand() - 0.5) * 30, WALL_H / 2, 4 + rand() * 10, 1.5 + rand() * 3, WALL_H, 0.6); // seeker-side cover
    // movable objects scattered in the hiders' half (z<0) plus a couple on the seekers' side
    let id = 1;
    const place = (type, n, zmin, zmax) => { for (let i = 0; i < n; i++) this.addObj(id++, type, (rand() - 0.5) * 30, 2 + i * 0.01, zmin + rand() * (zmax - zmin), rand() * Math.PI); };
    place('box', 6, -16, -3); place('wall', 3, -16, -3); place('ramp', 3, -16, -3);
    place('ramp', 1, 3, 16); place('box', 2, 3, 16);
  }
  // Open-ended arena like the video's later stages: random rooms, doorways, loose walls and a random pile of objects.
  buildRandom(rand, A) {
    const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1)), between = (lo, hi) => lo + rand() * (hi - lo);
    // a wall along one axis with a doorway; `ax` 'x' runs along x at z=pos, 'z' runs along z at x=pos
    const divider = (ax, pos, from, to, doorC, doorW) => {
      const seg = (a, b) => { if (b - a < 0.3) return; const m = (a + b) / 2, l = b - a; ax === 'x' ? this.addStatic(m, WALL_H / 2, pos, l, WALL_H, 0.6) : this.addStatic(pos, WALL_H / 2, m, 0.6, WALL_H, l); };
      seg(from, doorC - doorW / 2); seg(doorC + doorW / 2, to);
    };
    const zLim = A - 7; // keep both spawn rows (the outer ~6m on z) clear
    divider('x', between(-3, 3), -A, A, between(-A + 5, A - 5), between(4, 6.5));
    const optional = []; // walls we may drop again if they cut the arena in two
    for (let i = 0, n = int(0, 2); i < n; i++) {
      const before = this.statics.length;
      const xv = between(-A * 0.6, A * 0.6), z0 = between(-zLim, -2), z1 = between(2, zLim), dc = between(z0 + 2, z1 - 2);
      divider('z', xv, z0, z1, dc, between(3.5, 5));
      optional.push(...this.statics.slice(before));
    }
    for (let i = 0, n = int(2, 5); i < n; i++) { // loose wall segments
      const len = between(2, 5), alongX = rand() < 0.5, x = between(-A + 4, A - 4), z = between(-zLim, zLim);
      alongX ? this.addStatic(x, WALL_H / 2, z, len, WALL_H, 0.6) : this.addStatic(x, WALL_H / 2, z, 0.6, WALL_H, len);
      optional.unshift(this.statics[this.statics.length - 1]); // loose walls are dropped first
    }
    // both spawn areas must stay connected: drop optional walls (loose ones first) until a route exists
    const connected = () => { this.version++; return !!findPath(this, { x: 0, z: -(A - 3) }, { x: 0, z: A - 3 }); };
    while (!connected() && optional.length) { const st = optional.shift(); this.world.removeBody(st.body); this.statics.splice(this.statics.indexOf(st), 1); }
    const free = (x, z) => this.statics.every(st => st.y < 0 || st.sy > 5 || Math.abs(x - st.x) > st.sx / 2 + 1.6 || Math.abs(z - st.z) > st.sz / 2 + 1.6);
    let id = 1;
    const place = (type, n, zmin, zmax) => {
      for (let i = 0; i < n; i++) for (let t = 0; t < 30; t++) {
        const x = between(-A + 2.5, A - 2.5), z = between(zmin, zmax);
        if (free(x, z) || t === 29) { this.addObj(id++, type, x, 1.5 + i * 0.01, z, rand() * Math.PI); break; }
      }
    };
    const own = [-A + 2.5, -1.5], far = [1.5, A - 2.5];
    place('box', int(3, 6), ...own); place('plank', int(2, 4), ...own); place('ramp', int(1, 3), ...own); place('wall', int(0, 2), ...own);
    place('box', int(1, 2), ...far); place('ramp', int(0, 1), ...far); place('plank', int(0, 1), ...far);
  }
  layout() {
    return { arena: this.A, mode: this.mode, statics: this.statics.map(({ x, y, z, sx, sy, sz }) => ({ x, y, z, sx, sy, sz })),
      objs: this.objs.map(o => ({ id: o.id, type: o.type, size: OBJ_TYPES[o.type].size })) };
  }

  // ---- players ------------------------------------------------------------
  addPlayer(id, name, team = 'S') {
    const p = { id, name, team: this.match && team !== 'S' ? 'S' : team, input: { mx: 0, mz: 0, yaw: 0, pitch: 0, jump: false },
      body: null, held: null, holdDist: 2.5, seen: false };
    this.players.set(id, p); if (p.team === 'A' || p.team === 'B') this.makeBody(p); return p;
  }
  makeBody(p) {
    if (p.body) return;
    const body = new C.Body({ mass: 4, material: this.mPlayer, fixedRotation: true, allowSleep: false, linearDamping: 0.05, collisionFilterGroup: G_PLAYER, collisionFilterMask: G_OBS | G_PLAYER });
    body.addShape(new C.Sphere(0.5)); body.position.set(0, 0.6, 0);
    this.world.addBody(body); p.body = body;
  }
  removePlayer(id) {
    const p = this.players.get(id); if (!p) return;
    this.release(p); if (p.body) this.world.removeBody(p.body); this.players.delete(id);
  }
  setTeam(id, team) {
    const p = this.players.get(id); if (!p || this.match) return;
    p.team = team;
    if (team === 'S') { if (p.body) { this.world.removeBody(p.body); p.body = null; } } else this.makeBody(p);
  }
  setInput(id, i) { const p = this.players.get(id); if (p) Object.assign(p.input, i); }
  eye(p) { const b = p.body.position; return new C.Vec3(b.x, b.y + EYE - 0.5, b.z); }

  // ---- actions --------------------------------------------------------------
  lookTarget(p, dist = 5) {
    const f = forward(p.input.yaw, p.input.pitch), from = this.eye(p);
    const to = new C.Vec3(from.x + f.x * dist, from.y + f.y * dist, from.z + f.z * dist);
    const res = new C.RaycastResult();
    this.world.raycastClosest(from, to, { collisionFilterMask: G_OBS, skipBackfaces: true }, res);
    return res.hasHit ? { obj: this.objs.find(o => o.body === res.body), dist: res.distance } : null;
  }
  release(p) { if (p.held) { p.held.heldBy = null; p.held = null; } }
  action(id, a) {
    const p = this.players.get(id);
    if (!p || !p.body || !this.match || (this.match.phase !== 'prep' && this.match.phase !== 'seek')) return;
    if (this.match.phase === 'prep' && roleOf(this.match, p.team) === 'seeker') return;
    if (a === 'grab') {
      if (p.held) return this.release(p);
      const t = this.lookTarget(p, 4.5);
      if (t && t.obj && !t.obj.locked && !t.obj.heldBy) { t.obj.heldBy = p; p.held = t.obj; p.holdDist = Math.min(4.5, Math.max(1.9, t.dist + 0.6)); }
    } else if (a === 'lock') {
      const o = p.held || (this.lookTarget(p, 4.5) || {}).obj;
      if (!o) return;
      if (o.locked) { if (canUnlock(o, p.team)) this.unlock(o); }
      else if (canLock(o)) this.lock(o, p.team);
    }
  }
  lock(o, team) {
    if (o.heldBy) this.release(o.heldBy);
    o.locked = true; o.lockedBy = team;
    o.body.velocity.setZero(); o.body.angularVelocity.setZero();
    o.body.type = C.Body.STATIC; o.body.mass = 0; o.body.updateMassProperties();
  }
  unlock(o) {
    o.locked = false; o.lockedBy = null;
    o.body.type = C.Body.DYNAMIC; o.body.mass = o.mass; o.body.updateMassProperties(); o.body.wakeUp();
  }

  // ---- match ----------------------------------------------------------------
  start() {
    const list = [...this.players.values()].filter(p => p.team === 'A' || p.team === 'B');
    this.match = createMatch(list); this.resetRound(); return this.match;
  }
  resetRound() {
    for (const p of this.players.values()) this.release(p);
    this.buildLevel(this.match.round);
    const n = { hider: 0, seeker: 0 };
    for (const p of this.players.values()) {
      if (!p.body) continue;
      const role = roleOf(this.match, p.team), k = n[role]++;
      p.body.position.set(Math.max(-this.A + 2, Math.min(this.A - 2, -8 + (k % 8) * 2.2)) * (this.mode === 'small' ? 0.5 : 1), 0.6, (role === 'hider' ? -1 : 1) * (this.A - 3));
      p.body.velocity.setZero(); p.spawnYaw = p.input.yaw = role === 'hider' ? Math.PI : 0; // face the divider / centre
    }
    this.events.push('layout');
  }
  endMatch() {
    for (const p of this.players.values()) { this.release(p); if (p.team === 'S') this.setTeamForce(p); }
    this.match = null; this.buildLevel(0);
  }
  setTeamForce(p) { p.team = [...this.players.values()].filter(q => q.team === 'A').length <= [...this.players.values()].filter(q => q.team === 'B').length ? 'A' : 'B'; this.makeBody(p); }
  grounded(p) {
    const from = p.body.position, to = new C.Vec3(from.x, from.y - 0.65, from.z), res = new C.RaycastResult();
    this.world.raycastClosest(from, to, { collisionFilterMask: G_OBS, skipBackfaces: true }, res);
    return res.hasHit ? res.body : null;
  }
  blocked(seeker, hider) {
    const from = this.eye(seeker), to = hider.body.position;
    return this.losBlocked(from.x, from.y, from.z, to.x, to.y, to.z);
  }
  // true if a wall or object is between the two points
  losBlocked(x, y, z, tx, ty, tz) {
    const res = new C.RaycastResult();
    this.world.raycastClosest(new C.Vec3(x, y, z), new C.Vec3(tx, ty, tz), { collisionFilterMask: G_OBS, skipBackfaces: true }, res);
    return res.hasHit;
  }
  anyHiderSeen() {
    const ps = [...this.players.values()].filter(p => p.body);
    const seekers = ps.filter(p => roleOf(this.match, p.team) === 'seeker'), hiders = ps.filter(p => roleOf(this.match, p.team) === 'hider');
    let any = false;
    for (const h of hiders) {
      h.seen = false;
      for (const s of seekers) {
        const a = { ...this.eye(s), yaw: s.input.yaw, pitch: s.input.pitch };
        if (canSee(a, h.body.position, this.blocked(s, h))) { h.seen = true; any = true; break; }
      }
    }
    return any;
  }
  step(dt) {
    const m = this.match, live = m && (m.phase === 'prep' || m.phase === 'seek');
    for (const p of this.players.values()) {
      if (!p.body) continue;
      const role = m ? roleOf(m, p.team) : null;
      const frozen = !live || (m.phase === 'prep' && role === 'seeker');
      const i = p.input, f = forward(i.yaw, 0), rx = Math.cos(i.yaw), rz = -Math.sin(i.yaw);
      const g = this.grounded(p), gv = g ? g.velocity : { x: 0, z: 0 };
      const carry = p.held ? Math.max(0.55, 1 - 0.07 * p.held.mass) : 1; // heavier things slow you down
      let tx = 0, tz = 0;
      if (!frozen) { const len = Math.hypot(i.mx, i.mz) || 1, k = Math.min(1, Math.hypot(i.mx, i.mz)); tx = (f.x * i.mz + rx * i.mx) / len * SPEED * k * carry; tz = (f.z * i.mz + rz * i.mx) / len * SPEED * k * carry; }
      const a = g ? 0.35 : 0.08, v = p.body.velocity;
      v.x += (tx + gv.x - v.x) * a; v.z += (tz + gv.z - v.z) * a;
      if (!frozen && i.jump && g) v.y = JUMP + (g.velocity.y > 0 ? g.velocity.y : 0);
      if (p.held) {
        const o = p.held, e = this.eye(p), hf = forward(i.yaw, i.pitch);
        const tgt = new C.Vec3(e.x + hf.x * p.holdDist, Math.max(0.7, e.y + hf.y * p.holdDist), e.z + hf.z * p.holdDist);
        const d = tgt.vsub(o.body.position);
        if (d.length() > 7 || frozen) this.release(p);
        else { o.body.wakeUp(); d.scale(10, o.body.velocity); const s = o.body.velocity.length(); if (s > 13) o.body.velocity.scale(13 / s, o.body.velocity); o.body.angularVelocity.setZero(); }
      }
    }
    this.world.step(1 / 60, dt, 4);
    if (live) {
      const ev = tick(m, dt, this.anyHiderSeen());
      if (ev === 'prep') this.resetRound();
      if (ev) this.events.push(ev);
    } else if (m) tick(m, dt, false), (m.phase === 'prep' && this.resetRound());
  }
  drainEvents() { const e = this.events; this.events = []; return e; }
  snapshot() {
    const m = this.match;
    return {
      phase: m ? m.phase : 'lobby', t: m ? r2(m.t) : 0, round: m ? m.round : 0, hiderTeam: m ? m.hiderTeam : null,
      scores: m ? { A: r2(m.scores.A), B: r2(m.scores.B) } : { A: 0, B: 0 }, rs: m ? { hide: r2(m.roundScore.hide), seek: r2(m.roundScore.seek) } : null,
      players: [...this.players.values()].map(p => p.body
        ? { id: p.id, n: p.name, tm: p.team, x: r2(p.body.position.x), y: r2(p.body.position.y), z: r2(p.body.position.z), yw: r2(p.input.yaw), pt: r2(p.input.pitch), h: p.held ? p.held.id : 0, sn: p.seen ? 1 : 0 }
        : { id: p.id, n: p.name, tm: p.team }),
      objs: this.objs.map(o => { const b = o.body, q = b.quaternion; return [o.id, r2(b.position.x), r2(b.position.y), r2(b.position.z), r2(q.x), r2(q.y), r2(q.z), r2(q.w), o.locked ? (o.lockedBy === 'A' ? 1 : 2) : 0]; }),
    };
  }
}
export { CFG };
