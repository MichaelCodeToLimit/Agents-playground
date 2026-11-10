import test from 'node:test';
import assert from 'node:assert/strict';
import { Sim } from '../public/js/sim.js';
import { AiBot, observe, sanitizePlan, callModel, PLAN_TOOL } from '../public/js/ai.js';

const fakeFetch = (plan, calls = []) => async (url, init) => { calls.push({ url, init }); return { ok: true, json: async () => ({ content: [{ type: 'tool_use', name: 'plan', input: plan }] }) }; };
const setup = (mode = 'full') => { const s = new Sim(5, mode); s.addPlayer('h', 'Human', 'A'); s.addPlayer('ai', 'Bot', 'B'); s.start(); return s; };
const flush = () => new Promise(r => setTimeout(r, 0));

test('callModel sends key, forced tool use and the observation; returns the plan input', async () => {
  const calls = [], plan = { thought: 'hi' };
  const out = await callModel({ key: 'sk-test', model: 'claude-haiku-5-5', obs: { a: 1 }, fetchImpl: fakeFetch(plan, calls) });
  assert.deepEqual(out, plan);
  const { url, init } = calls[0], body = JSON.parse(init.body);
  assert.equal(url, 'https://api.anthropic.com/v1/messages');
  assert.equal(init.headers['x-api-key'], 'sk-test'); assert.equal(init.headers['anthropic-dangerous-direct-browser-access'], 'true');
  assert.equal(body.model, 'claude-haiku-5-5'); assert.deepEqual(body.tool_choice, { type: 'auto' }); assert.deepEqual(body.output_config, { effort: 'low' }); assert.ok(body.max_tokens >= 1000); assert.equal(body.tools[0].name, PLAN_TOOL.name);
  assert.equal(body.messages[0].content, '{"a":1}');
});
test('callModel surfaces HTTP errors with status', async () => {
  const f = async () => ({ ok: false, status: 401, text: async () => 'bad key' });
  await assert.rejects(callModel({ key: 'x', model: 'm', obs: {}, fetchImpl: f }), e => e.status === 401 && /bad key/.test(e.message));
});
test('sanitizePlan clamps coordinates and drops junk', () => {
  const p = sanitizePlan({ thought: 'x'.repeat(500), move_to: { x: 999, z: -999 }, face: { x: 'a', z: 1 }, actions: ['grab', 'explode', 'lock', 'jump', 'grab'] }, 20);
  assert.deepEqual(p.goto, { x: 20, z: -20 }); assert.equal(p.face, null); assert.deepEqual(p.actions, ['grab', 'lock', 'jump']); assert.equal(p.thought.length, 160);
  assert.deepEqual(sanitizePlan(null, 20), { thought: '', goto: null, face: null, actions: [] });
});
test('observation hides opponents behind walls and never leaks other info', () => {
  const s = setup(); const run = n => { for (let i = 0; i < n * 60; i++) s.step(1 / 60); }; run(16);
  s.objs.forEach(o => o.body.position.set(0, -50, 0));
  const h = s.players.get('h'), b = s.players.get('ai'); h.body.position.set(15, 0.6, 12); b.body.position.set(15, 0.6, 18); b.input.yaw = 0; b.input.pitch = 0;
  assert.equal(observe(s, 'ai').others.length, 1);
  s.addStatic(15, 1.3, 15, 4, 2.6, 0.6); assert.equal(observe(s, 'ai').others.length, 0);
  assert.ok(!JSON.stringify(observe(s, 'ai')).includes('sk-'));
});
test('bot walks to the planned point and shows its thought', async () => {
  const s = setup(); const thoughts = []; const bot = new AiBot(s, 'h', { key: 'k', model: 'm', onThought: t => thoughts.push(t), fetchImpl: fakeFetch({ thought: 'go', move_to: { x: -6, z: -17 } }) });
  s.players.get('h').body.position.set(-6, 0.6, -10);
  for (let i = 0; i < 400; i++) { bot.update(1 / 60); s.step(1 / 60); if (i % 5 === 0) await flush(); }
  const p = s.players.get('h').body.position;
  assert.ok(Math.hypot(p.x + 6, p.z + 17) < 2, `ended at ${p.x},${p.z}`); assert.deepEqual(thoughts.slice(0, 1), ['go']);
});
test('bot faces a box, grabs and locks it', async () => {
  const s = setup(); const o = s.objs.find(o => o.type === 'box'), p = s.players.get('h');
  s.objs.filter(q => q !== o).forEach(q => q.body.position.set(0, -50, 0));
  p.body.position.set(0, 0.6, -10); o.body.position.set(0, 0.6, -13); o.body.velocity.set(0, 0, 0);
  let n = 0; const once = async () => ({ ok: true, json: async () => ({ content: [{ type: 'tool_use', input: n++ ? { thought: 'idle' } : { thought: 'lock it', face: { x: 0, z: -13 }, actions: ['grab', 'lock'] } }] }) });
  const bot = new AiBot(s, 'h', { key: 'k', model: 'm', fetchImpl: once });
  for (let i = 0; i < 240; i++) { bot.update(1 / 60); s.step(1 / 60); if (i % 5 === 0) await flush(); }
  assert.equal(o.locked, true); assert.equal(o.lockedBy, 'A');
});
test('bot disables itself after a bad key and reports the error once', async () => {
  const s = setup(); const errs = []; const f = async () => ({ ok: false, status: 401, text: async () => 'invalid x-api-key' });
  const bot = new AiBot(s, 'h', { key: 'bad', model: 'm', fetchImpl: f, onError: e => errs.push(e.message) });
  for (let i = 0; i < 300; i++) { bot.update(1 / 60); s.step(1 / 60); if (i % 5 === 0) await flush(); }
  assert.equal(errs.length, 1); assert.equal(bot.off, true); assert.equal(bot.calls, 1);
});
test('seeker bot makes no calls while blind in prep', async () => {
  const s = setup(); const calls = []; const bot = new AiBot(s, 'ai', { key: 'k', model: 'm', fetchImpl: fakeFetch({ thought: 'x' }, calls) });
  for (let i = 0; i < 300; i++) { bot.update(1 / 60); s.step(1 / 60); if (i % 5 === 0) await flush(); }
  assert.equal(calls.length, 0);
});

test('callModel turns a text-only reply into an idle plan and a refusal into an error', async () => {
  const text = async () => ({ ok: true, json: async () => ({ content: [{ type: 'text', text: 'I will wait.' }], stop_reason: 'end_turn' }) });
  assert.equal((await callModel({ key: 'k', model: 'm', obs: {}, fetchImpl: text })).thought, 'I will wait.');
  const ref = async () => ({ ok: true, json: async () => ({ content: [], stop_reason: 'refusal' }) });
  await assert.rejects(callModel({ key: 'k', model: 'm', obs: {}, fetchImpl: ref }), /refusal/);
});
