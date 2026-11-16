// Nivel 5: Proyecto final — Robot Evasor de Obstáculos.
import { partsSvg } from './parts.js';
import { mountWiring } from './wiring.js';
import { mountCode } from './code.js';
import { mountSim } from './sim.js';
import { mountQuiz } from './quiz.js';
import { showGraduation } from './grad.js';
import { completeLevel, isCompleted } from '../../core/progress.js';

const STEPS = ['Ensamblaje eléctrico sin fallos', 'Cargar el código al robot', 'Llegar a la meta de forma autónoma', 'Aprobar 2 de 3 preguntas'];

function ensureStyles() {
  if (document.getElementById('l5-styles')) return;
  const link = document.createElement('link');
  link.id = 'l5-styles';
  link.rel = 'stylesheet';
  link.href = 'styles/level5.css';
  document.head.appendChild(link);
}

export function mountLevel5(app, { onExit }) {
  ensureStyles();
  app.innerHTML = `<section class="l5">
    <header class="l5-head"><button type="button" class="back-btn">← Volver al menú</button>
      <h2>Nivel 5: Proyecto Final — Robot Evasor</h2><ol class="l5-steps"></ol></header>
    <div class="l5-grad" hidden></div>
    <article class="l5-panel"><h3>Fase 1 · Ensamblaje e integración eléctrica</h3><div class="l5-parts">${partsSvg()}</div><div class="l5-wire"></div></article>
    <article class="l5-panel" hidden data-p="2"><h3>Fase 2 · Lógica de control y máquina de estados</h3><div class="l5-codehost"></div></article>
    <article class="l5-panel" hidden data-p="3"><h3>Fase 3 · Pista de pruebas autónoma</h3><div class="l5-simhost"></div></article>
    <article class="l5-panel" hidden data-p="4"><h3>Fase 4 · Certificación final</h3><div class="l5-quizhost"></div></article>
  </section>`;
  const q = (s) => app.querySelector(s);
  const panel = (n) => q(`[data-p="${n}"]`);
  const done = [false, false, false, false];
  const renderSteps = () => {
    q('.l5-steps').innerHTML = STEPS.map((s, i) => `<li class="${done[i] ? 'is-done' : ''}">${done[i] ? '✔' : '○'} ${s}</li>`).join('');
  };
  q('.back-btn').addEventListener('click', onExit);

  let code = null;
  let sim = null;
  let quizReady = false;
  const wiring = mountWiring(q('.l5-wire'), {
    onState(ok) {
      done[0] = ok;
      panel(2).hidden = !ok;
      if (!ok) { panel(3).hidden = true; panel(4).hidden = true; done[1] = false; done[2] = false; }
      if (ok && !code) code = mountCode(q('.l5-codehost'), wiring, { onLoad: loadProgram });
      else if (ok) code.render();
      renderSteps();
    },
  });

  function loadProgram() {
    done[1] = true;
    panel(3).hidden = false;
    if (!sim) {
      sim = mountSim(q('.l5-simhost'), { getParams: () => code.params, onState: (s) => code.setActive(s), onWin });
    } else sim.reset();
    renderSteps();
  }
  function onWin() {
    done[2] = true;
    panel(4).hidden = false;
    if (!quizReady) {
      quizReady = true;
      mountQuiz(q('.l5-quizhost'), { onPass() { done[3] = true; completeLevel(5); renderSteps(); showGraduation(q('.l5-grad'), onExit); } });
    }
    renderSteps();
  }

  if (isCompleted(5)) showGraduation(q('.l5-grad'), onExit);
  renderSteps();
  return () => sim?.destroy();
}
