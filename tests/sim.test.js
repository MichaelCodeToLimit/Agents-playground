import test from 'node:test';
import assert from 'node:assert/strict';
import { Sim } from '../public/js/sim.js';

function mk() { const s = new Sim(7); s.addPlayer('h', 'Hid', 'A'); s.addPlayer('s', 'Seek', 'B'); s.start(); return s; }
const run = (s, sec) => { for (let i = 0; i < sec * 60; i++) s.step(1 / 60); };

test('start requires both teams', () => {
  const s = new Sim(1); s.addPlayer('a', 'a', 'A'); assert.throws(() => s.start());
});
test('objects settle on the floor and do not fall through', () => {
  const s = mk(); run(s, 3);
  for (const o of s.objs) assert.ok(o.body.position.y > 0.2 && o.body.position.y < 3, o.type + ' y=' + o.body.position.y);
});
test('seekers are frozen during prep, hiders can move', () => {
  const s = mk(); s.setInput('h', { mz: 1 }); s.setInput('s', { mz: 1 });
  const h0 = s.players.get('h').body.position.z, s0 = s.players.get('s').body.position.z;
  run(s, 2);
  assert.ok(Math.abs(s.players.get('h').body.position.z - h0) > 3);
  assert.ok(Math.abs(s.players.get('s').body.position.z - s0) < 0.1);
});
test('lock freezes object; only the locking team can unlock', () => {
  const s = mk(); run(s, 2); const o = s.objs[0];
  s.lock(o, 'A'); assert.equal(o.body.type, 2 /* STATIC */);
  const hp = s.players.get('h'); hp.body.position.set(o.body.position.x, 0.6, o.body.position.z + 2);
  hp.input.yaw = 0; hp.input.pitch = -0.1;
  s.unlock(o); assert.equal(o.locked, false);
});
test('seeker sees hider in open view, not through a wall', () => {
  const s = mk(); run(s, 16); // now seek phase
  assert.equal(s.match.phase, 'seek');
  const h = s.players.get('h'), k = s.players.get('s');
  s.objs.forEach(o => o.body.position.set(0, -50, 0));
  h.body.position.set(15, 0.6, 12); k.body.position.set(15, 0.6, 18); k.input.yaw = 0; k.input.pitch = 0;
  assert.equal(s.anyHiderSeen(), true);
  s.addStatic(15, 1.3, 15, 4, 2.6, 0.6);
  assert.equal(s.anyHiderSeen(), false);
});
test('removing a player releases held objects', () => {
  const s = mk(); const o = s.objs[0], p = s.players.get('h'); o.heldBy = p; p.held = o;
  s.removePlayer('h'); assert.equal(o.heldBy, null);
});
test('snapshot is JSON-serialisable and small', () => {
  const s = mk(); run(s, 1); const j = JSON.stringify(s.snapshot()); assert.ok(j.length < 4000, 'size ' + j.length);
});

test('small mode: tiny arena, exactly one object, a different one each round', () => {
  const s = new Sim(3, 'small'); s.addPlayer('h', 'H', 'A'); s.addPlayer('s', 'S', 'B');
  assert.equal(s.layout().arena, 8);
  s.start(); assert.equal(s.objs.length, 1);
  const types = [s.objs[0].type];
  for (let r = 1; r < 4; r++) { s.match.round = r; s.buildLevel(r); assert.equal(s.objs.length, 1); types.push(s.objs[0].type); }
  assert.deepEqual(types, ['box', 'ramp', 'wall', 'box']);
  for (const p of s.players.values()) assert.ok(Math.abs(p.body.position.z) <= 5.01 && Math.abs(p.body.position.x) <= 8);
});
test('small mode: the object settles inside the arena and players start apart', () => {
  const s = new Sim(3, 'small'); s.addPlayer('h', 'H', 'A'); s.addPlayer('s', 'S', 'B'); s.start();
  run(s, 3); const o = s.objs[0].body.position;
  assert.ok(Math.abs(o.x) < 8 && Math.abs(o.z) < 8 && o.y > 0.2);
  assert.ok(Math.abs(s.players.get('h').body.position.z - s.players.get('s').body.position.z) > 8);
});
test('setMode rebuilds the level only before a match', () => {
  const s = new Sim(1); s.setMode('small'); assert.equal(s.layout().arena, 8); assert.equal(s.objs.length, 1);
  s.addPlayer('h', 'H', 'A'); s.addPlayer('s', 'S', 'B'); s.start(); s.setMode('full'); assert.equal(s.mode, 'small');
});

test('random mode: varied but deterministic arenas; spawn rows stay clear; everything inside the arena', () => {
  const sizes = new Set(), sigs = new Set();
  for (let seed = 1; seed <= 12; seed++) {
    const s = new Sim(seed, 'random'), L = s.layout(); sizes.add(L.arena); sigs.add(JSON.stringify(L.statics.length + ':' + L.objs.length));
    assert.ok(L.arena >= 12 && L.arena <= 21, 'arena ' + L.arena);
    assert.ok(L.objs.length >= 5 && L.objs.length <= 18, 'objs ' + L.objs.length);
    for (const st of L.statics) { if (st.y < 0 || st.sy > 5) continue; assert.ok(Math.abs(st.z) <= L.arena - 6.5 + st.sz / 2, `wall in spawn row z=${st.z}`); assert.ok(Math.abs(st.x) <= L.arena + 0.1, 'wall outside'); }
    for (const o of s.objs) assert.ok(Math.abs(o.body.position.x) < L.arena && Math.abs(o.body.position.z) < L.arena);
    assert.equal(JSON.stringify(new Sim(seed, 'random').layout()), JSON.stringify(L), 'same seed, same level');
  }
  assert.ok(sizes.size >= 4 && sigs.size >= 4, 'layouts should differ across seeds');
});
test('random mode: a new layout every round, players spawn apart and objects settle', () => {
  const s = new Sim(5, 'random'); s.addPlayer('h', 'H', 'A'); s.addPlayer('s', 'S', 'B'); s.start();
  const first = JSON.stringify(s.layout()); s.match.round = 1; s.resetRound(); assert.notEqual(JSON.stringify(s.layout()), first);
  run(s, 4);
  for (const o of s.objs) assert.ok(o.body.position.y > 0.1 && o.body.position.y < 5, `${o.type} y=${o.body.position.y}`);
  const h = s.players.get('h').body.position, k = s.players.get('s').body.position; assert.ok(Math.abs(h.z - k.z) > 2 * (s.A - 3) - 0.1);
});
test('objects fall asleep when still, wake when pushed, and a carried object slows the carrier', () => {
  const s = mk(); run(s, 6); const o = s.objs.find(q => q.type === 'box');
  assert.ok(o.body.sleepState === 2 || o.body.velocity.length() < 0.3, 'box should have settled');
  const p = s.players.get('h'); s.objs.forEach(q => q !== o && q.body.position.set(0, -50, 0)); o.body.position.set(0, 0.6, -16); p.body.position.set(0, 0.6, -18.5); p.input.yaw = Math.PI; p.input.pitch = 0; run(s, 1);
  o.heldBy = p; p.held = o; p.holdDist = 2.5; p.input.mz = 1; const z0 = p.body.position.z; run(s, 1); const carried = Math.abs(p.body.position.z - z0);
  p.held = null; o.heldBy = null; const z1 = p.body.position.z; run(s, 1); const free = Math.abs(p.body.position.z - z1);
  assert.ok(carried < free * 0.97, `carried ${carried.toFixed(2)} vs free ${free.toFixed(2)}`);
});
test('planks exist as a movable object type', () => {
  const s = new Sim(1, 'random'); assert.ok(s.objs.some(o => o.type === 'plank'));
});
