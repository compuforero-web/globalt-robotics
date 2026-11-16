// Controla los Workers de simulación desde la interfaz: ejecutar, detener, reiniciar y evaluar.
const WORKER_URL = new URL('./sim-worker.js', import.meta.url);
const WATCHDOG_MS = 4000;     // sin señales del Worker durante este tiempo → se detiene
const MAX_RUN_MS = 10 * 60 * 1000;

export class Simulation {
  constructor({ onPins, onSerial, onStatus, onStop }) {
    Object.assign(this, { onPins, onSerial, onStatus, onStop });
    this.worker = null;
    this.hex = null;
  }

  get running() { return Boolean(this.worker); }

  start(hex) {
    this.stop(null);
    this.hex = hex;
    const worker = new Worker(WORKER_URL, { type: 'module' });
    this.worker = worker;
    let lastSignal = performance.now();
    this.watchdog = setInterval(() => {
      if (performance.now() - lastSignal > WATCHDOG_MS) this.stop('La simulación dejó de responder y se detuvo.');
    }, 1000);
    worker.onmessage = ({ data }) => {
      if (worker !== this.worker) return;
      lastSignal = performance.now();
      if (data.type === 'pins') this.onPins(data.events);
      else if (data.type === 'serial') this.onSerial(data.bytes, data.baud);
      else if (data.type === 'status') this.onStatus(data.simMs);
      else if (data.type === 'limit') this.stop('Simulación pausada tras 10 minutos simulados.');
      else if (data.type === 'error') this.stop('No se pudo cargar el programa: ' + data.message);
    };
    worker.onerror = (event) => { event.preventDefault?.(); this.stop('La simulación no pudo iniciarse en este navegador.'); };
    worker.postMessage({ type: 'start', mode: 'realtime', hex, limitMs: MAX_RUN_MS });
  }

  stop(reason = null) {
    if (!this.worker) return;
    this.worker.terminate();
    this.worker = null;
    clearInterval(this.watchdog);
    this.onStop(reason);
  }

  /** Reinicia el microcontrolador con el mismo programa (como el botón RESET). */
  reset() { if (this.hex) this.start(this.hex); }
}

/** Ejecuta el programa en modo rápido durante `durationMs` simulados y devuelve la traza. */
export function recordTrace(hex, durationMs, wallLimitMs = 20000) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_URL, { type: 'module' });
    const timer = setTimeout(() => { worker.terminate(); reject(new Error('La evaluación superó el tiempo máximo.')); }, wallLimitMs);
    const finish = (fn, value) => { clearTimeout(timer); worker.terminate(); fn(value); };
    worker.onmessage = ({ data }) => {
      if (data.type === 'trace') finish(resolve, data.trace);
      else if (data.type === 'error') finish(reject, new Error(data.message));
    };
    worker.onerror = (event) => { event.preventDefault?.(); finish(reject, new Error('No se pudo iniciar la evaluación.')); };
    worker.postMessage({ type: 'start', mode: 'fast', hex, durationMs });
  });
}
