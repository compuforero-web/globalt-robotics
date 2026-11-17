// Modelo de un micro servo SG90 (señal en un pin digital del Nano) alimentado por una fuente externa de 5 V con GND común.
// Reacciona solo a lo que hace el microcontrolador emulado: los flancos reales del pin de señal, medidos con precisión de
// ciclo de reloj (62,5 ns). Nunca lee el texto del programa ni reproduce una animación preparada: si el programa no
// genera pulsos, el servo no se mueve.
//
// 1. Pulso: tiempo en HIGH entre una subida y la bajada siguiente. Periodo: tiempo entre dos subidas consecutivas.
//    Un pulso es una ORDEN válida si su ancho está entre MIN_US y MAX_US (400–2600 µs) y desde la subida anterior han
//    pasado al menos MIN_PERIOD_MS (un PWM de analogWrite a 490 Hz, con periodo de 2 ms, no es una señal de servo).
//    Los demás se registran como pulsos no válidos y no cambian la orden.
// 2. Ángulo objetivo: la misma escala que usa la librería Servo para write(): 544 µs → 0° y 2400 µs → 180°, lineal;
//    fuera de ese tramo se limita a 0° o 180° (tope mecánico del modelo).
// 3. Respuesta mecánica: el eje se mueve hacia el objetivo a una velocidad máxima de SPEED_DEG_S (SG90 a 5 V sin carga:
//    0,1 s cada 60° → 600 °/s), sin sobrepasarlo. Una orden se aplica al terminar su pulso (el servo necesita medir
//    el ancho completo).
// 4. Sin pulsos válidos durante SIGNAL_LOST_MS (p. ej. tras detach() o con el pin en LOW), el servo deja de recibir
//    órdenes: el modelo lo informa como «sin señal» y el eje se queda donde está (sin par de retención).
// Simplificaciones: sin carga ni inercia propia del brazo, sin zona muerta del amplificador (±1–2 µs en uno real),
// sin variación de velocidad con la tensión ni consumo; la fuente de 5 V y el GND común solo se representan en el
// diagrama. Un servo real puede tener otro rango de pulsos y vibrar en los topes.
import { CLOCK_HZ } from './nano-runner.js';

export const SERVO = {
  minUs: 544,            // write(0) de la librería Servo
  maxUs: 2400,           // write(180)
  validMinUs: 400,       // fuera de 400–2600 µs el pulso no es una orden de servo
  validMaxUs: 2600,
  minPeriodMs: 5,        // dos subidas a menos de 5 ms: PWM o ruido, no una señal de servo
  signalLostMs: 60,      // sin pulsos válidos durante 60 ms → «sin señal»
  speedDegS: 600,        // 0,1 s / 60°
  tickMs: 1,             // paso del modelo en tiempo simulado
};
const CYCLES_PER_MS = CLOCK_HZ / 1000;

/** Ángulo (0–180°) que corresponde a un pulso de `us` microsegundos. */
export function pulseToAngle(us, P = SERVO) {
  const a = ((us - P.minUs) / (P.maxUs - P.minUs)) * 180;
  return Math.min(180, Math.max(0, a));
}

/** Ancho de pulso (µs) que genera write(angle) en la librería Servo para AVR (sin el ajuste de ciclos internos). */
export function angleToPulse(angle, P = SERVO) {
  return P.minUs + (Math.min(180, Math.max(0, angle)) / 180) * (P.maxUs - P.minUs);
}

/** Un paso de la mecánica: nuevo ángulo tras `dt` ms yendo hacia `target` a la velocidad máxima. */
export function servoStep(angle, target, dt, P = SERVO) {
  const max = (P.speedDegS * dt) / 1000;
  const d = target - angle;
  return Math.abs(d) <= max ? target : angle + Math.sign(d) * max;
}

export class ServoModel {
  /**
   * @param {import('./nano-runner.js').NanoRunner} runner
   * @param {{ pin?: number, angle?: number, params?: object, onPulse?: Function, onTick?: Function }} options
   *   onPulse({ t, us, periodMs, valid, reason, angle }) al terminar cada pulso (t = subida, en ms simulados);
   *     reason: null, 'ancho' (fuera de 400–2600 µs) o 'periodo' (subidas a menos de 5 ms).
   *   onTick(t, model) tras cada paso (cada tickMs simulados).
   */
  constructor(runner, { pin = 9, angle = 90, params = {}, onPulse = () => {}, onTick = () => {} } = {}) {
    Object.assign(this, { runner, pin, onPulse, onTick });
    this.P = { ...SERVO, ...params };
    this.angle = angle;          // posición del eje (el servo real conserva la última posición al conectarlo)
    this.target = null;          // ángulo pedido por el último pulso válido (null: aún sin órdenes)
    this.lastUs = null;          // ancho del último pulso válido
    this.periodMs = null;        // periodo entre las dos últimas subidas
    this.riseCycle = null;
    this.prevRise = null;
    this.lastValid = null;       // ciclo del último pulso válido
    this.invalid = null;         // último motivo de pulso no válido (para la interfaz)
    this.pulses = 0;
    runner.pinListeners.push((p, high) => { if (p === this.pin) this.edge(high, runner.cpu.cycles); });
    this.tickCycles = Math.round(this.P.tickMs * CYCLES_PER_MS);
    const tick = () => { this.step(); runner.cpu.addClockEvent(tick, this.tickCycles); };
    runner.cpu.addClockEvent(tick, this.tickCycles);
  }

  edge(high, cycle) {
    if (high) {
      this.prevRise = this.riseCycle;
      this.riseCycle = cycle;
      if (this.prevRise !== null) this.periodMs = (cycle - this.prevRise) / CYCLES_PER_MS;
      return;
    }
    if (this.riseCycle === null) return;
    const us = ((cycle - this.riseCycle) / CYCLES_PER_MS) * 1000;
    const periodMs = this.prevRise === null ? null : (this.riseCycle - this.prevRise) / CYCLES_PER_MS;
    let reason = null;
    if (us < this.P.validMinUs || us > this.P.validMaxUs) reason = 'ancho';
    else if (periodMs !== null && periodMs < this.P.minPeriodMs) reason = 'periodo';
    const t = this.riseCycle / CYCLES_PER_MS;
    this.pulses++;
    if (reason) this.invalid = { t, us, periodMs, reason };
    else {
      this.target = pulseToAngle(us, this.P);
      this.lastUs = us;
      this.lastValid = cycle;
      this.invalid = null;
    }
    this.onPulse({ t, us: Math.round(us * 10) / 10, periodMs: periodMs === null ? null : Math.round(periodMs * 1000) / 1000,
      valid: !reason, reason, angle: reason ? null : Math.round(this.target * 10) / 10 });
  }

  /** ¿Recibe el servo órdenes válidas ahora? */
  get receiving() {
    return this.lastValid !== null && this.runner.cpu.cycles - this.lastValid <= this.P.signalLostMs * CYCLES_PER_MS;
  }

  step() {
    if (this.target !== null && this.receiving) this.angle = servoStep(this.angle, this.target, this.P.tickMs, this.P);
    this.onTick(this.runner.cpu.cycles / CYCLES_PER_MS, this);
  }

  /** Estado público (interfaz y pruebas). */
  state() {
    return {
      angle: this.angle, target: this.target, us: this.lastUs, periodMs: this.periodMs, receiving: this.receiving,
      moving: this.receiving && this.target !== null && Math.abs(this.target - this.angle) > 0.05,
      invalid: this.invalid, pulses: this.pulses, mode: this.runner.pinMode(this.pin),
    };
  }
}
