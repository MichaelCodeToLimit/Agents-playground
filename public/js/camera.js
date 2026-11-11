// Third-person camera placement (pure maths, no three.js) so it can be unit-tested.
// The old code clamped x and z to the arena separately, which squeezed the camera onto the player near a wall.
// Now the camera keeps its direction, pulls in along the view line only as far as needed, and rises to keep the player in frame.
export function chaseRig(P, yaw, A, back = 6, height = 4.6) {
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw), margin = A - 0.9;
  let t = back; // how far behind the player the camera may sit while staying inside the arena
  if (fx > 1e-4) t = Math.min(t, (P.x + margin) / fx); else if (fx < -1e-4) t = Math.min(t, (margin - P.x) / -fx);
  if (fz > 1e-4) t = Math.min(t, (P.z + margin) / fz); else if (fz < -1e-4) t = Math.min(t, (margin - P.z) / -fz);
  t = Math.max(1.3, t);
  const squeeze = (back - t) / back; // 0 in the open, up to ~1 against a wall
  const y = P.y + height + squeeze * 4.2;
  return { pos: { x: P.x - fx * t, y, z: P.z - fz * t }, look: { x: P.x + fx * (2.5 - squeeze * 1.2), z: P.z + fz * (2.5 - squeeze * 1.2) }, dist: t, squeeze };
}
