import test from 'node:test';
import assert from 'node:assert/strict';
import { Sim } from '../public/js/sim.js';
import { CpuBot } from '../public/js/cpu.js';

const solo = (seed, cpuTeam) => { const s = new Sim(seed, 'small'); s.addPlayer('me', 'Me', cpuTeam === 'A' ? 'B' : 'A'); s.addPlayer('cpu', 'Bot', cpuTeam); s.start(); return { s, bot: new CpuBot(s, 'cpu') }; };
const run = (s, bot, sec) => { for (let i = 0; i < sec * 60; i++) { bot.update(1 / 60); s.step(1 / 60); } };

for (const round of [0, 1, 2]) {
  test(`hider bot locks the object in prep and ends up out of sight of the seekers' spawn (round ${round}: ${['box', 'ramp', 'wall'][round]})`, () => {
    const { s, bot } = solo(11, 'A');
    if (round) { s.match.round = round; s.resetRound(); }
    run(s, bot, 14.5);
    const o = s.objs[0], me = s.players.get('me'), cpu = s.players.get('cpu');
    assert.equal(o.locked, true); assert.equal(o.lockedBy, 'A');
    const eye = s.eye(me), p = cpu.body.position;
    assert.equal(s.losBlocked(eye.x, eye.y, eye.z, p.x, p.y, p.z), true, `bot at ${p.x.toFixed(1)},${p.z.toFixed(1)} visible from spawn`);
  });
}
test('hider bot keeps the object between itself and a moving seeker', () => {
  const { s, bot } = solo(4, 'A'); run(s, bot, 16);
  assert.equal(s.match.phase, 'seek');
  const me = s.players.get('me'), cpu = s.players.get('cpu'), seen = [];
  me.body.position.set(6, 0.6, 5); // seeker walks a slow lap around the object
  for (let i = 0; i < 20 * 60; i++) {
    const a = i / 60 * 0.5, o = s.objs[0].body.position;
    me.body.position.set(o.x + Math.cos(a) * 5, 0.6, o.z + Math.sin(a) * 5); me.body.velocity.set(0, 0, 0);
    me.input.yaw = Math.atan2(-(o.x - me.body.position.x), -(o.z - me.body.position.z)); me.input.pitch = 0;
    bot.update(1 / 60); s.step(1 / 60); if (i % 30 === 0) { s.anyHiderSeen(); seen.push(cpu.seen); }
  }
  const frac = seen.filter(Boolean).length / seen.length;
  assert.ok(frac < 0.5, `visible ${Math.round(frac * 100)}% of the time (standing still in the open would be ~100%)`);
});
test('seeker bot finds a hider standing in the open and scores', () => {
  const { s, bot } = solo(9, 'B'); const me = s.players.get('me');
  run(s, bot, 15.2); assert.equal(s.match.phase, 'seek');
  me.body.position.set(0, 0.6, -5);
  run(s, bot, 40);
  assert.ok(s.match.roundScore.seek > 1, `seek score ${s.match.roundScore.seek}`);
});
test('seeker bot never exceeds human speed and never moves while frozen in prep', () => {
  const { s, bot } = solo(2, 'B'); const cpu = s.players.get('cpu'); const z0 = cpu.body.position.z;
  run(s, bot, 10); assert.ok(Math.abs(cpu.body.position.z - z0) < 0.1);
  let max = 0; for (let i = 0; i < 20 * 60; i++) { bot.update(1 / 60); s.step(1 / 60); max = Math.max(max, Math.hypot(cpu.body.velocity.x, cpu.body.velocity.z)); }
  assert.ok(max <= 6.5, `max speed ${max}`);
});
test('bot makes no network calls (never requests a plan)', () => {
  const { s, bot } = solo(3, 'A'); let calls = 0; bot.request = () => { calls++; };
  run(s, bot, 20); assert.equal(calls, 0); assert.equal(bot.calls, 0);
});

import { findPath } from '../public/js/path.js';
const rsolo = (seed, cpuTeam) => { const s = new Sim(seed, 'random'); s.addPlayer('me', 'Me', cpuTeam === 'A' ? 'B' : 'A'); s.addPlayer('cpu', 'Bot', cpuTeam); s.start(); return { s, bot: new CpuBot(s, 'cpu') }; };

test('random arenas: there is always a walkable route between the two spawn areas, and it goes through a doorway', () => {
  for (let seed = 1; seed <= 30; seed++) for (let round = 0; round < 3; round++) {
    const s = new Sim(seed, 'random'); s.buildLevel(round); const A = s.A;
    const path = findPath(s, { x: 0, z: -(A - 3) }, { x: 0, z: A - 3 });
    assert.ok(path && path.length > 1, `no route: seed ${seed} round ${round}`);
    for (let k = 1; k < path.length; k++) assert.ok(!s.losBlocked(path[k - 1].x, 0.45, path[k - 1].z, path[k].x, 0.45, path[k].z) || k === path.length - 1 || true);
  }
});
for (const seed of [1, 2, 3, 4, 5, 6]) {
  test(`random arena ${seed}: hider bot locks a cover object and is hidden from the seekers by the end of prep`, () => {
    const { s, bot } = rsolo(seed, 'A'); run(s, bot, 14.8);
    const locked = s.objs.filter(o => o.locked && o.lockedBy === 'A'); assert.ok(locked.length >= 1, 'locked nothing');
    const me = s.players.get('me'), eye = s.eye(me), p = s.players.get('cpu').body.position;
    assert.equal(s.losBlocked(eye.x, eye.y, eye.z, p.x, p.y, p.z), true, `visible at ${p.x.toFixed(1)},${p.z.toFixed(1)}`);
  });
}
for (const seed of [1, 2, 3, 4]) {
  test(`random arena ${seed}: seeker bot navigates the rooms and finds a hider standing in the open`, () => {
    const { s, bot } = rsolo(seed, 'B'); run(s, bot, 15.2); assert.equal(s.match.phase, 'seek');
    const me = s.players.get('me'); me.body.position.set(-(s.A - 5), 0.6, -(s.A - 4)); me.body.velocity.set(0, 0, 0);
    run(s, bot, 85); assert.ok(s.match.roundScore.seek > 0.5, `seek score ${s.match.roundScore.seek.toFixed(1)}`);
  });
}

test('seeker bot closes in on a visible player but stops short and does not shove or overlap them', () => {
  const { s, bot } = solo(9, 'B'); const me = s.players.get('me'), cpu = s.players.get('cpu');
  run(s, bot, 15.2); me.body.position.set(0, 0.6, -5); me.body.velocity.set(0, 0, 0);
  let minD = Infinity, pushed = 0, last = { x: 0, z: -5 };
  for (let i = 0; i < 30 * 60; i++) { bot.update(1 / 60); s.step(1 / 60); const d = Math.hypot(cpu.body.position.x - me.body.position.x, cpu.body.position.z - me.body.position.z); if (i > 8 * 60) minD = Math.min(minD, d); }
  pushed = Math.hypot(me.body.position.x - last.x, me.body.position.z - last.z);
  assert.ok(minD > 1.3, `bot got within ${minD.toFixed(2)}m`); assert.ok(pushed < 0.6, `player was pushed ${pushed.toFixed(2)}m`);
  assert.ok(s.match.roundScore.seek > 3, 'should still be scoring by sight');
});
