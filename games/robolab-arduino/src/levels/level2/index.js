// Nivel 2: Control de movimiento preciso con un microservo SG90.
import { createServoSvg } from './servo-svg.js';
import { mountAnatomy } from './anatomy.js';
import { mountWiring } from './wiring.js';
import { mountPower } from './power.js';
import { mountCode } from './codesim.js';
import { mountQuiz } from './quiz.js';
import { completeLevel, isCompleted } from '../../core/progress.js';

const STEPS = [
  ['wiring', 'Cableado correcto (GND, 5V y señal digital)'],
  ['write', 'Modo 1: probar servo.write() en 0°, 90° y 180°'],
  ['sweep', 'Modo 2: completar un barrido 0°→180°→0°'],
  ['quiz', 'Responder 2 preguntas'],
];

function ensureStyles() {
  if (document.getElementById('l2-styles')) return;
  const link = document.createElement('link');
  link.id = 'l2-styles';
  link.rel = 'stylesheet';
  link.href = 'styles/level2.css';
  document.head.appendChild(link);
}

/** Monta el nivel en `app`. Devuelve una función de limpieza. */
export function mountLevel2(app, { onExit }) {
  ensureStyles();
  app.innerHTML = `
    <section class="l2">
      <header class="l2-head">
        <button type="button" class="back-btn">← Volver al menú</button>
        <h2>Nivel 2: Microservo SG90</h2>
        <ol class="l2-steps"></ol>
      </header>
      <div class="l2-done" hidden></div>
      <div class="l2-sticky"><div class="l2-servo-host"></div></div>
      <article class="l2-panel">
        <h3>1 · Anatomía del servo</h3>
        <div class="l2-chips"></div>
        <div class="l2-card" aria-live="polite"></div>
      </article>
      <article class="l2-panel">
        <h3>2 · Reto de cableado</h3>
        <div class="l2-wiring-host"></div>
        <div class="l2-power-host"></div>
      </article>
      <article class="l2-panel">
        <h3>3 · Simula el código <code>&lt;Servo.h&gt;</code></h3>
        <p class="l2-lock-msg">🔒 Conecta bien el servo en el paso 2 para desbloquear la simulación.</p>
        <div class="l2-code-host is-locked"></div>
      </article>
      <article class="l2-panel">
        <h3>4 · Evaluación rápida</h3>
        <div class="l2-quiz-host"></div>
      </article>
    </section>`;

  const $ = (s) => app.querySelector(s);
  const done = new Set();

  function renderSteps() {
    $('.l2-steps').innerHTML = STEPS.map(([id, label]) =>
      `<li class="${done.has(id) ? 'is-done' : ''}">${done.has(id) ? '✔' : '○'} ${label}</li>`).join('');
  }

  function mark(id) {
    if (done.has(id)) return;
    done.add(id);
    renderSteps();
    if (done.size === STEPS.length) {
      completeLevel(2);
      const box = $('.l2-done');
      box.hidden = false;
      box.innerHTML = `<strong>🏆 ¡Nivel 2 completado!</strong>
        <p>Has desbloqueado el Nivel 3: Sensor Ultrasónico HC-SR04.</p>
        <button type="button" class="l2-btn-primary">Ir al menú</button>`;
      box.querySelector('button').addEventListener('click', onExit);
      box.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  if (isCompleted(2)) {
    const box = $('.l2-done');
    box.hidden = false;
    box.innerHTML = '<strong>✔ Ya superaste este nivel.</strong><p>Puedes repasarlo cuando quieras.</p>';
  }

  let anatomy = null;
  const servo = createServoSvg($('.l2-servo-host'), (part) => anatomy?.show(part));
  anatomy = mountAnatomy($('.l2-chips'), $('.l2-card'), servo);

  const code = mountCode($('.l2-code-host'), { servo, onTried: mark });
  code.disable();
  mountWiring($('.l2-wiring-host'), (r) => {
    $('.l2-lock-msg').hidden = !!r.ok;
    if (r.ok) { mark('wiring'); code.enable(r.pin); } else { code.disable(); }
  });
  mountPower($('.l2-power-host'));
  mountQuiz($('.l2-quiz-host'), () => mark('quiz'));

  $('.back-btn').addEventListener('click', onExit);
  renderSteps();
  return () => { code.destroy(); servo.destroy(); };
}
