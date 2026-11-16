// Simulación de código: digitalWrite (parpadeo) y analogWrite (PWM 0–255).
const BLINKS_NEEDED = 4;

function digitalCode(pin) {
  return [
    'void setup() {',
    `  pinMode(${pin}, OUTPUT);`,
    '}',
    'void loop() {',
    `  digitalWrite(${pin}, HIGH);  // 5 V → encendido`,
    '  delay(500);',
    `  digitalWrite(${pin}, LOW);   // 0 V → apagado`,
    '  delay(500);',
    '}',
  ];
}

function analogCode(pin, v) {
  return [
    'void setup() {',
    `  pinMode(${pin}, OUTPUT);`,
    '}',
    'void loop() {',
    `  analogWrite(${pin}, ${v});  // 0–255`,
    '}',
  ];
}

const codeHtml = (lines, active = -1) => lines
  .map((l, i) => `<span class="l1-line${i === active ? ' is-run' : ''}">${l.replace(/</g, '&lt;')}</span>`)
  .join('\n');

function waveSvg(v) {
  const duty = v / 255;
  let d = 'M0 40';
  for (let p = 0; p < 4; p += 1) {
    const x = p * 50;
    const hi = x + duty * 50;
    d += duty > 0 ? ` L${x} 8 L${hi} 8 L${hi} 40` : '';
    d += ` L${x + 50} 40`;
  }
  return `<svg viewBox="-2 0 204 48" class="l1-wave" aria-hidden="true"><path d="${d}"/></svg>`;
}

/**
 * Monta el panel. `onLevel(0..1)` refleja el brillo; `onTried('digital'|'analog')` marca los modos probados.
 * Devuelve { enable(pin), disable(), destroy() }.
 */
export function mountCode(host, { onLevel, onTried }) {
  host.innerHTML = `
    <div class="l1-tabs" role="tablist">
      <button type="button" role="tab" data-mode="digital" class="is-on">digitalWrite</button>
      <button type="button" role="tab" data-mode="analog">analogWrite</button>
    </div>
    <div class="l1-sim">
      <pre class="l1-code"></pre>
      <div class="l1-out">
        <svg viewBox="0 0 80 100" class="l1-bigled" aria-label="LED simulado">
          <circle cx="40" cy="40" r="38" class="l1-bigled-glow" opacity="0"/>
          <path d="M22 70 V40 a18 18 0 0 1 36 0 V70 Z" class="l1-led-body"/>
          <path d="M32 70 V98 M48 70 V92" class="l1-leg"/>
        </svg>
        <div class="l1-ctrl"></div>
      </div>
    </div>
    <p class="l1-locked">🔒 Primero completa el cableado correcto con un pin PWM.</p>`;

  const code = host.querySelector('.l1-code');
  const ctrl = host.querySelector('.l1-ctrl');
  const glow = host.querySelector('.l1-bigled-glow');
  const body = host.querySelector('.l1-led-body');
  let pin = null;
  let mode = 'digital';
  let timer = null;
  let blinks = 0;
  let analog = { v: 128, min: 128, max: 128 };

  const setLevel = (lv) => {
    glow.setAttribute('opacity', String(lv));
    body.style.fillOpacity = String(0.45 + 0.55 * lv);
    onLevel(lv);
  };
  const stop = () => { clearInterval(timer); timer = null; };

  function renderDigital() {
    stop();
    let on = false;
    code.innerHTML = codeHtml(digitalCode(pin));
    ctrl.innerHTML = `<button type="button" class="l1-btn-primary" data-act="run">▶ Ejecutar</button>
      <p class="l1-meter">Pin ${pin}: <strong>0 V</strong></p>`;
    const btn = ctrl.querySelector('[data-act="run"]');
    const meter = ctrl.querySelector('strong');
    setLevel(0);
    btn.addEventListener('click', () => {
      if (timer) { stop(); btn.textContent = '▶ Ejecutar'; return; }
      btn.textContent = '⏸ Pausar';
      const tick = () => {
        on = !on;
        setLevel(on ? 1 : 0);
        meter.textContent = on ? '5 V (HIGH)' : '0 V (LOW)';
        code.innerHTML = codeHtml(digitalCode(pin), on ? 4 : 6);
        blinks += 1;
        if (blinks === BLINKS_NEEDED) onTried('digital');
      };
      tick();
      timer = setInterval(tick, 500);
    });
  }

  function renderAnalog() {
    stop();
    ctrl.innerHTML = `
      <label class="l1-slider">Valor PWM: <strong>${analog.v}</strong>
        <input type="range" min="0" max="255" value="${analog.v}" aria-label="Valor de analogWrite"/>
      </label>
      <div class="l1-wave-box"></div>
      <p class="l1-meter"></p>
      <p class="l1-hint">Desliza de un extremo a otro para ver el cambio de brillo.</p>`;
    const input = ctrl.querySelector('input');
    const update = () => {
      const v = Number(input.value);
      analog = { v, min: Math.min(analog.min, v), max: Math.max(analog.max, v) };
      ctrl.querySelector('strong').textContent = v;
      code.innerHTML = codeHtml(analogCode(pin, v), 4);
      ctrl.querySelector('.l1-wave-box').innerHTML = waveSvg(v);
      ctrl.querySelector('.l1-meter').textContent = `Encendido ${Math.round((v / 255) * 100)}% del tiempo `
        + `≈ ${((v / 255) * 5).toFixed(2)} V promedio`;
      setLevel(v / 255);
      if (analog.max - analog.min >= 128) onTried('analog');
    };
    input.addEventListener('input', update);
    update();
  }

  const render = () => (mode === 'digital' ? renderDigital() : renderAnalog());

  host.querySelector('.l1-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-mode]');
    if (!b || !pin) return;
    mode = b.dataset.mode;
    host.querySelectorAll('[data-mode]').forEach((t) => t.classList.toggle('is-on', t === b));
    render();
  });

  return {
    enable(p) { pin = Number(p.slice(1)); host.classList.remove('is-locked'); render(); },
    disable() {
      stop(); pin = null; host.classList.add('is-locked');
      code.innerHTML = ''; ctrl.innerHTML = ''; setLevel(0);
    },
    destroy: stop,
  };
}
