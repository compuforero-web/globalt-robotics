// Web Worker: ejecuta el microcontrolador emulado fuera del hilo de la interfaz.
// Modos: 'realtime' (sigue el reloj real) y 'fast' (lo más rápido posible, para evaluar el reto).
import { NanoRunner, CLOCK_HZ } from './nano-runner.js';

const SLICE_MS = 16;           // trabajo máximo por porción antes de devolver el control
const MAX_LAG_MS = 100;        // si el equipo es lento, el tiempo simulado avanza más despacio
const MAX_TRACE = 20000;    // límite de eventos guardados para la evaluación
let runner = null;
let pins = [];
let serial = [];
let baud = 0;

function flush() {
  if (pins.length) { postMessage({ type: 'pins', events: pins }); pins = []; }
  if (serial.length) { postMessage({ type: 'serial', bytes: serial, baud }); serial = []; }
}

function realtime(limitMs) {
  let wallStart = performance.now();
  const step = () => {
    const wall = performance.now() - wallStart;
    const target = Math.min(wall, runner.timeMs + MAX_LAG_MS, limitMs);
    const sliceEnd = performance.now() + SLICE_MS;
    while (runner.timeMs < target && performance.now() < sliceEnd) {
      runner.runUntilCycle(Math.min(target, runner.timeMs + 2) * (CLOCK_HZ / 1000));
    }
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

function fast(durationMs) {
  const trace = { pins: [], serial: [], durationMs };
  const fastRunner = new NanoRunner(self.hex, {
    onPin: (pin, high, t) => { if (trace.pins.length < MAX_TRACE) trace.pins.push({ pin, high, t }); },
    onSerial: (byte, t, b) => { if (trace.serial.length < MAX_TRACE) trace.serial.push({ byte, t, baud: b }); },
  });
  while (fastRunner.timeMs < durationMs) fastRunner.runFor(50);
  postMessage({ type: 'trace', trace });
}

self.onmessage = ({ data }) => {
  try {
    if (data.type !== 'start') return;
    self.hex = data.hex;
    if (data.mode === 'fast') { fast(data.durationMs); return; }
    runner = new NanoRunner(data.hex, {
      onPin: (pin, high, t) => pins.push({ pin, high, t }),
      onSerial: (byte, _t, b) => { serial.push(byte); baud = b; },
    });
    postMessage({ type: 'ready' });
    realtime(data.limitMs || Infinity);
  } catch (error) {
    postMessage({ type: 'error', message: error.message });
  }
};
