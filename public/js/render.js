// Visual style modelled on OpenAI's "Multi-Agent Hide and Seek" video:
// white tiled floor, grey cube-rubble border, gold boxes/ramps, blue hiders, red seekers, blue sky with low-poly clouds.
import * as THREE from 'three';
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
  const g = new THREE.Group(), skin = new THREE.MeshStandardMaterial({ color: BLUE, roughness: 0.4, emissive: BLUE, emissiveIntensity: 0.22 });
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
    g.add(pivot); return pivot;
  };
  const legs = [limb(-0.09, -0.2, 0.16, 0.06, 0), limb(0.09, -0.2, 0.16, 0.06, 0)];
  const arms = [limb(-0.2, 0.14, 0.2, 0.05, -0.55), limb(0.2, 0.14, 0.2, 0.05, 0.55)];
  const emblem = mesh(new THREE.TorusKnotGeometry(0.05, 0.011, 64, 8, 3, 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, toneMapped: false }));
  emblem.position.set(0, 0.04, -0.15); emblem.rotation.x = Math.PI / 2; g.add(emblem); // little chest badge like the video's agents
  const blob = new THREE.Mesh(new THREE.CircleGeometry(0.62, 24), new THREE.MeshBasicMaterial({ map: blobTex(), transparent: true, depthWrite: false, toneMapped: false }));
  blob.rotation.x = -Math.PI / 2; blob.position.y = -0.47; g.add(blob); // soft contact shadow
  const t = tag(name); t.position.y = 1.35;
  g.add(torso, head, t);
  return { g, skin, grin, legs, arms, head, tag: t, tp: new THREE.Vector3(), init: false, walk: 0 };
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
  setLayout(layout) {
    if (layout.arena !== this.A) this.buildArena(layout.arena);
    this.world.clear(); this.objs.clear();
    for (const s of layout.statics) {
      if (s.y < 0 || s.sy > 5) continue; // floor and invisible boundary are drawn by the environment
      const m = new THREE.Mesh(new THREE.BoxGeometry(s.sx, s.sy, s.sz), new THREE.MeshStandardMaterial({ color: WALL, roughness: 0.7 }));
      m.position.set(s.x, s.y, s.z); m.receiveShadow = m.castShadow = true; this.world.add(m);
    }
    for (const o of layout.objs) {
      const geo = o.type === 'ramp' ? wedgeGeo(o.size) : new THREE.BoxGeometry(...o.size);
      const mat = new THREE.MeshStandardMaterial({ color: GOLD, roughness: 0.5, flatShading: o.type === 'ramp', side: THREE.DoubleSide });
      const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true; this.world.add(m);
      this.objs.set(o.id, { m, tp: new THREE.Vector3(), tq: new THREE.Quaternion(), init: false });
    }
  }
  // snap: latest snapshot; me: my id; look: {yaw, pitch, cam: 'chase' | 'top' | 'first'}
  update(snap, me, look, dt) {
    const k = damp(dt, 22), hid = snap.hiderTeam || 'A';
    const teamHex = n => ((n === 1 ? 'A' : 'B') === hid ? LOCK_BLUE : LOCK_RED);
    const held = new Set(snap.players.map(p => p.h).filter(Boolean));
    for (const a of snap.objs) {
      const o = this.objs.get(a[0]); if (!o) continue;
      o.tp.set(a[1], a[2], a[3]); o.tq.set(a[4], a[5], a[6], a[7]);
      if (!o.init) { o.m.position.copy(o.tp); o.m.quaternion.copy(o.tq); o.init = true; }
      o.m.position.lerp(o.tp, k); o.m.quaternion.slerp(o.tq, k);
      o.m.material.color.setHex(a[8] ? teamHex(a[8]) : GOLD);
      o.m.material.emissive.setHex(held.has(a[0]) ? 0x554000 : 0);
    }
    const mineP = snap.players.find(p => p.id === me), myTeam = mineP && mineP.tm, iSeek = mineP && mineP.x !== undefined && myTeam !== hid;
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
      const before = e.g.position.clone(); e.g.position.lerp(e.tp, k);
      const sp = Math.hypot(e.g.position.x - before.x, e.g.position.z - before.z) / Math.max(dt, 1e-3);
      e.walk += sp * dt * 3.2; const sw = Math.sin(e.walk) * Math.min(1, sp / 3) * 0.8;
      e.legs[0].rotation.x = sw; e.legs[1].rotation.x = -sw; e.arms[0].rotation.x = -sw; e.arms[1].rotation.x = sw;
      e.g.rotation.y = p.yw; e.head.rotation.x = p.pt * 0.5;
      // From the elevated camera a seeker only gets to see a hider that some seeker's eyes can actually see.
      const concealed = look.cam !== 'first' && iSeek && hider && live && !p.sn;
      e.g.visible = !(p.id === me && look.cam === 'first') && !concealed;
      e.tag.visible = p.tm === myTeam && p.id !== me;
      if (p.id === me) mine = e;
    }
    for (const [id, e] of this.players) if (!seen.has(id)) { this.scene.remove(e.g); this.players.delete(id); }
    if (mine && look.cam === 'top') { // overhead view like the video's "Shelter Construction" shot
      const P = mine.g.position, c = v => Math.max(-this.A - 2, Math.min(this.A + 2, v));
      this.cam.position.set(c(P.x), P.y + this.A * 0.7 + 4, c(P.z) + this.A * 0.42 + 2.5); this.cam.lookAt(c(P.x) * 0.9, 0, c(P.z) * 0.9);
    } else if (mine && look.cam === 'chase') { // elevated chase camera
      const P = mine.g.position, fx = -Math.sin(look.yaw), fz = -Math.cos(look.yaw), c = v => Math.max(-this.A + 0.6, Math.min(this.A - 0.6, v));
      this.cam.position.set(c(P.x - fx * 6), P.y + 4.6, c(P.z - fz * 6));
      this.cam.lookAt(P.x + fx * 2.5, P.y + 0.4 + look.pitch * 5, P.z + fz * 2.5);
    } else if (mine) {
      this.cam.position.set(mine.g.position.x, mine.g.position.y + 0.4, mine.g.position.z);
      this.cam.rotation.set(look.pitch, look.yaw, 0);
    } else { // lobby / spectator: slow overhead orbit
      this.orbit += dt * 0.08;
      const od = Math.max(14, this.A * 1.35); this.cam.position.set(Math.cos(this.orbit) * od, od, Math.sin(this.orbit) * od); this.cam.lookAt(0, 0, 0);
    }
    this.r.render(this.scene, this.cam);
  }
}
