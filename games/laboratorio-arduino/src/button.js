// Modelo eléctrico de un pulsador conectado entre un pin del Nano y GND (sin resistencia externa).
// Reacciona a los registros del microcontrolador emulado (DDR/PORT) y le impone el nivel que leerá digitalRead:
//   · contacto cerrado (pulsado)        → el pin queda unido a GND: LOW.
//   · contacto abierto + INPUT_PULLUP   → la resistencia interna lo lleva a 5 V: HIGH.
//   · contacto abierto + INPUT          → nada fija el nivel: el pin queda «flotante» y lee ruido. Se modela con
//                                         cambios pseudoaleatorios deterministas (misma semilla → mismo ruido).
//   · pin configurado como OUTPUT       → el modelo no impone nada (lo manda el programa).
// Nunca lee el texto del programa: solo el modo del pin que dejó el código compilado al ejecutarse.

/** Generador pseudoaleatorio determinista (mulberry32): devuelve números en [0, 1). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FLOAT_MIN_MS = 0.2;   // intervalo entre cambios del ruido de un pin flotante
const FLOAT_MAX_MS = 3;

/**
 * Rebote mecánico: tras el cambio de contacto en `t`, `n` (min…max) idas y vueltas breves de 0,2–2 ms cada tramo,
 * terminando en el estado final `closed`. Devuelve los eventos [{ t, closed }] (incluido el primero) y el instante
 * en que el contacto queda estable.
 */
export function bounceBurst(t, closed, random, { min = 3, max = 8, minMs = 0.2, maxMs = 2 } = {}) {
  const events = [{ t, closed }];
  const n = min + Math.floor(random() * (max - min + 1));
  let at = t;
  const span = () => minMs + random() * (maxMs - minMs);
  for (let k = 0; k < n; k++) {
    at += span(); events.push({ t: at, closed: !closed });
    at += span(); events.push({ t: at, closed });
  }
  return { events, stable: at, bounces: n };
}

/**
 * Guion reproducible de pulsaciones. `presses` = [{ down, up }] en ms simulados.
 * Con `bounce`, cada pulsación y cada suelta rebota (bounceBurst) con la semilla dada.
 * Devuelve { events: [{ t, closed }], presses: [{ down, up, stableDown, stableUp, bouncesDown, bouncesUp }] }.
 */
export function buildScript(presses, { bounce = false, seed = 1 } = {}) {
  const random = rng(seed);
  const events = [];
  const out = presses.map(({ down, up }) => {
    if (!bounce) {
      events.push({ t: down, closed: true }, { t: up, closed: false });
      return { down, up, stableDown: down, stableUp: up, bouncesDown: 0, bouncesUp: 0 };
    }
    const d = bounceBurst(down, true, random);
    const u = bounceBurst(up, false, random);
    events.push(...d.events, ...u.events);
    return { down, up, stableDown: d.stable, stableUp: u.stable, bouncesDown: d.bounces, bouncesUp: u.bounces };
  });
  return { events, presses: out };
}

export class ButtonModel {
  /**
   * @param {import('./nano-runner.js').NanoRunner} runner
   * @param {{ pin?: number, seed?: number, bounce?: boolean, onContact?: Function, onMode?: Function }} options
   *   onContact(closed, tMs) y onMode(mode, tMs) informan de lo que ocurre (traza y dibujo).
   */
  constructor(runner, { pin = 2, seed = 1, bounce = false, onContact = () => {}, onMode = () => {} } = {}) {
    Object.assign(this, { runner, pin, bounce, onContact, onMode });
    this.random = rng(seed);
    this.closed = false;
    this.mode = null;
    this.level = null;
    this.noise = null;
    this.manual = new Set();   // rebotes pendientes de la última pulsación manual (el guion va aparte)
    runner.portListeners.push(() => this.resolve());
    this.resolve();
  }

  /** Nivel que impone el circuito según el contacto y el modo actual del pin. */
  resolve() {
    const mode = this.runner.pinMode(this.pin);
    if (mode !== this.mode) { this.mode = mode; this.onMode(mode, this.runner.timeMs); }
    if (mode === 'output') { this.stopNoise(); return; }
    if (this.closed) { this.stopNoise(); this.drive(false); return; }
    if (mode === 'pullup') { this.stopNoise(); this.drive(true); return; }
    this.startNoise();
  }

  drive(high) {
    if (high === this.level) return;
    this.level = high;
    this.runner.setInput(this.pin, high);
  }

  startNoise() {
    if (this.noise) return;
    const tick = () => {
      this.noise = null;
      if (this.closed || this.mode !== 'input') return;
      this.drive(!this.level);
      this.scheduleNoise(tick);
    };
    if (this.level === null) this.drive(this.random() < 0.5);
    this.scheduleNoise(tick);
  }

  scheduleNoise(tick) {
    const ms = FLOAT_MIN_MS + this.random() * (FLOAT_MAX_MS - FLOAT_MIN_MS);
    this.noise = this.runner.atMs(this.runner.timeMs + ms, tick);
  }

  stopNoise() {
    if (!this.noise) return;
    this.runner.cancel(this.noise);
    this.noise = null;
  }

  /** Abre o cierra el contacto ahora mismo (sin rebote). */
  setContact(closed) {
    closed = Boolean(closed);
    if (closed === this.closed) return;
    this.closed = closed;
    this.onContact(closed, this.runner.timeMs);
    this.resolve();
  }

  /** Programa el contacto en el instante `t` (ms simulados), con precisión de ciclo. */
  at(t, closed, group = null) {
    const fn = () => { group?.delete(fn); this.setContact(closed); };
    group?.add(fn);
    this.runner.atMs(t, fn);
  }

  /** Aplica un guion [{ t, closed }]. */
  play(events, group = null) { for (const e of events) this.at(e.t, e.closed, group); }

  /** Pulsación manual (interfaz): cambia ya, o con rebote si el modelo lo simula. */
  press(closed) {
    for (const fn of this.manual) this.runner.cancel(fn);   // una pulsación nueva sustituye al rebote anterior
    this.manual.clear();
    if (!this.bounce) { this.setContact(closed); return; }
    this.play(bounceBurst(this.runner.timeMs + 0.001, closed, this.random).events, this.manual);
  }
}
