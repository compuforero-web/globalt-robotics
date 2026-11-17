// Controla los Workers de simulación desde la interfaz: ejecutar, detener, reiniciar y evaluar.
// `watch` = pines del circuito de la lección, que se miden en todas las ventanas aunque no cambien.
// `button` = configuración del pulsador de la lección ({ pin, seed, bounce }) o null si no tiene entradas.
const WORKER_URL = new URL('./sim-worker.js', import.meta.url);
const WATCHDOG_MS = 4000;     // sin señales del Worker durante este tiempo → se detiene
const MAX_RUN_MS = 10 * 60 * 1000;

export class Simulation {
  constructor({ onWindows, onSerial, onStatus, onStop, onButton = () => {}, onPot = () => {}, onSonar = () => {}, watch = [], button = null, pot = null, sonar = null }) {
    Object.assign(this, { onWindows, onSerial, onStatus, onStop, onButton, onPot, onSonar, watch, button, pot, sonar });
    this.worker = null;
    this.hex = null;
  }

  get running() { return Boolean(this.worker); }

  /**
   * `script` (opcional) = guion [{ t, closed }] que mueve el pulsador desde t = 0; `potScript` = [{ t, volts }]
   * para el potenciómetro; `potVolts` = posición inicial del potenciómetro; `sonarScript` = [{ t, cm }] para el
   * obstáculo del HC-SR04 y `sonarCm` su posición inicial (null = sin obstáculo).
   */
  start(hex, { script = null, potScript = null, potVolts = 0, sonarScript = null, sonarCm = null } = {}) {
    this.stop(null);
    this.hex = hex;
    this.script = script;
    this.potScript = potScript;
    this.sonarScript = sonarScript;
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
      else if (data.type === 'pot') this.onPot(data);
      else if (data.type === 'sonar') this.onSonar(data);
      else if (data.type === 'limit') this.stop('Simulación pausada tras 10 minutos simulados.');
      else if (data.type === 'error') this.stop('No se pudo cargar el programa: ' + data.message);
    };
    worker.onerror = (event) => { event.preventDefault?.(); this.stop('La simulación no pudo iniciarse en este navegador.'); };
    const pot = this.pot ? { ...this.pot, volts: potScript?.[0]?.t === 0 ? potScript[0].volts : potVolts } : null;
    const sonar = this.sonar ? { ...this.sonar, cm: sonarScript?.[0]?.t === 0 ? sonarScript[0].cm : sonarCm } : null;
    worker.postMessage({ type: 'start', mode: 'realtime', hex, limitMs: MAX_RUN_MS, watch: this.watch, button: this.button, script, pot, potScript, sonar, sonarScript });
  }

  /** El estudiante mueve el potenciómetro a `volts` (0–5 V). */
  analog(volts) {
    if (!this.worker || !this.pot) return false;
    this.worker.postMessage({ type: 'analog', volts: Number(volts) });
    return true;
  }

  /** El estudiante mueve el obstáculo del HC-SR04 a `cm` (null = sin obstáculo). */
  distance(cm) {
    if (!this.worker || !this.sonar) return false;
    this.worker.postMessage({ type: 'distance', cm: cm === null ? null : Number(cm) });
    return true;
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
  reset(potVolts = 0, sonarCm = null) { if (this.hex) this.start(this.hex, { script: this.script, potScript: this.potScript, potVolts, sonarScript: this.sonarScript, sonarCm }); }
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
