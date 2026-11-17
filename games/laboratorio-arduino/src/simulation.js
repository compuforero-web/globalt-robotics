// Controla los Workers de simulación desde la interfaz: ejecutar, detener, reiniciar y evaluar.
// `watch` = pines del circuito de la lección, que se miden en todas las ventanas aunque no cambien.
// `button` = configuración del pulsador de la lección ({ pin, seed, bounce }) o null si no tiene entradas.
const WORKER_URL = new URL('./sim-worker.js', import.meta.url);
const WATCHDOG_MS = 4000;     // sin señales del Worker durante este tiempo → se detiene
const MAX_RUN_MS = 10 * 60 * 1000;

export class Simulation {
  constructor({ onWindows, onSerial, onStatus, onStop, onButton = () => {}, watch = [], button = null }) {
    Object.assign(this, { onWindows, onSerial, onStatus, onStop, onButton, watch, button });
    this.worker = null;
    this.hex = null;
  }

  get running() { return Boolean(this.worker); }

  /** `script` (opcional) = guion [{ t, closed }] que mueve el pulsador desde t = 0. */
  start(hex, { script = null } = {}) {
    this.stop(null);
    this.hex = hex;
    this.script = script;
    const worker = new Worker(WORKER_URL, { type: 'module' });
    this.worker = worker;
    let lastSignal = performance.now();
    this.watchdog = setInterval(() => {
      if (performance.now() - lastSignal > WATCHDOG_MS) this.stop('La simulación dejó de responder y se detuvo.');
    }, 1000);
    worker.onmessage = ({ data }) => {
      if (worker !== this.worker) return;
      lastSignal = performance.now();
      if (data.type === 'windows') this.onWindows(data.windows);
      else if (data.type === 'serial') this.onSerial(data.bytes, data.baud);
      else if (data.type === 'status') this.onStatus(data.simMs);
      else if (data.type === 'button') this.onButton(data);
      else if (data.type === 'limit') this.stop('Simulación pausada tras 10 minutos simulados.');
      else if (data.type === 'error') this.stop('No se pudo cargar el programa: ' + data.message);
    };
    worker.onerror = (event) => { event.preventDefault?.(); this.stop('La simulación no pudo iniciarse en este navegador.'); };
    worker.postMessage({ type: 'start', mode: 'realtime', hex, limitMs: MAX_RUN_MS, watch: this.watch, button: this.button, script });
  }

  /** El estudiante pulsa (true) o suelta (false) el pulsador del circuito. */
  input(closed) {
    if (!this.worker || !this.button) return false;
    this.worker.postMessage({ type: 'input', closed: Boolean(closed) });
    return true;
  }

  stop(reason = null) {
    if (!this.worker) return;
    this.worker.terminate();
    this.worker = null;
    clearInterval(this.watchdog);
    this.onStop(reason);
  }

  /** Reinicia el microcontrolador con el mismo programa (como el botón RESET). */
  reset() { if (this.hex) this.start(this.hex, { script: this.script }); }
}

/** Ejecuta el programa en modo rápido durante `durationMs` simulados y devuelve la traza. */
export function recordTrace(hex, durationMs, { watch = [], stimulus = null, wallLimitMs = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_URL, { type: 'module' });
    const timer = setTimeout(() => { worker.terminate(); reject(new Error('La evaluación superó el tiempo máximo.')); }, wallLimitMs);
    const finish = (fn, value) => { clearTimeout(timer); worker.terminate(); fn(value); };
    worker.onmessage = ({ data }) => {
      if (data.type === 'trace') finish(resolve, data.trace);
      else if (data.type === 'error') finish(reject, new Error(data.message));
    };
    worker.onerror = (event) => { event.preventDefault?.(); finish(reject, new Error('No se pudo iniciar la evaluación.')); };
    worker.postMessage({ type: 'start', mode: 'fast', hex, durationMs, watch, stimulus });
  });
}
