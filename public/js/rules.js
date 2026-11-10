// Pure game rules: no DOM, no physics. Testable in Node.
export const CFG = { prep: 15, seek: 90, between: 5, rounds: 4, viewDot: 0.45, viewDist: 45 };

export function createMatch(players) {
  const teams = new Set(players.map(p => p.team));
  if (!teams.has('A') || !teams.has('B')) throw new Error('Both teams need at least one player');
  return { phase: 'prep', round: 0, t: CFG.prep, hiderTeam: 'A', scores: { A: 0, B: 0 }, roundScore: { hide: 0, seek: 0 } };
}

export const roleOf = (match, team) => (team === match.hiderTeam ? 'hider' : 'seeker');

export function forward(yaw, pitch) {
  return { x: -Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(yaw) * Math.cos(pitch) };
}

// seeker/hider: {x,y,z,yaw,pitch}; blocked: true if a wall/object is between them
export function canSee(seeker, hider, blocked) {
  if (blocked) return false;
  const dx = hider.x - seeker.x, dy = hider.y - seeker.y, dz = hider.z - seeker.z;
  const d = Math.hypot(dx, dy, dz);
  if (d > CFG.viewDist) return false;
  if (d < 0.001) return true;
  const f = forward(seeker.yaw, seeker.pitch);
  return (f.x * dx + f.y * dy + f.z * dz) / d >= CFG.viewDot;
}

export function canUnlock(obj, team) { return !obj.locked || obj.lockedBy === team; }
export function canLock(obj) { return !obj.locked; }

// isSeen(hiderId) => bool, supplied by the sim. Returns event name on phase change.
export function tick(match, dt, hiderSeen) {
  if (match.phase === 'over' || match.phase === 'lobby') return null;
  if (match.phase === 'seek') {
    if (hiderSeen) match.roundScore.seek += dt; else match.roundScore.hide += dt;
  }
  match.t -= dt;
  if (match.t > 0) return null;
  if (match.phase === 'prep') { match.phase = 'seek'; match.t = CFG.seek; return 'seek'; }
  if (match.phase === 'seek') {
    const seekTeam = match.hiderTeam === 'A' ? 'B' : 'A';
    match.scores[match.hiderTeam] += match.roundScore.hide;
    match.scores[seekTeam] += match.roundScore.seek;
    match.roundScore = { hide: 0, seek: 0 };
    if (match.round + 1 >= CFG.rounds) { match.phase = 'over'; match.t = 0; return 'over'; }
    match.phase = 'between'; match.t = CFG.between; return 'between';
  }
  if (match.phase === 'between') {
    match.round++; match.hiderTeam = match.hiderTeam === 'A' ? 'B' : 'A';
    match.phase = 'prep'; match.t = CFG.prep; return 'prep';
  }
  return null;
}
