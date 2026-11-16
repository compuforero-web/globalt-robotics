// Evaluación rápida: 2 preguntas aleatorias de un banco de 5 (Puente H, GND común, PWM).
const BANK = [
  { q: '¿Por qué los motores no se conectan directo a los pines del Arduino Nano?',
    ok: 'Cada pin da máx. 40 mA y un motor DC pide cientos de mA: hace falta una etapa de potencia.',
    bad: ['Porque los motores solo funcionan con 3.3 V.', 'Porque los pines digitales no pueden dar HIGH.'],
    why: 'El L298N entrega la corriente desde las baterías; el Nano solo envía señales de pocos mA.' },
  { q: 'En un puente H, ¿qué ocurre al pasar de IN1=HIGH, IN2=LOW a IN1=LOW, IN2=HIGH?',
    ok: 'Cambian los interruptores activos, se invierte la polaridad y el motor gira al revés.',
    bad: ['El motor gira igual pero más rápido.', 'El motor se apaga siempre.'],
    why: 'S1+S4 pasan a S2+S3: la corriente cruza el motor en sentido contrario.' },
  { q: '¿Para qué sirve unir el GND del L298N con el GND del Nano?',
    ok: 'Para que ambos compartan la misma referencia de 0 V y entiendan HIGH/LOW igual.',
    bad: ['Para cargar las baterías 18650.', 'Para que el motor gire más fuerte.'],
    why: 'Sin GND común, las señales de control no tienen referencia y los motores no responden.' },
  { q: '¿A qué pines debes conectar ENA y ENB para regular la velocidad?',
    ok: 'A pines PWM marcados con ~ (D3, D5, D6, D9, D10, D11).',
    bad: ['A cualquier pin: todos soportan analogWrite.', 'Al pin de 5V.'],
    why: 'analogWrite solo genera PWM en pines con ~; en otros solo hay HIGH o LOW.' },
  { q: 'Si ejecutas analogWrite(ENA, 128), ¿cuál es el ciclo de trabajo aproximado?',
    ok: 'Cerca del 50 %: el motor recibe ~la mitad de la potencia promedio.',
    bad: ['100 %: velocidad máxima.', '12.8 %: casi detenido.'],
    why: '128 / 255 ≈ 0.5. PWM varía el tiempo en HIGH, no el voltaje pico.' },
];
const shuffle = (a) => a.map((v) => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);

export function mountQuiz(host, onPass) {
  function render() {
    const picks = shuffle(BANK).slice(0, 2);
    const result = [null, null];
    host.innerHTML = `${picks.map((p, i) => `<fieldset class="l4-q"><legend>${i + 1}. ${p.q}</legend>
      ${shuffle([[p.ok, true], ...p.bad.map((b) => [b, false])]).map(([t, r]) =>
    `<button type="button" class="l4-opt" data-q="${i}" data-r="${r ? 1 : 0}">${t}</button>`).join('')}
      <p class="l4-why" hidden></p></fieldset>`).join('')}
      <div class="l4-msg" role="status" aria-live="polite"></div>`;
    host.onclick = (e) => {
      const b = e.target.closest('.l4-opt');
      if (!b || result[b.dataset.q] !== null) return;
      const i = Number(b.dataset.q);
      const right = b.dataset.r === '1';
      result[i] = right;
      b.classList.add(right ? 'is-right' : 'is-wrong');
      host.querySelectorAll(`[data-q="${i}"]`).forEach((o) => { o.disabled = true; if (o.dataset.r === '1') o.classList.add('is-right'); });
      const why = b.closest('fieldset').querySelector('.l4-why');
      why.hidden = false;
      why.textContent = `${right ? '✔' : '✖'} ${picks[i].why}`;
      if (result.includes(null)) return;
      const msg = host.querySelector('.l4-msg');
      if (result.every(Boolean)) {
        msg.className = 'l4-msg is-ok';
        msg.textContent = '✔ ¡Evaluación superada!';
        onPass();
      } else {
        msg.className = 'l4-msg is-err';
        msg.innerHTML = 'Repasa las explicaciones e inténtalo con otras preguntas.<button type="button" class="l4-btn">Intentar de nuevo</button>';
        msg.querySelector('button').addEventListener('click', render);
      }
    };
  }
  render();
}
