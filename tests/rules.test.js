import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, tick, canSee, canUnlock, CFG } from '../public/js/rules.js';

const P = [{ id: 1, team: 'A' }, { id: 2, team: 'B' }];

test('cannot start without both teams', () => {
  assert.throws(() => createMatch([{ id: 1, team: 'A' }]));
  assert.throws(() => createMatch([]));
});
test('prep -> seek after 15s, seek -> between after 90s', () => {
  const m = createMatch(P);
  assert.equal(m.phase, 'prep');
  assert.equal(tick(m, CFG.prep, false), 'seek');
  assert.equal(tick(m, CFG.seek, false), 'between');
});
test('hiders score when unseen, seekers when seen', () => {
  const m = createMatch(P); tick(m, 15, false);
  tick(m, 10, false); tick(m, 5, true);
  assert.equal(m.roundScore.hide, 10); assert.equal(m.roundScore.seek, 5);
});
test('sides swap and match ends after 4 rounds', () => {
  const m = createMatch(P);
  for (let r = 0; r < CFG.rounds; r++) {
    assert.equal(m.hiderTeam, r % 2 ? 'B' : 'A');
    tick(m, 15, false); const e = tick(m, 90, false);
    if (r < CFG.rounds - 1) { assert.equal(e, 'between'); tick(m, 5, false); } else assert.equal(e, 'over');
  }
  assert.equal(m.phase, 'over');
});
test('wall between seeker and hider blocks sight', () => {
  const s = { x: 0, y: 1, z: 0, yaw: 0, pitch: 0 }, h = { x: 0, y: 1, z: -5 };
  assert.equal(canSee(s, h, false), true);
  assert.equal(canSee(s, h, true), false);
});
test('hider behind seeker is not seen; too far is not seen', () => {
  const s = { x: 0, y: 1, z: 0, yaw: 0, pitch: 0 };
  assert.equal(canSee(s, { x: 0, y: 1, z: 5 }, false), false);
  assert.equal(canSee(s, { x: 0, y: 1, z: -100 }, false), false);
});
test('only locking team may unlock', () => {
  const o = { locked: true, lockedBy: 'A' };
  assert.equal(canUnlock(o, 'A'), true); assert.equal(canUnlock(o, 'B'), false);
  assert.equal(canUnlock({ locked: false }, 'B'), true);
});
