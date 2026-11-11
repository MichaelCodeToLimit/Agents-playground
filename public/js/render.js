// Visual style modelled on OpenAI's "Multi-Agent Hide and Seek" video:
// white tiled floor, grey cube-rubble border, gold boxes/ramps, blue hiders, red seekers, blue sky with low-poly clouds.
import * as THREE from 'three';
import { chaseRig } from './camera.js';
const BLUE = 0x27a8ec, RED = 0xf5352a, GOLD = 0xf7b413, WALL = 0xe0e1e5, LOCK_BLUE = 0xa6d8f7, LOCK_RED = 0xf8aaa2;
const damp = (dt, k) => 1 - Math.exp(-dt * k);
const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

function wedgeGeo([w, h, l]) {
  const x = w / 2, y = h / 2, z = l / 2;
  const v = [[-x,-y,-z],[x,-y,-z],[x,-y,z],[-x,-y,z],[-x,y,z],[x,y,z]];
  const tris = [[0,1,2],[0,2,3],[3,2,5],[3,5,4],[0,1,5],[0,5,4],[0,3,4],[1,5,2]];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat().flatMap(i => v[i]), 3));
  g.computeVertexNormals(); return g;
}
function tag(text) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d');
  x.font = '600 32px system-ui, sans-serif'; x.textAlign = 'center'; x.fillStyle = '#3d3a7c'; x.strokeStyle = '#fff'; x.lineWidth = 7;
  x.strokeText(text, 128, 44); x.fillText(text, 128, 44);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), fog: false, toneMapped: false }));
  s.scale.set(2, 0.5, 1); return s;
}
function blobTex() {
  if (blobTex.t) return blobTex.t;
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 2, 32, 32, 32);
  g.addColorStop(0, 'rgba(30,30,50,.55)'); g.addColorStop(1, 'rgba(30,30,50,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return (blobTex.t = new THREE.CanvasTexture(c));
}
function lockTex(hex) {
  lockTex.c = lockTex.c || {}; if (lockTex.c[hex]) return lockTex.c[hex];
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'), col = '#' + hex.toString(16).padStart(6, '0');
  x.fillStyle = 'rgba(255,255,255,.92)'; x.beginPath(); x.arc(64, 64, 58, 0, 7); x.fill();           // white badge
  x.strokeStyle = '#33305f'; x.lineWidth = 10; x.lineCap = 'round'; x.beginPath(); x.arc(64, 52, 18, Math.PI, 0); x.moveTo(46, 52); x.lineTo(46, 62); x.moveTo(82, 52); x.lineTo(82, 62); x.stroke(); // shackle
  x.fillStyle = col; x.strokeStyle = '#33305f'; x.lineWidth = 6; x.beginPath(); x.roundRect(34, 60, 60, 44, 9); x.fill(); x.stroke();
  x.fillStyle = '#33305f'; x.beginPath(); x.arc(64, 78, 7, 0, 7); x.fill(); x.fillRect(61, 80, 6, 14);                                      // keyhole
  return (lockTex.c[hex] = new THREE.CanvasTexture(c));
}
function puffTex() {
  if (puffTex.t) return puffTex.t;
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return (puffTex.t = new THREE.CanvasTexture(c));
}
function floorTex(n) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 256, 256); g.addColorStop(0, '#f1f2f5'); g.addColorStop(1, '#e4e6ea');
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  x.fillStyle = 'rgba(255,255,255,.5)'; x.fillRect(5, 5, 246, 246); // soft bevel inside each tile
  x.strokeStyle = '#2b2e38'; x.lineWidth = 3; x.strokeRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(n, n); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
function skyTex() {
  const c = document.createElement('canvas'); c.width = 4; c.height = 256; const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#0b46a8'); g.addColorStop(0.3, '#1f6fd0'); g.addColorStop(0.48, '#86bdee'); g.addColorStop(0.55, '#cfe4f6'); g.addColorStop(1, '#cfe4f6');
  x.fillStyle = g; x.fillRect(0, 0, 4, 256); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// Round-headed little character like the video's agents. Origin = physics sphere centre (0.5 above the ground).
function makeAgent(name) {
  const g = new THREE.Group(), rig = new THREE.Group(), skin = new THREE.MeshStandardMaterial({ color: BLUE, roughness: 0.4, emissive: BLUE, emissiveIntensity: 0.22 });
  const glow = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, fog: false, toneMapped: false });
  const mesh = (geo, m = skin) => { const o = new THREE.Mesh(geo, m); o.castShadow = m === skin; return o; };
  const torso = mesh(new THREE.CapsuleGeometry(0.15, 0.2, 4, 12)); torso.position.y = -0.02; torso.scale.set(1.1, 1, 0.85);
  const head = new THREE.Group(); head.position.y = 0.55; head.scale.setScalar(1.12);
  const skull = mesh(new THREE.SphereGeometry(0.4, 28, 20)); skull.scale.set(1.08, 0.86, 0.95); head.add(skull);
  for (const sx of [-1, 1]) { // happy "closed" glowing eyes
    const eye = mesh(new THREE.TorusGeometry(0.085, 0.03, 8, 16, Math.PI), glow); eye.position.set(sx * 0.16, 0.03, -0.365); eye.rotation.y = sx * -0.35; head.add(eye);
  }
  const grin = mesh(new THREE.CircleGeometry(0.17, 20, Math.PI, Math.PI), glow); grin.position.set(0, -0.07, -0.37); grin.rotation.x = -0.5; head.add(grin);
  const limb = (x, y, len, r, tilt) => {
    const pivot = new THREE.Group(); pivot.position.set(x, y, 0); pivot.rotation.z = tilt;
    const m = mesh(new THREE.CapsuleGeometry(r, len, 4, 8)); m.position.y = -len / 2 - r * 0.5; pivot.add(m);
    const end = mesh(new THREE.SphereGeometry(r * 1.45, 10, 8)); end.position.y = -len - r; pivot.add(end);
    rig.add(pivot); return pivot;
  };
  const legs = [limb(-0.09, -0.2, 0.16, 0.06, 0), limb(0.09, -0.2, 0.16, 0.06, 0)];
  const arms = [limb(-0.2, 0.14, 0.2, 0.05, -0.55), limb(0.2, 0.14, 0.2, 0.05, 0.55)];
  const emblem = mesh(new THREE.TorusKnotGeometry(0.05, 0.011, 64, 8, 3, 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, toneMapped: false }));
  emblem.position.set(0, 0.04, -0.15); emblem.rotation.x = Math.PI / 2; rig.add(emblem); // little chest badge like the video's agents
  const blob = new THREE.Mesh(new THREE.CircleGeometry(0.62, 24), new THREE.MeshBasicMaterial({ map: blobTex(), transparent: true, depthWrite: false, toneMapped: false }));
  blob.rotation.x = -Math.PI / 2; blob.position.y = -0.47; g.add(blob); // soft contact shadow
  const t = tag(name); t.position.y = 1.35;
  rig.add(torso, head); g.add(rig, t);
  return { g, rig, skin, grin, legs, arms, head, tag: t, tp: new THREE.Vector3(), init: false, walk: 0, prev: null, vx: 0, vy: 0, vz: 0, hsp: 0, stepT: 0, squash: 0, h: 0, sn: 0, armX: 0, legX: 0, armZ: 0.55, beam: null };
}

export class View {
  constructor(canvas) {
    this.r = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.r.toneMapping = THREE.ACESFilmicToneMapping; this.r.toneMappingExposure = 1.25; this.r.shadowMap.enabled = true; this.r.shadowMap.type = THREE.PCFSoftShadowMap; this.r.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.scene = new THREE.Scene(); this.scene.fog = new THREE.Fog(0xcfe4f6, 70, 170);
    this.cam = new THREE.PerspectiveCamera(60, 1, 0.1, 400); this.cam.rotation.order = 'YXZ';
    this.scene.add(new THREE.HemisphereLight(0xeaf3ff, 0xc9ced8, 1.7));
    const sun = new THREE.DirectionalLight(0xfff6e8, 1.9); sun.position.set(18, 34, 12); sun.castShadow = true;
    Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 90 }); sun.shadow.mapSize.set(2048, 2048); sun.shadow.radius = 4;
    this.scene.add(sun);
    this.buildSky(); this.env = new THREE.Group(); this.scene.add(this.env); this.A = 0;
    this.world = new THREE.Group(); this.scene.add(this.world);
    this.objs = new Map(); this.players = new Map(); this.orbit = 0.6;
    this.events = []; this.puffs = []; this.shake = 0; this.hover = null; this.ray = new THREE.Raycaster(); this.lastSnap = null; this.lastT = performance.now(); this.t = 0;
    addEventListener('resize', () => this.resize()); this.resize();
  }
  buildSky() {
    const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 24, 16), new THREE.MeshBasicMaterial({ map: skyTex(), side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false }));
    this.scene.add(sky);
    const cm = new THREE.MeshStandardMaterial({ color: 0xf4f7fb, flatShading: true, fog: false, roughness: 1, emissive: 0x9fb4cc, emissiveIntensity: 0.35 }), cg = new THREE.IcosahedronGeometry(1, 0);
    for (let i = 0; i < 22; i++) { // low-poly clouds
      const c = new THREE.Group(), a = hash(i) * Math.PI * 2, d = 80 + hash(i + 50) * 110;
      for (let j = 0; j < 4; j++) { const m = new THREE.Mesh(cg, cm); m.position.set((j - 1.5) * 7 + hash(i * 9 + j) * 3, hash(i * 5 + j) * 2, hash(i * 3 + j) * 5); m.scale.set(7 + hash(i + j * 7) * 6, 2.2 + hash(i * 2 + j) * 2, 5 + hash(i + j) * 4); m.rotation.y = hash(i + j * 3) * 3; c.add(m); }
      c.position.set(Math.cos(a) * d, 26 + hash(i + 20) * 34, Math.sin(a) * d); c.rotation.y = -a; this.scene.add(c);
    }
  }
  buildArena(A) {
    this.A = A; this.env.clear();
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(A * 2, A * 2), new THREE.MeshStandardMaterial({ map: floorTex(A), roughness: 0.55 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; this.env.add(floor);
    // border: field of grey cubes of random heights
    const cells = []; const S = 1, R = A + 26;
    for (let x = -R; x < R; x += S) for (let z = -R; z < R; z += S) if (Math.abs(x + 0.5) > A || Math.abs(z + 0.5) > A) cells.push([x + 0.5, z + 0.5]);
    const rub = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }), cells.length);
    const M = new THREE.Matrix4(), col = new THREE.Color();
    cells.forEach(([x, z], i) => {
      const edge = Math.max(Math.abs(x), Math.abs(z)) - A, h = 0.35 + Math.floor(hash(x * 13.7 + z * 71.3) * 4) * 0.45 * Math.min(1.6, 0.7 + edge / 10);
      M.makeScale(S, h, S).setPosition(x, h / 2, z); rub.setMatrixAt(i, M);
      rub.setColorAt(i, col.setScalar(0.5 + hash(x * 3.1 + z * 7.7) * 0.2));
    });
    rub.castShadow = false; rub.receiveShadow = true; rub.frustumCulled = false; this.env.add(rub); // far border: no shadow casting (cheap)
  }
  resize() { this.r.setSize(innerWidth, innerHeight, false); this.cam.aspect = innerWidth / innerHeight; this.cam.updateProjectionMatrix(); }
  drainEvents() { const e = this.events; this.events = []; return e; }
  puff(x, y, z, n = 6, power = 1) { // little dust cloud
    for (let i = 0; i < n && this.puffs.length < 80; i++) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex(), color: 0xe9e9ef, transparent: true, depthWrite: false, toneMapped: false, opacity: 0.55 }));
      const a = Math.random() * 6.28, sp = (0.6 + Math.random()) * power; m.position.set(x + Math.cos(a) * 0.2, y + 0.08, z + Math.sin(a) * 0.2);
      this.scene.add(m); this.puffs.push({ m, vx: Math.cos(a) * sp, vy: 0.5 + Math.random() * power * 0.6, vz: Math.sin(a) * sp, t: 0, life: 0.5 + Math.random() * 0.3, s0: 0.25 + power * 0.12 });
    }
  }
  setLayout(layout) {
    if (layout.arena !== this.A) this.buildArena(layout.arena);
    this.world.clear(); this.objs.clear(); this.hover = null; this.quiet = 2.5; // objects drop in at round start: no impact sounds meanwhile
    for (const s of layout.statics) {
      if (s.y < 0 || s.sy > 5) continue; // floor and invisible boundary are drawn by the environment
      const m = new THREE.Mesh(new THREE.BoxGeometry(s.sx, s.sy, s.sz), new THREE.MeshStandardMaterial({ color: WALL, roughness: 0.7 }));
      m.position.set(s.x, s.y, s.z); m.receiveShadow = m.castShadow = true; this.world.add(m);
    }
    for (const o of layout.objs) {
      const geo = o.type === 'ramp' ? wedgeGeo(o.size) : new THREE.BoxGeometry(...o.size);
      const mat = new THREE.MeshStandardMaterial({ color: GOLD, roughness: 0.5, flatShading: o.type === 'ramp', side: THREE.DoubleSide });
      const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true; m.userData.id = o.id; this.world.add(m);
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: lockTex(LOCK_BLUE), transparent: true, toneMapped: false })); spr.scale.set(0.75, 0.75, 1); spr.visible = false; this.world.add(spr);
      this.objs.set(o.id, { m, spr, top: o.size[1] / 2, tp: new THREE.Vector3(), tq: new THREE.Quaternion(), init: false, prev: null, vel: 0, lock: 0 });
    }
  }
  // snap: latest snapshot; me: my id; look: {yaw, pitch, cam: 'chase' | 'top' | 'first'}
  update(snap, me, look, dt) {
    const k = damp(dt, 22), hid = snap.hiderTeam || 'A', now = performance.now(); this.t += dt;
    this.quiet = Math.max(0, (this.quiet || 0) - dt);
    const fresh = snap !== this.lastSnap, sdt = Math.max(0.016, (now - this.lastT) / 1000); if (fresh) { this.lastSnap = snap; this.lastT = now; }
    const teamHex = n => ((n === 1 ? 'A' : 'B') === hid ? LOCK_BLUE : LOCK_RED);
    const holders = new Map(snap.players.filter(p => p.h).map(p => [p.h, p.id]));
    const mineP = snap.players.find(p => p.id === me), myTeam = mineP && mineP.tm, iSeek = mineP && mineP.x !== undefined && myTeam !== hid;
    const hovered = this.hover && this.hover.id;
    for (const a of snap.objs) {
      const o = this.objs.get(a[0]); if (!o) continue;
      o.tp.set(a[1], a[2], a[3]); o.tq.set(a[4], a[5], a[6], a[7]);
      if (!o.init) { o.m.position.copy(o.tp); o.m.quaternion.copy(o.tq); o.init = true; o.lock = a[8]; }
      if (fresh) { // impact + lock events from snapshot differences
        const v = o.prev ? Math.hypot(a[1] - o.prev[0], a[2] - o.prev[1], a[3] - o.prev[2]) / sdt : 0;
        if (!this.quiet && o.vel > 3 && v < o.vel * 0.35 && !holders.has(a[0]) && !a[8]) { this.events.push({ type: 'impact', x: a[1], y: a[2], z: a[3], v: o.vel }); if (o.vel > 4.5) this.puff(a[1], a[2] - o.top, a[3], 5, Math.min(1.6, o.vel / 6)); }
        o.vel = o.vel * 0.4 + v * 0.6; o.prev = [a[1], a[2], a[3]];
        if (a[8] !== o.lock) { this.events.push({ type: a[8] ? 'lock' : 'unlock', x: a[1], y: a[2], z: a[3] }); o.lock = a[8]; }
      }
      o.m.position.lerp(o.tp, k); o.m.quaternion.slerp(o.tq, k);
      const mat = o.m.material; mat.color.setHex(a[8] ? teamHex(a[8]) : GOLD);
      mat.emissive.setHex(holders.has(a[0]) ? 0x6a4c00 : a[0] === hovered ? (a[8] ? 0x2a3a48 : 0x4a3500) : 0);
      o.spr.visible = !!a[8];
      if (a[8]) { o.spr.material.map = lockTex(teamHex(a[8])); o.spr.position.set(o.m.position.x, o.m.position.y + o.top + 0.65 + Math.sin(this.t * 2.6 + a[0]) * 0.05, o.m.position.z); }
    }
    const live = snap.phase === 'prep' || snap.phase === 'seek';
    const seen = new Set(); let mine = null;
    for (const p of snap.players) {
      if (p.x === undefined) continue;
      seen.add(p.id);
      let e = this.players.get(p.id);
      if (!e) { e = makeAgent(p.n); this.scene.add(e.g); this.players.set(p.id, e); }
      const hider = p.tm === hid;
      e.skin.color.setHex(hider ? BLUE : RED); e.skin.emissive.setHex(hider ? BLUE : RED); e.grin.visible = !hider;
      e.tp.set(p.x, p.y, p.z); if (!e.init) { e.g.position.copy(e.tp); e.init = true; }
      if (fresh) { // velocity from snapshot differences -> footsteps, jump / landing, grab events
        if (e.prev) {
          const pvy = e.vy, vx = (p.x - e.prev.x) / sdt, vz = (p.z - e.prev.z) / sdt, vy = (p.y - e.prev.y) / sdt;
          e.vx = e.vx * 0.5 + vx * 0.5; e.vz = e.vz * 0.5 + vz * 0.5; e.vy = e.vy * 0.4 + vy * 0.6; e.hsp = Math.hypot(e.vx, e.vz);
          const at = { x: p.x, y: p.y, z: p.z, who: p.id };
          if (pvy < -4 && e.vy > -1.5) { e.squash = Math.min(1, -pvy / 10); this.events.push({ type: 'land', v: -pvy, ...at }); this.puff(p.x, p.y - 0.5, p.z, 6, Math.min(1.4, -pvy / 8)); if (p.id === me) this.shake = Math.min(0.3, -pvy * 0.03); }
          if (pvy < 2.5 && e.vy > 4.5) this.events.push({ type: 'jump', ...at });
          e.stepT -= sdt; if (Math.abs(e.vy) < 1.3 && e.hsp > 1.5 && e.stepT <= 0) { this.events.push({ type: 'step', v: Math.min(1, e.hsp / 5), ...at }); e.stepT = 0.46 - Math.min(0.16, e.hsp * 0.025); }
          if ((p.h || 0) !== e.h) { this.events.push({ type: p.h ? 'grab' : 'release', ...at }); e.h = p.h || 0; }
          if (p.id === me && p.sn && !e.sn && hider) this.events.push({ type: 'seen', ...at });
          e.sn = p.sn || 0;
        }
        e.prev = { x: p.x, y: p.y, z: p.z };
      }
      e.g.position.lerp(e.tp, k);
      // pose: running swing, run lean, jump tuck, landing squash, arms forward while carrying
      const sp = e.hsp, air = Math.abs(e.vy) > 2.4 ? Math.sign(e.vy) : 0;
      e.walk += sp * dt * 3.1; const sw = Math.sin(e.walk) * Math.min(1, sp / 3) * 0.85;
      const legT = air ? (air > 0 ? -0.8 : 0.5) : sw, armT = p.h ? -1.45 : air ? -0.3 : -sw, armZT = p.h ? 0.18 : air ? 1.3 : 0.55;
      const lk = damp(dt, 18); e.legX += (legT - e.legX) * lk; e.armX += (armT - e.armX) * lk; e.armZ += (armZT - e.armZ) * lk;
      e.legs[0].rotation.x = e.legX; e.legs[1].rotation.x = air ? e.legX : -e.legX;
      e.arms[0].rotation.x = e.armX; e.arms[1].rotation.x = p.h ? e.armX : -e.armX; e.arms[0].rotation.z = -e.armZ; e.arms[1].rotation.z = e.armZ;
      e.squash = Math.max(0, e.squash - dt * 5); e.rig.scale.set(1 + 0.14 * e.squash, 1 - 0.2 * e.squash, 1 + 0.14 * e.squash);
      e.rig.rotation.x += (-Math.min(0.2, sp * 0.03) - e.rig.rotation.x) * lk; e.head.position.y = 0.55 + Math.sin(e.walk * 2) * 0.015 * Math.min(1, sp / 3);
      e.g.rotation.y = p.yw; e.head.rotation.x = p.pt * 0.5;
      // grab beam from the carrier's hands to the object it holds
      const ho = p.h && this.objs.get(p.h);
      if (ho) {
        if (!e.beam) { e.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 6), new THREE.MeshBasicMaterial({ color: 0xfff1b0, transparent: true, opacity: 0.7, toneMapped: false, depthWrite: false })); this.scene.add(e.beam); }
        const a0 = new THREE.Vector3(e.g.position.x - Math.sin(p.yw) * 0.35, e.g.position.y + 0.12, e.g.position.z - Math.cos(p.yw) * 0.35), d = ho.m.position.clone().sub(a0), len = d.length();
        e.beam.visible = true; e.beam.position.copy(a0).addScaledVector(d, 0.5); e.beam.scale.set(1 + Math.sin(this.t * 14) * 0.25, len, 1 + Math.sin(this.t * 14) * 0.25); e.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
      } else if (e.beam) e.beam.visible = false;
      // From the elevated camera a seeker only gets to see a hider that some seeker's eyes can actually see.
      const concealed = look.cam !== 'first' && iSeek && hider && live && !p.sn;
      e.g.visible = !(p.id === me && look.cam === 'first') && !concealed;
      if (e.beam && concealed) e.beam.visible = false;
      e.tag.visible = p.tm === myTeam && p.id !== me;
      if (p.id === me) mine = e;
    }
    for (const [id, e] of this.players) if (!seen.has(id)) { this.scene.remove(e.g); if (e.beam) this.scene.remove(e.beam); this.players.delete(id); }
    if (mine && look.cam === 'top') { // overhead view like the video's "Shelter Construction" shot
      const P = mine.g.position, c = v => Math.max(-this.A - 2, Math.min(this.A + 2, v));
      this.cam.position.set(c(P.x), P.y + this.A * 0.7 + 4, c(P.z) + this.A * 0.42 + 2.5); this.cam.lookAt(c(P.x) * 0.9, 0, c(P.z) * 0.9);
    } else if (mine && look.cam === 'chase') { // elevated chase camera: pulls in and rises near walls instead of squashing onto the player
      const P = mine.g.position, r = chaseRig(P, look.yaw, this.A);
      this.cam.position.set(r.pos.x, r.pos.y, r.pos.z); this.cam.lookAt(r.look.x, P.y + 0.4 + look.pitch * 5 - r.squeeze * 0.5, r.look.z);
    } else if (mine) {
      this.cam.position.set(mine.g.position.x, mine.g.position.y + 0.4, mine.g.position.z);
      this.cam.rotation.set(look.pitch, look.yaw, 0);
    } else { // lobby / spectator: slow overhead orbit
      this.orbit += dt * 0.08;
      const od = Math.max(14, this.A * 1.35); this.cam.position.set(Math.cos(this.orbit) * od, od, Math.sin(this.orbit) * od); this.cam.lookAt(0, 0, 0);
    }
    if (mine) { // aim: what would grab / lock act on?
      const o = this.cam.position.clone(); if (look.cam !== 'first') o.set(mine.g.position.x, mine.g.position.y + 0.4, mine.g.position.z);
      const d = new THREE.Vector3(-Math.sin(look.yaw) * Math.cos(look.pitch), Math.sin(look.pitch), -Math.cos(look.yaw) * Math.cos(look.pitch));
      this.ray.set(o, d); this.ray.far = 4.5; const hit = this.ray.intersectObjects(this.world.children.filter(c => c.isMesh), false)[0];
      const id = hit && hit.object.userData.id, a = id && snap.objs.find(q => q[0] === id);
      this.hover = a ? { id, lockTeam: a[8] ? (a[8] === 1 ? 'A' : 'B') : null, mine: !!(mineP && mineP.h === id) } : null;
    } else this.hover = null;
    const fovT = 60 + (mine ? Math.min(7, mine.hsp * 1.1) : 0); this.cam.fov += (fovT - this.cam.fov) * Math.min(1, dt * 6); this.cam.updateProjectionMatrix();
    if (this.shake > 0.002) { this.cam.position.x += (Math.random() - 0.5) * this.shake; this.cam.position.y += (Math.random() - 0.5) * this.shake; this.shake *= Math.exp(-dt * 9); }
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const q = this.puffs[i]; q.t += dt; const f = q.t / q.life;
      if (f >= 1) { this.scene.remove(q.m); q.m.material.dispose(); this.puffs.splice(i, 1); continue; }
      q.m.position.x += q.vx * dt; q.m.position.y += q.vy * dt; q.m.position.z += q.vz * dt; q.vx *= 0.94; q.vz *= 0.94; q.vy *= 0.95;
      q.m.scale.setScalar(q.s0 * (1 + f * 3)); q.m.material.opacity = 0.5 * (1 - f);
    }
    this.r.render(this.scene, this.cam);
  }
}
