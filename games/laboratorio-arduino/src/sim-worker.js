// Web Worker: ejecuta el microcontrolador emulado fuera del hilo de la interfaz.
// Modos: 'realtime' (sigue el reloj real) y 'fast' (lo más rápido posible, para evaluar el reto).
// Los pines se resumen en ventanas de 20 ms (pwm.js): así una salida PWM de ~1 kHz no satura la interfaz
// ni la traza de evaluación. Todo sale de los flancos del HEX emulado.
// Las lecciones con pulsador añaden su modelo (button.js): en tiempo real lo mueve el estudiante (mensajes
// 'input') o un guion; en la evaluación, siempre el guion reproducible de la lección, con precisión de ciclo.
import { NanoRunner, CLOCK_HZ } from './nano-runner.js';
import { PwmMeter, WINDOW_MS } from './pwm.js';
import { ButtonModel } from './button.js';
import { PotModel } from './pot.js';

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
  advance(durationMs, (ws) => { for (const w of ws) trace.windows.push(w); });
  button = null;
  pot = null;
  return trace;
}

if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
  self.onmessage = ({ data }) => {
    try {
      if (data.type === 'input') { if (button && runner) { button.press(Boolean(data.closed)); } return; }
      if (data.type === 'analog') { if (pot && runner) pot.set(data.volts); return; }
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
      postMessage({ type: 'ready' });
      realtime(data.limitMs || Infinity);
    } catch (error) {
      postMessage({ type: 'error', message: error.message });
    }
  };
}
