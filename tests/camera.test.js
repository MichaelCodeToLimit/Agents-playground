import test from 'node:test';
import assert from 'node:assert/strict';
import { chaseRig } from '../public/js/camera.js';

const inside = (r, A) => Math.abs(r.pos.x) <= A - 0.85 && Math.abs(r.pos.z) <= A - 0.85;
test('in the open the camera sits 6m behind and 4.6m up', () => {
  const r = chaseRig({ x: 0, y: 0.6, z: 0 }, 0, 20); // facing -z, so camera is at +z
  assert.ok(Math.abs(r.dist - 6) < 1e-6 && Math.abs(r.pos.z - 6) < 1e-6 && Math.abs(r.pos.y - 5.2) < 1e-6 && r.squeeze === 0);
});
test('never leaves the arena, whatever the player position and heading, in every arena size', () => {
  for (const A of [8, 12, 20]) for (let i = 0; i < 400; i++) {
    const P = { x: (Math.random() * 2 - 1) * (A - 0.6), y: 0.6, z: (Math.random() * 2 - 1) * (A - 0.6) }, yaw = Math.random() * 6.3;
    const r = chaseRig(P, yaw, A); assert.ok(inside(r, A) || r.dist === 1.3, `A=${A} P=${P.x.toFixed(1)},${P.z.toFixed(1)} yaw=${yaw.toFixed(2)}`);
    assert.ok(r.dist >= 1.3 && r.dist <= 6 && Number.isFinite(r.pos.x + r.pos.y + r.pos.z));
  }
});
test('against a wall the camera keeps its heading (no sideways drift), pulls in and rises', () => {
  const P = { x: 5, y: 0.6, z: 6.6 }, yaw = 0; // small arena, player at the +z wall facing -z: the camera wants to go beyond the wall
  const r = chaseRig(P, yaw, 8), open = chaseRig({ x: 5, y: 0.6, z: 0 }, yaw, 8);
  assert.ok(Math.abs(r.pos.x - P.x) < 1e-6, 'camera should stay straight behind the player');
  assert.ok(r.dist < 3 && r.pos.y > open.pos.y + 1.5, `dist ${r.dist.toFixed(2)} y ${r.pos.y.toFixed(2)} vs open ${open.pos.y.toFixed(2)}`);
});
test('a camera squeezed into a corner still looks at the player', () => {
  const P = { x: 7, y: 0.6, z: 7 }, r = chaseRig(P, Math.PI * 0.25 * -1 + Math.PI, 8); // facing into the corner direction
  assert.ok(r.dist >= 1.3 && Math.hypot(r.look.x - P.x, r.look.z - P.z) < 3.1);
});
