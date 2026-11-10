// Small arena + AI player, with api.anthropic.com mocked (no real key needed). Needs `npm run signal` running.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await (await b.newContext({ viewport: { width: 1000, height: 600 } })).newPage();
const errors = [], reqs = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => m.type() === 'error' && errors.push('console: ' + m.text()));
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
await page.route('https://api.anthropic.com/**', async route => {
  const r = route.request();
  if (r.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
  const body = JSON.parse(r.postData()); reqs.push({ key: r.headers()['x-api-key'], model: body.model, role: JSON.parse(body.messages[0].content).role });
  await route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ stop_reason: 'tool_use',
    content: [{ type: 'tool_use', id: 't1', name: 'plan', input: { thought: 'Walking to the middle to look for the box.', move_to: { x: 0, z: 0 } } }] }) });
});
await page.goto('http://localhost:8080/?ph=localhost&pp=9000');
await page.fill('#name', 'Alice'); await page.click('#hostBtn');
await page.waitForFunction(() => document.getElementById('roomCode').textContent.length === 4, null, { timeout: 15000 });
await page.selectOption('#modeSel', 'small');
await page.click('#aiBox summary'); await page.fill('#aiKey', 'sk-ant-test-123'); await page.selectOption('#aiModel', 'claude-haiku-5-5'); await page.click('#aiAdd');
await page.waitForTimeout(600); await page.screenshot({ path: 'shots/lobby-ai.png' });
console.log('lobby list B:', await page.evaluate(() => [...document.querySelectorAll('#listB li')].map(l => l.textContent)));
await page.click('#startBtn');
await page.waitForFunction(() => __hns.snap?.phase === 'prep', null, { timeout: 8000 });
console.log('layout:', await page.evaluate(() => ({ objs: __hns.snap.objs.length, arena: __hns.sim.layout().arena })));
await page.waitForTimeout(800); await page.screenshot({ path: 'shots/small-prep.png' });
await page.waitForFunction(() => __hns.snap?.phase === 'seek', null, { timeout: 25000 });
await page.waitForTimeout(3500); await page.screenshot({ path: 'shots/small-seek-ai.png' });
const bot = await page.evaluate(() => { const p = __hns.snap.players.find(p => p.id === 'ai-1'); return { x: p.x, z: p.z, panel: document.getElementById('aiPanel').textContent }; });
console.log('AI after ~3s of seek:', bot, '| API calls:', reqs.length, reqs[0], '| errors:', errors);
await b.close(); process.exit(errors.length || !reqs.length ? 1 : 0);
