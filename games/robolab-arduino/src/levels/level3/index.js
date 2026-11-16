// Nivel 3: Percepción del entorno con el sensor ultrasónico HC-SR04.
import { createSensorSvg } from './sensor-svg.js';
import { mountAnatomy } from './anatomy.js';
import { mountWiring } from './wiring.js';
import { mountSim } from './sim.js';
import { mountCode } from './codepanel.js';
import { mountQuiz } from './quiz.js';
import { completeLevel, isCompleted } from '../../core/progress.js';

const STEPS = [
  ['wiring', 'Cableado correcto (VCC, GND, Trig y Echo)'],
  ['near', 'Acercar el obstáculo a menos de 15 cm'],
  ['far', 'Alejar el obstáculo a más de 50 cm'],
  ['quiz', 'Responder 2 preguntas'],
];

function ensureStyles() {
  if (document.getElementById('l3-styles')) return;
  const link = document.createElement('link');
  link.id = 'l3-styles';
  link.rel = 'stylesheet';
  link.href = 'styles/level3.css';
  document.head.appendChild(link);
}

/** Monta el nivel en `app`. Devuelve una función de limpieza. */
export function mountLevel3(app, { onExit }) {
  ensureStyles();
  app.innerHTML = `
    <section class="l3">
      <header class="l3-head">
        <button type="button" class="back-btn">← Volver al menú</button>
        <h2>Nivel 3: Sensor Ultrasónico HC-SR04</h2>
        <ol class="l3-steps"></ol>
      </header>
      <div class="l3-done" hidden></div>
      <article class="l3-panel">
        <h3>1 · Anatomía del sensor</h3>
        <div class="l3-sensor-host"></div>
        <div class="l3-chips"></div>
        <div class="l3-card" aria-live="polite"></div>
      </article>
      <article class="l3-panel">
        <h3>2 · Reto de cableado</h3>
        <div class="l3-wiring-host"></div>
      </article>
      <article class="l3-panel">
        <h3>3 · Simulación, fórmula y Monitor Serie</h3>
        <div class="l3-sim-host"></div>
        <div class="l3-code-host"></div>
      </article>
      <article class="l3-panel">
        <h3>4 · Evaluación rápida</h3>
        <div class="l3-quiz-host"></div>
      </article>
    </section>`;

  const $ = (s) => app.querySelector(s);
  const done = new Set();

  function renderSteps() {
    $('.l3-steps').innerHTML = STEPS.map(([id, label]) =>
      `<li class="${done.has(id) ? 'is-done' : ''}">${done.has(id) ? '✔' : '○'} ${label}</li>`).join('');
  }

  function mark(id) {
    if (done.has(id)) return;
    done.add(id);
    renderSteps();
    if (done.size === STEPS.length) {
      completeLevel(3);
      const box = $('.l3-done');
      box.hidden = false;
      box.innerHTML = `<strong>🏆 ¡Nivel 3 completado!</strong>
        <p>Has desbloqueado el Nivel 4: Puente H L298N y Motores.</p>
        <button type="button" class="l3-btn-primary">Ir al menú</button>`;
      box.querySelector('button').addEventListener('click', onExit);
      box.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  if (isCompleted(3)) {
    const box = $('.l3-done');
    box.hidden = false;
    box.innerHTML = '<strong>✔ Ya superaste este nivel.</strong><p>Puedes repasarlo cuando quieras.</p>';
  }

  let anatomy = null;
  const sensor = createSensorSvg($('.l3-sensor-host'), (part) => anatomy?.show(part));
  anatomy = mountAnatomy($('.l3-chips'), $('.l3-card'), sensor);

  const code = mountCode($('.l3-code-host'));
  const sim = mountSim($('.l3-sim-host'), {
    onPhase(phase, res) {
      code.phase(phase, res);
      if (phase !== 'calc') return;
      if (res.dist < 15) mark('near');
      if (res.dist > 50) mark('far');
    },
  });
  mountWiring($('.l3-wiring-host'), (r) => {
    if (r.ok) {
      mark('wiring');
      code.setPins(r.trig, r.echo);
      sim.enable();
    } else {
      sim.disable();
      code.reset();
    }
  });
  mountQuiz($('.l3-quiz-host'), () => mark('quiz'));

  $('.back-btn').addEventListener('click', onExit);
  renderSteps();
  return () => { sim.destroy(); code.destroy(); };
}
