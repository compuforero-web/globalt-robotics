// Evaluación rápida: 2 preguntas aleatorias de un banco de 5.
const BANK = [
  { q: '¿Qué pin del HC-SR04 configura Arduino como OUTPUT para iniciar la medición?',
    a: ['Trig', 'Echo', 'VCC', 'GND'], why: 'Arduino envía el pulso de disparo por Trig.' },
  { q: '¿Cuánto debe durar el pulso HIGH en Trig para lanzar el ultrasonido?',
    a: ['10 µs', '10 ms', '1 s', '40 µs'], why: 'Basta un pulso de 10 microsegundos.' },
  { q: '¿Qué devuelve pulseIn(ECHO, HIGH)?',
    a: ['Los µs que Echo estuvo en HIGH', 'La distancia en cm', 'La frecuencia de 40 kHz', 'El número de ecos'],
    why: 'Devuelve la duración del pulso en microsegundos (ida + vuelta).' },
  { q: 'La velocidad del sonido (343 m/s) expresada en cm por microsegundo es aprox.:',
    a: ['0.034 cm/µs', '3.4 cm/µs', '34 cm/µs', '0.34 cm/µs'], why: '343 m/s = 34 300 cm / 1 000 000 µs ≈ 0.034.' },
  { q: 'En distancia = (tiempo × 0.034) / 2, ¿por qué se divide entre 2?',
    a: ['La onda viaja de ida y de vuelta', 'El sensor tiene 2 transductores', 'Para pasar de µs a ms', 'Para redondear'],
    why: 'El tiempo medido incluye ir al obstáculo y regresar.' },
];

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export function mountQuiz(host, onPass) {
  let round = [];
  let passed = false;

  function newRound() {
    round = shuffle(BANK).slice(0, 2).map((item) => ({ ...item, opts: shuffle(item.a), pick: null }));
    host.innerHTML = `${round.map((it, i) => `
      <fieldset class="l3-q" data-i="${i}">
        <legend>${i + 1}. ${it.q}</legend>
        ${it.opts.map((o) => `<button type="button" class="l3-opt" data-o="${o}">${o}</button>`).join('')}
        <p class="l3-why" hidden></p>
      </fieldset>`).join('')}
      <div class="l3-actions"><button type="button" class="l3-btn-primary" data-act="check">Comprobar respuestas</button></div>
      <div class="l3-msg" aria-live="polite"></div>`;
  }

  host.addEventListener('click', (e) => {
    const opt = e.target.closest('.l3-opt');
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (opt && !passed) {
      const fs = opt.closest('.l3-q');
      round[fs.dataset.i].pick = opt.dataset.o;
      fs.querySelectorAll('.l3-opt').forEach((b) => b.classList.toggle('is-sel', b === opt));
      return;
    }
    if (act === 'retry') { newRound(); return; }
    if (act !== 'check' || passed) return;
    if (round.some((it) => !it.pick)) {
      host.querySelector('.l3-msg').innerHTML = 'Responde las 2 preguntas.';
      return;
    }
    let good = 0;
    host.querySelectorAll('.l3-q').forEach((fs) => {
      const it = round[fs.dataset.i];
      const ok = it.pick === it.a[0];
      good += ok;
      fs.querySelectorAll('.l3-opt').forEach((b) => {
        b.classList.toggle('is-right', b.dataset.o === it.a[0]);
        b.classList.toggle('is-wrong', b.dataset.o === it.pick && !ok);
      });
      const why = fs.querySelector('.l3-why');
      why.hidden = false;
      why.textContent = `${ok ? '✔' : '✘'} ${it.why}`;
    });
    const msg = host.querySelector('.l3-msg');
    if (good === 2) {
      passed = true;
      msg.className = 'l3-msg is-ok';
      msg.textContent = '✔ ¡2 de 2! Evaluación aprobada.';
      onPass();
    } else {
      msg.className = 'l3-msg is-err';
      msg.innerHTML = `${good} de 2. Repasa la explicación e inténtalo con otras preguntas.
        <button type="button" class="l3-btn" data-act="retry">Nuevas preguntas</button>`;
    }
  });
  newRound();
}
