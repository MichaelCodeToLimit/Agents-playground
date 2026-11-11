// All sound is synthesized with the Web Audio API (no audio files). Every call is safe if audio is unavailable or not yet unlocked.
export class Sfx {
  constructor() {
    this.ctx = null; this.master = null; this.noise = null; this.muted = false; this.wind = null; this.last = {};
    try { this.muted = localStorage.getItem('hns-muted') === '1'; } catch {}
  }
  // browsers only allow audio after a user gesture: call this from a click / key press
  resume() {
    try {
      if (!this.ctx) {
        const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
        this.ctx = new C(); this.master = this.ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.55; this.master.connect(this.ctx.destination);
        const n = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate), d = n.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; this.noise = n;
        this.startWind();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch {}
  }
  toggleMute() {
    this.muted = !this.muted; try { localStorage.setItem('hns-muted', this.muted ? '1' : '0'); } catch {}
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.55; return this.muted;
  }
  startWind() { // quiet ambient breeze
    const c = this.ctx, src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380; const g = c.createGain(); g.gain.value = 0.028;
    const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 0.12; lg.gain.value = 0.014; lfo.connect(lg); lg.connect(g.gain);
    src.connect(lp); lp.connect(g); g.connect(this.master); src.start(); lfo.start(); this.wind = g;
  }
  // --- building blocks ---
  out(vol, pan) { const c = this.ctx, g = c.createGain(); g.gain.value = vol; let n = g; if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan || 0)); g.connect(p); n = p; } n.connect(this.master); return g; }
  burst(dest, { freq = 600, q = 1, type = 'bandpass', dur = 0.08, attack = 0.004, at = 0 }) {
    const c = this.ctx, s = c.createBufferSource(); s.buffer = this.noise; const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const e = c.createGain(), t = c.currentTime + at; e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(1, t + attack); e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(e); e.connect(dest); s.start(t, Math.random() * 0.5, dur + 0.05);
  }
  tone(dest, { f0 = 300, f1 = 300, dur = 0.1, type = 'sine', gain = 1, at = 0 }) {
    const c = this.ctx, o = c.createOscillator(), e = c.createGain(), t = c.currentTime + at; o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(gain, t + 0.005); e.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(e); e.connect(dest); o.start(t); o.stop(t + dur + 0.05);
  }
  // ev: {type, v?}; dist/pan describe where it happened relative to the listener
  play(ev, dist = 0, pan = 0) {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const t = ev.type, now = this.ctx.currentTime, near = 1 / (1 + dist * 0.22); if (near < 0.05) return;
    const key = t + (ev.who || ''); if (this.last[key] && now - this.last[key] < 0.05) return; this.last[key] = now; // de-dupe bursts
    try {
      const v = Math.min(1, ev.v ?? 1);
      if (t === 'step') { const o = this.out(0.18 * near * (0.5 + v * 0.5), pan); this.burst(o, { freq: 700 + Math.random() * 300, q: 0.8, dur: 0.06 }); this.tone(o, { f0: 110, f1: 70, dur: 0.07, gain: 0.5 }); }
      else if (t === 'jump') { const o = this.out(0.22 * near, pan); this.burst(o, { freq: 1200, q: 0.5, dur: 0.16, attack: 0.05 }); this.tone(o, { f0: 260, f1: 520, dur: 0.14, gain: 0.25 }); }
      else if (t === 'land') { const o = this.out(Math.min(0.5, 0.15 + ev.v * 0.03) * near, pan); this.burst(o, { freq: 220, type: 'lowpass', dur: 0.16 }); this.tone(o, { f0: 90, f1: 45, dur: 0.18, gain: 0.8 }); }
      else if (t === 'impact') { const o = this.out(Math.min(0.6, 0.12 + ev.v * 0.04) * near, pan); this.burst(o, { freq: 420, type: 'lowpass', dur: 0.14 }); this.tone(o, { f0: 150, f1: 55, dur: 0.16, gain: 0.7, type: 'triangle' }); this.burst(o, { freq: 1800, q: 2, dur: 0.04, at: 0.01 }); }
      else if (t === 'lock') { const o = this.out(0.34 * near, pan); this.tone(o, { f0: 1500, f1: 1100, dur: 0.05, type: 'square', gain: 0.35 }); this.tone(o, { f0: 700, f1: 500, dur: 0.07, type: 'square', gain: 0.4, at: 0.06 }); this.burst(o, { freq: 3000, q: 3, dur: 0.03 }); }
      else if (t === 'unlock') { const o = this.out(0.3 * near, pan); this.tone(o, { f0: 600, f1: 800, dur: 0.05, type: 'square', gain: 0.35 }); this.tone(o, { f0: 1300, f1: 1700, dur: 0.06, type: 'square', gain: 0.3, at: 0.06 }); }
      else if (t === 'grab') { const o = this.out(0.26 * near, pan); this.tone(o, { f0: 190, f1: 330, dur: 0.09, gain: 0.8 }); this.burst(o, { freq: 900, dur: 0.05 }); }
      else if (t === 'release') { const o = this.out(0.22 * near, pan); this.tone(o, { f0: 320, f1: 170, dur: 0.1, gain: 0.7 }); }
      else if (t === 'seen') { const o = this.out(0.22, 0); this.tone(o, { f0: 880, f1: 880, dur: 0.09, type: 'triangle', gain: 0.7 }); this.tone(o, { f0: 660, f1: 660, dur: 0.12, type: 'triangle', gain: 0.7, at: 0.11 }); }
      else if (t === 'chime') { const o = this.out(0.2, 0); [523, 659, 784].forEach((f, i) => this.tone(o, { f0: f, f1: f, dur: 0.22, gain: 0.6, at: i * 0.09 })); }
      else if (t === 'go') { const o = this.out(0.24, 0); [392, 523, 784].forEach((f, i) => this.tone(o, { f0: f, f1: f * 1.01, dur: 0.18, type: 'triangle', gain: 0.6, at: i * 0.07 })); }
      else if (t === 'over') { const o = this.out(0.22, 0); [784, 659, 523, 392].forEach((f, i) => this.tone(o, { f0: f, f1: f, dur: 0.3, gain: 0.55, at: i * 0.12 })); }
    } catch {}
  }
}
