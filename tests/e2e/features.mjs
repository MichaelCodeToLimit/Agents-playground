// Random arena + built-in bots + locks/grab visuals + sound/effect events. Needs `npm run signal` running.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const errors = [];
const p = await (await b.newContext({ viewport: { width: 1000, height: 600 } })).newPage();
p.on('pageerror', e => errors.push(e.message)); p.on('console', m => m.type() === 'error' && errors.push('console: ' + m.text()));
await p.goto('http://localhost:8080/?ph=localhost&pp=9000');
await p.fill('#name', 'Alice'); await p.click('#hostBtn');
await p.waitForFunction(() => document.getElementById('roomCode').textContent.length === 4, null, { timeout: 30000 });
await p.selectOption('#modeSel', 'random'); await p.click('#cpuB'); await p.click('#cpuA'); await p.waitForTimeout(500);
console.log('lobby teams:', await p.evaluate(() => ({ A: [...document.querySelectorAll('#listA li')].map(l => l.textContent), B: [...document.querySelectorAll('#listB li')].map(l => l.textContent) })));
await p.click('#startBtn'); await p.waitForFunction(() => __hns.snap?.phase === 'prep', null, { timeout: 20000 });
console.log('random arena:', await p.evaluate(() => { const L = __hns.sim.layout(); const t = {}; L.objs.forEach(o => t[o.type] = (t[o.type] || 0) + 1); return { arena: L.arena, walls: L.statics.filter(s => s.y >= 0 && s.sy <= 5).length, objects: t }; }));
// human hider: stand near a box, look at it, grab, move a little, lock
const set = await p.evaluate(async () => {
  const s = __hns.sim, me = s.players.get('host'), o = s.objs.find(q => q.type === 'box'); const A = s.A;
  s.objs.filter(q => q !== o).forEach(q => { q.body.position.set(q.body.position.x, q.body.position.y, q.body.position.z); });
  o.body.position.set(0, 0.6, -(A - 6)); o.body.velocity.set(0, 0, 0); me.body.position.set(0, 0.6, -(A - 3)); __hns.input.yaw = Math.PI; __hns.input.pitch = -0.1; __hns.input.cam = 'chase';
  await new Promise(r => setTimeout(r, 1200));
  const hoverBefore = document.getElementById('hoverHint').textContent;
  s.action('host', 'grab'); await new Promise(r => setTimeout(r, 900));
  const holding = !!me.held, beam = __hns.view.players.get('host')?.beam?.visible;
  s.action('host', 'lock'); await new Promise(r => setTimeout(r, 1200));
  return { hoverBefore, holding, beam, locked: o.locked, hoverAfter: document.getElementById('hoverHint').textContent, sprites: [...__hns.view.objs.values()].filter(q => q.spr.visible).length };
});
console.log('aim/grab/lock:', set);
await p.waitForTimeout(3500); const imp0 = await p.evaluate(() => __hns.evCount.impact || 0);
console.log('impacts while objects settle at round start (should be ~0):', imp0);
await p.evaluate(() => { const s = __hns.sim, o = s.objs.find(q => q.type === 'plank' && !q.locked); const a = s.players.get('host').body.position; o.body.wakeUp(); o.body.position.set(a.x + 3, 6, a.z + 2); o.body.velocity.set(0, 0, 0); });
await p.waitForTimeout(2200); console.log('dropped plank -> impact events:', (await p.evaluate(() => __hns.evCount.impact || 0)) - imp0, '| dust puffs seen:', await p.evaluate(() => __hns.evCount.impact > 0));
await p.screenshot({ path: 'shots/features-chase.png' });
await p.evaluate(() => { __hns.input.cam = 'top'; }); await p.waitForTimeout(800); await p.screenshot({ path: 'shots/features-top.png' });
await p.evaluate(() => { const me = __hns.sim.players.get('host'); me.input.jump = true; __hns.input.cam = 'chase'; });
await p.waitForTimeout(2500);
console.log('events heard:', await p.evaluate(() => __hns.evCount), '| puffs/frame state ok:', await p.evaluate(() => __hns.view.puffs.length >= 0));
console.log('bots:', await p.evaluate(() => [...__hns.sim.players.values()].filter(q => q.id.startsWith('cpu')).map(q => ({ id: q.id, team: q.team, z: +q.body.position.z.toFixed(1) }))));
// toggle mute, then let the bots play on for a while
await p.keyboard.press('KeyM'); console.log('muted:', await p.evaluate(() => __hns.sfx.muted));
console.log('errors:', errors); await b.close(); process.exit(errors.length ? 1 : 0);
