// Fase 3: pista autónoma a 60 fps con obstáculos arrastrables.
import { SimCore } from './simcore.js';
import { draw } from './draw.js';
import { STATE_NAMES } from './brain.js';
import { W, H } from './world.js';

const MSGS = {
  won: ['is-ok', '🏁 ¡Meta alcanzada de forma 100% autónoma!'],
  crash: ['is-err', '💥 Chocó: frenó demasiado tarde. Sube DISTANCIA_MIN o baja VEL_CRUCERO, recarga y reinicia.'],
  timeout: ['is-err', '⏱ Se perdió (150 s). Revisa los parámetros de giro, recarga y reinicia.'],
};

export function mountSim(host, { getParams, onState, onWin }) {
  host.innerHTML = `<div class="l5-track"><canvas class="l5-canvas" aria-label="Pista de pruebas vista desde arriba"></canvas></div>
    <p class="l5-read" aria-live="off"></p>
    <div class="l5-actions">
      <button type="button" class="l5-btn-primary" data-a="run">▶ Iniciar</button>
      <button type="button" class="l5-btn" data-a="reset">↺ Reiniciar</button>
      <button type="button" class="l5-btn" data-a="add">+ Obstáculo</button>
      <button type="button" class="l5-btn" data-a="del">− Quitar</button>
      <button type="button" class="l5-btn" data-a="track">Pista original</button>
      <button type="button" class="l5-btn" data-a="fast">×1</button>
    </div>
    <p class="l5-hint">Arrastra los obstáculos (también en pantalla táctil) para probar la robustez de tu código.</p>
    <div class="l5-msg" role="status" aria-live="polite"></div>`;
  const canvas = host.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const read = host.querySelector('.l5-read');
  const msg = host.querySelector('.l5-msg');
  const runBtn = host.querySelector('[data-a=run]');
  const sim = new SimCore(getParams, onState);
  let speed = 1;
  let sel = -1;
  let raf = 0;
  let last = 0;
  let wonSent = false;

  const resize = () => {
    const w = Math.max(1, Math.round(canvas.clientWidth * (window.devicePixelRatio || 1)));
    if (canvas.width !== w) { canvas.width = w; canvas.height = Math.round((w * H) / W); }
  };
  const label = () => { runBtn.textContent = sim.status === 'run' ? '⏸ Pausar' : '▶ Iniciar'; };
  const frame = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    resize();
    for (let i = 0; i < speed; i += 1) sim.step(dt);
    draw(ctx, canvas, sim, sel);
    const b = sim.brain;
    read.textContent = `Estado: ${STATE_NAMES[b.state]} · Distancia: ${b.dist} cm · Servo: ${Math.round(b.servo)}° · Motores: ${Math.round(b.m.l)}/${Math.round(b.m.r)} · ${sim.time.toFixed(1)} s${sim.stalled ? ' · ⚠ PWM < 70: el motor solo zumba' : ''}`;
    if (MSGS[sim.status]) {
      msg.className = `l5-msg ${MSGS[sim.status][0]}`; msg.textContent = MSGS[sim.status][1];
      if (sim.status === 'won' && !wonSent) { wonSent = true; onWin(); }
      label();
    }
    raf = requestAnimationFrame(frame);
  };
  const reset = () => { sim.reset(); msg.textContent = ''; msg.className = 'l5-msg'; wonSent = false; label(); };
  const actions = {
    run() { if (sim.status === 'idle') sim.status = 'run'; else if (sim.status === 'run') sim.status = 'idle'; label(); },
    reset,
    add() { sim.obstacles.push({ x: 125 + (sim.obstacles.length % 3) * 20, y: 40 + (sim.obstacles.length % 4) * 25, w: 18, h: 18 }); },
    del() { if (sim.obstacles.length) sim.obstacles.pop(); sel = -1; },
    track() { sim.restoreTrack(); reset(); },
    fast(e) { speed = speed === 3 ? 1 : speed + 1; e.textContent = `×${speed}`; },
  };
  host.addEventListener('click', (e) => { const b = e.target.closest('[data-a]'); if (b) actions[b.dataset.a](b); });

  const pos = (e) => { const r = canvas.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H]; };
  let off = null;
  canvas.addEventListener('pointerdown', (e) => {
    const [x, y] = pos(e);
    sel = -1;
    for (let i = sim.obstacles.length - 1; i >= 0; i -= 1) {
      const o = sim.obstacles[i];
      if (x >= o.x - 6 && x <= o.x + o.w + 6 && y >= o.y - 6 && y <= o.y + o.h + 6) { sel = i; off = [x - o.x, y - o.y]; canvas.setPointerCapture(e.pointerId); break; }
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (sel < 0 || !off) return;
    const [x, y] = pos(e);
    const o = sim.obstacles[sel];
    o.x = Math.max(0, Math.min(W - o.w, x - off[0]));
    o.y = Math.max(0, Math.min(H - o.h, y - off[1]));
  });
  const end = () => { off = null; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  raf = requestAnimationFrame(frame);
  return { reset, destroy: () => cancelAnimationFrame(raf) };
}
