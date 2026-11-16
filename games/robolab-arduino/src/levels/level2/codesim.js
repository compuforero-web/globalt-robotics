// Paso 3: simulación de <Servo.h> — Modo 1 servo.write(ángulo) y Modo 2 barrido con ciclos for.
const MIN_US = 1000, MAX_US = 2000;
export const pulseFor = (deg) => Math.round(MIN_US + (deg / 180) * (MAX_US - MIN_US));
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const sweepLines = (pin) => [
  '#include <Servo.h>',
  'Servo miServo;',
  'void setup() {',
  `  miServo.attach(${pin});`,
  '}',
  'void loop() {',
  '  for (int a = 0; a <= 180; a++) {',
  '    miServo.write(a);',
  '    delay(15);',
  '  }',
  '  for (int a = 180; a >= 0; a--) {',
  '    miServo.write(a);',
  '    delay(15);',
  '  }',
  '}',
];
const SPEEDS = { fast: { ms: 22, step: 5 }, slow: { ms: 140, step: 10 } };

/** Generador que recorre el programa línea a línea: produce [índiceLínea, a]. */
function* program() {
  yield [3, 0];
  for (;;) {
    for (let a = 0; a <= 180; a += 1) { yield [6, a, 'up']; yield [7, a]; yield [8, a]; a += yield [9, a]; }
    for (let a = 180; a >= 0; a -= 1) { yield [10, a, 'down']; yield [11, a]; yield [12, a]; a -= yield [13, a]; }
    yield [14, 0, 'cycle'];
  }
}

export function mountCode(host, { servo, onTried }) {
  host.innerHTML = `
    <div class="l2-seg l2-modes" role="tablist">
      <button type="button" data-mode="1" class="is-active" role="tab">Modo 1 · write(ángulo)</button>
      <button type="button" data-mode="2" role="tab">Modo 2 · Barrido for</button>
    </div>
    <div class="l2-mode" data-pane="1">
      <pre class="l2-code"><code class="l2-code1"></code></pre>
      <label class="l2-range">Ángulo: <b class="l2-deg">90°</b>
        <input type="range" class="l2-slider" min="0" max="180" value="90"></label>
      <div class="l2-quick">${[0, 90, 180].map((d) => `<button type="button" class="l2-btn" data-deg="${d}">${d}°</button>`).join('')}</div>
      <svg class="l2-wave" viewBox="0 0 300 70" aria-label="Pulso PWM en un periodo de 20 ms">
        <path class="l2-wave-path" fill="none" stroke="#f77f00" stroke-width="2.5"/>
        <line x1="10" y1="62" x2="290" y2="62" stroke="#64748b" stroke-dasharray="2 3"/>
        <text x="10" y="12" font-size="10" fill="currentColor" class="l2-wave-txt"></text>
        <text x="290" y="58" font-size="9" fill="currentColor" text-anchor="end">20 ms</text>
      </svg>
      <p class="l2-small">Usamos el estándar 1000–2000 µs. La librería Servo.h, por defecto, envía 544–2400 µs.</p>
    </div>
    <div class="l2-mode" data-pane="2" hidden>
      <div class="l2-actions">
        <button type="button" class="l2-btn-primary l2-run">▶ Ejecutar</button>
        <select class="l2-acc-sel" aria-label="Accesorio del servo">
          <option value="barrier">Talanquera</option><option value="radar">Radar</option><option value="horn">Brazo</option>
        </select>
        <select class="l2-speed" aria-label="Velocidad"><option value="fast">Rápido</option><option value="slow">Lento</option></select>
      </div>
      <pre class="l2-code l2-code2"></pre>
      <p class="l2-vars" aria-live="off">a = 0 · pulso = 1000 µs</p>
      <p class="l2-small">Simulación acelerada: cada paso avanza varios grados del <code>a++</code>.</p>
    </div>`;

  const $ = (s) => host.querySelector(s);
  let pin = '9', mode = 1, timer = 0, gen = null, seen = new Set();

  function setWrite(deg) {
    servo.setAngle(deg);
    const us = pulseFor(deg);
    $('.l2-deg').textContent = `${deg}°`;
    $('.l2-slider').value = deg;
    $('.l2-code1').innerHTML = esc(`#include <Servo.h>\nServo miServo;\nvoid setup() { miServo.attach(${pin}); }\nvoid loop() {\n  miServo.write(`)
      + `<mark>${deg}</mark>);  // pulso de ${us} µs\n}`;
    const w = (us / 20000) * 280;
    $('.l2-wave-path').setAttribute('d', `M10 62 L10 18 L${(10 + w).toFixed(1)} 18 L${(10 + w).toFixed(1)} 62 L290 62`);
    $('.l2-wave-txt').textContent = `Pulso: ${us} µs (${(us / 1000).toFixed(2)} ms) cada 20 ms`;
    seen.add(deg);
    if ([0, 90, 180].every((d) => seen.has(d)) || seen.size >= 4) onTried('write');
  }

  function renderSweep(active = -1) {
    $('.l2-code2').innerHTML = sweepLines(pin)
      .map((l, i) => `<span class="l2-line ${i === active ? 'is-current' : ''}">${esc(l) || ' '}</span>`).join('\n');
  }

  function stop() {
    clearInterval(timer);
    timer = 0;
    $('.l2-run').textContent = '▶ Ejecutar';
  }

  function run() {
    if (timer) { stop(); return; }
    gen = gen || program();
    const { ms, step } = SPEEDS[$('.l2-speed').value];
    $('.l2-run').textContent = '■ Detener';
    let res = gen.next();
    timer = setInterval(() => {
      const [line, a, tag] = res.value;
      renderSweep(line);
      if (line === 7 || line === 11) servo.setAngle(a);
      $('.l2-vars').textContent = `a = ${a} · pulso = ${pulseFor(a)} µs · línea ${line + 1}`;
      if (tag === 'cycle') onTried('sweep');
      res = gen.next(line === 9 || line === 13 ? step - 1 : undefined);
    }, ms);
  }

  host.addEventListener('click', (e) => {
    const m = e.target.closest('[data-mode]');
    if (m) {
      mode = Number(m.dataset.mode);
      stop();
      host.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('is-active', b === m));
      host.querySelectorAll('[data-pane]').forEach((p) => { p.hidden = Number(p.dataset.pane) !== mode; });
      servo.setAccessory(mode === 2 ? $('.l2-acc-sel').value : 'horn');
      if (mode === 1) setWrite(Number($('.l2-slider').value));
      return;
    }
    const d = e.target.closest('[data-deg]');
    if (d) setWrite(Number(d.dataset.deg));
  });
  $('.l2-slider').addEventListener('input', (e) => setWrite(Number(e.target.value)));
  $('.l2-run').addEventListener('click', run);
  $('.l2-speed').addEventListener('change', () => { if (timer) { stop(); run(); } });
  $('.l2-acc-sel').addEventListener('change', (e) => servo.setAccessory(e.target.value));

  renderSweep();
  return {
    enable(p) {
      pin = /^D\d+$/.test(p) ? p.slice(1) : p;
      host.classList.remove('is-locked');
      host.inert = false;
      renderSweep();
      if (mode === 1) setWrite(Number($('.l2-slider').value));
    },
    disable() {
      stop();
      host.classList.add('is-locked');
      host.inert = true;
    },
    destroy: stop,
  };
}
