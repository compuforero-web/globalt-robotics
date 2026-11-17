// Ilustraciones originales de los circuitos. Se iluminan con las medidas de los pines del microcontrolador
// emulado (ventanas de pwm.js): nivel al final de la ventana y, si hay PWM, el % de tiempo en HIGH.
// No hay animaciones preparadas: si el programa no mueve un pin, su componente no cambia.
import { isPwmWindow } from './pwm.js';

const DIGITAL = [13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
export const PWM_PINS = new Set([3, 5, 6, 9, 10, 11]);
const pct = (d) => `${Math.round(d * 100)} %`;

/** Tira de indicadores D0–D13 (los pines con PWM llevan «~» y muestran el % medido). */
export function pinStripHtml() {
  return `<div class="pin-strip" aria-label="Estado de los pines digitales">
    ${[...Array(14).keys()].map((p) => `<span class="pin-dot" data-pin="${p}" title="D${p}${PWM_PINS.has(p) ? ' (PWM)' : ''}">D${p}${PWM_PINS.has(p) ? '<span class="pin-dot__pwm" aria-hidden="true">~</span>' : ''}<span class="pin-dot__pct" hidden></span></span>`).join('')}
  </div>`;
}

export function pinStrip(root) {
  const dots = new Map([...root.querySelectorAll('.pin-dot')].map((d) => [Number(d.dataset.pin), d]));
  return {
    update(w) {
      const dot = dots.get(w.pin);
      if (!dot) return;
      const pwm = isPwmWindow(w);
      dot.classList.toggle('is-high', pwm ? w.duty >= 0.5 : w.level);
      dot.classList.toggle('is-pwm', pwm);
      const label = dot.querySelector('.pin-dot__pct');
      label.hidden = !pwm;
      label.textContent = pwm ? ' ' + pct(w.duty) : '';
    },
    reset() { for (const pin of dots.keys()) this.update({ pin, duty: 0, level: false, rises: 0 }); },
  };
}

/** Estado de un LED según la ventana medida: { on, brightness 0…1 }. Con PWM, brillo proporcional al %. */
export function ledState(w) {
  if (isPwmWindow(w)) return { on: w.duty > 0.02, brightness: w.duty };
  return { on: w.level, brightness: w.level ? 1 : 0 };
}

function applyLed(el, w, name = 'LED') {
  const { on, brightness } = ledState(w);
  el.classList.toggle('is-on', on);
  el.style.setProperty('--b', brightness.toFixed(3));
  el.setAttribute('aria-label', !on ? `${name} apagado` : brightness < 0.995 ? `${name} encendido al ${pct(brightness)}` : `${name} encendido`);
}

/**
 * Nano compatible, resistencia de 220 Ω y LED en `pin` (D13 en la lección 1, D9 en la de PWM).
 * El LED «L» de la placa sigue siempre a D13, como en una placa real. Con `meter`, muestra el % y la
 * frecuencia medidos en ese pin.
 */
export function createCircuit(root, { pin = 13, meter = false } = {}) {
  const x = 40 + DIGITAL.indexOf(pin) * 15;
  root.innerHTML = `
  <svg class="circuit" viewBox="0 0 360 230" role="img" aria-labelledby="circuit-title circuit-desc">
    <title id="circuit-title">Circuito de la lección</title>
    <desc id="circuit-desc">Arduino Nano compatible: D${pin} conectado a una resistencia de 220 ohmios, luego al ánodo de un LED; el cátodo va a GND.</desc>
    <rect x="20" y="70" width="200" height="86" rx="8" class="c-pcb"/>
    <rect x="6" y="99" width="22" height="28" rx="3" class="c-usb"/>
    <rect x="92" y="98" width="44" height="30" rx="3" class="c-chip"/>
    <text x="114" y="117" class="c-chip-txt" text-anchor="middle">328P</text>
    <text x="176" y="118" class="c-label" text-anchor="middle">NANO</text>
    <g class="c-onboard"><rect x="56" y="104" width="12" height="7" rx="2" class="c-l"/><text x="62" y="124" class="c-tiny" text-anchor="middle">L</text></g>
    ${DIGITAL.map((p, i) => `<g><circle cx="${40 + i * 15}" cy="82" r="3.4" class="c-hole ${p === pin ? 'is-used' : ''}"/>
      <text x="${40 + i * 15}" y="96" class="c-tiny" text-anchor="middle">${p}</text></g>`).join('')}
    <circle cx="40" cy="144" r="3.4" class="c-hole is-used"/><text x="40" y="136" class="c-tiny" text-anchor="middle">GND</text>
    <text x="${x - 6}" y="66" class="c-pin-name">D${pin}</text>
    <path d="M${x} 82 V30 H120" class="c-wire c-wire--sig"/>
    <g transform="translate(120 22)"><rect width="56" height="16" rx="6" class="c-res"/>
      <rect x="12" y="0" width="4" height="16" class="c-band1"/><rect x="21" y="0" width="4" height="16" class="c-band1"/>
      <rect x="30" y="0" width="4" height="16" class="c-band2"/><rect x="44" y="0" width="3" height="16" class="c-band3"/></g>
    <text x="148" y="14" class="c-small" text-anchor="middle">220 Ω</text>
    <path d="M176 30 H252 V170 H281 V144" class="c-wire c-wire--sig"/>
    <g class="c-led" data-pin="${pin}" transform="translate(286 104)">
      <circle r="30" class="c-glow"/>
      <path d="M-13 6 V-10 a13 13 0 0 1 26 0 V6 z" class="c-led-body"/>
      <rect x="-16" y="6" width="32" height="5" rx="2" class="c-led-rim"/>
      <line x1="-5" y1="11" x2="-5" y2="40" class="c-leg"/><line x1="5" y1="11" x2="5" y2="32" class="c-leg"/>
    </g>
    <circle cx="281" cy="144" r="2.2" fill="#f97316"/>
    <text x="245" y="161" class="c-tiny">ánodo +</text>
    <text x="300" y="148" class="c-tiny">cátodo −</text>
    <path d="M291 136 V196 H40 V144" class="c-wire c-wire--gnd"/>
    <circle cx="291" cy="136" r="2.2" fill="#7c8da2"/>
  </svg>
  ${meter ? `<div class="pwm-meter">
    <span class="pwm-meter__label">D${pin} medido</span>
    <span class="pwm-meter__bar" aria-hidden="true"><span class="pwm-meter__fill"></span></span>
    <span class="pwm-meter__value">0 %</span>
    <span class="pwm-meter__freq">salida continua</span>
  </div>` : ''}
  ${pinStripHtml()}`;
  const led = root.querySelector('.c-led');
  const onboard = root.querySelector('.c-onboard');
  const strip = pinStrip(root);
  const meterEl = root.querySelector('.pwm-meter');
  const showMeter = (w) => {
    if (!meterEl) return;
    const pwm = isPwmWindow(w);
    const duty = pwm ? w.duty : (w.level ? 1 : 0);
    meterEl.querySelector('.pwm-meter__fill').style.width = `${(duty * 100).toFixed(1)}%`;
    meterEl.querySelector('.pwm-meter__value').textContent = pct(duty);
    meterEl.querySelector('.pwm-meter__freq').textContent = pwm && w.freq ? `PWM a ${Math.round(w.freq)} Hz` : 'salida continua';
  };
  return {
    update(w) {
      strip.update(w);
      if (w.pin === pin) { applyLed(led, w); showMeter(w); }
      if (w.pin === 13) onboard.classList.toggle('is-on', ledState(w).on);
    },
    reset() {
      strip.reset();
      for (const p of new Set([pin, 13])) this.update({ pin: p, duty: 0, level: false, rises: 0 });
    },
  };
}

const LIGHTS = [
  { pin: 4, color: 'rojo', cls: 'red', x: 312 },
  { pin: 3, color: 'amarillo', cls: 'yellow', x: 262 },
  { pin: 2, color: 'verde', cls: 'green', x: 212 },
];
const NANO_PINS = [13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
const nanoX = (p) => 20 + NANO_PINS.indexOf(p) * 11.4;

/** Semáforo en protoboard: tres LED (rojo D4, amarillo D3, verde D2), cada uno con su resistencia de 220 Ω. */
export function createSemaforoCircuit(root) {
  const holes = [];
  for (let y = 44; y <= 186; y += 10) for (let hx = 182; hx <= 342; hx += 10) holes.push(`<circle cx="${hx}" cy="${y}" r="1.3" class="c-bb-hole"/>`);
  root.innerHTML = `
  <svg class="circuit circuit--semaforo" viewBox="0 0 360 230" role="img" aria-labelledby="circuit-title circuit-desc">
    <title id="circuit-title">Semáforo en la protoboard</title>
    <desc id="circuit-desc">Arduino Nano compatible y protoboard. D2 va por una resistencia de 220 ohmios al LED verde, D3 al amarillo y D4 al rojo. Los cátodos de los tres LED van al riel de GND, unido al GND del Nano.</desc>
    <rect x="172" y="34" width="180" height="180" rx="6" class="c-bb"/>
    ${holes.join('')}
    <line x1="178" y1="200" x2="346" y2="200" class="c-rail"/>
    <text x="346" y="211" class="c-bb-label" text-anchor="end">riel GND −</text>
    <rect x="8" y="96" width="150" height="72" rx="7" class="c-pcb"/>
    <rect x="62" y="122" width="34" height="24" rx="3" class="c-chip"/>
    <text x="79" y="137" class="c-chip-txt" text-anchor="middle">328P</text>
    <text x="128" y="160" class="c-label" text-anchor="middle">NANO</text>
    ${NANO_PINS.map((p) => `<circle cx="${nanoX(p)}" cy="106" r="2.8" class="c-hole ${[2, 3, 4].includes(p) ? 'is-used' : ''}"/>
      <text x="${nanoX(p)}" y="117" class="c-tiny" text-anchor="middle">${p}</text>`).join('')}
    <circle cx="20" cy="158" r="2.8" class="c-hole is-used"/><text x="27" y="161" class="c-tiny">GND</text>
    <path d="M20 158 V222 H350 V200 H346" class="c-wire c-wire--gnd"/>
    ${LIGHTS.map((l, k) => `<path d="M${nanoX(l.pin)} 106 V${14 + k * 8} H${l.x} V44" class="c-wire c-wire--${l.cls}"/>
    <g transform="translate(${l.x - 6} 44)"><rect width="12" height="34" rx="5" class="c-res"/>
      <rect y="7" width="12" height="3" class="c-band1"/><rect y="13" width="12" height="3" class="c-band1"/><rect y="19" width="12" height="3" class="c-band2"/><rect y="27" width="12" height="2.5" class="c-band3"/></g>
    <line x1="${l.x}" y1="78" x2="${l.x}" y2="108" class="c-leg"/>
    <g class="c-led c-led--${l.cls}" data-pin="${l.pin}" transform="translate(${l.x} 118)">
      <circle r="24" class="c-glow"/>
      <path d="M-11 6 V-8 a11 11 0 0 1 22 0 V6 z" class="c-led-body"/>
      <rect x="-13" y="6" width="26" height="4" rx="2" class="c-led-rim"/>
    </g>
    <line x1="${l.x + 4}" y1="128" x2="${l.x + 4}" y2="200" class="c-leg"/>
    <text x="${l.x - 12}" y="186" class="c-small" transform="rotate(-90 ${l.x - 12} 186)">D${l.pin} · ${l.color}</text>`).join('')}
    <text x="346" y="90" class="c-bb-label" text-anchor="end">220 Ω</text>
  </svg>
  ${pinStripHtml()}`;
  const leds = new Map([...root.querySelectorAll('.c-led')].map((el) => [Number(el.dataset.pin), el]));
  const strip = pinStrip(root);
  const names = new Map(LIGHTS.map((l) => [l.pin, `LED ${l.color}`]));
  return {
    update(w) {
      strip.update(w);
      const led = leds.get(w.pin);
      if (led) applyLed(led, w, names.get(w.pin));
    },
    reset() {
      strip.reset();
      for (const pin of leds.keys()) this.update({ pin, duty: 0, level: false, rises: 0 });
    },
  };
}

const BTN_MODE = {
  pullup: (level) => `D2 = ${level ? 'HIGH' : 'LOW'} · entrada con pull-up`,
  input: (level) => (level === null ? 'D2 flotante · entrada sin pull-up: lee ruido' : `D2 = ${level ? 'HIGH' : 'LOW'} · entrada sin pull-up`),
  output: () => 'D2 configurado como salida: no lee el botón',
};

/**
 * Pulsador entre D2 y GND (sin resistencia externa: se usa el pull-up interno) y LED con 220 Ω en D13.
 * El pulsador se acciona con el ratón, el dedo o el teclado (Espacio/Intro mantenidos) mientras la simulación
 * se ejecuta: `onButton(closed)` lo envía al modelo eléctrico del Worker, que devuelve el estado real (`input`).
 * `onScript()` reproduce el guion de pulsaciones del reto. `bounce` solo cambia los textos (2.3 simula rebotes).
 */
export function createButtonCircuit(root, { onButton = () => false, onScript = null, bounce = false } = {}) {
  const ledX = nanoX(13);
  const btnX = nanoX(2);
  root.innerHTML = `
  <svg class="circuit circuit--boton" viewBox="0 36 360 190" role="img" aria-labelledby="circuit-title circuit-desc">
    <title id="circuit-title">Pulsador en D2 y LED en D13</title>
    <desc id="circuit-desc">Arduino Nano compatible. Un pulsador une D2 con GND cuando se pulsa; no hay resistencia externa, se usa la resistencia de pull-up interna. D13 va por una resistencia de 220 ohmios al LED y el cátodo a GND.</desc>
    <rect x="8" y="96" width="150" height="72" rx="7" class="c-pcb"/>
    <rect x="62" y="122" width="34" height="24" rx="3" class="c-chip"/>
    <text x="79" y="137" class="c-chip-txt" text-anchor="middle">328P</text>
    <text x="128" y="160" class="c-label" text-anchor="middle">NANO</text>
    <g class="c-onboard"><rect x="36" y="131" width="10" height="6" rx="2" class="c-l"/><text x="32" y="137" class="c-tiny" text-anchor="end">L</text></g>
    ${NANO_PINS.map((p) => `<circle cx="${nanoX(p)}" cy="106" r="2.8" class="c-hole ${[2, 13].includes(p) ? 'is-used' : ''}"/>
      <text x="${nanoX(p)}" y="117" class="c-tiny" text-anchor="middle">${p}</text>`).join('')}
    <circle cx="20" cy="158" r="2.8" class="c-hole is-used"/><text x="27" y="161" class="c-tiny">GND</text>
    <text x="${btnX - 4}" y="90" class="c-pin-name" text-anchor="end">D2</text>
    <path d="M${btnX} 106 V60 H232" class="c-wire c-wire--sig"/>
    <g class="c-btn" transform="translate(262 60)">
      <rect x="-22" y="-16" width="44" height="32" rx="4" class="c-btn-base"/>
      <line x1="-30" y1="0" x2="-22" y2="0" class="c-leg"/><line x1="22" y1="0" x2="30" y2="0" class="c-leg"/>
      <circle r="11" class="c-btn-cap"/>
      <text y="30" class="c-small" text-anchor="middle">pulsador</text>
    </g>
    <path d="M292 60 H338 V214 H20 V158" class="c-wire c-wire--gnd"/>
    <text x="${ledX + 4}" y="90" class="c-pin-name">D13</text>
    <path d="M${ledX} 106 V76 H3 V190 H120" class="c-wire c-wire--sig"/>
    <g transform="translate(120 182)"><rect width="56" height="16" rx="6" class="c-res"/>
      <rect x="12" y="0" width="4" height="16" class="c-band1"/><rect x="21" y="0" width="4" height="16" class="c-band1"/>
      <rect x="30" y="0" width="4" height="16" class="c-band2"/><rect x="44" y="0" width="3" height="16" class="c-band3"/></g>
    <text x="148" y="176" class="c-small" text-anchor="middle">220 Ω</text>
    <path d="M176 190 H232" class="c-wire c-wire--sig"/>
    <g class="c-led" data-pin="13" transform="translate(246 186) rotate(90)">
      <circle r="24" class="c-glow"/>
      <path d="M-11 6 V-8 a11 11 0 0 1 22 0 V6 z" class="c-led-body"/>
      <rect x="-13" y="6" width="26" height="4" rx="2" class="c-led-rim"/>
    </g>
    <path d="M257 190 H300 V214" class="c-wire c-wire--gnd"/>
    <text x="246" y="166" class="c-tiny" text-anchor="middle">LED</text>
  </svg>
  <div class="btn-ctl">
    <button type="button" class="btn-ctl__press" aria-pressed="false" aria-describedby="btn-ctl-help">Pulsador (D2)</button>
    <span class="btn-ctl__state" aria-live="polite">D2 sin conexión: pulsa Ejecutar</span>
    ${onScript ? '<button type="button" class="btn btn--ghost btn--sm btn-ctl__script">Reproducir guion del reto</button>' : ''}
    <p id="btn-ctl-help" class="btn-ctl__help muted small">Mantén pulsado con el ratón, el dedo o Espacio/Intro mientras se ejecuta la simulación.${bounce ? ' Cada pulsación y cada suelta rebota de 3 a 8 veces, como un pulsador real.' : ''}</p>
  </div>
  ${pinStripHtml()}`;
  const led = root.querySelector('.c-led');
  const onboard = root.querySelector('.c-onboard');
  const cap = root.querySelector('.c-btn');
  const press = root.querySelector('.btn-ctl__press');
  const stateEl = root.querySelector('.btn-ctl__state');
  const strip = pinStrip(root);
  const d2 = root.querySelector('.pin-dot[data-pin="2"]');
  let down = false;

  const showContact = (closed) => {
    cap.classList.toggle('is-pressed', closed);
    press.classList.toggle('is-pressed', closed);
    press.setAttribute('aria-pressed', String(closed));
  };
  function set(closed) {
    if (closed === down) return;
    down = closed;
    showContact(closed);
    if (!onButton(closed) && closed) stateEl.textContent = 'La simulación no está en marcha: pulsa Ejecutar para usar el pulsador.';
  }
  press.addEventListener('pointerdown', (e) => { e.preventDefault(); press.setPointerCapture?.(e.pointerId); set(true); });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) press.addEventListener(ev, () => set(false));
  press.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); set(true); } });
  press.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); set(false); } });
  press.addEventListener('blur', () => set(false));
  press.addEventListener('contextmenu', (e) => e.preventDefault());
  root.querySelector('.btn-ctl__script')?.addEventListener('click', () => onScript());

  return {
    update(w) {
      if (w.pin === 2) return;                 // D2 es la entrada: su estado llega con input()
      strip.update(w);
      if (w.pin === 13) { applyLed(led, w); onboard.classList.toggle('is-on', ledState(w).on); }
    },
    /** Estado real del modelo en el Worker: { closed, mode, level } (level null = flotante). */
    input({ closed, mode, level }) {
      if (!down) showContact(closed);           // el guion también mueve el pulsador
      stateEl.textContent = `${closed ? 'Pulsado' : 'Suelto'} · ${(BTN_MODE[mode] || BTN_MODE.input)(level)}`;
      d2.classList.toggle('is-high', level === true);
      d2.classList.toggle('is-floating', level === null);
    },
    reset() {
      strip.reset();
      this.update({ pin: 13, duty: 0, level: false, rises: 0 });
      d2.classList.remove('is-high', 'is-floating');
      showContact(down);
      stateEl.textContent = 'D2 sin conexión: pulsa Ejecutar';
    },
    stopped() { stateEl.textContent = 'Simulación detenida: el pulsador no está conectado a ningún programa.'; },
  };
}
