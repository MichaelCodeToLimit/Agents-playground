// Tiny grid A* over the arena's fixed walls, for the built-in bots. Dynamic objects are ignored here
// (bots steer around them locally), walls and the outer boundary are blocked with a margin for the player's radius.
const S = 1;

function buildGrid(sim) {
  const A = sim.A, n = Math.ceil((2 * A) / S), blocked = new Uint8Array(n * n);
  const rects = sim.statics.filter(r => r.y >= 0 && r.sy <= 5);
  for (let iz = 0; iz < n; iz++) for (let ix = 0; ix < n; ix++) {
    const x = -A + (ix + 0.5) * S, z = -A + (iz + 0.5) * S;
    if (Math.abs(x) > A - 0.7 || Math.abs(z) > A - 0.7 || rects.some(r => Math.abs(x - r.x) < r.sx / 2 + 0.7 && Math.abs(z - r.z) < r.sz / 2 + 0.7)) blocked[iz * n + ix] = 1;
  }
  return { A, n, blocked };
}
export function gridFor(sim) {
  if (!sim._grid || sim._gridVersion !== sim.version) { sim._grid = buildGrid(sim); sim._gridVersion = sim.version; }
  return sim._grid;
}
const cell = (g, v) => Math.max(0, Math.min(g.n - 1, Math.floor((v + g.A) / S)));
const center = (g, i) => -g.A + (i + 0.5) * S;

function nearestFree(g, ix, iz) {
  if (!g.blocked[iz * g.n + ix]) return [ix, iz];
  for (let r = 1; r <= 4; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    const x = ix + dx, z = iz + dz;
    if (x >= 0 && z >= 0 && x < g.n && z < g.n && !g.blocked[z * g.n + x]) return [x, z];
  }
  return null;
}

// returns [{x,z}, ...] ending at `to`, or null when no route exists
export function findPath(sim, from, to) {
  const g = gridFor(sim), n = g.n;
  const a = nearestFree(g, cell(g, from.x), cell(g, from.z)), b = nearestFree(g, cell(g, to.x), cell(g, to.z));
  if (!a || !b) return null;
  const start = a[1] * n + a[0], goal = b[1] * n + b[0];
  const gs = new Float32Array(n * n).fill(Infinity), came = new Int32Array(n * n).fill(-1), closed = new Uint8Array(n * n);
  const open = [[0, start]]; gs[start] = 0;
  const h = i => { const dx = Math.abs((i % n) - b[0]), dz = Math.abs(Math.floor(i / n) - b[1]); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
  while (open.length) {
    let bi = 0; for (let k = 1; k < open.length; k++) if (open[k][0] < open[bi][0]) bi = k;
    const [, cur] = open.splice(bi, 1)[0]; if (closed[cur]) continue; closed[cur] = 1;
    if (cur === goal) break;
    const cx = cur % n, cz = Math.floor(cur / n);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const x = cx + dx, z = cz + dz; if (x < 0 || z < 0 || x >= n || z >= n) continue;
      const ni = z * n + x; if (g.blocked[ni] || closed[ni]) continue;
      if (dx && dz && (g.blocked[cz * n + x] || g.blocked[z * n + cx])) continue; // no corner cutting
      const cost = gs[cur] + (dx && dz ? 1.414 : 1);
      if (cost < gs[ni]) { gs[ni] = cost; came[ni] = cur; open.push([cost + h(ni), ni]); }
    }
  }
  if (!closed[goal]) return null;
  const pts = []; for (let i = goal; i !== -1; i = came[i]) pts.push({ x: center(g, i % n), z: center(g, Math.floor(i / n)) });
  pts.reverse(); pts[pts.length - 1] = { x: to.x, z: to.z }; return pts;
}

export function randomFreePoint(sim, rand = Math.random) {
  const g = gridFor(sim);
  for (let t = 0; t < 60; t++) { const ix = Math.floor(rand() * g.n), iz = Math.floor(rand() * g.n); if (!g.blocked[iz * g.n + ix]) return { x: center(g, ix), z: center(g, iz) }; }
  return { x: 0, z: 0 };
}
