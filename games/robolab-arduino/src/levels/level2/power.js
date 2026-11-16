// Nota educativa interactiva: caídas de voltaje al alimentar servos desde el pin 5V del Nano.
const PEAK_A = 0.65;       // corriente pico aprox. de un SG90 al arrancar o forzarse
const R_USB = 0.75;        // resistencia aprox. de cable USB + diodo + fusible del Nano (Ω)
const R_EXT = 0.08;        // resistencia aprox. de una fuente externa 5V 2A y sus cables (Ω)
const BROWNOUT = 4.3;      // umbral típico de brown-out del ATmega328P (V)

export function mountPower(host) {
  host.innerHTML = `
    <details class="l2-power">
      <summary>⚡ Nota de energía: ¿por qué se reinicia mi Arduino con varios servos?</summary>
      <p>Cada servo, al arrancar, puede pedir unos <b>650 mA</b> de golpe. Por USB solo llegan ~500 mA y la corriente
      atraviesa cable, diodo y fusible: el voltaje <b>cae</b>. Si baja de ~4.3 V, el microcontrolador detecta
      <i>brown-out</i> y <b>se reinicia</b>.</p>
      <div class="l2-power-ctl">
        <label>Servos moviéndose a la vez: <b class="l2-n">1</b>
          <input type="range" class="l2-n-range" min="1" max="4" value="1"></label>
        <div class="l2-seg" role="group" aria-label="Fuente de alimentación de los servos">
          <button type="button" data-src="nano" class="is-active">Pin 5V del Nano</button>
          <button type="button" data-src="ext">Fuente externa + GND común</button>
        </div>
      </div>
      <div class="l2-meter"><div class="l2-meter-bar"></div></div>
      <p class="l2-power-out" aria-live="polite"></p>
      <p class="l2-small">Solución: el rojo de los servos va al <b>+5V de la fuente externa</b>, el marrón a su <b>GND</b>,
      y ese GND se une con el <b>GND del Nano</b>. El naranja sigue en el pin digital. Así la potencia no pasa por la placa,
      pero la señal comparte la misma referencia de 0 V.</p>
    </details>`;

  const $ = (s) => host.querySelector(s);
  let src = 'nano';

  function update() {
    const n = Number($('.l2-n-range').value);
    $('.l2-n').textContent = n;
    const amps = n * PEAK_A;
    const vServo = 5 - amps * (src === 'nano' ? R_USB : R_EXT);
    const vBoard = src === 'nano' ? vServo : 5;
    const reset = vBoard < BROWNOUT;
    const bar = $('.l2-meter-bar');
    bar.style.width = `${Math.max(0, Math.min(100, ((vServo - 3) / 2) * 100))}%`;
    bar.className = `l2-meter-bar ${reset ? 'is-bad' : vServo < 4.6 ? 'is-warn' : 'is-good'}`;
    const head = `Pico ≈ ${amps.toFixed(2)} A · servos a ${vServo.toFixed(2)} V · Nano a ${vBoard.toFixed(2)} V.`;
    const verdict = reset
      ? ' 🔁 ¡Brown-out! El Nano se reinicia y el programa vuelve a empezar: los servos dan tirones sin control.'
      : src === 'nano'
        ? ' ✅ Aguanta, aunque el voltaje ya se nota afectado.'
        : ' ✅ La fuente externa entrega la corriente y el Nano queda estable a 5 V.';
    const out = $('.l2-power-out');
    out.textContent = head + verdict;
    out.classList.toggle('is-error', reset);
    host.querySelector('.l2-power').classList.toggle('is-reset', reset);
  }

  $('.l2-n-range').addEventListener('input', update);
  $('.l2-seg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-src]');
    if (!b) return;
    src = b.dataset.src;
    host.querySelectorAll('[data-src]').forEach((x) => x.classList.toggle('is-active', x === b));
    update();
  });
  update();
}
