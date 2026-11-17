// Web Worker: ejecuta el microcontrolador emulado fuera del hilo de la interfaz.
// Modos: 'realtime' (sigue el reloj real) y 'fast' (lo más rápido posible, para evaluar el reto).
// Los pines se resumen en ventanas de 20 ms (pwm.js): así una salida PWM de ~1 kHz no satura la interfaz
// ni la traza de evaluación. Todo sale de los flancos del HEX emulado.
// Las lecciones con pulsador añaden su modelo (button.js): en tiempo real lo mueve el estudiante (mensajes
// 'input') o un guion; en la evaluación, siempre el guion reproducible de la lección, con precisión de ciclo.
// Las lecciones del sensor ultrasónico añaden el HC-SR04 (sonar.js): el estudiante mueve el obstáculo ('distance')
// o lo mueve el guion; el modelo responde a los pulsos reales de TRIG del programa.
// Las lecciones de motores añaden el puente H L298N y sus motores (motor.js): sin estímulos externos; el modelo sigue
// el nivel real de los pines IN y el PWM real de EN, y la traza registra órdenes, velocidades e inversiones.
// Las lecciones del servo añaden el SG90 (servo.js): sin estímulos externos; el modelo mide cada pulso real del pin de
// señal (ancho y periodo) y la traza registra los pulsos, el ángulo pedido y el ángulo del eje.
import { NanoRunner, CLOCK_HZ } from './nano-runner.js';
import { PwmMeter, WINDOW_MS } from './pwm.js';
import { ButtonModel } from './button.js';
import { PotModel } from './pot.js';
import { SonarModel } from './sonar.js';
import { MotorModel } from './motor.js';
import { ServoModel } from './servo.js';

const SLICE_MS = 16;            // trabajo máximo por porción antes de devolver el control
const MAX_LAG_MS = 100;         // si el equipo es lento, el tiempo simulado avanza más despacio
const MAX_TRACE = 20000;        // límite total de flancos y de bytes guardados para la evaluación
const MAX_EDGES_PER_PIN = 1000; // un pin más rápido (PWM) queda medido solo por ventanas
const CYCLES_PER_MS = CLOCK_HZ / 1000;
let runner = null;
let meter = null;
let windows = [];
let serial = [];
let baud = 0;
const lastSent = new Map();     // pin → última ventana enviada (no se repiten estados iguales)
let button = null;
let buttonSent = '';            // último estado del pulsador enviado a la interfaz
let pot = null;
let lastAdc = null;             // última conversión del ADC pedida por el programa { channel, value, t }
let potSent = '';
let sonar = null;
let sonarState = null;          // último disparo y último eco del HC-SR04 (para la interfaz)
let sonarSent = '';
let motor = null;
let motorSent = '';
const MOTOR_SAMPLE_MS = 10;     // la traza guarda la velocidad de cada motor cada 10 ms
let servo = null;
let servoSent = '';
const SERVO_SAMPLE_MS = 10;     // la traza guarda el ángulo del servo cada 10 ms

function changed(w) {
  const prev = lastSent.get(w.pin);
  if (prev && prev.level === w.level && w.rises === 0 && prev.rises === 0 && Math.abs(prev.duty - w.duty) < 0.002) return false;
  lastSent.set(w.pin, w);
  return true;
}

function flush() {
  if (button) {
    // Un pin flotante cambia cada pocos ms: se informa como «flotante» (level null) en lugar de cada cambio.
    const floating = button.mode === 'input' && !button.closed;
    const state = { closed: button.closed, mode: button.mode, level: floating ? null : button.level };
    const key = JSON.stringify(state);
    if (key !== buttonSent) { buttonSent = key; postMessage({ type: 'button', ...state }); }
  }
  if (pot) {
    const state = { volts: pot.volts, adc: lastAdc && lastAdc.channel === pot.channel ? lastAdc.value : null };
    const key = JSON.stringify(state);
    if (key !== potSent) { potSent = key; postMessage({ type: 'pot', ...state }); }
  }
  if (sonar) {
    const state = { cm: sonar.cm, trigMode: runner.pinMode(sonar.trig), measures: sonar.measures, echoHigh: sonar.echoHigh, ...sonarState };
    const key = JSON.stringify(state);
    if (key !== sonarSent) { sonarSent = key; postMessage({ type: 'sonar', ...state }); }
  }
  if (motor) {
    const channels = motor.state().map((c) => ({ ...c, speed: Math.round(c.speed * 1000) / 1000, angle: Math.round(c.angle) }));
    const key = JSON.stringify(channels);
    if (key !== motorSent) { motorSent = key; postMessage({ type: 'motor', channels, reversals: motor.reversals }); }
  }
  if (servo) {
    const st = servo.state();
    const r1 = (x) => (x === null ? null : Math.round(x * 10) / 10);
    const state = { angle: r1(st.angle), target: r1(st.target), us: st.us === null ? null : Math.round(st.us),
      periodMs: r1(st.periodMs), receiving: st.receiving, moving: st.moving, mode: st.mode, pulses: st.pulses > 0,
      invalid: st.invalid ? { reason: st.invalid.reason, us: Math.round(st.invalid.us), periodMs: r1(st.invalid.periodMs) } : null };
    const key = JSON.stringify(state);
    if (key !== servoSent) { servoSent = key; postMessage({ type: 'servo', ...state }); }
  }
  if (windows.length) { postMessage({ type: 'windows', windows }); windows = []; }
  if (serial.length) { postMessage({ type: 'serial', bytes: serial, baud }); serial = []; }
}

/** Ejecuta hasta `targetMs` cerrando las ventanas de medición que se completen por el camino. */
function advance(targetMs, onWindows) {
  while (runner.timeMs < targetMs) {
    // Límites en múltiplos exactos de 20 ms: el cierre real llega unos ciclos tarde y no debe acumularse.
    const boundary = (Math.round(meter.start / WINDOW_MS) + 1) * WINDOW_MS;
    runner.runUntilCycle(Math.min(targetMs, boundary) * CYCLES_PER_MS);
    if (runner.timeMs >= boundary) onWindows(meter.close(runner.timeMs));
  }
}

function realtime(limitMs) {
  let wallStart = performance.now();
  const keep = (ws) => { for (const w of ws) if (changed(w)) windows.push(w); };
  const step = () => {
    const wall = performance.now() - wallStart;
    const target = Math.min(wall, runner.timeMs + MAX_LAG_MS, limitMs);
    const sliceEnd = performance.now() + SLICE_MS;
    while (runner.timeMs < target && performance.now() < sliceEnd) advance(Math.min(target, runner.timeMs + 2), keep);
    if (runner.timeMs + MAX_LAG_MS < wall) { // equipo lento: reajusta la referencia
      wallStart = performance.now() - runner.timeMs;
    }
    flush();
    postMessage({ type: 'status', simMs: runner.timeMs });
    if (runner.timeMs >= limitMs) postMessage({ type: 'limit', simMs: runner.timeMs });
    else setTimeout(step, 4);
  };
  step();
}

/**
 * Pulsador de la lección. `config` = { pin, seed, bounce }; `script` = [{ t, closed }] (guion opcional).
 * `record` recibe los cambios de contacto y de modo del pin para la traza.
 */
function attachButton(config, script, record = {}) {
  if (!config) return null;
  const model = new ButtonModel(runner, { pin: config.pin, seed: config.seed, bounce: Boolean(config.bounce),
    onContact: record.onContact, onMode: record.onMode });
  if (Array.isArray(script)) model.play(script);
  return model;
}

/**
 * Traza para evaluar: flancos (limitados por pin), bytes serie y ventanas de medición.
 * `stimulus` = { button: { pin, seed }, script: [{ t, closed }] }: el guion de pulsaciones se aplica igual siempre.
 * La traza añade `input` = { pin, contact: [{ t, closed }], modes: [{ t, mode }] } con lo que ocurrió en el pin.
 */
export function recordFast(hex, durationMs, watch = [], stimulus = null) {
  const trace = { pins: [], serial: [], windows: [], durationMs, truncatedPins: [], adc: [] };
  const perPin = new Map();
  meter = new PwmMeter({ watch });
  runner = new NanoRunner(hex, {
    onPin: (pin, high, t) => {
      meter.edge(pin, high, t);
      const n = (perPin.get(pin) || 0) + 1;
      perPin.set(pin, n);
      if (n > MAX_EDGES_PER_PIN) { if (n === MAX_EDGES_PER_PIN + 1) trace.truncatedPins.push(pin); return; }
      if (trace.pins.length < MAX_TRACE) trace.pins.push({ pin, high, t });
    },
    onSerial: (byte, t, b) => { if (trace.serial.length < MAX_TRACE) trace.serial.push({ byte, t, baud: b }); },
    onAdc: (channel, value, t) => { if (trace.adc.length < MAX_TRACE) trace.adc.push({ channel, value, t }); },
  });
  if (stimulus?.button) {
    const input = { pin: stimulus.button.pin, contact: [], modes: [] };
    trace.input = input;
    button = attachButton({ ...stimulus.button, bounce: false }, stimulus.script || [], {
      onContact: (closed, t) => { if (input.contact.length < MAX_TRACE) input.contact.push({ t, closed }); },
      onMode: (mode, t) => { if (input.modes.length < MAX_TRACE) input.modes.push({ t, mode }); },
    });
  }
  if (stimulus?.pot) {
    // `potScript` = [{ t, volts }]: posición del potenciómetro en cada momento (la traza la registra).
    const analog = { channel: stimulus.pot.channel, volts: [] };
    trace.analog = analog;
    pot = new PotModel(runner, { channel: stimulus.pot.channel, volts: stimulus.pot.volts ?? 0,
      onChange: (volts, t) => analog.volts.push({ t, volts }) });
    pot.play(stimulus.potScript || []);
  }
  if (stimulus?.sonar) {
    // `sonarScript` = [{ t, cm }] (cm = null: sin obstáculo). La traza registra cada disparo en TRIG tal como lo
    // generó el programa, cada ECHO que produjo el modelo y cada cambio del obstáculo.
    const log = { trig: stimulus.sonar.trig, echo: stimulus.sonar.echo, triggers: [], echoes: [], distances: [] };
    trace.sonar = log;
    sonar = new SonarModel(runner, { trig: stimulus.sonar.trig, echo: stimulus.sonar.echo, cm: stimulus.sonar.cm ?? null,
      onTrigger: (x) => { if (log.triggers.length < MAX_TRACE) log.triggers.push(x); },
      onEcho: (x) => { if (log.echoes.length < MAX_TRACE) log.echoes.push(x); },
      onDistance: (cm, t) => log.distances.push({ t, cm }) });
    sonar.play(stimulus.sonarScript || []);
  }
  if (stimulus?.motors) {
    // Sin guion: el programa es la única fuente de órdenes. `orders` = cambios de orden del puente H por canal
    // (y de EN en ≥ 2 puntos), `samples` = velocidad de cada motor cada 10 ms, `reversals` = inversiones con el motor girando.
    const log = { channels: stimulus.motors.channels, orders: [], reversals: [], samples: [], params: null, outputs: null };
    trace.motor = log;
    let next = 0;
    motor = new MotorModel(runner, { channels: stimulus.motors.channels,
      onOrder: (x) => { if (log.orders.length < MAX_TRACE) log.orders.push(x); },
      onReverse: (x) => { if (log.reversals.length < MAX_TRACE) log.reversals.push(x); },
      onTick: (t, m) => {
        if (t + 1e-6 < next) return;
        next += MOTOR_SAMPLE_MS;
        if (log.samples.length < MAX_TRACE) log.samples.push({ t, v: m.channels.map((c) => Math.round(c.speed * 1000) / 1000) });
      } });
    log.params = motor.P;
  }
  if (stimulus?.servo) {
    // Sin guion: el programa es la única fuente de pulsos. `pulses` = cada pulso medido en el pin de señal (ancho en µs,
    // periodo en ms, válido o no y su ángulo), `samples` = ángulo del eje (a) y ángulo pedido (g) cada 10 ms.
    const log = { pin: stimulus.servo.pin, pulses: [], samples: [], params: null };
    trace.servo = log;
    let next = 0;
    servo = new ServoModel(runner, { pin: stimulus.servo.pin, angle: stimulus.servo.angle ?? 90,
      onPulse: (x) => { if (log.pulses.length < MAX_TRACE) log.pulses.push(x); },
      onTick: (t, m) => {
        if (t + 1e-6 < next) return;
        next += SERVO_SAMPLE_MS;
        if (log.samples.length < MAX_TRACE) {
          log.samples.push({ t, a: Math.round(m.angle * 10) / 10, g: m.target === null || !m.receiving ? null : Math.round(m.target * 10) / 10 });
        }
      } });
    log.params = servo.P;
  }
  advance(durationMs, (ws) => { for (const w of ws) trace.windows.push(w); });
  if (motor) trace.motor.outputs = motor.channels.map((c) => ({ id: c.id, ...c.everOutput }));
  button = null;
  pot = null;
  sonar = null;
  motor = null;
  servo = null;
  return trace;
}

if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
  self.onmessage = ({ data }) => {
    try {
      if (data.type === 'input') { if (button && runner) { button.press(Boolean(data.closed)); } return; }
      if (data.type === 'analog') { if (pot && runner) pot.set(data.volts); return; }
      if (data.type === 'distance') { if (sonar && runner) sonar.setDistance(data.cm); return; }
      if (data.type !== 'start') return;
      const watch = Array.isArray(data.watch) ? data.watch : [];
      if (data.mode === 'fast') { postMessage({ type: 'trace', trace: recordFast(data.hex, data.durationMs, watch, data.stimulus || null) }); return; }
      meter = new PwmMeter({ watch });
      runner = new NanoRunner(data.hex, {
        onPin: (pin, high, t) => meter.edge(pin, high, t),
        onSerial: (byte, _t, b) => { serial.push(byte); baud = b; },
        onAdc: (channel, value, t) => { lastAdc = { channel, value, t }; },
      });
      // Con guion, el pulsador sigue el guion del reto (el estudiante puede pulsar además).
      button = attachButton(data.button || null, data.script || null);
      if (data.pot) {
        pot = new PotModel(runner, { channel: data.pot.channel, volts: data.pot.volts ?? 0 });
        if (Array.isArray(data.potScript)) pot.play(data.potScript);
      }
      if (data.sonar) {
        sonarState = null;
        sonar = new SonarModel(runner, { trig: data.sonar.trig, echo: data.sonar.echo, cm: data.sonar.cm ?? null,
          onTrigger: (x) => { sonarState = { ...sonarState, trig: x }; },
          onEcho: (x) => { sonarState = { ...sonarState, echo: x }; } });
        if (Array.isArray(data.sonarScript)) sonar.play(data.sonarScript);
      }
      motor = null;
      motorSent = '';
      if (data.motors) {
        const reversals = [];
        motor = new MotorModel(runner, { channels: data.motors.channels, onReverse: (x) => { reversals.push(x); if (reversals.length > 5) reversals.shift(); } });
        motor.reversals = reversals;
      }
      servo = null;
      servoSent = '';
      if (data.servo) servo = new ServoModel(runner, { pin: data.servo.pin, angle: data.servo.angle ?? 90 });
      postMessage({ type: 'ready' });
      realtime(data.limitMs || Infinity);
    } catch (error) {
      postMessage({ type: 'error', message: error.message });
    }
  };
}
