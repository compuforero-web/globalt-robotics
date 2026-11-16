// Web Worker: ejecuta el microcontrolador emulado fuera del hilo de la interfaz.
// Modos: 'realtime' (sigue el reloj real) y 'fast' (lo más rápido posible, para evaluar el reto).
// Los pines se resumen en ventanas de 20 ms (pwm.js): así una salida PWM de ~1 kHz no satura la interfaz
// ni la traza de evaluación. Todo sale de los flancos del HEX emulado.
import { NanoRunner, CLOCK_HZ } from './nano-runner.js';
import { PwmMeter, WINDOW_MS } from './pwm.js';

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

function changed(w) {
  const prev = lastSent.get(w.pin);
  if (prev && prev.level === w.level && w.rises === 0 && prev.rises === 0 && Math.abs(prev.duty - w.duty) < 0.002) return false;
  lastSent.set(w.pin, w);
  return true;
}

function flush() {
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

/** Traza para evaluar: flancos (limitados por pin), bytes serie y ventanas de medición. */
export function recordFast(hex, durationMs, watch = []) {
  const trace = { pins: [], serial: [], windows: [], durationMs, truncatedPins: [] };
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
  });
  advance(durationMs, (ws) => { for (const w of ws) trace.windows.push(w); });
  return trace;
}

if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
  self.onmessage = ({ data }) => {
    try {
      if (data.type !== 'start') return;
      const watch = Array.isArray(data.watch) ? data.watch : [];
      if (data.mode === 'fast') { postMessage({ type: 'trace', trace: recordFast(data.hex, data.durationMs, watch) }); return; }
      meter = new PwmMeter({ watch });
      runner = new NanoRunner(data.hex, {
        onPin: (pin, high, t) => meter.edge(pin, high, t),
        onSerial: (byte, _t, b) => { serial.push(byte); baud = b; },
      });
      postMessage({ type: 'ready' });
      realtime(data.limitMs || Infinity);
    } catch (error) {
      postMessage({ type: 'error', message: error.message });
    }
  };
}
