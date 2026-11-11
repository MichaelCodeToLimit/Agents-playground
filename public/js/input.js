// Keyboard + pointer-lock mouse look. Exposes current input state and one-shot actions.
export class Input {
  constructor(canvas, onAction) {
    this.yaw = 0; this.pitch = 0; this.cam = 'chase'; this.keys = new Set(); this.canvas = canvas; this.onAction = onAction; this.enabled = false;
    const k = e => e.code;
    addEventListener('keydown', e => {
      if (!this.enabled || e.target.tagName === 'INPUT') return;
      if (!e.repeat) { if (e.code === 'KeyE') onAction('grab'); if (e.code === 'KeyF') onAction('lock'); if (e.code === 'KeyV') this.cam = { chase: 'top', top: 'first', first: 'chase' }[this.cam]; }
      this.keys.add(k(e)); if (e.code === 'Space') e.preventDefault();
    });
    addEventListener('keyup', e => this.keys.delete(k(e)));
    addEventListener('blur', () => this.keys.clear());
    addEventListener('mousemove', e => {
      if (document.pointerLockElement !== canvas) return;
      this.yaw -= e.movementX * 0.0025;
      this.pitch = Math.max(-1.4, Math.min(1.4, this.pitch - e.movementY * 0.0025));
    });
    canvas.addEventListener('mousedown', e => {
      if (!this.enabled) return;
      if (document.pointerLockElement !== canvas) { canvas.requestPointerLock?.(); return; }
      if (e.button === 0) onAction('grab'); else if (e.button === 2) onAction('lock');
    });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
  }
  state() {
    const d = c => this.keys.has(c) ? 1 : 0;
    return { mx: d('KeyD') + d('ArrowRight') - d('KeyA') - d('ArrowLeft'), mz: d('KeyW') + d('ArrowUp') - d('KeyS') - d('ArrowDown'),
      yaw: this.yaw, pitch: this.pitch, jump: this.keys.has('Space') };
  }
}
