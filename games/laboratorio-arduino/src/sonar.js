// Modelo eléctrico de un sensor ultrasónico HC-SR04 conectado a un Nano (TRIG y ECHO en dos pines digitales).
// Reacciona solo a lo que hace el microcontrolador emulado: los flancos reales del pin TRIG (salida del programa
// compilado). Nunca lee el texto del programa. Comportamiento modelado, como el del módulo:
//   · Un pulso TRIG en HIGH de al menos 10 µs dispara una medida al bajar (flanco de bajada). Un pulso más corto
//     se ignora («TRIG inválido»), igual que un disparo mientras el módulo aún está midiendo («ocupado»).
//   · Tras el disparo, el módulo emite la ráfaga de 40 kHz y sube ECHO 450 µs después (latencia fija).
//   · ECHO permanece en HIGH el tiempo de ida y vuelta del sonido hasta el obstáculo vigente en ese instante:
//     2·d / 343 m/s (≈ 58,3 µs por cm). El final se programa con precisión de ciclo de reloj (62,5 ns).
//   · Sin eco (sin obstáculo o a más de 400 cm), ECHO baja al cabo de 38 ms: es el «tiempo máximo» del módulo.
//   · Mientras no mide, el módulo mantiene ECHO en LOW (lo impone aunque el pin tenga pull-up).
// Simplificaciones: obstáculo plano y perpendicular, sin ruido, sin ecos múltiples ni ángulo del haz; la distancia
// se toma en el instante en que sale la ráfaga; el sonido viaja a 343 m/s (aire a 20 °C).
import { CLOCK_HZ } from './nano-runner.js';

export const SOUND_CM_PER_S = 34300;
export const US_PER_CM = 2e6 / SOUND_CM_PER_S;   // ida y vuelta: ≈ 58,31 µs por cm
export const MIN_TRIG_US = 10;
export const ECHO_DELAY_US = 450;
export const NO_ECHO_US = 38000;
export const MIN_CM = 2;
export const MAX_CM = 400;
const CYCLES_PER_US = CLOCK_HZ / 1e6;

/** Duración del ECHO (µs) que produce un obstáculo a `cm` (null = sin eco → 38 ms). */
export function echoUs(cm) {
  if (cm === null || cm === undefined || !Number.isFinite(cm) || cm > MAX_CM) return NO_ECHO_US;
  return Math.max(MIN_CM, cm) * US_PER_CM;
}

/** Normaliza una distancia de la interfaz o del guion: número en 2–400 cm, o null (sin obstáculo). */
export function normalizeCm(cm) {
  if (cm === null || cm === undefined || cm === '' || !Number.isFinite(Number(cm))) return null;
  const v = Number(cm);
  if (v > MAX_CM) return null;
  return Math.max(MIN_CM, v);
}

export class SonarModel {
  /**
   * @param {import('./nano-runner.js').NanoRunner} runner
   * @param {{ trig?: number, echo?: number, cm?: number|null, onTrigger?: Function, onEcho?: Function, onDistance?: Function }} options
   *   onTrigger({ rise, fall, widthUs, accepted, reason }) con tiempos en ms simulados; reason: null, 'corto' u 'ocupado'.
   *   onEcho({ t0, t1, us, cm }) al terminar cada ECHO (cm = null si no hubo eco).
   *   onDistance(cm, tMs) cuando cambia el obstáculo.
   */
  constructor(runner, { trig = 7, echo = 8, cm = 100, onTrigger = () => {}, onEcho = () => {}, onDistance = () => {} } = {}) {
    Object.assign(this, { runner, trig, echo, onTrigger, onEcho, onDistance });
    this.cm = undefined;
    this.riseCycle = null;     // ciclo en que TRIG subió (null si está en LOW)
    this.busy = false;         // midiendo: desde el disparo aceptado hasta que ECHO baja
    this.echoHigh = false;
    this.pending = [];         // eventos programados de la medida en curso
    this.measures = 0;
    this.setDistance(cm);
    runner.setInput(echo, false);
    runner.pinListeners.push((pin, high) => { if (pin === this.trig) this.trigEdge(high); });
    // Si el programa deja ECHO como entrada con pull-up, el módulo lo sigue imponiendo (salida activa del sensor).
    runner.portListeners.push(() => this.drive());
  }

  get cycles() { return this.runner.cpu.cycles; }

  /** Obstáculo a `cm` (2–400) o null (sin obstáculo: no hay eco). Afecta a la siguiente ráfaga. */
  setDistance(cm) {
    const v = normalizeCm(cm);
    if (v === this.cm) return;
    this.cm = v;
    this.onDistance(v, this.runner.timeMs);
  }

  drive() { this.runner.setInput(this.echo, this.echoHigh); }

  trigEdge(high) {
    if (high) { this.riseCycle = this.cycles; return; }
    if (this.riseCycle === null) return;
    const rise = this.riseCycle;
    const fall = this.cycles;
    this.riseCycle = null;
    const widthUs = (fall - rise) / CYCLES_PER_US;
    const reason = widthUs < MIN_TRIG_US ? 'corto' : this.busy ? 'ocupado' : null;
    const toMs = (c) => c / (CLOCK_HZ / 1000);
    this.onTrigger({ rise: toMs(rise), fall: toMs(fall), widthUs, accepted: !reason, reason });
    if (!reason) this.fire(fall);
  }

  /** Disparo aceptado en el ciclo `fall`: ráfaga, ECHO alto y ECHO bajo, todo con ciclos absolutos. */
  fire(fall) {
    this.busy = true;
    this.measures++;
    const start = fall + Math.round(ECHO_DELAY_US * CYCLES_PER_US);
    const schedule = (cycle, fn) => {
      const ev = () => { this.pending = this.pending.filter((e) => e !== ev); fn(); };
      this.pending.push(ev);
      this.runner.atCycle(cycle, ev);
    };
    schedule(start, () => {
      const cm = this.cm;                       // obstáculo vigente cuando sale la ráfaga
      const us = echoUs(cm);
      const end = start + Math.round(us * CYCLES_PER_US);
      this.echoHigh = true;
      this.drive();
      const t0 = this.runner.timeMs;
      schedule(end, () => {
        this.echoHigh = false;
        this.drive();
        this.busy = false;
        this.onEcho({ t0, t1: this.runner.timeMs, us, cm });
      });
    });
  }

  /** Guion [{ t, cm }] (ms simulados; cm = null → sin obstáculo), aplicado con precisión de ciclo. */
  play(events) {
    for (const e of events) this.runner.atMs(e.t, () => this.setDistance(e.cm));
  }
}
