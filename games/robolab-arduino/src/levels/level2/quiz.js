// Paso 4: evaluación rápida — 2 preguntas aleatorias de un banco de 5 (cables, ángulos y alimentación).
const BANK = [
  {
    q: '¿Qué cable del SG90 lleva la señal PWM?',
    ok: 'Naranja', bad: ['Rojo', 'Marrón'],
    why: 'Naranja = señal, Rojo = 5V, Marrón = GND.',
  },
  {
    q: '¿Qué ancho de pulso corresponde a 90° (posición central)?',
    ok: '1500 µs', bad: ['1000 µs', '2000 µs'],
    why: '1000 µs ≈ 0°, 1500 µs ≈ 90° y 2000 µs ≈ 180°.',
  },
  {
    q: '¿Cada cuánto tiempo recibe el servo un pulso de control?',
    ok: 'Cada 20 ms (50 Hz)', bad: ['Cada 1 ms', 'Cada 1 segundo'],
    why: 'El servo espera un pulso cada 20 ms; la duración del pulso define el ángulo.',
  },
  {
    q: 'Vas a mover 3 servos a la vez. ¿Cómo los alimentas?',
    ok: 'Fuente externa de 5V con GND común al Nano', bad: ['Todos al pin 5V del Nano', 'Al pin 3.3V del Nano'],
    why: 'Los picos de corriente hacen caer el 5V del Nano y la placa se reinicia (brown-out).',
  },
  {
    q: '¿Qué pasa si conectas el cable de señal al pin A6 del Nano?',
    ok: 'No funciona: A6 y A7 son solo entradas analógicas', bad: ['Funciona igual que D9', 'El servo gira siempre a 180°'],
    why: 'A6/A7 no tienen salida digital, así que no pueden generar pulsos.',
  },
];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function mountQuiz(host, onPass) {
  let picked = [];

  function render() {
    picked = shuffle(BANK).slice(0, 2);
    host.innerHTML = picked.map((item, qi) => `
      <fieldset class="l2-q" data-q="${qi}">
        <legend>${qi + 1}. ${item.q}</legend>
        ${shuffle([item.ok, ...item.bad]).map((opt) => `
          <label class="l2-opt"><input type="radio" name="l2q${qi}" value="${opt}"> ${opt}</label>`).join('')}
        <p class="l2-why" hidden></p>
      </fieldset>`).join('') + `
      <div class="l2-actions"><button type="button" class="l2-btn-primary l2-check-quiz">Comprobar respuestas</button></div>
      <p class="l2-feedback" aria-live="polite"></p>`;

    host.querySelector('.l2-check-quiz').addEventListener('click', check);
  }

  function check() {
    let right = 0;
    picked.forEach((item, qi) => {
      const sel = host.querySelector(`input[name="l2q${qi}"]:checked`);
      const good = sel?.value === item.ok;
      if (good) right++;
      const why = host.querySelector(`[data-q="${qi}"] .l2-why`);
      why.hidden = false;
      why.textContent = `${good ? '✔' : '✘'} ${item.why}`;
      why.className = `l2-why ${good ? 'is-ok' : 'is-error'}`;
    });
    const fb = host.querySelector('.l2-feedback');
    if (right === picked.length) {
      fb.textContent = '🎉 ¡Perfecto! Respondiste todo bien.';
      fb.className = 'l2-feedback is-ok';
      host.querySelector('.l2-check-quiz').disabled = true;
      onPass();
      return;
    }
    fb.innerHTML = `Acertaste ${right} de ${picked.length}. Lee las pistas e inténtalo con otras preguntas.
      <button type="button" class="l2-btn l2-retry">Nuevas preguntas</button>`;
    fb.className = 'l2-feedback is-error';
    fb.querySelector('.l2-retry').addEventListener('click', render);
  }

  render();
}
