// Modelo eléctrico y mecánico de un puente H L298N con motores DC de corriente continua, conectado a un Nano.
// Reacciona solo a lo que hace el microcontrolador emulado: el nivel real de los pines IN (salidas del programa
// compilado), el modo de esos pines (DDR/PORT) y los flancos reales del pin EN (PWM de analogWrite). Nunca lee el
// texto del programa ni reproduce una animación preparada: si el programa no mueve un pin, el motor no cambia.
//
// Configuración por canal (reutilizable en otras lecciones y en el futuro robot): { id, name, in1, in2, en }.
// `en` = número de pin, o null si el puente ENA/ENB lleva el puente (jumper) puesto: habilitado siempre al 100 %.
//
// 1. Orden eléctrica del puente H (tabla del L298N), evaluada cada milisegundo simulado:
//      EN = 0 % (LOW)                    → 'libre'    salidas desconectadas: el motor gira suelto hasta pararse
//      EN > 0, IN1 = HIGH, IN2 = LOW     → 'adelante'
//      EN > 0, IN1 = LOW,  IN2 = HIGH    → 'atras'
//      EN > 0, IN1 = IN2                 → 'freno'    ambos bornes al mismo nivel: parada rápida
//    Un pin IN que el programa no configuró como salida (sin pinMode OUTPUT) no da una orden firme: el modelo lo
//    trata como LOW y lo informa como «sin configurar» (digitalWrite HIGH sobre una entrada solo activa la
//    resistencia interna de ~35 kΩ). Simplificación documentada: en un módulo real esa entrada quedaría indefinida.
// 2. Habilitación con PWM: el ciclo de trabajo de EN se mide sobre el último periodo completo (de subida a subida)
//    de los flancos reales. Sin flancos durante STEADY_MS, EN vale su nivel (0 % o 100 %). Mientras un PWM recién
//    empezado no completa su primer periodo, se mantiene el valor anterior.
// 3. Motor: velocidad normalizada v ∈ [−1, 1] (1 = RPM_MAX) con respuesta de primer orden (inercia):
//      adelante/atras con EN = d:  objetivo ±(d − zona muerta) / (1 − zona muerta) si d > zona muerta; si no, 0
//                                  (el par no vence el rozamiento: el motor no arranca o se va parando).
//                                  Constante de tiempo tauDriveMs al acelerar y tauCoastMs si no vence la zona muerta.
//      freno con EN = d:           objetivo 0, ritmo d / tauBrakeMs + (1 − d) / tauCoastMs.
//      libre:                      objetivo 0, constante tauCoastMs (desaceleración mecánica por rozamiento).
//    Por debajo de stopSpeed sin orden de giro, el eje se considera parado (v = 0).
//    La orden de parada es instantánea; la parada mecánica no: el modelo distingue ambas.
// 4. Inversión con el motor girando: si la orden cambia de adelante a atrás (o al revés) con |v| > reverseSpeed,
//    se registra un evento (en un motor real, pico de corriente y esfuerzo mecánico).
// Simplificaciones: el PWM se promedia por periodo (no se modela la corriente dentro de cada pulso), mismo rozamiento
// para arrancar y para seguir girando, sin carga variable, sin caída de tensión del L298N (~2 V en el módulo real)
// ni límite de corriente. La batería del motor se supone de 7–9 V con GND común al Nano.
import { CLOCK_HZ } from './nano-runner.js';

export const MOTOR = {
  deadZone: 0.30,       // fracción de EN por debajo de la cual el motor no gira (≈ analogWrite 77)
  tauDriveMs: 120,      // constante de tiempo al acelerar o invertir con orden de giro
  tauBrakeMs: 40,       // con freno (IN1 = IN2 y EN activo)
  tauCoastMs: 300,      // rueda libre (EN = 0) o par insuficiente
  stopSpeed: 0.02,      // por debajo: eje parado
  reverseSpeed: 0.2,    // invertir la orden con |v| mayor se registra como inversión brusca
  rpmMax: 200,          // velocidad sin carga a 100 % (para mostrar rpm)
  tickMs: 1,            // paso del modelo en tiempo simulado
};
export const STEADY_MS = 5;      // sin flancos en EN durante 5 ms → salida continua (0 % o 100 %)
export const PWM_PINS = [3, 5, 6, 9, 10, 11];
const CYCLES_PER_MS = CLOCK_HZ / 1000;

/** Mapas de pines del curso (ver docs/INTEGRACION_PINES_ARDUINO.md). Los de las lecciones se conservan tal cual. */
export const PIN_MAPS = {
  direccion: [{ id: 'A', name: 'Motor', in1: 7, in2: 8, en: null }],
  velocidad: [{ id: 'A', name: 'Motor', in1: 7, in2: 8, en: 9 }],
  dosMotores: [
    { id: 'A', name: 'Motor izquierdo', in1: 7, in2: 8, en: 5 },
    { id: 'B', name: 'Motor derecho', in1: 4, in2: 2, en: 6 },
  ],
  // Robot evasor (fase futura): sin colisiones con el HC-SR04 (TRIG D7, ECHO D8) ni con el servo reservado (D9).
  robot: [
    { id: 'A', name: 'Motor izquierdo', in1: 2, in2: 4, en: 5 },
    { id: 'B', name: 'Motor derecho', in1: 10, in2: 11, en: 6 },
  ],
};

/**
 * Comprueba un mapa de canales junto con otros pines ocupados ({ pin: 'uso' }).
 * Devuelve una lista de problemas (vacía si el mapa es válido): pin repetido, EN sin PWM, D0/D1 (serie), pin inexistente.
 */
export function pinMapProblems(channels, reserved = {}) {
  const used = new Map(Object.entries(reserved).map(([p, use]) => [Number(p), use]));
  const problems = [];
  for (const ch of channels) {
    const signals = [['in1', ch.in1], ['in2', ch.in2], ...(ch.en === null ? [] : [['en', ch.en]])];
    for (const [sig, pin] of signals) {
      const use = `${ch.id}.${sig.toUpperCase()}`;
      if (!Number.isInteger(pin) || pin < 0 || pin > 19) problems.push(`${use}: D${pin} no existe en el Nano`);
      else if (pin <= 1) problems.push(`${use}: D${pin} está reservado al monitor serie`);
      if (used.has(pin)) problems.push(`D${pin} lo usan a la vez ${used.get(pin)} y ${use}`);
      used.set(pin, use);
      if (sig === 'en' && !PWM_PINS.includes(pin)) problems.push(`${use}: D${pin} no tiene PWM`);
    }
  }
  return problems;
}

/** Ciclo de trabajo de una entrada a partir de sus flancos reales (en ciclos de reloj). */
export class PwmInput {
  constructor(level = false) {
    this.level = level;
    this.lastRise = null;
    this.lastFall = null;
    this.measured = null;   // { duty, at } del último periodo completo
    this.held = level ? 1 : 0;   // último valor devuelto (se mantiene mientras se completa un periodo)
  }

  edge(high, cycle) {
    if (high === this.level) return;
    this.level = high;
    if (high) {
      // Solo un periodo real de PWM: la subida anterior debe ser reciente (si no, es un pulso suelto o un reinicio).
      if (this.lastRise !== null && this.lastFall !== null && this.lastFall > this.lastRise
        && cycle - this.lastRise <= STEADY_MS * CYCLES_PER_MS) {
        this.measured = { duty: (this.lastFall - this.lastRise) / (cycle - this.lastRise), at: cycle };
      }
      this.lastRise = cycle;
    } else this.lastFall = cycle;
  }

  /** Fracción del tiempo en HIGH vista en el ciclo `now`. */
  duty(now) {
    const steady = STEADY_MS * CYCLES_PER_MS;
    const lastEdge = Math.max(this.lastRise ?? -Infinity, this.lastFall ?? -Infinity);
    if (now - lastEdge > steady) this.held = this.level ? 1 : 0;           // salida continua
    else if (this.measured && now - this.measured.at <= steady) this.held = this.measured.duty;
    return this.held;                                                       // PWM recién empezado: aún sin periodo completo
  }
}

/** Orden del puente H para un canal: niveles de IN1/IN2 y fracción de EN. */
export function bridgeOrder(in1, in2, en) {
  if (en <= 0) return 'libre';
  if (in1 && !in2) return 'adelante';
  if (!in1 && in2) return 'atras';
  return 'freno';
}

/** Un paso de la mecánica del motor: nueva velocidad tras `dt` ms con la orden y el EN dados. */
export function motorStep(v, order, en, dt, P = MOTOR) {
  let target = 0;
  let rate;   // 1/ms
  if (order === 'adelante' || order === 'atras') {
    if (en > P.deadZone) {
      target = (order === 'adelante' ? 1 : -1) * Math.min(1, (en - P.deadZone) / (1 - P.deadZone));
      rate = 1 / P.tauDriveMs;
    } else rate = 1 / P.tauCoastMs;
  } else if (order === 'freno') rate = en / P.tauBrakeMs + (1 - en) / P.tauCoastMs;
  else rate = 1 / P.tauCoastMs;
  let next = v + (target - v) * (1 - Math.exp(-dt * rate));
  if (target === 0 && Math.abs(next) < P.stopSpeed) next = 0;
  return next;
}

const sign = (order) => (order === 'adelante' ? 1 : order === 'atras' ? -1 : 0);

export class MotorModel {
  /**
   * @param {import('./nano-runner.js').NanoRunner} runner
   * @param {{ channels: {id,name,in1,in2,en}[], params?: object, onOrder?: Function, onReverse?: Function, onTick?: Function }} options
   *   onOrder({ t, ch, order, duty }) cuando cambia la orden de un canal (o su EN en ≥ 2 puntos).
   *   onReverse({ t, ch, from, to, speed }) al invertir la orden con el motor girando.
   *   onTick(t, model) tras cada paso (cada tickMs simulados).
   */
  constructor(runner, { channels, params = {}, onOrder = () => {}, onReverse = () => {}, onTick = () => {} }) {
    const problems = pinMapProblems(channels);
    if (problems.length) throw new Error('Mapa de pines no válido: ' + problems.join('; '));
    this.runner = runner;
    this.P = { ...MOTOR, ...params };
    Object.assign(this, { onOrder, onReverse, onTick });
    this.channels = channels.map((c) => ({
      ...c,
      enInput: c.en === null ? null : new PwmInput(runner.pins.get(c.en)),
      order: 'libre', duty: 0, speed: 0, angle: 0, lastDir: 0, loggedDuty: -1, levels: { in1: false, in2: false },
      modes: { in1: 'input', in2: 'input', en: c.en === null ? 'output' : 'input' },
      everOutput: { in1: false, in2: false, en: c.en === null },
    }));
    this.byEn = new Map(this.channels.filter((c) => c.en !== null).map((c) => [c.en, c]));
    runner.pinListeners.push((pin, high) => {
      const ch = this.byEn.get(pin);
      if (ch) ch.enInput.edge(high, runner.cpu.cycles);
    });
    this.tickCycles = Math.round(this.P.tickMs * CYCLES_PER_MS);
    const tick = () => { this.step(); runner.cpu.addClockEvent(tick, this.tickCycles); };
    runner.cpu.addClockEvent(tick, this.tickCycles);
  }

  /** Nivel que el L298N recibe en un pin: solo cuenta si el pin es una salida del Nano. */
  drive(ch, sig) {
    const pin = ch[sig];
    const mode = this.runner.pinMode(pin);
    ch.modes[sig] = mode;
    if (mode !== 'output') return false;
    ch.everOutput[sig] = true;
    return this.runner.pins.get(pin);
  }

  step() {
    const now = this.runner.cpu.cycles;
    const t = now / CYCLES_PER_MS;
    for (const ch of this.channels) {
      const in1 = this.drive(ch, 'in1');
      const in2 = this.drive(ch, 'in2');
      let duty = 1;
      if (ch.enInput) {
        this.drive(ch, 'en');
        duty = ch.modes.en === 'output' ? ch.enInput.duty(now) : 0;   // EN sin configurar: canal deshabilitado
      }
      const order = bridgeOrder(in1, in2, duty);
      const dir = sign(order);
      if (dir && ch.lastDir && dir !== ch.lastDir && Math.abs(ch.speed) > this.P.reverseSpeed && duty > this.P.deadZone) {
        this.onReverse({ t, ch: ch.id, from: ch.lastDir > 0 ? 'adelante' : 'atras', to: order, speed: ch.speed });
      }
      if (dir) ch.lastDir = dir;
      if (order !== ch.order || Math.abs(duty - ch.loggedDuty) >= 0.02) {
        ch.loggedDuty = duty;
        this.onOrder({ t, ch: ch.id, order, duty: Math.round(duty * 1000) / 1000 });
      }
      ch.order = order;
      ch.duty = duty;
      ch.levels = { in1, in2 };
      ch.speed = motorStep(ch.speed, order, duty, this.P.tickMs, this.P);
      ch.angle = (ch.angle + ch.speed * this.P.rpmMax * 6 * this.P.tickMs / 1000) % 360;   // rpm · 360° / 60 s
    }
    this.onTick(t, this);
  }

  /** Estado público de cada canal (para la interfaz y las pruebas). */
  state() {
    return this.channels.map((c) => ({
      id: c.id, order: c.order, duty: c.duty, speed: c.speed, rpm: c.speed * this.P.rpmMax, angle: c.angle,
      modes: { ...c.modes }, levels: { ...c.levels },
    }));
  }
}
