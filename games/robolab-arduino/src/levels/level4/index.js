// Nivel 4: Potencia y tracción con Puente H L298N y motores DC.
import { createL298nSvg } from './l298n-svg.js';
import { mountAnatomy } from './anatomy.js';
import { mountHBridge } from './hbridge.js';
import { mountWiring } from './wiring.js';
import { mountSim } from './sim.js';
import { mountQuiz } from './quiz.js';
import { completeLevel, isCompleted } from '../../core/progress.js';

const STEPS = [
  ['wiring', 'Cableado correcto (potencia, motores, control y GND común)'],
  ['moves', 'Avanzar, retroceder, girar y ajustar el PWM'],
  ['quiz', 'Responder 2 preguntas'],
];

function ensureStyles() {
  if (document.getElementById('l4-styles')) return;
  const link = document.createElement('link');
  link.id = 'l4-styles';
  link.rel = 'stylesheet';
  link.href = 'styles/level4.css';
  document.head.appendChild(link);
}

/** Monta el nivel en `app`. Devuelve una función de limpieza. */
export function mountLevel4(app, { onExit }) {
  ensureStyles();
  app.innerHTML = `
    <section class="l4">
      <header class="l4-head">
        <button type="button" class="back-btn">← Volver al menú</button>
        <h2>Nivel 4: Puente H L298N y Motores</h2>
        <ol class="l4-steps"></ol>
      </header>
      <div class="l4-done" hidden></div>
      <article class="l4-panel">
        <h3>1 · Anatomía del módulo L298N</h3>
        <div class="l4-board-host"></div>
        <div class="l4-chips"></div>
        <div class="l4-card" aria-live="polite"></div>
        <div class="l4-hb-host"></div>
      </article>
      <article class="l4-panel"><h3>2 · Reto de cableado</h3><div class="l4-wiring-host"></div></article>
      <article class="l4-panel"><h3>3 · Tracción, tabla de verdad y PWM</h3><div class="l4-sim-host"></div></article>
      <article class="l4-panel"><h3>4 · Evaluación rápida</h3><div class="l4-quiz-host"></div></article>
    </section>`;

  const $ = (s) => app.querySelector(s);
  const done = new Set();

  function renderSteps() {
    $('.l4-steps').innerHTML = STEPS.map(([id, label]) =>
      `<li class="${done.has(id) ? 'is-done' : ''}">${done.has(id) ? '✔' : '○'} ${label}</li>`).join('');
  }

  function mark(id) {
    if (done.has(id)) return;
    done.add(id);
    renderSteps();
    if (done.size === STEPS.length) {
      completeLevel(4);
      const box = $('.l4-done');
      box.hidden = false;
      box.innerHTML = `<strong>🏆 ¡Nivel 4 completado!</strong>
        <p>Has desbloqueado el Nivel 5: Robot Evasor de Obstáculos.</p>
        <button type="button" class="l4-btn-primary">Ir al menú</button>`;
      box.querySelector('button').addEventListener('click', onExit);
      box.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  if (isCompleted(4)) {
    const box = $('.l4-done');
    box.hidden = false;
    box.innerHTML = '<strong>✔ Ya superaste este nivel.</strong><p>Puedes repasarlo cuando quieras.</p>';
  }

  let anatomy = null;
  const board = createL298nSvg($('.l4-board-host'), (id) => anatomy?.show(id));
  anatomy = mountAnatomy($('.l4-chips'), $('.l4-card'), board);
  mountHBridge($('.l4-hb-host'));

  const sim = mountSim($('.l4-sim-host'), { onDone: () => mark('moves') });
  mountWiring($('.l4-wiring-host'), (res) => {
    sim.setWiring(res);
    if (res.status === 'ok') mark('wiring');
  });
  mountQuiz($('.l4-quiz-host'), () => mark('quiz'));

  $('.back-btn').addEventListener('click', onExit);
  renderSteps();
  return () => sim.destroy();
}
