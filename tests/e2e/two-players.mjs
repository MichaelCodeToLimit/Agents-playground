// Two-tab smoke test. Needs `npm run signal` running (local PeerJS broker) and Playwright installed globally.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const base = 'http://localhost:8080/?ph=localhost&pp=9000';
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const errors = [];
const mk = async n => { const p = await (await b.newContext({ viewport: { width: 1000, height: 600 } })).newPage();
  p.on('pageerror', e => errors.push(n + ': ' + e.message)); p.on('console', m => m.type() === 'error' && errors.push(n + ' console: ' + m.text())); await p.goto(base); return p; };
const A = await mk('host'), B = await mk('join');
await A.fill('#name', 'Alice'); await A.click('#hostBtn');
await A.waitForFunction(() => document.getElementById('roomCode').textContent.length === 4, null, { timeout: 15000 });
const code = await A.textContent('#roomCode'); console.log('room', code);
await B.fill('#name', 'Bob'); await B.fill('#code', code); await B.click('#joinBtn');
await B.waitForFunction(() => document.getElementById('listB').children.length + document.getElementById('listA').children.length === 2, null, { timeout: 15000 });
console.log('lobby on joiner:', await B.evaluate(() => [...document.querySelectorAll('li')].map(l => l.parentElement.id + ':' + l.textContent)));
await A.waitForTimeout(800); await A.screenshot({ path: 'shots/lobby.png' });
await A.click('#startBtn');
await B.waitForFunction(() => window.__hns.snap?.phase === 'prep', null, { timeout: 8000 });
console.log('match started; joiner sees', await B.evaluate(() => ({ phase: __hns.snap.phase, players: __hns.snap.players.length, objs: __hns.snap.objs.length })));
// hider (Alice, team A) grabs a box
const grabbed = await A.evaluate(async () => {
  const s = __hns.sim, p = s.players.get('host'), o = s.objs.find(o => o.type === 'box');
  p.body.position.set(0, 0.6, -10); p.input.yaw = 0; p.input.pitch = 0; __hns.input.yaw = 0; __hns.input.pitch = 0;
  o.body.position.set(0, 0.6, -12.4); o.body.velocity.set(0, 0, 0); await new Promise(r => setTimeout(r, 300));
  s.action('host', 'grab'); const held = !!p.held; s.action('host', 'lock'); const locked = o.locked; return { held, locked, by: o.lockedBy };
});
console.log('grab+lock', grabbed);
await B.waitForTimeout(500);
await A.screenshot({ path: 'shots/host-prep.png' }); await B.screenshot({ path: 'shots/join-prep.png' });
await B.waitForFunction(() => __hns.snap?.phase === 'seek', null, { timeout: 25000 });
await A.evaluate(() => { const s = __hns.sim; s.players.get('host').body.position.set(-3, 0.6, 11); __hns.input.yaw = Math.PI; const k = [...s.players.values()].find(p => p.id !== 'host'); k.body.position.set(-3, 0.6, 15); });
await B.keyboard.down('KeyW'); await B.waitForTimeout(500); await B.keyboard.up('KeyW'); await B.waitForTimeout(600);
await A.screenshot({ path: 'shots/host-seek.png' });
await B.screenshot({ path: 'shots/join-seek.png' });
console.log('seek reached; scores', await B.evaluate(() => __hns.snap.scores), 'errors:', errors);
await b.close(); process.exit(errors.length ? 1 : 0);
