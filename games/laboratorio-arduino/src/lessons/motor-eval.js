// Evaluación de las lecciones del puente H L298N y motores (5.1, 5.2 y 5.3 de la ruta).
// Solo usa lo medido al ejecutar el programa compilado: las órdenes del puente H que dedujo el modelo (motor.js) del
// nivel real de los pines IN y del PWM real de EN, las velocidades del motor modelado, las ventanas PWM de los pines
// (pwm.js) y las líneas del monitor serie. No mira el texto del programa.
//
// Se distingue siempre:
//   · la ORDEN eléctrica (adelante, atrás, freno, libre): cambia en el instante en que cambian los pines;
//   · la VELOCIDAD del motor modelado: tarda en subir y en bajar (inercia). Una orden de parada no detiene el eje
//     al instante; el freno (IN1 = IN2 con EN activo) lo detiene antes que la rueda libre (EN = 0).
import { isPwmWindow } from '../pwm.js';
import { timedSerialLines } from '../challenge.js';
import { PIN_MAPS, MOTOR } from '../motor.js';

const BAUD = 9600;
const PWM_PINS = [3, 5, 6, 9, 10, 11];
const FREQ_MIN = 450;
const FREQ_MAX = 1000;
const MIN_PHASE_MS = 20;      // los estados más breves (al cambiar un pin y luego el otro) no cuentan como fase

export const DIRECCION_PINS = PIN_MAPS.direccion;
export const VELOCIDAD_PINS = PIN_MAPS.velocidad;
export const DOS_PINS = PIN_MAPS.dosMotores;

/** 5.1 · Ida y vuelta: 1 s adelante → 0,5 s parado → 1 s atrás → 0,5 s parado, en bucle (dos ciclos completos). */
export const DIRECCION = {
  durationMs: 6600,
  tol: 0.1,
  minStopMs: 100,     // parado al menos 100 ms antes de invertir
  minCycles: 2,
  pattern: [
    { kind: 'adelante', ms: 1000 },
    { kind: 'parado', ms: 500 },
    { kind: 'atras', ms: 1000 },
    { kind: 'parado', ms: 500 },
  ],
};

/** 5.2 · Rampa: 0 → 100 % en 2 s, 1 s a tope, 100 → 0 % en 2 s y 1 s parado, en bucle, siempre hacia adelante. */
export const VELOCIDAD = {
  durationMs: 6600,
  rampMs: 2000,
  topMs: 1000,
  offMs: 1000,
  maxStartMs: 400,    // la rampa empieza al arrancar el programa
  tol: 0.08,          // ±8 puntos de ENA respecto al perfil
  maxJump: 0.15,      // ningún salto mayor de 15 puntos entre ventanas de 20 ms
};
VELOCIDAD.periodMs = 2 * VELOCIDAD.rampMs + VELOCIDAD.topMs + VELOCIDAD.offMs;

/** 5.3 · Maniobras: avanzar 1 s, girar a la derecha 0,6 s, avanzar 1 s y parar (una vez), anunciando cada una. */
export const DOS = {
  durationMs: 4200,
  tol: 0.1,
  pauseMaxMs: 200,    // se admite una pausa breve (parar) entre maniobras
  lineMs: 100,        // cada anuncio a ±100 ms del inicio de su maniobra
  settleMs: 150,      // margen para que el motor modelado alcance su velocidad
  finalMinMs: 500,    // tras «parar», parado hasta el final
  plan: [
    { kind: 'avanzar', ms: 1000 },
    { kind: 'derecha', ms: 600 },
    { kind: 'avanzar', ms: 1000 },
    { kind: 'parar', ms: null },
  ],
};

export const KIND_NAMES = {
  adelante: 'adelante', atras: 'atrás', parado: 'parado',
  avanzar: 'avanzar', derecha: 'girar a la derecha', izquierda: 'girar a la izquierda', retroceder: 'retroceder', parar: 'parar',
  'solo-izq': 'solo el motor izquierdo hacia adelante', 'solo-der': 'solo el motor derecho hacia adelante',
  'solo-izq-atras': 'solo el motor izquierdo hacia atrás', 'solo-der-atras': 'solo el motor derecho hacia atrás',
};
export const ORDER_NAMES = { adelante: 'adelante', atras: 'atrás', freno: 'freno (IN1 = IN2)', libre: 'libre (EN en 0 %)' };

const fmtS = (ms) => `${(ms / 1000).toFixed(2).replace('.', ',')} s`;
const pct = (d) => `${Math.round(d * 100)} %`;
const pinsOf = (ch) => ch.en === null ? [ch.in1, ch.in2] : [ch.in1, ch.in2, ch.en];
const dirOf = (order) => (order === 'adelante' ? 1 : order === 'atras' ? -1 : 0);

/** Órdenes de un canal como intervalos [{ order, duty, start, end }]. */
export function orderIntervals(trace, id) {
  const list = (trace.motor?.orders || []).filter((o) => o.ch === id);
  return list.map((o, k) => ({ order: o.order, duty: o.duty, start: o.t, end: list[k + 1]?.t ?? trace.durationMs }));
}

/**
 * Fases a partir de intervalos con `kind`: une las iguales seguidas y absorbe las de menos de MIN_PHASE_MS
 * (un estado intermedio al cambiar un pin y después el otro). La última queda `open` si llega al final.
 */
export function mergePhases(intervals, durationMs, minMs = MIN_PHASE_MS) {
  const out = [];
  for (const iv of intervals) {
    const last = out[out.length - 1];
    if (last && last.kind === iv.kind) { last.end = iv.end; continue; }
    if (last && last.end - last.start < minMs && out.length > 1 && out[out.length - 2].kind === iv.kind) {
      out.pop();
      out[out.length - 1].end = iv.end;
      continue;
    }
    if (last && last.end - last.start < minMs) { Object.assign(last, iv, { start: last.start }); continue; }
    out.push({ ...iv });
  }
  for (const p of out) p.open = p.end >= durationMs - 1e-6;
  return out;
}

/** Velocidades del motor modelado del canal `k` entre a y b: { min, max, at(t) }. */
function speeds(trace, k, a, b) {
  const v = (trace.motor?.samples || []).filter((s) => s.t >= a && s.t < b).map((s) => s.v[k]);
  return { min: v.length ? Math.min(...v) : 0, max: v.length ? Math.max(...v) : 0 };
}

/** Tiempo desde `t` hasta que el motor `k` queda parado (v = 0), o null si no se paró antes de `end`. */
function stopTime(trace, k, t, end) {
  const s = (trace.motor?.samples || []).find((x) => x.t >= t && x.t <= end && x.v[k] === 0);
  return s ? s.t - t : null;
}

/** Pines del mapa que el programa nunca configuró como salida (o EN que nunca activó). */
function unconfigured(trace, channels) {
  const outputs = trace.motor?.outputs || [];
  const missing = [];
  channels.forEach((ch, k) => {
    const o = outputs[k] || {};
    const names = channels.length > 1 ? (ch.id === 'A' ? ['IN1', 'IN2', 'ENA'] : ['IN3', 'IN4', 'ENB']) : ['IN1', 'IN2', 'ENA'];
    if (!o.in1) missing.push({ pin: ch.in1, sig: names[0], en: false });
    if (!o.in2) missing.push({ pin: ch.in2, sig: names[1], en: false });
    if (ch.en !== null && !o.en) missing.push({ pin: ch.en, sig: names[2], en: true });
  });
  return missing;
}

function missingDetail(missing) {
  return missing.map((m) => (m.en
    ? `${m.sig} (D${m.pin}) nunca se activó: sin analogWrite(${m.pin}, …) ni pinMode(${m.pin}, OUTPUT) el canal queda deshabilitado y el motor, libre`
    : `${m.sig} (D${m.pin}) nunca se configuró como salida: falta pinMode(${m.pin}, OUTPUT) (sin él, digitalWrite solo activa la resistencia interna y el L298N no recibe la orden)`)).join('. ') + '.';
}

function otherActivity(trace, channels) {
  const mine = new Set(channels.flatMap(pinsOf));
  return [...new Set(trace.windows.filter((w) => w.pin > 1 && !mine.has(w.pin) && (w.rises || w.level)).map((w) => w.pin))];
}

function checkBaud(trace, add) {
  const bauds = [...new Set(trace.serial.map((s) => s.baud))];
  add('baud', trace.serial.length > 0 && bauds.every((b) => Math.abs(b - BAUD) <= BAUD * 0.03), 'Monitor serie a 9600 baudios',
    trace.serial.length ? `Velocidad detectada: ${bauds.map((b) => Math.round(b)).join(', ')} baudios.` : 'No se recibió ningún texto por el puerto serie.');
}

// ---------------------------------------------------------------- 5.1 · Dirección

/**
 * @param {{ windows, serial, durationMs, motor: { orders, samples, reversals, outputs } }} trace
 * @returns {{passed:boolean, checks:{id,ok,label,detail}[]}}
 */
export function evaluateDireccion(trace, S = DIRECCION) {
  const checks = [];
  const add = (id, ok, label, detail) => checks.push({ id, ok, label, detail });
  const channels = DIRECCION_PINS;
  const missing = unconfigured(trace, channels);
  const others = otherActivity(trace, channels);
  add('salidas', !missing.length, 'IN1 (D7) e IN2 (D8) configurados como salidas',
    missing.length ? missingDetail(missing) : 'D7 y D8 son salidas: el L298N recibe sus niveles.');

  const kind = (order) => (order === 'adelante' || order === 'atras' ? order : 'parado');
  const phases = mergePhases(orderIntervals(trace, 'A').map((iv) => ({ ...iv, kind: kind(iv.order) })), trace.durationMs);
  const firstMove = phases.findIndex((p) => p.kind !== 'parado');
  const moves = phases.filter((p) => p.kind !== 'parado');

  // 1. Sentido: el primer movimiento es hacia adelante (IN1 HIGH, IN2 LOW).
  let dirDetail;
  if (!moves.length) dirDetail = `El motor nunca recibió una orden de giro: IN1 e IN2 estuvieron siempre iguales o sin configurar.${others.length ? ` Hay actividad en D${others.join(', D')}, pero el L298N está en D7 (IN1) y D8 (IN2).` : ''}`;
  else if (moves[0].kind !== 'adelante') dirDetail = `El primer movimiento (a los ${fmtS(moves[0].start)}) fue hacia atrás: IN1 = LOW e IN2 = HIGH. Hacia adelante es IN1 = HIGH e IN2 = LOW.`;
  else dirDetail = `Primer movimiento hacia adelante a los ${fmtS(moves[0].start)} (IN1 = HIGH, IN2 = LOW).`;
  add('sentido', moves.length > 0 && moves[0].kind === 'adelante', 'Empieza hacia adelante (IN1 HIGH, IN2 LOW)', dirDetail);

  // 2. Secuencia y duraciones (±10 %): adelante 1 s → parado 0,5 s → atrás 1 s → parado 0,5 s, dos ciclos completos.
  let seqDetail = null;
  let cycles = 0;
  const done = firstMove < 0 ? [] : phases.slice(firstMove).filter((p) => !p.open);
  if (firstMove < 0) seqDetail = 'No hubo ninguna fase de giro que comparar.';
  else {
    const start = S.pattern.findIndex((p) => p.kind === phases[firstMove].kind);
    for (let k = 0; k < done.length; k++) {
      const want = S.pattern[(start + k) % S.pattern.length];
      const got = done[k];
      const ms = got.end - got.start;
      if (got.kind !== want.kind) {
        seqDetail = `A los ${fmtS(got.start)} el motor pasó a «${KIND_NAMES[got.kind]}», pero tocaba «${KIND_NAMES[want.kind]}». Orden esperado: adelante → parado → atrás → parado.`;
        break;
      }
      if (Math.abs(ms - want.ms) > want.ms * S.tol) {
        seqDetail = `La fase «${KIND_NAMES[got.kind]}» que empieza a los ${fmtS(got.start)} duró ${Math.round(ms)} ms; debe durar ${want.ms} ms ±${Math.round(S.tol * 100)} %.`;
        break;
      }
      if ((start + k) % S.pattern.length === S.pattern.length - 1) cycles++;
    }
    if (!seqDetail && cycles < S.minCycles) seqDetail = `Solo se completaron ${cycles} ciclo(s) en ${fmtS(trace.durationMs)}; se esperan ${S.minCycles}.`;
  }
  add('secuencia', !seqDetail && start0(phases, firstMove) === 'adelante', 'Adelante 1 s → parado 0,5 s → atrás 1 s → parado 0,5 s (±10 %), dos ciclos',
    seqDetail || (start0(phases, firstMove) !== 'adelante' ? 'La secuencia debe empezar hacia adelante.' : `${cycles} ciclos completos: ${done.slice(0, 4).map((p) => `${KIND_NAMES[p.kind]} ${Math.round(p.end - p.start)} ms`).join(', ')}.`));

  // 3. Parada antes de invertir: entre adelante y atrás, al menos 100 ms parado.
  let invDetail = null;
  const lastMove = { kind: null, end: null };
  for (const p of phases) {
    if (p.kind === 'parado') continue;
    if (lastMove.kind && lastMove.kind !== p.kind) {
      const gap = p.start - lastMove.end;
      if (gap < S.minStopMs) {
        const rev = (trace.motor?.reversals || []).find((r) => Math.abs(r.t - p.start) <= MIN_PHASE_MS + 2);
        invDetail = `A los ${fmtS(p.start)} el motor pasó de «${KIND_NAMES[lastMove.kind]}» a «${KIND_NAMES[p.kind]}» ${gap < 1 ? 'sin pasar por parado' : `tras solo ${Math.round(gap)} ms parado`}; deja al menos ${S.minStopMs} ms parado antes de invertir.${rev ? ` El motor aún giraba al ${pct(Math.abs(rev.speed))} de su velocidad: en un motor real, pico de corriente y golpe en los engranajes.` : ''}`;
        break;
      }
    }
    lastMove.kind = p.kind;
    lastMove.end = p.end;
  }
  add('inversion', moves.length > 1 && !invDetail, 'Parado ≥ 100 ms antes de cambiar de sentido',
    invDetail || (moves.length > 1 ? 'Siempre pasa por parado antes de invertir.' : 'No hubo cambio de sentido que comprobar.'));

  // 4. El motor modelado sigue las órdenes: gira en cada sentido y se detiene (con su inercia) en cada parada.
  let motorDetail = null;
  const stops = [];
  for (const p of done) {
    const v = speeds(trace, 0, p.start, p.end);
    if (p.kind === 'adelante' && v.max < 0.8) { motorDetail = `En la fase «adelante» de los ${fmtS(p.start)} el motor modelado solo llegó al ${pct(Math.max(0, v.max))} de su velocidad.`; break; }
    if (p.kind === 'atras' && v.min > -0.8) { motorDetail = `En la fase «atrás» de los ${fmtS(p.start)} el motor modelado solo llegó al ${pct(Math.max(0, -v.min))} de su velocidad hacia atrás.`; break; }
  }
  for (const p of firstMove < 0 ? [] : phases.slice(firstMove)) if (p.kind === 'parado') stops.push(stopTime(trace, 0, p.start, p.end));
  const both = ['adelante', 'atras'].filter((k) => !done.some((p) => p.kind === k));
  if (!motorDetail && both.length) motorDetail = both.length === 2 ? 'El motor modelado no completó ninguna fase de giro.' : `El motor modelado nunca completó una fase «${KIND_NAMES[both[0]]}».`;
  const okStops = stops.filter((x) => x !== null).map(Math.round);
  const range = okStops.length ? (Math.min(...okStops) === Math.max(...okStops) ? `${okStops[0]} ms` : `${Math.min(...okStops)}–${Math.max(...okStops)} ms`) : null;
  add('motor', !motorDetail, 'El motor modelado gira en los dos sentidos según cada orden',
    motorDetail || `Gira hacia adelante y hacia atrás. La orden de parada es instantánea, pero el eje ${range ? `tardó ${range} en detenerse (inercia)` : 'no llegó a detenerse durante la parada'}.`);
  return { passed: checks.every((c) => c.ok), checks };
}

const start0 = (phases, i) => (i >= 0 ? phases[i].kind : null);

// ---------------------------------------------------------------- 5.2 · Velocidad

/** Ciclo de trabajo que pide el perfil en `t` ms desde el inicio de la rampa (se repite cada periodMs). */
export function profileDuty(t, S = VELOCIDAD) {
  if (t < 0) return 0;
  const x = t % S.periodMs;
  if (x < S.rampMs) return x / S.rampMs;
  if (x < S.rampMs + S.topMs) return 1;
  if (x < 2 * S.rampMs + S.topMs) return 1 - (x - S.rampMs - S.topMs) / S.rampMs;
  return 0;
}

/** Inicio de la rampa que mejor encaja con las ventanas medidas (0–maxStartMs, paso de 2 ms). */
export function fitStart(ws, S = VELOCIDAD) {
  let best = { t0: 0, err: Infinity };
  for (let t0 = 0; t0 <= S.maxStartMs; t0 += 2) {
    let err = 0;
    for (const w of ws) err += Math.abs(w.duty - profileDuty((w.t0 + w.t1) / 2 - t0, S));
    if (err < best.err) best = { t0, err };
  }
  return best.t0;
}

export function evaluateVelocidad(trace, S = VELOCIDAD) {
  const checks = [];
  const add = (id, ok, label, detail) => checks.push({ id, ok, label, detail });
  const [ch] = VELOCIDAD_PINS;
  const ws = trace.windows.filter((w) => w.pin === ch.en).sort((a, b) => a.t0 - b.t0);
  const lit = ws.some((w) => w.level || w.duty > 0);

  // 1. ENA (D9) con PWM real de analogWrite.
  const pwm = ws.filter(isPwmWindow);
  const freqs = pwm.map((w) => w.freq).sort((a, b) => a - b);
  const typical = freqs.length ? freqs[freqs.length >> 1] : null;
  const share = freqs.length ? freqs.filter((f) => f >= FREQ_MIN && f <= FREQ_MAX).length / freqs.length : 0;
  const pwmOk = pwm.length >= 20 && typical >= FREQ_MIN && typical <= FREQ_MAX && share >= 0.9;
  const otherPwm = PWM_PINS.filter((p) => p !== ch.en && trace.windows.some((w) => w.pin === p && isPwmWindow(w)));
  let pwmDetail;
  if (pwmOk) pwmDetail = `ENA (D9) recibe PWM a ${Math.round(typical)} Hz con valores intermedios.`;
  else if (otherPwm.length) pwmDetail = `Hay PWM en D${otherPwm.join(', D')}, pero ENA está en D9: el canal sigue deshabilitado y el motor, libre.`;
  else if (!lit) pwmDetail = 'ENA (D9) estuvo siempre en 0 %: el canal está deshabilitado y el motor queda libre aunque IN1 e IN2 den una orden. Usa analogWrite(9, valor).';
  else if (typical && (typical < FREQ_MIN || typical > FREQ_MAX)) pwmDetail = `D9 cambia a unos ${Math.round(typical)} Hz: no es el PWM de analogWrite (≈ 490 Hz en D9).`;
  else pwmDetail = 'ENA (D9) solo estuvo en 0 % o en 100 %, sin valores intermedios: para regular la velocidad usa analogWrite(9, valor) con valores entre 0 y 255.';
  add('pwm', pwmOk, 'ENA (D9) con PWM de analogWrite', pwmDetail);

  // 2. Perfil: rampa de subida 2 s, 1 s a tope, rampa de bajada 2 s, 1 s parado (±8 puntos).
  const t0 = fitStart(ws, S);
  const end = Math.min(trace.durationMs, t0 + S.periodMs);
  const inProfile = ws.filter((w) => w.t0 >= 0 && w.t1 <= end);
  let worst = null;
  for (const w of inProfile) {
    const want = profileDuty((w.t0 + w.t1) / 2 - t0, S);
    const err = Math.abs(w.duty - want);
    if (!worst || err > worst.err) worst = { err, w, want };
  }
  const maxReached = inProfile.find((w) => w.duty >= 0.97);
  let profDetail;
  if (!lit) profDetail = 'ENA no cambió: no hay perfil que comparar.';
  else if (worst.err <= S.tol) profDetail = `La rampa empieza a los ${fmtS(t0)}; la mayor diferencia con el perfil fue de ${Math.round(worst.err * 100)} puntos.`;
  else {
    let why = '';
    const upMs = maxReached ? maxReached.t0 - t0 : null;
    if (upMs !== null && upMs < S.rampMs * 0.8) why = ` Llegó al 100 % en ${(upMs / 1000).toFixed(1).replace('.', ',')} s: la subida debe durar 2 s (unos 8 ms por paso de 0 a 255).`;
    else if (upMs !== null && upMs > S.rampMs * 1.2) why = ` Tardó ${(upMs / 1000).toFixed(1).replace('.', ',')} s en llegar al 100 %: la subida debe durar 2 s.`;
    profDetail = `A los ${fmtS(worst.w.t0)} ENA midió ${pct(worst.w.duty)}; el perfil pide ${pct(worst.want)} (±${Math.round(S.tol * 100)} puntos).${why}`;
  }
  add('perfil', lit && worst.err <= S.tol, 'Perfil: subir 2 s, 1 s a tope, bajar 2 s, 1 s parado (±8 puntos)', profDetail);

  // 3. Sin saltos: ninguna ventana cambia más de 15 puntos respecto a la anterior.
  let jump = null;
  for (let k = 1; k < ws.length; k++) {
    const d = Math.abs(ws[k].duty - ws[k - 1].duty);
    if (!jump || d > jump.d) jump = { d, t: ws[k].t0, from: ws[k - 1].duty, to: ws[k].duty };
  }
  const smooth = jump && jump.d <= S.maxJump;
  add('suave', lit && smooth, 'Cambios graduales (≤ 15 puntos cada 20 ms)',
    !lit || !jump ? 'ENA no cambió.' : smooth ? `El mayor cambio entre ventanas fue de ${Math.round(jump.d * 100)} puntos.`
      : `A los ${fmtS(jump.t)} ENA saltó de ${pct(jump.from)} a ${pct(jump.to)} en 20 ms: es una rampa brusca. Cambia el valor poco a poco (de 1 en 1 o en pasos pequeños).`);

  // 4. Dirección constante hacia adelante mientras ENA no está en 0.
  const missing = unconfigured(trace, VELOCIDAD_PINS).filter((m) => !m.en);
  const orders = orderIntervals(trace, 'A').filter((iv) => iv.duty > 0.02 && iv.end - iv.start >= MIN_PHASE_MS);
  const bad = orders.find((iv) => iv.order !== 'adelante');
  let dirDetail;
  if (missing.length) dirDetail = missingDetail(missing);
  else if (!orders.length) dirDetail = 'ENA nunca estuvo activo: no hay dirección que comprobar.';
  else if (bad) dirDetail = bad.order === 'atras'
    ? `A los ${fmtS(bad.start)}, con ENA al ${pct(bad.duty)}, IN1 = LOW e IN2 = HIGH: el motor iba hacia atrás. El reto es hacia adelante (IN1 HIGH, IN2 LOW) toda la rampa.`
    : `A los ${fmtS(bad.start)}, con ENA al ${pct(bad.duty)}, IN1 e IN2 estaban iguales: el puente frena en lugar de mover el motor.`;
  else dirDetail = 'IN1 = HIGH e IN2 = LOW durante toda la rampa.';
  add('direccion', !missing.length && orders.length > 0 && !bad, 'Dirección constante hacia adelante (IN1 HIGH, IN2 LOW)', dirDetail);

  // 5. Motor modelado: zona muerta e inercia (informa a qué % de ENA empezó a girar).
  const samples = trace.motor?.samples || [];
  const vmax = samples.length ? Math.max(...samples.map((s) => s.v[0])) : 0;
  const vmin = samples.length ? Math.min(...samples.map((s) => s.v[0])) : 0;
  const startS = samples.find((s) => s.v[0] > 0.005);
  const startW = startS ? ws.find((w) => w.t0 <= startS.t && w.t1 > startS.t) : null;
  const motorOk = vmax >= 0.95 && vmin > -0.02;
  add('motor', motorOk, 'El motor modelado arranca, llega a su velocidad máxima y no gira hacia atrás',
    motorOk ? `El motor modelado empezó a girar con ENA en torno al ${pct(startW ? startW.duty : MOTOR.deadZone)} (zona muerta del modelo: ${pct(MOTOR.deadZone)}; por debajo, el par no vence el rozamiento) y llegó a ${Math.round(vmax * MOTOR.rpmMax)} rpm.`
      : vmin <= -0.02 ? 'El motor modelado giró hacia atrás.' : `El motor modelado solo llegó al ${pct(Math.max(0, vmax))} de su velocidad: ENA debe llegar al 100 % con IN1 HIGH e IN2 LOW.`);
  return { passed: checks.every((c) => c.ok), checks };
}

// ---------------------------------------------------------------- 5.3 · Dos motores

/** Maniobra según las órdenes de los dos motores (izquierdo A y derecho B). */
export function maneuverOf(orderA, orderB) {
  const a = dirOf(orderA);
  const b = dirOf(orderB);
  if (a === 1 && b === 1) return 'avanzar';
  if (a === 1 && b === -1) return 'derecha';
  if (a === -1 && b === 1) return 'izquierda';
  if (a === -1 && b === -1) return 'retroceder';
  if (a === 0 && b === 0) return 'parar';
  if (b === 0) return a === 1 ? 'solo-izq' : 'solo-izq-atras';
  return b === 1 ? 'solo-der' : 'solo-der-atras';
}

/** Línea de tiempo de maniobras: intervalos con la combinación de órdenes de A y B. */
export function maneuvers(trace) {
  const A = orderIntervals(trace, 'A');
  const B = orderIntervals(trace, 'B');
  const times = [...new Set([...A, ...B].map((iv) => iv.start))].sort((x, y) => x - y);
  const at = (list, t) => list.filter((iv) => iv.start <= t).pop();
  const raw = times.map((t, k) => {
    const a = at(A, t);
    const b = at(B, t);
    return { kind: maneuverOf(a?.order, b?.order), start: t, end: times[k + 1] ?? trace.durationMs, a, b };
  });
  return mergePhases(raw, trace.durationMs);
}

const WORDS = { avanzar: /avanz/, derecha: /derech/, parar: /\bpar(a|ar|ado|ada|o)\b|deten/ };
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function evaluateDosMotores(trace, S = DOS) {
  const checks = [];
  const add = (id, ok, label, detail) => checks.push({ id, ok, label, detail });
  const channels = DOS_PINS;
  const missing = unconfigured(trace, channels);
  add('salidas', !missing.length, 'IN1–IN4 (D7, D8, D4, D2) como salidas y ENA/ENB (D5, D6) activados',
    missing.length ? missingDetail(missing) : 'Los seis pines del L298N reciben señal del Nano.');

  // 1. Maniobras: avanzar → girar a la derecha → avanzar → parar (se admiten pausas breves entre ellas).
  const all = maneuvers(trace);
  const first = all.findIndex((p) => p.kind !== 'parar');
  const steps = [];
  if (first >= 0) {
    for (const p of all.slice(first)) {
      const isPause = p.kind === 'parar' && !p.open && p.end - p.start <= S.pauseMaxMs;
      if (isPause) continue;
      const last = steps[steps.length - 1];
      if (last && last.kind === p.kind) { last.end = p.end; last.open = p.open; continue; }
      steps.push({ ...p });
    }
  }
  let manDetail = null;
  const plan = S.plan;
  for (let k = 0; k < plan.length && !manDetail; k++) {
    const got = steps[k];
    const want = plan[k];
    if (!got) { manDetail = `Tras «${KIND_NAMES[plan[k - 1]?.kind] || 'el inicio'}» no hubo más maniobras: falta «${KIND_NAMES[want.kind]}».`; break; }
    if (got.kind === want.kind) continue;
    let why = '';
    if (want.kind === 'derecha' && got.kind === 'izquierda') why = ' Giró a la izquierda: para girar a la derecha, el motor izquierdo va hacia adelante y el derecho hacia atrás.';
    else if (want.kind === 'derecha' && got.kind.startsWith('solo')) why = ' Solo giró un motor (giro sobre una rueda): el reto pide las dos ruedas en sentido opuesto.';
    else if (want.kind === 'avanzar' && (got.kind === 'derecha' || got.kind === 'izquierda')) why = ` Un motor gira hacia atrás al avanzar: revisa los valores de ${got.kind === 'derecha' ? 'IN3/IN4 (motor derecho)' : 'IN1/IN2 (motor izquierdo)'}.`;
    else if (got.kind.startsWith('solo')) {
      const off = got.kind.startsWith('solo-izq') ? got.b : got.a;
      why = off?.order === 'libre' ? ` El ${got.kind.startsWith('solo-izq') ? 'motor derecho tiene ENB' : 'motor izquierdo tiene ENA'} en 0 %: ese canal está deshabilitado.` : ' Uno de los motores no recibió orden de giro.';
    }
    manDetail = `${k === 0 ? 'La primera maniobra' : `La maniobra ${k + 1}`} (a los ${fmtS(got.start)}) fue «${KIND_NAMES[got.kind]}»; tocaba «${KIND_NAMES[want.kind]}».${why}`;
  }
  if (first < 0) manDetail = 'Los motores nunca recibieron una orden de giro.';
  else if (!manDetail && steps.length > plan.length) manDetail = `Después de «parar» hubo otra maniobra («${KIND_NAMES[steps[plan.length].kind]}» a los ${fmtS(steps[plan.length].start)}): el recorrido se hace una sola vez.`;
  const manOk = !manDetail;
  add('maniobras', manOk, 'Avanzar → girar a la derecha (ruedas opuestas) → avanzar → parar', manDetail || `Secuencia correcta: ${steps.map((s) => KIND_NAMES[s.kind]).join(' → ')}.`);

  // 2. Tiempos (±10 %) y parada final hasta el final de la comprobación.
  let timeDetail = null;
  if (manOk) {
    for (let k = 0; k < plan.length; k++) {
      const st = steps[k];
      const ms = st.end - st.start;
      if (plan[k].ms === null) {
        if (!st.open || ms < S.finalMinMs) timeDetail = `Tras «parar» a los ${fmtS(st.start)} los motores deben quedarse parados hasta el final.`;
      } else if (Math.abs(ms - plan[k].ms) > plan[k].ms * S.tol) {
        timeDetail = `«${KIND_NAMES[st.kind]}» a los ${fmtS(st.start)} duró ${Math.round(ms)} ms; debe durar ${plan[k].ms} ms ±${Math.round(S.tol * 100)} %.`;
      }
      if (timeDetail) break;
    }
  }
  add('tiempos', manOk && !timeDetail, 'Avanzar 1 s, girar 0,6 s, avanzar 1 s (±10 %) y quedarse parado',
    !manOk ? 'Primero hace falta la secuencia de maniobras correcta.' : timeDetail || steps.slice(0, 3).map((s) => `${KIND_NAMES[s.kind]} ${Math.round(s.end - s.start)} ms`).join(', ') + '.');

  // 3. Los dos motores modelados giran como pide cada maniobra (EN por encima de la zona muerta).
  let motDetail = null;
  const wantDirs = { avanzar: [1, 1], derecha: [1, -1] };
  for (const st of manOk ? steps.filter((s) => wantDirs[s.kind]) : []) {
    for (const [k, ch] of channels.entries()) {
      const v = speeds(trace, k, st.start + S.settleMs, st.end);
      const dir = wantDirs[st.kind][k];
      const reached = dir > 0 ? v.max : -v.min;
      if (reached < 0.3) {
        const iv = orderIntervals(trace, ch.id).filter((x) => x.start <= st.start + S.settleMs).pop();
        const duty = iv ? iv.duty : 0;
        motDetail = `En «${KIND_NAMES[st.kind]}» (a los ${fmtS(st.start)}) el ${ch.name.toLowerCase()} solo llegó al ${pct(Math.max(0, reached))} de su velocidad.${duty > 0 && duty <= MOTOR.deadZone ? ` ${ch.id === 'A' ? 'ENA' : 'ENB'} estaba al ${pct(duty)}: por debajo de la zona muerta (${pct(MOTOR.deadZone)}) el motor no vence el rozamiento.` : ''}`;
        break;
      }
    }
    if (motDetail) break;
  }
  const finalStop = manOk ? steps[plan.length - 1] : null;
  const stopMs = finalStop ? Math.max(...channels.map((_, k) => stopTime(trace, k, finalStop.start, trace.durationMs) ?? Infinity)) : null;
  add('motores', manOk && !motDetail, 'Los dos motores modelados giran como pide cada maniobra',
    !manOk ? 'Primero hace falta la secuencia de maniobras correcta.' : motDetail
      || `Ambos motores siguen las órdenes. Tras la orden «parar», los ejes tardaron ${Number.isFinite(stopMs) ? `${Math.round(stopMs)} ms` : 'más que la comprobación'} en detenerse por inercia.`);

  // 4. Un anuncio por maniobra en el monitor serie, a ±100 ms de su inicio.
  const lines = timedSerialLines(trace.serial).filter((l) => l.t < S.durationMs - 30);
  let lineDetail = null;
  if (manOk) {
    const used = new Set();
    for (const st of steps.slice(0, plan.length)) {
      const re = WORDS[st.kind];
      const match = lines.find((l) => !used.has(l) && re.test(norm(l.text)) && Math.abs(l.t - st.start) <= S.lineMs);
      if (match) { used.add(match); continue; }
      const near = lines.find((l) => !used.has(l) && re.test(norm(l.text)));
      lineDetail = near
        ? `El anuncio «${near.text.slice(0, 40)}» llegó a los ${fmtS(near.t)}, pero «${KIND_NAMES[st.kind]}» empezó a los ${fmtS(st.start)}: escribe el mensaje justo al empezar la maniobra (±${S.lineMs} ms).`
        : `No hubo ninguna línea que anunciara «${KIND_NAMES[st.kind]}» (a los ${fmtS(st.start)}). Usa palabras como «Avanzar», «Derecha» y «Parar».`;
      break;
    }
  }
  add('mensajes', manOk && !lineDetail && lines.length > 0, 'Cada maniobra anunciada por el monitor serie (±100 ms)',
    !manOk ? 'Primero hace falta la secuencia de maniobras correcta.' : lineDetail || (lines.length ? `${lines.length} líneas: ${lines.slice(0, 4).map((l) => `«${l.text.slice(0, 20)}»`).join(', ')}.` : 'No llegó ningún texto.'));
  checkBaud(trace, add);
  return { passed: checks.every((c) => c.ok), checks };
}
