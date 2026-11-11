import { Sim } from './sim.js';
import { View } from './render.js';
import { Input } from './input.js';
import { hostRoom, joinRoom } from './net.js';
import { CFG } from './rules.js';
import { AiBot, MODELS } from './ai.js';

const $ = id => document.getElementById(id);
const show = (id, on = true) => { $(id).classList.toggle('hidden', !on); if (id === 'menu') document.body.classList.toggle('menu-on', on); };
const TEAMN = { A: 'Team 1', B: 'Team 2', S: 'Spectator' };
const view = new View($('c'));
const bots = new Map(), thoughts = new Map(); let aiN = 0;
let mode = null, sim = null, net = null, me = null, snap = null, layoutSeen = false, lastPhase = null, input;
const send = m => mode === 'client' ? net.send(m) : null;

function act(a) { if (mode === 'host') sim.action('host', a); else send({ t: 'act', a }); }
input = new Input($('c'), act);

function toast(text, ms = 1800) {
  const t = $('toast'); t.textContent = text; t.style.opacity = 1; clearTimeout(toast.h); toast.h = setTimeout(() => t.style.opacity = 0, ms);
}
function err(el, e) { $(el).textContent = typeof e === 'string' ? e : e.type === 'peer-unavailable' ? 'Room not found. Check the code.' : e.type === 'timeout' ? 'Could not connect (timed out).' : 'Connection error: ' + (e.type || e.message || e); }

// ---------------- hosting ----------------
function startHost() {
  const name = $('name').value.trim() || 'Host';
  $('menuErr').textContent = 'Opening room…';
  sim = new Sim(Math.floor(Math.random() * 1e6)); mode = 'host'; me = 'host';
  sim.addPlayer('host', name, 'A');
  net = hostRoom({
    ready: code => { $('roomCode').textContent = code; show('menu', false); show('lobby'); $('startBtn').classList.remove('hidden'); initHostUi(); startLoops(); },
    error: e => { err('menuErr', e); mode = null; },
    join: id => { net.send(id, { t: 'welcome', id }); net.send(id, { t: 'layout', l: sim.layout() }); },
    leave: id => { const p = sim.players.get(id); if (p) toast(p.name + ' left'); sim.removePlayer(id); },
    data: (id, m) => {
      if (m.t === 'hello') {
        const a = [...sim.players.values()].filter(p => p.team === 'A').length, b = [...sim.players.values()].filter(p => p.team === 'B').length;
        if (!sim.players.has(id)) sim.addPlayer(id, String(m.name || 'Player').slice(0, 14), a <= b ? 'A' : 'B');
      } else if (m.t === 'team') sim.setTeam(id, m.team === 'B' ? 'B' : m.team === 'A' ? 'A' : 'S');
      else if (m.t === 'in') sim.setInput(id, { mx: +m.mx || 0, mz: +m.mz || 0, yaw: +m.yaw || 0, pitch: +m.pitch || 0, jump: !!m.jump });
      else if (m.t === 'act') sim.action(id, m.a);
    },
  });
}
function startMatch() {
  try { sim.start(); $('lobbyErr').textContent = ''; } catch (e) { $('lobbyErr').textContent = 'Both teams need at least one player.'; }
}

// ---------------- AI players (host only, bring your own key) ----------------
function initHostUi() {
  $('aiModel').innerHTML = MODELS.map(([id, label]) => `<option value="${id}">${label}</option>`).join('');
  try { const k = localStorage.getItem('hns-aikey'); if (k) { $('aiKey').value = k; $('aiRemember').checked = true; } } catch {}
  $('modeSel').onchange = () => sim.setMode($('modeSel').value);
  $('aiAdd').onclick = addBot;
  $('aiClear').onclick = () => { for (const id of bots.keys()) sim.removePlayer(id); bots.clear(); thoughts.clear(); $('aiErr').textContent = ''; };
}
function addBot() {
  const key = $('aiKey').value.trim(), el = $('aiErr');
  if (!key) { el.textContent = 'Paste your Anthropic API key first.'; return; }
  if (bots.size >= 6) { el.textContent = 'Up to 6 AI players.'; return; }
  try { if ($('aiRemember').checked) localStorage.setItem('hns-aikey', key); else localStorage.removeItem('hns-aikey'); } catch {}
  const id = 'ai-' + (++aiN), name = '🤖 Claude ' + aiN; el.textContent = '';
  sim.addPlayer(id, name, $('aiTeam').value);
  bots.set(id, new AiBot(sim, id, { key, model: $('aiModel').value,
    onThought: t => thoughts.set(id, { name, text: t }),
    onError: e => { thoughts.set(id, { name, text: '⚠ ' + (e.status === 401 ? 'Invalid API key' : e.message) }); toast(name + ': ' + (e.status === 401 ? 'invalid API key' : 'API error'), 3500); } }));
}
function aiPanel(s, inGame) {
  show('aiPanel', mode === 'host' && bots.size > 0 && inGame && s.phase !== 'over');
  if (!bots.size) return;
  $('aiPanel').innerHTML = [...bots.keys()].map(id => { const t = thoughts.get(id), pl = s.players.find(p => p.id === id), role = pl ? (pl.tm === s.hiderTeam ? 'hider' : 'seeker') : '';
    return `<div><b>${t ? t.name : id} ${role ? '(' + role + ')' : ''}</b>${t ? t.text.replace(/</g, '&lt;') : 'thinking…'}</div>`; }).join('');
}

// ---------------- joining ----------------
function startJoin() {
  const code = $('code').value.trim(); if (!code) return err('menuErr', 'Enter a room code');
  $('menuErr').textContent = 'Connecting…'; mode = 'client';
  net = joinRoom(code, {
    open: () => { net.send({ t: 'hello', name: $('name').value.trim() || 'Player' }); $('roomCode').textContent = code.toUpperCase(); show('menu', false); show('lobby'); startLoops(); },
    data: m => {
      if (m.t === 'welcome') me = m.id;
      else if (m.t === 'layout') { view.setLayout(m.l); layoutSeen = true; }
      else if (m.t === 'snap') snap = m.s;
      else if (m.t === 'spawn') { input.yaw = m.yaw; input.pitch = 0; }
    },
    close: () => { toast('Disconnected from host', 5000); setTimeout(() => location.reload(), 2500); },
    error: e => { err('menuErr', e); if (!$('menu').classList.contains('hidden')) mode = null; },
  });
}

// ---------------- loops ----------------
let loopsOn = false;
function startLoops() {
  if (loopsOn) return; loopsOn = true;
  let last = performance.now(), acc = 0, lastIn = 0, lastSent = '';
  if (mode === 'host') {
    setInterval(() => { // host simulation keeps running even if rAF is throttled
      const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
      sim.setInput('host', input.state()); for (const b of bots.values()) b.update(dt); sim.step(dt);
      for (const e of sim.drainEvents()) if (e === 'layout') {
        const l = sim.layout(); view.setLayout(l); layoutSeen = true; net.broadcast({ t: 'layout', l });
        // players' own mouse-look would otherwise overwrite the spawn facing: hand it to their input
        for (const [pid, pl] of sim.players) { if (pid === 'host') { input.yaw = pl.spawnYaw ?? 0; input.pitch = 0; } else if (!bots.has(pid) && pl.body) net.send(pid, { t: 'spawn', yaw: pl.spawnYaw ?? 0 }); }
      }
      acc += dt; if (acc >= 0.05) { acc = 0; net.broadcast({ t: 'snap', s: sim.snapshot() }); }
    }, 1000 / 60);
    view.setLayout(sim.layout());
  } else {
    setInterval(() => { const s = input.state(), j = JSON.stringify(s), now = performance.now();
      if (j !== lastSent || now - lastIn > 150) { lastSent = j; lastIn = now; net.send({ t: 'in', ...s }); } }, 33);
  }
  let t0 = performance.now();
  (function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - t0) / 1000); t0 = now;
    if (mode === 'host') snap = sim.snapshot();
    if (snap) { ui(snap); view.update(snap, me, input, dt); }
  })(t0);
}

// ---------------- UI ----------------
const fmt = s => Math.max(0, Math.ceil(s));
function ui(s) {
  const mine = s.players.find(p => p.id === me), inGame = s.phase !== 'lobby';
  show('hostOnly', !inGame && mode === 'host'); aiPanel(s, inGame);
  show('lobby', !inGame); show('hud', inGame && s.phase !== 'over'); show('end', s.phase === 'over');
  input.enabled = inGame && s.phase !== 'over' && !!mine && !!mine.x;
  if (!inGame) {
    for (const t of ['A', 'B']) { $('list' + t).innerHTML = ''; }
    $('listS').textContent = '';
    for (const p of s.players) {
      if (p.tm === 'S') { $('listS').textContent += (p.id === me ? 'You are ' : p.n + ' is ') + 'spectating  '; continue; }
      const li = document.createElement('li'); li.textContent = p.n + (p.id === 'host' ? ' ★' : ''); if (p.id === me) li.className = 'me'; $('list' + p.tm).append(li);
    }
    $('lobbyHint').textContent = mode === 'host' ? 'Share the code with friends. Pick teams, then start.' : 'Waiting for the host to start…';
    lastPhase = null; return;
  }
  const role = mine && mine.tm !== 'S' ? (mine.tm === s.hiderTeam ? 'hider' : 'seeker') : 'spectator';
  $('role').innerHTML = role === 'spectator' ? 'Spectating' : `You are a <b style="color:${role === 'hider' ? '#1583cf' : '#e0281b'}">${role.toUpperCase()}</b> (${TEAMN[mine.tm]}) · Round ${s.round + 1}/${CFG.rounds}`;
  const L = { prep: role === 'seeker' ? 'Hiders are building…' : 'Prep — build your fort!', seek: 'Seek!', between: 'Round over' };
  $('phase').textContent = L[s.phase] || ''; $('timer').textContent = s.phase === 'over' ? '' : fmt(s.t);
  $('scores').innerHTML = `Team 1 <b>${Math.round(s.scores.A)}</b> · Team 2 <b>${Math.round(s.scores.B)}</b>`;
  show('blind', s.phase === 'prep' && role === 'seeker');
  $('blind').textContent = `Hiders are building a shelter… you're released in ${fmt(s.t)}s`;
  $('seenFlash').style.opacity = role === 'hider' && s.phase === 'seek' && mine && mine.sn ? 1 : 0;
  show('cross', input.cam === 'first'); $('caption').textContent = { prep: 'Shelter Construction', seek: 'Hide and Seek', between: 'Swapping sides' }[s.phase] || ''; show('click', input.enabled && document.pointerLockElement !== $('c'));
  if (s.phase !== lastPhase) {
    if (s.phase === 'prep') toast(role === 'hider' ? 'Build a shelter! Grab (E) and lock (F) objects' : 'Hold tight…', 2500);
    if (s.phase === 'seek') toast(role === 'seeker' ? 'GO! Find them!' : 'Stay hidden!', 2000);
    if (s.phase === 'between') toast('Round over — swapping sides', 2500);
    lastPhase = s.phase;
  }
  if (s.phase === 'over') {
    const d = s.scores.A - s.scores.B; document.exitPointerLock?.();
    $('endTitle').textContent = Math.abs(d) < 1 ? 'Draw!' : (d > 0 ? 'Team 1' : 'Team 2') + ' wins!';
    $('endScores').innerHTML = `Team 1 <b>${Math.round(s.scores.A)}</b> — Team 2 <b>${Math.round(s.scores.B)}</b>`;
    show('againBtn', mode === 'host'); show('endWait', mode !== 'host');
  }
}

// ---------------- wiring ----------------
$('hostBtn').onclick = startHost; $('joinBtn').onclick = startJoin;
$('code').addEventListener('keydown', e => e.key === 'Enter' && startJoin());
$('startBtn').onclick = startMatch;
$('againBtn').onclick = () => { sim.endMatch(); const l = sim.layout(); view.setLayout(l); net.broadcast({ t: 'layout', l }); lastPhase = null; };
document.querySelectorAll('[data-team]').forEach(b => b.onclick = () => { const t = b.dataset.team; if (mode === 'host') sim.setTeam('host', t); else send({ t: 'team', team: t }); });
$('name').value = localStorage.getItem('hns-name') || ''; $('name').oninput = () => localStorage.setItem('hns-name', $('name').value);
const q = new URLSearchParams(location.search); if (q.get('join')) $('code').value = q.get('join');
window.__hns = { get snap() { return snap; }, get sim() { return sim; }, input };
