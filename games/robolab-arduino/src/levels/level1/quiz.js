// Evaluación rápida: 2 preguntas al azar sobre los pines del Nano.
const POOL = [
  {
    q: '¿Qué símbolo indica que un pin puede usar analogWrite() (PWM)?',
    options: ['~ (virgulilla)', 'A (de analógico)', '+ (positivo)'], answer: 0,
    why: 'Los pines marcados con ~ (D3, D5, D6, D9, D10, D11) generan PWM. Los pines A0–A7 son entradas analógicas, no salidas PWM.',
  },
  {
    q: '¿Qué pines del Nano son SOLO entradas analógicas?',
    options: ['D2 y D3', 'A6 y A7', 'A0 y A1'], answer: 1,
    why: 'A6 y A7 solo pueden leer con analogRead(). A0–A5 también funcionan como pines digitales.',
  },
  {
    q: '¿Dónde se conecta el cátodo (pata corta) del LED?',
    options: ['Al pin 5V', 'A un pin PWM', 'A GND'], answer: 2,
    why: 'La corriente entra por el ánodo (+) y sale por el cátodo (−) hacia GND, que es 0 V.',
  },
  {
    q: '¿Qué voltaje entrega un pin digital con digitalWrite(pin, HIGH)?',
    options: ['5 V', '3,3 V', '12 V'], answer: 0,
    why: 'En el Nano, HIGH equivale a 5 V y LOW a 0 V.',
  },
  {
    q: '¿Qué rango de valores acepta analogWrite()?',
    options: ['0 a 1023', '0 a 255', '0 a 5'], answer: 1,
    why: 'analogWrite() usa 0–255 (8 bits). El rango 0–1023 es el que devuelve analogRead().',
  },
];

function pickTwo() {
  const idx = POOL.map((_, i) => i).sort(() => Math.random() - 0.5);
  return idx.slice(0, 2).map((i) => POOL[i]);
}

/** Monta el cuestionario; llama a `onPass()` cuando ambas respuestas son correctas. */
export function mountQuiz(host, onPass) {
  const qs = pickTwo();
  const solved = new Set();
  host.innerHTML = qs.map((item, qi) => `
    <fieldset class="l1-q" data-q="${qi}">
      <legend>${qi + 1}. ${item.q}</legend>
      <div class="l1-opts">
        ${item.options.map((o, oi) => `<button type="button" data-o="${oi}">${o}</button>`).join('')}
      </div>
      <p class="l1-why" role="status" aria-live="polite"></p>
    </fieldset>`).join('');

  host.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-o]');
    if (!btn) return;
    const box = btn.closest('.l1-q');
    const qi = Number(box.dataset.q);
    if (solved.has(qi)) return;
    const item = qs[qi];
    const ok = Number(btn.dataset.o) === item.answer;
    btn.classList.add(ok ? 'is-right' : 'is-wrong');
    box.querySelector('.l1-why').textContent = ok ? `✅ ¡Correcto! ${item.why}` : '❌ No es esa. Piensa en lo que viste en la placa e inténtalo de nuevo.';
    if (ok) {
      solved.add(qi);
      box.querySelectorAll('[data-o]').forEach((b) => { b.disabled = true; });
      if (solved.size === qs.length) onPass();
    }
  });
}
