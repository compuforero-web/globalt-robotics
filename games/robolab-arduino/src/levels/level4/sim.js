// Simulación de tracción: botones de maniobra, PWM, escena, tabla de verdad y código.
import { createScene } from './scene.js';
import { mountView } from './view.js';
import { ACTIONS, ORDER, DEFAULT_PINS, MIN_PWM, motors, rpmOf } from './truth.js';
import { GND_MSG } from './check.js';

const GOALS = [['fwd', 'Avanzar'], ['back', 'Retroceder'], ['turn', 'Girar'], ['pwm', 'Ajustar PWM']];

export function mountSim(host, { onDone }) {
  host.innerHTML = `
    <div class="l4-scene-host"></div>
    <div class="l4-alert" role="alert" hidden></div>
    <div class="l4-maneuvers" role="group" aria-label="Maniobras">
      ${ORDER.map((k) => `<button type="button" class="l4-btn" data-act="${k}">${ACTIONS[k].label}</button>`).join('')}
    </div>
    <label class="l4-range"><span>Velocidad PWM: <b class="l4-pwmv">150</b> / 255</span>
      <input type="range" min="0" max="255" value="150" aria-label="Velocidad PWM de 0 a 255"></label>
    <p class="l4-note" aria-live="polite"></p>
    <ul class="l4-tries"></ul>
    <div class="l4-view-host"></div>`;
  const $ = (s) => host.querySelector(s);
  const scene = createScene($('.l4-scene-host'));
  const view = mountView($('.l4-view-host'));
  const s = { status: 'pending', action: 'stop', pwm: 150, pins: DEFAULT_PINS };
  const tried = new Set();
  let raf = 0; let prev = 0; let rpm = { l: 0, r: 0 }; let finished = false;

  const powered = () => s.status === 'ok';

  function loop(t) {
    const dt = Math.min((t - prev) / 1000, 0.1);
    prev = t;
    scene.frame(dt, rpm.l, rpm.r);
    raf = rpm.l || rpm.r ? requestAnimationFrame(loop) : 0;
  }

  function refresh() {
    const m = motors(s.action);
    const speed = powered() ? rpmOf(s.pwm) : 0;
    rpm = { l: m.l * speed, r: m.r * speed };
    scene.setRpm(rpm.l, rpm.r, powered() ? ACTIONS[s.action].label : s.action === 'stop' ? 'Detenido' : 'SIN RESPUESTA');
    view.update(s.action, s.pins, s.pwm, powered());
    const usable = s.status === 'ok' || s.status === 'nognd';
    scene.lock(usable ? '' : 'Completa el cableado del paso 2 para activar los motores.');
    host.querySelectorAll('.l4-maneuvers .l4-btn').forEach((b) => {
      b.disabled = !usable;
      b.classList.toggle('is-on', b.dataset.act === s.action);
      b.setAttribute('aria-pressed', String(b.dataset.act === s.action));
    });
    const al = $('.l4-alert');
    al.hidden = s.status !== 'nognd';
    al.textContent = GND_MSG;
    $('.l4-note').textContent = powered() && s.action !== 'stop' && s.action !== 'brake' && s.pwm < MIN_PWM
      ? `⚠ Con PWM menor a ${MIN_PWM} el motor zumba pero no vence la fricción: sube la velocidad.` : '';
    $('.l4-tries').innerHTML = GOALS.map(([id, t]) =>
      `<li class="${tried.has(id) ? 'is-done' : ''}">${tried.has(id) ? '✔' : '○'} ${t}</li>`).join('');
    if (!raf && (rpm.l || rpm.r)) { prev = performance.now(); raf = requestAnimationFrame(loop); }
  }

  function record(goal) {
    if (!powered() || tried.has(goal)) return;
    tried.add(goal);
    if (!finished && GOALS.every(([id]) => tried.has(id))) { finished = true; onDone(); }
  }

  host.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    s.action = act;
    if (powered() && rpmOf(s.pwm) > 0) record(act === 'fwd' ? 'fwd' : act === 'back' ? 'back' : act === 'brake' ? '' : 'turn');
    refresh();
  });
  $('input[type=range]').addEventListener('input', (e) => {
    s.pwm = Number(e.target.value);
    $('.l4-pwmv').textContent = s.pwm;
    record('pwm');
    refresh();
  });
  refresh();

  return {
    setWiring(res) {
      s.status = res.status;
      s.pins = res.pins && Object.values(res.pins).every(Number.isFinite) ? res.pins : DEFAULT_PINS;
      if (!['ok', 'nognd'].includes(res.status)) s.action = 'stop';
      refresh();
    },
    destroy() { cancelAnimationFrame(raf); },
  };
}
