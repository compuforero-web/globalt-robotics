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

const fmtV = (v) => `${v.toFixed(2).replace('.', ',')} V`;

/**
 * Potenciómetro de 10 kΩ como divisor de tensión (5 V – cursor a A0 – GND) y LED con 220 Ω en D9, con medidor
 * de % y Hz de D9. El control deslizante (teclado, ratón o dedo) fija la tensión del cursor: `onPot(volts)` la
 * envía al ADC emulado. `potState({ volts, adc })` muestra la posición real y la última conversión que pidió
 * el programa con analogRead. `onScript()` reproduce el guion del reto.
 */
export function createPotCircuit(root, { onPot = () => false, onScript = null } = {}) {
  const ledX = nanoX(9);
  const [GND_X, A0_X, V5_X] = [50, 74, 98];
  root.innerHTML = `
  <svg class="circuit circuit--pot" viewBox="0 36 360 192" role="img" aria-labelledby="circuit-title circuit-desc">
    <title id="circuit-title">Potenciómetro en A0 y LED en D9</title>
    <desc id="circuit-desc">Arduino Nano compatible. Un potenciómetro de 10 kilohmios tiene un extremo en 5 V y el otro en GND; su cursor va a la entrada analógica A0. D9 va por una resistencia de 220 ohmios al LED y el cátodo a GND.</desc>
    <rect x="8" y="96" width="150" height="72" rx="7" class="c-pcb"/>
    <rect x="112" y="118" width="34" height="24" rx="3" class="c-chip"/>
    <text x="129" y="133" class="c-chip-txt" text-anchor="middle">328P</text>
    <text x="134" y="160" class="c-label" text-anchor="middle">NANO</text>
    ${NANO_PINS.map((p) => `<circle cx="${nanoX(p)}" cy="106" r="2.8" class="c-hole ${p === 9 ? 'is-used' : ''}"/>
      <text x="${nanoX(p)}" y="117" class="c-tiny" text-anchor="middle">${p}</text>`).join('')}
    ${[[GND_X, 'GND'], [A0_X, 'A0'], [V5_X, '5V']].map(([x, t]) => `<circle cx="${x}" cy="156" r="2.8" class="c-hole is-used"/>
      <text x="${x}" y="148" class="c-tiny" text-anchor="middle">${t}</text>`).join('')}
    <text x="${ledX + 4}" y="90" class="c-pin-name">D9</text>
    <path d="M${ledX} 106 V62 H170" class="c-wire c-wire--sig"/>
    <g transform="translate(170 54)"><rect width="56" height="16" rx="6" class="c-res"/>
      <rect x="12" y="0" width="4" height="16" class="c-band1"/><rect x="21" y="0" width="4" height="16" class="c-band1"/>
      <rect x="30" y="0" width="4" height="16" class="c-band2"/><rect x="44" y="0" width="3" height="16" class="c-band3"/></g>
    <text x="198" y="48" class="c-small" text-anchor="middle">220 Ω</text>
    <path d="M226 62 H262" class="c-wire c-wire--sig"/>
    <g class="c-led" data-pin="9" transform="translate(276 58) rotate(90)">
      <circle r="24" class="c-glow"/>
      <path d="M-11 6 V-8 a11 11 0 0 1 22 0 V6 z" class="c-led-body"/>
      <rect x="-13" y="6" width="26" height="4" rx="2" class="c-led-rim"/>
    </g>
    <text x="276" y="86" class="c-tiny" text-anchor="middle">LED</text>
    <path d="M287 62 H346 V222 H${GND_X} V156" class="c-wire c-wire--gnd"/>
    <path d="M${GND_X} 204 H226" class="c-wire c-wire--gnd"/>
    <circle cx="${GND_X}" cy="204" r="3" fill="#7c8da2"/>
    <path d="M${V5_X} 156 V176 H226" class="c-wire c-wire--5v"/>
    <path d="M${A0_X} 156 V190 H226" class="c-wire c-wire--sig"/>
    <text x="196" y="172" class="c-tiny" text-anchor="middle">5 V</text>
    <text x="196" y="186" class="c-tiny" text-anchor="middle">cursor</text>
    <text x="196" y="200" class="c-tiny" text-anchor="middle">GND</text>
    <g class="c-pot" transform="translate(258 190)">
      <rect x="-32" y="-24" width="64" height="48" rx="6" class="c-pot-base"/>
      <circle r="17" class="c-pot-knob"/>
      <line class="c-pot-mark" x1="0" y1="0" x2="0" y2="-14"/>
      <text x="0" y="-29" class="c-small" text-anchor="middle">10 kΩ</text>
    </g>
  </svg>
  <div class="pwm-meter">
    <span class="pwm-meter__label">D9 medido</span>
    <span class="pwm-meter__bar" aria-hidden="true"><span class="pwm-meter__fill"></span></span>
    <span class="pwm-meter__value">0 %</span>
    <span class="pwm-meter__freq">salida continua</span>
  </div>
  <div class="pot-ctl">
    <label class="pot-ctl__label" for="pot-range">Potenciómetro (A0)</label>
    <input id="pot-range" class="pot-ctl__range" type="range" min="0" max="500" step="5" value="0" aria-valuetext="0,00 voltios" aria-describedby="pot-ctl-help">
    <output class="pot-ctl__volts" for="pot-range">0,00 V</output>
    <span class="pot-ctl__adc" aria-live="polite">Última lectura de analogRead: —</span>
    ${onScript ? '<button type="button" class="btn btn--ghost btn--sm pot-ctl__script">Reproducir guion del reto</button>' : ''}
    <p id="pot-ctl-help" class="pot-ctl__help muted small">Arrastra el control o usa las flechas (0,05 V), Re Pág/Av Pág (0,5 V), Inicio y Fin. Funciona con la simulación en marcha.</p>
  </div>
  ${pinStripHtml()}`;
  const led = root.querySelector('.c-led');
  const strip = pinStrip(root);
  const meterEl = root.querySelector('.pwm-meter');
  const range = root.querySelector('.pot-ctl__range');
  const voltsEl = root.querySelector('.pot-ctl__volts');
  const adcEl = root.querySelector('.pot-ctl__adc');
  const mark = root.querySelector('.c-pot-mark');
  let dragging = false;
  const volts = () => Number(range.value) / 100;
  const show = (v) => {
    voltsEl.textContent = fmtV(v);
    range.setAttribute('aria-valuetext', `${v.toFixed(2).replace('.', ',')} voltios`);
    mark.setAttribute('transform', `rotate(${-135 + (v / 5) * 270})`);
  };
  let lastUser = -Infinity;   // el eco del Worker no debe devolver el control a una posición anterior
  range.addEventListener('input', () => { lastUser = performance.now(); show(volts()); onPot(volts()); });
  range.addEventListener('pointerdown', () => { dragging = true; });
  for (const ev of ['pointerup', 'pointercancel', 'blur']) range.addEventListener(ev, () => { dragging = false; });
  root.querySelector('.pot-ctl__script')?.addEventListener('click', () => onScript());
  show(0);
  const showMeter = (w) => {
    const pwm = isPwmWindow(w);
    const duty = pwm ? w.duty : (w.level ? 1 : 0);
    meterEl.querySelector('.pwm-meter__fill').style.width = `${(duty * 100).toFixed(1)}%`;
    meterEl.querySelector('.pwm-meter__value').textContent = pct(duty);
    meterEl.querySelector('.pwm-meter__freq').textContent = pwm && w.freq ? `PWM a ${Math.round(w.freq)} Hz` : 'salida continua';
  };
  return {
    update(w) {
      strip.update(w);
      if (w.pin === 9) { applyLed(led, w); showMeter(w); }
    },
    /** Estado real en el Worker: tensión del cursor y última conversión del ADC en A0 (null si no hubo). */
    potState({ volts: v, adc }) {
      if (!dragging && performance.now() - lastUser > 400 && Math.abs(v - volts()) > 0.004) { range.value = String(Math.round(v * 100)); show(v); }
      adcEl.textContent = `Última lectura de analogRead: ${adc === null || adc === undefined ? '— (el programa no ha leído A0)' : adc}`;
    },
    potVolts: volts,
    reset() {
      strip.reset();
      this.update({ pin: 9, duty: 0, level: false, rises: 0 });
      adcEl.textContent = 'Última lectura de analogRead: —';
    },
  };
}

const SONAR_MIN = 2;
const SONAR_MAX = 400;
const fmtUs = (us) => `${Math.round(us)} µs`;
/** Posición del obstáculo en el dibujo (escala logarítmica: 2 cm pegado al sensor, 400 cm al fondo). */
const wallX = (cm) => 252 + (Math.log(cm / SONAR_MIN) / Math.log(SONAR_MAX / SONAR_MIN)) * 92;
const gndSym = (x, y) => `<path d="M${x - 7} ${y} H${x + 7} M${x - 4.5} ${y + 3} H${x + 4.5} M${x - 2} ${y + 6} H${x + 2}" class="c-gnd-sym"/>`;

/**
 * Sensor ultrasónico HC-SR04 (VCC a 5 V, TRIG en D7, ECHO en D8, GND) y obstáculo móvil; con `led`, además un LED
 * con 220 Ω en D9 y medidor de % y Hz. El control deslizante y la casilla «Sin obstáculo» fijan la distancia del
 * modelo (`onDistance(cm | null)`). `sonarState(estado)` muestra lo que ocurre en el Worker: el obstáculo vigente,
 * el último pulso TRIG que generó el programa (con su duración) y el último ECHO que devolvió el módulo.
 * El resultado que calcula el programa solo aparece en el monitor serie. `onScript()` reproduce el guion del reto.
 */
export function createSonarCircuit(root, { onDistance = () => false, onScript = null, led = false, cm = 100 } = {}) {
  const [GND_X, V5_X] = [50, 98];
  const [TRIG_X, ECHO_X, LED_X] = [nanoX(7), nanoX(8), nanoX(9)];
  const PIN_Y = { gnd: 76, echo: 96, trig: 112, vcc: 128 };
  root.innerHTML = `
  <svg class="circuit circuit--sonar" viewBox="0 ${led ? 18 : 52} 360 ${led ? 206 : 172}" role="img" aria-labelledby="circuit-title circuit-desc">
    <title id="circuit-title">Sensor ultrasónico HC-SR04${led ? ' y LED en D9' : ''}</title>
    <desc id="circuit-desc">Arduino Nano compatible y sensor ultrasónico HC-SR04: VCC a 5 V, TRIG a D7, ECHO a D8 y GND a GND. Delante del sensor hay un obstáculo a una distancia que puedes cambiar.${led ? ' D9 va por una resistencia de 220 ohmios al LED y el cátodo a GND.' : ''}</desc>
    <rect x="8" y="120" width="150" height="72" rx="7" class="c-pcb"/>
    <rect x="112" y="142" width="34" height="24" rx="3" class="c-chip"/>
    <text x="129" y="157" class="c-chip-txt" text-anchor="middle">328P</text>
    <text x="134" y="184" class="c-label" text-anchor="middle">NANO</text>
    ${NANO_PINS.map((p) => `<circle cx="${nanoX(p)}" cy="130" r="2.8" class="c-hole ${[7, 8].includes(p) || (led && p === 9) ? 'is-used' : ''}"/>
      <text x="${nanoX(p)}" y="141" class="c-tiny" text-anchor="middle">${p}</text>`).join('')}
    ${[[GND_X, 'GND'], [V5_X, '5V']].map(([x, t]) => `<circle cx="${x}" cy="180" r="2.8" class="c-hole is-used"/>
      <text x="${x}" y="172" class="c-tiny" text-anchor="middle">${t}</text>`).join('')}
    <path d="M${ECHO_X} 130 V${PIN_Y.echo} H196" class="c-wire c-wire--echo"/>
    <path d="M${TRIG_X} 130 V${PIN_Y.trig} H196" class="c-wire c-wire--trig"/>
    <path d="M${V5_X} 180 V204 H180 V${PIN_Y.vcc} H196" class="c-wire c-wire--5v"/>
    <path d="M196 ${PIN_Y.gnd} H182 V84" class="c-wire c-wire--gnd"/>${gndSym(182, 84)}
    <path d="M${GND_X} 180 V202" class="c-wire c-wire--gnd"/>${gndSym(GND_X, 202)}
    <text x="${(ECHO_X + 176) / 2}" y="${PIN_Y.echo - 4}" class="c-tiny" text-anchor="middle">D8 · ECHO</text>
    <text x="${(TRIG_X + 196) / 2}" y="${PIN_Y.trig - 4}" class="c-tiny" text-anchor="middle">D7 · TRIG</text>
    <g class="c-sonar">
      <rect x="196" y="66" width="30" height="84" rx="3" class="c-sonar-pcb"/>
      ${Object.entries(PIN_Y).map(([k, y]) => `<circle cx="196" cy="${y}" r="2.6" class="c-hole is-used"/>
        <text x="200" y="${y + 2.5}" class="c-tiny">${k.toUpperCase()}</text>`).join('')}
      <rect x="226" y="72" width="14" height="30" rx="3" class="c-sonar-can"/><text x="233" y="90" class="c-tiny" text-anchor="middle">T</text>
      <rect x="226" y="114" width="14" height="30" rx="3" class="c-sonar-can"/><text x="233" y="132" class="c-tiny" text-anchor="middle">R</text>
      <text x="211" y="62" class="c-small" text-anchor="middle">HC-SR04</text>
    </g>
    <path class="c-beam" d="M240 87 H300"/>
    <path class="c-beam c-beam--back" d="M300 129 H240"/>
    <g class="c-wall"><rect x="0" y="66" width="8" height="84" class="c-wall-body"/></g>
    <path class="c-ruler" d="M240 160 H300"/>
    <text class="c-dist c-small" x="270" y="172" text-anchor="middle">100 cm</text>
    ${led ? `<path d="M${LED_X} 130 V44 H200" class="c-wire c-wire--sig"/>
    <g transform="translate(200 36)"><rect width="48" height="16" rx="6" class="c-res"/>
      <rect x="10" y="0" width="4" height="16" class="c-band1"/><rect x="18" y="0" width="4" height="16" class="c-band1"/>
      <rect x="26" y="0" width="4" height="16" class="c-band2"/><rect x="38" y="0" width="3" height="16" class="c-band3"/></g>
    <text x="224" y="30" class="c-small" text-anchor="middle">220 Ω</text>
    <path d="M248 44 H270" class="c-wire c-wire--sig"/>
    <g class="c-led" data-pin="9" transform="translate(282 44) rotate(90)">
      <circle r="22" class="c-glow"/>
      <path d="M-11 6 V-8 a11 11 0 0 1 22 0 V6 z" class="c-led-body"/>
      <rect x="-13" y="6" width="26" height="4" rx="2" class="c-led-rim"/>
    </g>
    <text x="282" y="30" class="c-tiny" text-anchor="middle">LED (D9)</text>
    <path d="M293 44 H330 V52" class="c-wire c-wire--gnd"/>${gndSym(330, 52)}` : ''}
  </svg>
  ${led ? `<div class="pwm-meter">
    <span class="pwm-meter__label">D9 medido</span>
    <span class="pwm-meter__bar" aria-hidden="true"><span class="pwm-meter__fill"></span></span>
    <span class="pwm-meter__value">0 %</span>
    <span class="pwm-meter__freq">salida continua</span>
  </div>` : ''}
  <div class="sonar-ctl">
    <label class="sonar-ctl__label" for="sonar-range">Obstáculo</label>
    <input id="sonar-range" class="sonar-ctl__range" type="range" min="${SONAR_MIN}" max="${SONAR_MAX}" step="1" value="${cm}" aria-describedby="sonar-ctl-help">
    <output class="sonar-ctl__cm" for="sonar-range"></output>
    <label class="sonar-ctl__none"><input type="checkbox" class="sonar-ctl__check"> Sin obstáculo (sin eco)</label>
    <dl class="sonar-ctl__read">
      <div><dt>Último pulso TRIG (D7)</dt><dd class="sonar-ctl__trig">—</dd></div>
      <div><dt>Último ECHO del módulo (D8)</dt><dd class="sonar-ctl__echo">—</dd></div>
    </dl>
    ${onScript ? '<button type="button" class="btn btn--ghost btn--sm sonar-ctl__script">Reproducir guion del reto</button>' : ''}
    <p id="sonar-ctl-help" class="sonar-ctl__help muted small">Arrastra el control o usa las flechas (1 cm), Re Pág/Av Pág, Inicio (2 cm) y Fin (400 cm). Funciona con la simulación en marcha; el cambio vale para el siguiente disparo. Lo que calcula tu programa aparece en el monitor serie.</p>
  </div>
  ${pinStripHtml()}`;
  const ledEl = root.querySelector('.c-led');
  const strip = pinStrip(root);
  const meterEl = root.querySelector('.pwm-meter');
  const range = root.querySelector('.sonar-ctl__range');
  const check = root.querySelector('.sonar-ctl__check');
  const cmEl = root.querySelector('.sonar-ctl__cm');
  const trigEl = root.querySelector('.sonar-ctl__trig');
  const echoEl = root.querySelector('.sonar-ctl__echo');
  const wall = root.querySelector('.c-wall');
  const beams = [...root.querySelectorAll('.c-beam')];
  const ruler = root.querySelector('.c-ruler');
  const distEl = root.querySelector('.c-dist');
  const svg = root.querySelector('svg');
  let dragging = false;
  let lastUser = -Infinity;   // el eco del Worker no debe devolver el control a una posición anterior
  let measures = 0;
  const current = () => (check.checked ? null : Number(range.value));
  const show = (v) => {
    const none = v === null;
    range.disabled = none;
    cmEl.textContent = none ? 'sin obstáculo' : `${v} cm`;
    range.setAttribute('aria-valuetext', `${none ? Number(range.value) : v} centímetros${none ? ' (desactivado: sin obstáculo)' : ''}`);
    const x = none ? 352 : wallX(v);
    wall.setAttribute('transform', `translate(${x} 0)`);
    wall.classList.toggle('is-none', none);
    for (const b of beams) b.setAttribute('d', b.classList.contains('c-beam--back') ? `M${x} 129 H240` : `M240 87 H${x}`);
    ruler.setAttribute('d', `M240 160 H${none ? 340 : x}`);
    distEl.setAttribute('x', String((240 + (none ? 340 : x)) / 2));
    distEl.textContent = none ? 'sin obstáculo' : `${v} cm`;
    svg.classList.toggle('is-noecho', none);
  };
  const changed = () => { lastUser = performance.now(); show(current()); onDistance(current()); };
  range.addEventListener('input', changed);
  check.addEventListener('change', changed);
  range.addEventListener('pointerdown', () => { dragging = true; });
  for (const ev of ['pointerup', 'pointercancel', 'blur']) range.addEventListener(ev, () => { dragging = false; });
  root.querySelector('.sonar-ctl__script')?.addEventListener('click', () => onScript());
  show(current());
  const showMeter = (w) => {
    if (!meterEl) return;
    const pwm = isPwmWindow(w);
    const duty = pwm ? w.duty : (w.level ? 1 : 0);
    meterEl.querySelector('.pwm-meter__fill').style.width = `${(duty * 100).toFixed(1)}%`;
    meterEl.querySelector('.pwm-meter__value').textContent = pct(duty);
    meterEl.querySelector('.pwm-meter__freq').textContent = pwm && w.freq ? `PWM a ${Math.round(w.freq)} Hz` : 'salida continua';
  };
  const ping = () => {
    svg.classList.remove('is-ping');
    void svg.getBBox?.();
    svg.classList.add('is-ping');
  };
  return {
    update(w) {
      strip.update(w);
      if (led && w.pin === 9) { applyLed(ledEl, w); showMeter(w); }
    },
    /** Estado real del modelo en el Worker: obstáculo, último TRIG y último ECHO (ver sim-worker.js). */
    sonarState({ cm: v, trigMode, measures: n, trig, echo }) {
      if (!dragging && performance.now() - lastUser > 400 && v !== current()) {
        check.checked = v === null;
        if (v !== null) range.value = String(Math.round(v));
        show(v === null ? null : Math.round(v));
      }
      if (!trig) trigEl.textContent = trigMode === 'output' ? 'sin pulsos todavía' : 'sin pulsos: D7 no está configurado como salida';
      else if (trig.accepted) trigEl.textContent = `${trig.widthUs.toFixed(1).replace('.', ',')} µs en alto ✓ disparo válido`;
      else trigEl.textContent = `${trig.widthUs.toFixed(1).replace('.', ',')} µs en alto ✗ ${trig.reason === 'corto' ? 'ignorado: necesita ≥ 10 µs' : 'ignorado: el módulo aún estaba midiendo'}`;
      echoEl.textContent = !echo ? '—' : echo.cm === null ? `${fmtUs(echo.us)} en alto: sin eco (tiempo máximo del módulo)`
        : `${fmtUs(echo.us)} en alto (obstáculo a ${String(Math.round(echo.cm * 10) / 10).replace('.', ',')} cm)`;
      if (n > measures) ping();
      measures = n;
    },
    sonarCm: current,
    stopped() { svg.classList.remove('is-ping'); },
    reset() {
      strip.reset();
      if (led) this.update({ pin: 9, duty: 0, level: false, rises: 0 });
      trigEl.textContent = '—';
      echoEl.textContent = '—';
      measures = 0;
      svg.classList.remove('is-ping');
    },
  };
}

// ---------- Puente H L298N y motores (lecciones 9–11) ----------
const ORDER_TEXT = { adelante: 'adelante', atras: 'atrás', freno: 'freno', libre: 'libre (sin tensión)' };
const HEADER = [['ENA', 'A', 'en'], ['IN1', 'A', 'in1'], ['IN2', 'A', 'in2'], ['IN3', 'B', 'in1'], ['IN4', 'B', 'in2'], ['ENB', 'B', 'en']];
const headerX = (k) => 188 + k * 16;
const fmtPct = (d) => `${Math.round(d * 100)} %`;
const esc = (t) => String(t).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

/**
 * Nano + módulo L298N + uno o dos motores DC + batería del motor (7–9 V) con GND común.
 * `channels` = mapa de pines de motor.js (canal A y, si hay, B); `en: null` dibuja el puente (jumper) de ENA.
 * Los motores giran con el ángulo y la velocidad que calcula el modelo del Worker (motorState); nada se anima solo.
 */
export function createMotorCircuit(root, { channels }) {
  const byId = Object.fromEntries(channels.map((c) => [c.id, c]));
  const two = channels.length > 1;
  const used = new Set(channels.flatMap((c) => [c.in1, c.in2, c.en].filter((p) => p !== null)));
  const signals = HEADER.map(([label, id, sig], k) => ({ label, id, sig, k, pin: byId[id] ? byId[id][sig] : undefined }))
    .filter((s) => byId[s.id]);
  const wired = signals.filter((s) => s.pin !== null && s.pin !== undefined);
  const lanes = [...wired].sort((a, b) => nanoX(a.pin) - nanoX(b.pin));
  const motorY = { A: two ? 60 : 86, B: 104 };
  const desc = [
    'Arduino Nano compatible conectado a un módulo puente H L298N.',
    ...wired.map((s) => `${s.label} del L298N a D${s.pin}.`),
    ...channels.filter((c) => c.en === null).map((c) => `${c.id === 'A' ? 'ENA' : 'ENB'} lleva el puente puesto: canal siempre habilitado.`),
    `${two ? 'OUT1 y OUT2 van al motor izquierdo; OUT3 y OUT4, al motor derecho.' : 'OUT1 y OUT2 van al motor.'}`,
    'Una batería de 7 a 9 voltios alimenta los motores por el borne VS del L298N; su negativo va al GND del L298N y ese GND se une al GND del Nano (GND común).',
    'El Nano se alimenta por USB y no alimenta los motores; el borne de 5 V del módulo queda sin usar.',
  ].join(' ');
  const motorSvg = (c) => `<g class="c-motor" data-motor="${c.id}" transform="translate(326 ${motorY[c.id]})">
      <circle r="19" class="c-motor-body"/>
      <g class="c-motor-rotor"><circle r="12" class="c-motor-hub"/><path d="M0 -12 V12 M-10.4 -6 L10.4 6 M-10.4 6 L10.4 -6" class="c-motor-spoke"/><circle cy="-9" r="2.6" class="c-motor-mark"/></g>
      <text y="${c.id === 'A' ? -24 : 31}" class="c-tiny" text-anchor="middle">${esc(c.name)}</text>
    </g>`;
  root.innerHTML = `
  <svg class="circuit circuit--motor" viewBox="0 0 360 232" role="img" aria-labelledby="circuit-title circuit-desc">
    <title id="circuit-title">Puente H L298N y ${two ? 'dos motores' : 'motor DC'}</title>
    <desc id="circuit-desc">${esc(desc)}</desc>
    <rect x="8" y="154" width="150" height="68" rx="7" class="c-pcb"/>
    <rect x="104" y="176" width="34" height="24" rx="3" class="c-chip"/>
    <text x="121" y="191" class="c-chip-txt" text-anchor="middle">328P</text>
    <text x="70" y="214" class="c-label" text-anchor="middle">NANO</text>
    <text x="70" y="226" class="c-tiny" text-anchor="middle">USB: alimenta solo el Nano</text>
    ${NANO_PINS.map((p) => `<circle cx="${nanoX(p)}" cy="162" r="2.8" class="c-hole ${used.has(p) ? 'is-used' : ''}"/>
      <text x="${nanoX(p)}" y="173" class="c-tiny" text-anchor="middle">${p}</text>`).join('')}
    <circle cx="22" cy="200" r="2.8" class="c-hole is-used"/><text x="22" y="192" class="c-tiny" text-anchor="middle">GND</text>
    ${lanes.map((s, i) => {
      const lane = 148 - i * 3.6;
      return `<path d="M${nanoX(s.pin)} 162 V${lane} H${headerX(s.k)} V134" class="c-wire c-wire--${s.sig === 'en' ? 'en' : 'in'}"/>`;
    }).join('')}
    <rect x="176" y="44" width="116" height="90" rx="5" class="c-l298-pcb"/>
    <rect x="214" y="58" width="40" height="34" rx="2" class="c-l298-sink"/>
    <text x="234" y="104" class="c-small" text-anchor="middle">L298N</text>
    ${signals.map((s) => `<circle cx="${headerX(s.k)}" cy="130" r="2.6" class="c-hole ${s.pin !== undefined ? 'is-used' : ''}"/>
      <text x="${headerX(s.k)}" y="122" class="c-tiny" text-anchor="middle">${s.label}</text>`).join('')}
    ${channels.filter((c) => c.en === null).map((c) => {
      const x = headerX(c.id === 'A' ? 0 : 5);
      return `<rect x="${x - 4}" y="125" width="8" height="12" rx="1.5" class="c-jumper"/><text x="${x}" y="146" class="c-tiny" text-anchor="middle">puente</text>`;
    }).join('')}
    ${[['5V', 190], ['GND', 208], ['VS', 226]].map(([t, x]) => `<rect x="${x - 6}" y="44" width="12" height="10" class="c-terminal"/><text x="${x}" y="64" class="c-tiny" text-anchor="middle">${t}</text>`).join('')}
    <text x="190" y="72" class="c-tiny" text-anchor="middle">sin usar</text>
    <g class="c-battery" transform="translate(200 6)">
      <rect width="60" height="20" rx="3" class="c-battery-body"/>
      <rect x="60" y="6" width="4" height="8" class="c-battery-tip"/>
      <text x="30" y="14" class="c-tiny" text-anchor="middle">batería 7–9 V</text>
      <text x="56" y="-1" class="c-tiny" text-anchor="middle">+</text><text x="4" y="-1" class="c-tiny" text-anchor="middle">−</text>
    </g>
    <path d="M264 16 H272 V36 H226 V44" class="c-wire c-wire--vs"/>
    <path d="M200 16 H196 V34 H208 V44" class="c-wire c-wire--gnd"/>
    <path d="M196 34 H6 V200 H22" class="c-wire c-wire--gnd"/>
    <text x="70" y="30" class="c-tiny" text-anchor="middle">GND común</text>
    ${channels.map((c) => {
      const y = motorY[c.id];
      const [o1, o2] = c.id === 'A' ? ['OUT1', 'OUT2'] : ['OUT3', 'OUT4'];
      return `<path d="M292 ${y - 6} H307" class="c-wire c-wire--out"/><path d="M292 ${y + 6} H307" class="c-wire c-wire--out"/>
        <text x="289" y="${y - 3.5}" class="c-tiny" text-anchor="end">${o1}</text><text x="289" y="${y + 8.5}" class="c-tiny" text-anchor="end">${o2}</text>`;
    }).join('')}
    ${channels.map(motorSvg).join('')}
  </svg>
  <div class="motor-read">
    ${channels.map((c) => `<section class="motor-read__ch" data-ch="${c.id}" aria-label="${esc(c.name)}">
      <h4 class="motor-read__title">${esc(c.name)} <span class="muted small">(IN ${c.in1 !== undefined ? `D${c.in1}/D${c.in2}` : ''}${c.en === null ? ', EN con puente' : `, EN D${c.en}`})</span></h4>
      <dl>
        <div><dt>Orden del puente H</dt><dd class="motor-read__order">—</dd></div>
        <div><dt>Motor (modelo con inercia)</dt><dd class="motor-read__speed">—</dd></div>
      </dl>
    </section>`).join('')}
    <p class="motor-read__warn" role="status" hidden></p>
    <p class="motor-read__help muted small">La orden cambia en cuanto cambian los pines; el eje del motor tarda en acelerar y en detenerse. Velocidades del modelo: zona muerta 30 %, 200 rpm al 100 %.</p>
  </div>
  ${pinStripHtml()}`;
  const strip = pinStrip(root);
  const els = Object.fromEntries(channels.map((c) => [c.id, {
    rotor: root.querySelector(`[data-motor="${c.id}"] .c-motor-rotor`),
    motor: root.querySelector(`[data-motor="${c.id}"]`),
    order: root.querySelector(`[data-ch="${c.id}"] .motor-read__order`),
    speed: root.querySelector(`[data-ch="${c.id}"] .motor-read__speed`),
  }]));
  const warn = root.querySelector('.motor-read__warn');
  let warned = 0;
  const level = (mode, high) => (mode !== 'output' ? 'sin configurar' : high ? 'HIGH' : 'LOW');
  const show = (s) => {
    const c = byId[s.id];
    const e = els[s.id];
    const [n1, n2, ne] = c.id === 'A' ? ['IN1', 'IN2', 'ENA'] : ['IN3', 'IN4', 'ENB'];
    const enText = c.en === null ? `${ne} con puente` : s.modes.en !== 'output' ? `${ne} sin configurar (0 %)` : `${ne} ${fmtPct(s.duty)}`;
    e.order.textContent = `${ORDER_TEXT[s.order]} · ${n1} ${level(s.modes.in1, s.levels.in1)}, ${n2} ${level(s.modes.in2, s.levels.in2)}, ${enText}`;
    const rpm = Math.round(Math.abs(s.rpm));
    const moving = s.order === 'adelante' || s.order === 'atras';
    let txt;
    if (rpm === 0) txt = moving && s.duty > 0 ? `parado: con ${fmtPct(s.duty)} no vence la zona muerta` : 'parado';
    else txt = `${rpm} rpm ${s.speed > 0 ? '↻ adelante' : '↺ atrás'}${moving ? '' : ` · deteniéndose (${s.order === 'freno' ? 'freno' : 'rueda libre'})`}`;
    e.speed.textContent = txt;
    e.rotor.setAttribute('transform', `rotate(${s.angle})`);
    e.motor.classList.toggle('is-moving', rpm > 0);
  };
  return {
    update(w) { strip.update(w); },
    /** Estado real del modelo en el Worker (motor.js): órdenes, velocidad, ángulo e inversiones bruscas. */
    motorState({ channels: states, reversals = [] }) {
      for (const s of states) show(s);
      if (reversals.length > warned) {
        const r = reversals[reversals.length - 1];
        warned = reversals.length;
        warn.hidden = false;
        warn.textContent = `⚠ A los ${(r.t / 1000).toFixed(2).replace('.', ',')} s, ${byId[r.ch].name.toLowerCase()} pasó de ${ORDER_TEXT[r.from]} a ${ORDER_TEXT[r.to]} girando al ${fmtPct(Math.abs(r.speed))}. En un motor real eso provoca un pico de corriente y un golpe en los engranajes; una parada breve antes de invertir lo evita.`;
      }
    },
    stopped() {},
    reset() {
      strip.reset();
      warned = 0;
      warn.hidden = true;
      for (const c of channels) {
        els[c.id].order.textContent = '—';
        els[c.id].speed.textContent = '—';
        els[c.id].rotor.setAttribute('transform', 'rotate(0)');
        els[c.id].motor.classList.remove('is-moving');
      }
    },
  };
}

// ---------- Servo SG90 (lecciones 12 y 13) ----------
const SERVO_SHAFT = [252, 127];
const SERVO_DIAL = 44;
const polar = (deg, r) => {
  const a = (deg * Math.PI) / 180;
  return [SERVO_SHAFT[0] + r * Math.cos(a), SERVO_SHAFT[1] - r * Math.sin(a)];
};
const fmtNum = (x, d = 1) => x.toFixed(d).replace('.', ',');

/** Texto de la señal de servo según el estado del modelo (servo.js) en el Worker. */
export function servoSignalText(s, pin = 9) {
  if (!s || (!s.pulses && !s.invalid)) return s && s.mode !== 'output' ? `D${pin} sin configurar: no hay pulsos` : `sin pulsos: el servo no recibe órdenes`;
  if (s.receiving && s.us !== null && s.periodMs) return `${fmtNum(1000 / s.periodMs)} Hz · pulso de ${s.us} µs → ${Math.round(s.target)}°`;
  if (s.invalid?.reason === 'periodo') return `pulsos cada ${fmtNum(s.invalid.periodMs ?? 0, 2)} ms: no es una señal de servo (¿analogWrite?)`;
  if (s.invalid?.reason === 'ancho') return `pulso de ${s.invalid.us} µs: fuera de 0,4–2,6 ms, el servo lo ignora`;
  return 'sin señal: el servo se queda donde está';
}

/**
 * Nano + micro servo SG90 en `pin` (señal naranja) alimentado por una fuente externa de 5 V (rojo) con GND común
 * (marrón). Con `led`, además un LED con 220 Ω en ese pin. El brazo gira con el ángulo que calcula el modelo del Worker
 * (servoState) y la marca del dial indica el ángulo pedido por el último pulso; nada se anima solo.
 */
export function createServoCircuit(root, { pin = 9, led = null } = {}) {
  const sx = nanoX(pin);
  const desc = [
    `Arduino Nano compatible y micro servo SG90. El cable naranja (señal) del servo va a D${pin}.`,
    'El cable rojo va al positivo de una fuente externa de 5 voltios y el marrón al negativo de esa fuente.',
    'El negativo de la fuente se une al GND del Nano (GND común). El Nano se alimenta por USB y no alimenta el servo.',
    led !== null ? `D${led} va por una resistencia de 220 ohmios al ánodo de un LED; el cátodo va a GND.` : '',
  ].join(' ');
  const ticks = [0, 45, 90, 135, 180].map((d) => {
    const [x1, y1] = polar(d, SERVO_DIAL - 4);
    const [x2, y2] = polar(d, SERVO_DIAL + 2);
    const [tx, ty] = polar(d, SERVO_DIAL + 10);
    return `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)}" class="c-servo-tick"/>${d % 90 === 0 ? `<text x="${tx.toFixed(1)}" y="${(ty + (d === 90 ? 2.5 : d === 0 ? -22 : -9)).toFixed(1)}" class="c-tiny" text-anchor="middle">${d}°</text>` : ''}`;
  }).join('');
  const [ax, ay] = polar(180, SERVO_DIAL);
  const [bx, by] = polar(0, SERVO_DIAL);
  root.innerHTML = `
  <svg class="circuit circuit--servo" viewBox="0 0 360 232" role="img" aria-labelledby="circuit-title circuit-desc">
    <title id="circuit-title">Servo SG90 en D${pin}${led !== null ? ` y LED en D${led}` : ''}</title>
    <desc id="circuit-desc">${esc(desc)}</desc>
    <rect x="8" y="154" width="150" height="68" rx="7" class="c-pcb"/>
    <rect x="104" y="176" width="34" height="24" rx="3" class="c-chip"/>
    <text x="121" y="191" class="c-chip-txt" text-anchor="middle">328P</text>
    <text x="70" y="214" class="c-label" text-anchor="middle">NANO</text>
    <text x="70" y="226" class="c-tiny" text-anchor="middle">USB: alimenta solo el Nano</text>
    ${NANO_PINS.map((p) => `<circle cx="${nanoX(p)}" cy="162" r="2.8" class="c-hole ${p === pin || p === led ? 'is-used' : ''}"/>
      <text x="${nanoX(p)}" y="173" class="c-tiny" text-anchor="middle">${p}</text>`).join('')}
    <circle cx="22" cy="200" r="2.8" class="c-hole is-used"/><text x="22" y="192" class="c-tiny" text-anchor="middle">GND</text>
    <g class="c-battery" transform="translate(20 10)">
      <rect width="62" height="24" rx="3" class="c-battery-body"/>
      <text x="31" y="11" class="c-tiny" text-anchor="middle">fuente externa</text>
      <text x="31" y="20" class="c-tiny" text-anchor="middle">5 V · ≥ 1 A</text>
    </g>
    <text x="90" y="14" class="c-tiny">+</text><text x="90" y="33" class="c-tiny">−</text>
    <path d="M82 16 H338 V127 H310" class="c-wire c-wire--5v"/>
    <path d="M82 28 H96 V40 H322 V121 H310" class="c-wire c-wire--gnd"/>
    <path d="M96 40 H6 V200 H22" class="c-wire c-wire--gnd"/>
    <text x="52" y="52" class="c-tiny" text-anchor="middle">GND común</text>
    <path d="M310 133 H330 V148 H${sx} V162" class="c-wire c-wire--sig"/>
    <text x="${(sx + 330) / 2}" y="145" class="c-tiny" text-anchor="middle">señal · D${pin}</text>
    <text x="344" y="70" class="c-tiny" text-anchor="middle" transform="rotate(90 344 70)">+5 V</text>
    <path d="M${ax.toFixed(1)} ${ay.toFixed(1)} A${SERVO_DIAL} ${SERVO_DIAL} 0 0 1 ${bx.toFixed(1)} ${by.toFixed(1)}" class="c-servo-dial"/>
    ${ticks}
    <g class="c-servo">
      <rect x="226" y="113" width="10" height="28" rx="2" class="c-servo-tab"/>
      <rect x="300" y="113" width="10" height="28" rx="2" class="c-servo-tab"/>
      <rect x="232" y="110" width="74" height="34" rx="4" class="c-servo-body"/>
      <text x="283" y="140" class="c-tiny" text-anchor="middle">SG90</text>
      <circle cx="${SERVO_SHAFT[0]}" cy="${SERVO_SHAFT[1]}" r="9" class="c-servo-gear"/>
      <path class="c-servo-target" d="M0 0" hidden/>
      <g class="c-servo-horn" transform="translate(${SERVO_SHAFT[0]} ${SERVO_SHAFT[1]}) rotate(-90)">
        <path d="M-6 -5 L30 -3 A3.5 3.5 0 0 1 30 3 L-6 5 A6 6 0 0 1 -6 -5 z" class="c-servo-arm"/>
        <circle r="3" class="c-servo-screw"/><circle cx="12" r="1.2" class="c-servo-screw"/><circle cx="21" r="1.2" class="c-servo-screw"/>
      </g>
    </g>
    ${led !== null ? `<path d="M${nanoX(led)} 162 V104 H40" class="c-wire c-wire--sig"/>
    <g transform="translate(40 96)"><rect width="44" height="16" rx="6" class="c-res"/>
      <rect x="9" y="0" width="4" height="16" class="c-band1"/><rect x="17" y="0" width="4" height="16" class="c-band1"/>
      <rect x="25" y="0" width="4" height="16" class="c-band2"/><rect x="35" y="0" width="3" height="16" class="c-band3"/></g>
    <text x="62" y="92" class="c-tiny" text-anchor="middle">220 Ω</text>
    <path d="M84 104 H104" class="c-wire c-wire--sig"/>
    <g class="c-led" data-pin="${led}" transform="translate(116 104) rotate(90)">
      <circle r="22" class="c-glow"/>
      <path d="M-11 6 V-8 a11 11 0 0 1 22 0 V6 z" class="c-led-body"/>
      <rect x="-13" y="6" width="26" height="4" rx="2" class="c-led-rim"/>
    </g>
    <text x="116" y="86" class="c-tiny" text-anchor="middle">LED (D${led})</text>
    <path d="M127 104 H146 V116" class="c-wire c-wire--gnd"/>${gndSym(146, 116)}` : ''}
  </svg>
  <div class="motor-read servo-read">
    <section class="motor-read__ch" aria-label="Servo">
      <dl>
        <div><dt>Señal en D${pin} (pulsos medidos)</dt><dd class="servo-read__signal">—</dd></div>
        <div><dt>Servo (modelo del SG90)</dt><dd class="servo-read__angle">—</dd></div>
      </dl>
    </section>
    <p class="motor-read__help muted small">El ángulo pedido cambia con cada pulso (marca naranja del dial); el brazo tarda en llegar: el modelo gira como máximo a 600 °/s. Escala de la librería Servo: 544 µs = 0°, 2400 µs = 180°.</p>
  </div>
  ${pinStripHtml()}`;
  const strip = pinStrip(root);
  const horn = root.querySelector('.c-servo-horn');
  const target = root.querySelector('.c-servo-target');
  const body = root.querySelector('.c-servo');
  const signal = root.querySelector('.servo-read__signal');
  const angleEl = root.querySelector('.servo-read__angle');
  const ledEl = root.querySelector('.c-led');
  // Un barrido lento avanza a pasos de 1° que el modelo alcanza en milisegundos: se muestra «girando» mientras el brazo
  // haya cambiado de ángulo en los últimos 200 ms (tiempo real de la interfaz), no solo en el instante del mensaje.
  let lastAngle = null;
  let lastMove = -Infinity;
  let refresh = null;
  const setHorn = (a) => horn.setAttribute('transform', `translate(${SERVO_SHAFT[0]} ${SERVO_SHAFT[1]}) rotate(${(-a).toFixed(1)})`);
  const api = {
    update(w) {
      strip.update(w);
      if (ledEl && w.pin === led) applyLed(ledEl, w);
    },
    /** Estado real del modelo en el Worker (servo.js): pulso medido, ángulo pedido y ángulo del eje. */
    servoState(s) {
      signal.textContent = servoSignalText(s, pin);
      const a = s.angle ?? 90;
      const now = performance.now();
      if (lastAngle === null || Math.abs(a - lastAngle) > 0.5) { if (lastAngle !== null) lastMove = now; lastAngle = a; }
      const far = s.receiving && s.target !== null && Math.abs(s.target - a) > 0.5;
      const moving = far || now - lastMove < 200;
      clearTimeout(refresh);
      if (moving && !far) refresh = setTimeout(() => api.servoState({ ...s, angle: a }), 220);   // el Worker no avisa cuando ya no cambia
      angleEl.textContent = moving ? `${Math.round(a)}°${far ? ` → ${Math.round(s.target)}°` : ''} (girando)` : `${Math.round(a)}° · quieto${s.receiving ? '' : ' (sin órdenes)'}`;
      setHorn(a);
      body.classList.toggle('is-moving', moving);
      if (s.target !== null && s.receiving) {
        const [x1, y1] = polar(s.target, SERVO_DIAL - 6);
        const [x2, y2] = polar(s.target, SERVO_DIAL + 3);
        target.setAttribute('d', `M${x1.toFixed(1)} ${y1.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)}`);
        target.hidden = false;
      } else target.hidden = true;
    },
    stopped() { clearTimeout(refresh); },
    reset() {
      strip.reset();
      clearTimeout(refresh);
      signal.textContent = '—';
      angleEl.textContent = '—';
      target.hidden = true;
      lastAngle = null;
      lastMove = -Infinity;
      body.classList.remove('is-moving');
      setHorn(90);
      if (ledEl) applyLed(ledEl, { pin: led, duty: 0, level: false, rises: 0 });
    },
  };
  return api;
}
