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
