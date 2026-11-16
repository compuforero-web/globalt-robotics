// Piezas HTML comunes de las lecciones: ejemplos, preguntas «Piensa», botones de salto y la lección por pasos.
// Los ejemplos nunca son la solución del reto; recorrer los pasos nunca aprueba nada.
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function exampleHtml(examples, id) {
  const ex = examples[id];
  return `<figure class="example">
    <figcaption><span class="tag tag--example">Ejemplo</span> ${esc(ex.title)} <span class="muted small">· no es la solución del reto</span></figcaption>
    <pre class="lesson-code"><code>${esc(ex.code)}</code></pre>
    <div class="example__actions">
      <button type="button" class="btn btn--ghost btn--sm" data-example="${id}" data-act="copy">Copiar</button>
      <button type="button" class="btn btn--outline btn--sm" data-example="${id}" data-act="try">Probar en el editor…</button>
    </div>
  </figure>`;
}

export function question(q, a) {
  return `<details class="think"><summary><span class="tag tag--think">Piensa</span> ${q}</summary><p>${a}</p></details>`;
}

export const goTo = (target, label) => `<button type="button" class="btn btn--ghost btn--sm step__go" data-goto="${target}">${label}</button>`;

export function challengeBox(challenge) {
  return `<div class="challenge-box">
        <p class="challenge-box__head"><span class="tag tag--challenge">Reto</span> ${challenge.title}</p>
        <p>${challenge.summary}</p>
        <ul class="criteria">${challenge.criteria.map((c) => `<li>${c}</li>`).join('')}</ul>
      </div>`;
}

/** Lección por pasos: objetivo, barra de pasos, secciones, navegación y alcance del simulador. */
export function renderLesson({ goal, steps, scope }) {
  const nav = steps.map((s, i) => `<li><button type="button" class="steps__btn" data-step="${i}" aria-controls="step-${s.id}">
      <span class="steps__n" aria-hidden="true">${i + 1}</span><span class="steps__label">${s.short}</span><span class="steps__seen" hidden><span class="sr-only"> (visto)</span><span aria-hidden="true">✓</span></span></button></li>`).join('');
  const sections = steps.map((s, i) => `<section class="step" id="step-${s.id}" aria-labelledby="step-${s.id}-t" hidden>
      <p class="step__count">Paso ${i + 1} de ${steps.length}</p>
      <h3 id="step-${s.id}-t" class="step__title" tabindex="-1">${s.title}</h3>
      ${s.html}
    </section>`).join('');
  return `
  <p class="lesson-goal"><strong>Objetivo:</strong> ${goal}</p>
  <nav class="steps" aria-label="Pasos de la lección"><ol>${nav}</ol></nav>
  ${sections}
  <div class="step-nav">
    <button type="button" class="btn btn--ghost btn--sm" data-nav="prev">← Anterior</button>
    <button type="button" class="btn btn--primary btn--sm" data-nav="next">Siguiente →</button>
  </div>
  <details class="lesson-block scope">
    <summary>Alcance del simulador</summary>
    <ul>
      ${scope.map((s) => `<li>${s}</li>`).join('\n      ')}
    </ul>
  </details>`;
}

/** Alcance común del simulador (cada lección añade su circuito). */
export const SCOPE_COMMON = [
  'Tu código se compila de verdad con avr-gcc y el núcleo Arduino AVR para Nano (ATmega328P a 16&nbsp;MHz).',
  'El archivo resultante se ejecuta instrucción por instrucción en un ATmega328P emulado (avr8js) dentro de tu navegador.',
];
