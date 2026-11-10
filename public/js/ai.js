// Optional AI players driven by the Anthropic API using the HOST's own key.
// The key stays in the host's browser. The bot only receives what a player on its team could see.
import { roleOf, canSee, CFG } from './rules.js';

export const MODELS = [
  ['claude-haiku-5-5', 'Haiku 5.5 (fast, cheap)'],
  ['claude-sonnet-5-5', 'Sonnet 5.5 (balanced)'],
  ['claude-opus-5-5', 'Opus 5.5 (smartest, slowest)'],
];
const ACTIONS = ['grab', 'lock', 'jump'];

export const SYSTEM = `You control one player in a 3D hide-and-seek game, like OpenAI's "Multi-Agent Hide and Seek".
Two teams. HIDERS get a prep phase (seekers frozen) to build a shelter by grabbing and locking boxes, walls and ramps, then must stay out of the seekers' line of sight until time runs out. SEEKERS try to see a hider; ramps and boxes let them climb over walls (jump from a ramp top clears a 2.6m wall).
World: flat floor, x/z plane, arena spans -arena..+arena on both axes, y is up. Players are ~1m tall spheres. Boxes 1.2m, walls 3x1.8x0.3m, ramps 2x1.5x3m.
Actions: "grab" toggles holding the object you are LOOKING at (within 4.5m); held objects follow where you look. "lock" toggles locking the held or looked-at object in place; only the team that locked it can unlock it. "jump" jumps.
Each turn you get a JSON observation and must answer with the plan tool: move_to (world x,z to walk to), face (world x,z to look at, needed before grab/lock), actions (run in order after turning), and a short thought. Plans are executed for ~1.5 seconds before you can act again, so keep them simple and concrete. Use the numbers in the observation; you cannot see through walls. Always answer by calling the plan tool exactly once, with no other text.`;

export const PLAN_TOOL = {
  name: 'plan',
  description: 'Your next short plan for your player.',
  input_schema: {
    type: 'object',
    properties: {
      thought: { type: 'string', description: 'One short sentence on what you are doing and why.' },
      move_to: { type: 'object', properties: { x: { type: 'number' }, z: { type: 'number' } }, required: ['x', 'z'] },
      face: { type: 'object', properties: { x: { type: 'number' }, z: { type: 'number' } }, required: ['x', 'z'] },
      actions: { type: 'array', items: { type: 'string', enum: ACTIONS }, maxItems: 3 },
    },
    required: ['thought'],
  },
};

const r1 = n => Math.round(n * 10) / 10;

export function observe(sim, id) {
  const p = sim.players.get(id), m = sim.match, b = p.body.position, role = roleOf(m, p.team);
  const me = { ...sim.eye(p), yaw: p.input.yaw, pitch: p.input.pitch };
  const others = [];
  for (const q of sim.players.values()) {
    if (q === p || !q.body) continue;
    const mate = q.team === p.team;
    if (!mate && !canSee(me, q.body.position, sim.blocked(p, q))) continue; // opponents only when actually visible
    others.push({ name: q.name, team: mate ? 'teammate' : 'opponent', x: r1(q.body.position.x), z: r1(q.body.position.z) });
  }
  return {
    role, phase: m.phase, seconds_left: Math.ceil(m.t), round: m.round + 1, of_rounds: CFG.rounds,
    arena: sim.A, you: { x: r1(b.x), z: r1(b.z), facing: { x: r1(-Math.sin(p.input.yaw)), z: r1(-Math.cos(p.input.yaw)) }, holding: p.held ? p.held.id : null },
    seen_by_seeker: role === 'hider' ? !!p.seen : undefined,
    objects: sim.objs.map(o => ({ id: o.id, type: o.type, x: r1(o.body.position.x), y: r1(o.body.position.y), z: r1(o.body.position.z), locked: o.locked ? (o.lockedBy === p.team ? 'by your team' : 'by opponents') : false, held: !!o.heldBy })),
    fixed_walls: sim.statics.filter(s => s.y >= 0 && s.sy <= 5).map(s => ({ x: r1(s.x), z: r1(s.z), size_x: r1(s.sx), size_z: r1(s.sz) })),
    others,
  };
}

export function sanitizePlan(plan, A) {
  const pt = v => v && Number.isFinite(+v.x) && Number.isFinite(+v.z) ? { x: Math.max(-A, Math.min(A, +v.x)), z: Math.max(-A, Math.min(A, +v.z)) } : null;
  return {
    thought: typeof plan?.thought === 'string' ? plan.thought.slice(0, 160) : '',
    goto: pt(plan?.move_to), face: pt(plan?.face),
    actions: Array.isArray(plan?.actions) ? plan.actions.filter(a => ACTIONS.includes(a)).slice(0, 3) : [],
  };
}

export async function callModel({ key, model, obs, fetchImpl = (...a) => fetch(...a), signal }) {
  const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST', signal,
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    // tool_choice stays 'auto': forced tool use is rejected (400) on Opus 5.5 / Sonnet 5.5. Low effort keeps the bots quick.
    body: JSON.stringify({ model, max_tokens: 2000, system: SYSTEM, tools: [PLAN_TOOL], tool_choice: { type: 'auto' }, output_config: { effort: 'low' }, messages: [{ role: 'user', content: JSON.stringify(obs) }] }),
  });
  if (!res.ok) { const e = new Error(`API ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`); e.status = res.status; throw e; }
  const j = await res.json(), tu = j.content?.find(c => c.type === 'tool_use');
  if (tu) return tu.input;
  if (j.stop_reason === 'refusal') throw new Error('The model declined this request (refusal)');
  const text = (j.content || []).filter(c => c.type === 'text').map(c => c.text).join(' ').trim();
  return { thought: text || 'No plan returned; holding position.' }; // soft failure: bot idles this turn
}

const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

export class AiBot {
  constructor(sim, id, { key, model, onThought = () => {}, onError = () => {}, fetchImpl, interval = 1.2 }) {
    Object.assign(this, { sim, id, key, model, onThought, onError, fetchImpl, interval });
    this.cmd = { goto: null, face: null, actions: [], wait: 0 }; this.inflight = false; this.cool = 0; this.errors = 0; this.off = false;
    this.jumpT = 0; this.stuck = 0; this.last = null; this.calls = 0;
  }
  update(dt) {
    const p = this.sim.players.get(this.id), m = this.sim.match;
    if (!p || !p.body || !m) return;
    const live = m.phase === 'prep' || m.phase === 'seek';
    if (!live) { Object.assign(p.input, { mx: 0, mz: 0, jump: false }); return; }
    this.cool -= dt;
    const blind = m.phase === 'prep' && roleOf(m, p.team) === 'seeker';
    if (!this.inflight && this.cool <= 0 && !this.off && !blind) this.request(p);
    this.drive(p, dt);
  }
  request(p) {
    this.inflight = true; this.calls++;
    callModel({ key: this.key, model: this.model, obs: observe(this.sim, this.id), fetchImpl: this.fetchImpl })
      .then(raw => {
        this.errors = 0; const plan = sanitizePlan(raw, this.sim.A);
        this.cmd = { goto: plan.goto, face: plan.face, actions: plan.actions, wait: 0 };
        this.onThought(plan.thought, p);
      })
      .catch(e => { this.errors++; this.onError(e); if (e.status === 401 || e.status === 403 || e.status === 404 || this.errors >= 3) this.off = true; })
      .finally(() => { this.inflight = false; this.cool = this.interval; });
  }
  drive(p, dt) {
    const c = this.cmd, i = p.input, b = p.body.position;
    if (c.goto && Math.hypot(c.goto.x - b.x, c.goto.z - b.z) < 0.7) c.goto = null;
    const aim = c.goto || c.face; let diff = 0;
    if (aim) {
      diff = wrap(Math.atan2(-(aim.x - b.x), -(aim.z - b.z)) - i.yaw);
      i.yaw += Math.max(-5 * dt, Math.min(5 * dt, diff));
    }
    i.mx = 0; i.mz = c.goto && Math.abs(diff) < 0.8 ? 1 : 0;
    let pitch = 0;
    if (!c.goto && c.face) { // aim at the nearest object so grab/lock raycasts hit it
      const o = this.sim.objs.reduce((best, q) => { const d = Math.hypot(q.body.position.x - c.face.x, q.body.position.z - c.face.z); return !best || d < best.d ? { q, d } : best; }, null);
      if (o && o.d < 2) { const e = this.sim.eye(p), h = Math.hypot(o.q.body.position.x - e.x, o.q.body.position.z - e.z) || 1; pitch = Math.atan2(o.q.body.position.y - e.y, h); }
    }
    i.pitch += (Math.max(-1, Math.min(1, pitch)) - i.pitch) * Math.min(1, dt * 8);
    // hop over small obstacles when blocked
    const moved = this.last ? Math.hypot(b.x - this.last.x, b.z - this.last.z) : 1; this.last = { x: b.x, z: b.z };
    this.stuck = i.mz && moved < 0.4 * dt ? this.stuck + dt : 0;
    if (this.stuck > 0.5) { this.jumpT = 0.3; this.stuck = 0; }
    if (c.actions.length) {
      c.wait += dt; const aligned = !aim || Math.abs(diff) < 0.12;
      if ((aligned && c.wait > 0.3) || c.wait > 1.5) {
        const a = c.actions.shift(); c.wait = 0.3;
        if (a === 'jump') this.jumpT = 0.3; else this.sim.action(this.id, a);
      }
    }
    this.jumpT = Math.max(0, this.jumpT - dt); i.jump = this.jumpT > 0;
  }
}
