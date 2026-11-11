// Single-player smoke test: no signaling server, no network game. Needs `npm start` running.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const errors = [], calls = [];
for (const role of ['hider', 'seeker']) {
  const p = await (await b.newContext({ viewport: { width: 1000, height: 600 } })).newPage();
  p.on('pageerror', e => errors.push(role + ': ' + e.message)); p.on('console', m => m.type() === 'error' && errors.push(role + ' console: ' + m.text()));
  p.on('request', r => { if (!r.url().startsWith('http://localhost:8080') && !r.url().startsWith('data:')) calls.push(r.url()); });
  await p.goto('http://localhost:8080/');
  await p.fill('#name', 'Solo'); await p.click(role === 'hider' ? '#soloHide' : '#soloSeek');
  await p.waitForFunction(() => window.__hns.snap?.phase === 'prep', null, { timeout: 10000 });
  const start = await p.evaluate(() => { const s = __hns.snap; const me = s.players.find(x => x.id === 'host'), bot = s.players.find(x => x.id === 'cpu-1'); return { arena: __hns.sim.layout().arena, objs: s.objs.length, myRole: me.tm === s.hiderTeam ? 'hider' : 'seeker', botRole: bot.tm === s.hiderTeam ? 'hider' : 'seeker', exit: !document.getElementById('exitBtn').classList.contains('hidden'), menuHidden: document.getElementById('menu').classList.contains('hidden') }; });
  console.log(role, 'start:', start);
  // let prep run, then check the bot's behaviour for its side
  await p.evaluate(() => { __hns.sim.match.t = 8; }); await p.waitForTimeout(9500);
  const mid = await p.evaluate(() => ({ phase: __hns.snap.phase, locked: __hns.snap.objs.map(o => o[8]), botPos: (({ x, z }) => ({ x, z }))(__hns.snap.players.find(x => x.id === 'cpu-1')) }));
  console.log(role, 'after prep:', mid);
  await p.screenshot({ path: `shots/solo-${role}.png` });
  // fast-forward every phase to the end, then "Play again"
  for (let i = 0; i < 40; i++) { const ph = await p.evaluate(() => { const m = __hns.sim.match; if (m.phase !== 'over') m.t = 0.01; return m.phase; }); if (ph === 'over') break; await p.waitForTimeout(150); }
  await p.waitForFunction(() => __hns.snap.phase === 'over', null, { timeout: 15000 });
  console.log(role, 'match ended; button:', await p.textContent('#againBtn'), '| scores:', await p.evaluate(() => __hns.snap.scores));
  await p.click('#againBtn'); await p.waitForFunction(() => __hns.snap.phase === 'prep' && __hns.snap.round === 0, null, { timeout: 8000 });
  console.log(role, 'play again OK');
}
console.log('external requests:', calls, 'errors:', errors); await b.close(); process.exit(errors.length ? 1 : 0);
