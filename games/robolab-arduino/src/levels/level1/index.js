// Nivel 1: Anatomía del Arduino Nano y primeras señales digitales.
import { mountBoard } from './board.js';
import { mountWiring } from './wiring.js';
import { mountCode } from './codesim.js';
import { mountQuiz } from './quiz.js';
import { completeLevel, isCompleted } from '../../core/progress.js';

const STEPS = [
  ['wiring', 'Cableado correcto (LED + 220Ω en pin PWM)'],
  ['digital', 'Probar digitalWrite (parpadeo)'],
  ['analog', 'Probar analogWrite (brillo 0–255)'],
  ['quiz', 'Responder 2 preguntas'],
];

function ensureStyles() {
  if (document.getElementById('l1-styles')) return;
  const link = document.createElement('link');
  link.id = 'l1-styles';
  link.rel = 'stylesheet';
  link.href = 'styles/level1.css';
  document.head.appendChild(link);
}

/** Monta el nivel en `app`. Devuelve una función de limpieza. */
export function mountLevel1(app, { onExit }) {
  ensureStyles();
  app.innerHTML = `
    <section class="l1">
      <header class="l1-head">
        <button type="button" class="back-btn">← Volver al menú</button>
        <h2>Nivel 1: Anatomía del Arduino Nano</h2>
        <ol class="l1-steps"></ol>
      </header>
      <div class="l1-done" hidden></div>
      <article class="l1-panel">
        <h3>1 · Explora la placa</h3>
        <div class="l1-explore"><div class="l1-board-host"></div><div class="l1-card" aria-live="polite"></div></div>
      </article>
      <article class="l1-panel">
        <h3>2 · Reto de cableado</h3>
        <p>Enciende el LED de forma segura: pin PWM (<b>D3~</b> o <b>D5~</b>) → resistencia de 220 Ω y LED en serie → <b>GND</b>.</p>
        <div class="l1-wiring-host"></div>
      </article>
      <article class="l1-panel">
        <h3>3 · Simula el código</h3>
        <div class="l1-code-host is-locked"></div>
      </article>
      <article class="l1-panel">
        <h3>4 · Evaluación rápida</h3>
        <div class="l1-quiz-host"></div>
      </article>
    </section>`;

  const $ = (s) => app.querySelector(s);
  const done = new Set();
  const alreadyCompleted = isCompleted(1);

  function renderSteps() {
    $('.l1-steps').innerHTML = STEPS.map(([id, label]) =>
      `<li class="${done.has(id) ? 'is-done' : ''}">${done.has(id) ? '✔' : '○'} ${label}</li>`).join('');
  }

  function mark(id) {
    if (done.has(id)) return;
    done.add(id);
    renderSteps();
    if (done.size === STEPS.length) {
      completeLevel(1);
      const box = $('.l1-done');
      box.hidden = false;
      box.innerHTML = `<strong>🏆 ¡Nivel 1 completado!</strong>
        <p>Has desbloqueado el Nivel 2: Microservo SG90.</p>
        <button type="button" class="l1-btn-primary">Ir al menú</button>`;
      box.querySelector('button').addEventListener('click', onExit);
      box.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  if (alreadyCompleted) {
    const box = $('.l1-done');
    box.hidden = false;
    box.innerHTML = '<strong>✔ Ya superaste este nivel.</strong><p>Puedes repasarlo cuando quieras.</p>';
  }

  mountBoard($('.l1-board-host'), $('.l1-card'));
  let code = null;
  const wiring = mountWiring($('.l1-wiring-host'), (r) => {
    if (r.ok) { mark('wiring'); code.enable(r.pin); } else { code.disable(); }
  });
  code = mountCode($('.l1-code-host'), { onLevel: (lv) => wiring.setLed(lv), onTried: mark });
  code.disable();
  mountQuiz($('.l1-quiz-host'), () => mark('quiz'));

  $('.back-btn').addEventListener('click', onExit);
  renderSteps();
  return () => code.destroy();
}
