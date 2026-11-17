// Evaluación de las lecciones del servo (3.1 y 3.2 de la ruta).
// Solo usa lo medido al ejecutar el programa compilado: cada pulso real del pin de señal que midió el modelo del servo
// (servo.js: ancho, periodo y ángulo), el ángulo del eje modelado, los flancos de los pines y las líneas del monitor
// serie. No mira el texto del programa: un programa que no genera pulsos no mueve el servo, aunque «diga» write(90).
//
// Se distingue siempre:
//   · la ORDEN: el ángulo que pide cada pulso (544 µs → 0°, 2400 µs → 180°), que cambia en cuanto cambia el ancho;
//   · la POSICIÓN del eje modelado, que tarda en llegar (600 °/s en el modelo del SG90).
import { timedSerialLines } from '../challenge.js';
import { SERVO } from '../servo.js';

const BAUD = 9600;
export const SERVO_PIN = 9;
export const LED_PIN = 13;
export const DEFAULT_US = 1500;          // posición de attach() sin write(): ≈ 93°

/** 3.1 · Posiciones: 0° → 90° → 180° → 90°, 1 s en cada una, informando el ángulo por serie. */
export const POSICIONES = {
  durationMs: 5600,
  angles: [0, 90, 180, 90],
  holdMs: 1000,
  holdTol: 0.1,        // cada posición mantenida 0,9–1,1 s
  tolDeg: 5,           // ancho convertido a ángulo ±5°
  freqMin: 45,
  freqMax: 55,
  maxStartMs: 500,     // la secuencia empieza al arrancar
  minPhaseMs: 300,     // una orden más breve es un paso intermedio, no una posición
  lineMs: 150,         // línea serie de cada posición a ±150 ms de su inicio
};

/** 3.2 · Barrido sin bloquear: 0↔180° a 1° cada 15 ms mientras D13 parpadea 500/500 ms. */
export const BARRIDO = {
  durationMs: 7000,
  freqMin: 45,
  freqMax: 55,
  speedMin: 55,        // °/s (1° cada 15 ms ≈ 67 °/s)
  speedMax: 80,
  maxStepDeg: 3,       // entre dos pulsos (20 ms) la orden no cambia más de 3°
  extremeTol: 5,       // los extremos del barrido: ≤ 5° y ≥ 175°
  minReversals: 2,
  ledPeriodMs: 1000,
  ledTol: 0.05,        // periodo de D13 ±5 %
  halfTol: 0.1,        // cada mitad (encendido / apagado) 500 ms ±10 %
  minLedPeriods: 5,
  trackDeg: 5,         // el eje modelado sigue la orden a ±5°
};

const fmtS = (ms) => `${(ms / 1000).toFixed(2).replace('.', ',')} s`;
const deg = (a) => `${Math.round(a)}°`;
const median = (v) => {
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null;
};

/** Intervalos entre subidas de cada pin (de los flancos guardados en la traza): { pin: [ms, …] }. */
function riseIntervals(trace) {
  const last = new Map();
  const out = new Map();
  for (const e of trace.pins || []) {
    if (!e.high) continue;
    if (last.has(e.pin)) (out.get(e.pin) || out.set(e.pin, []).get(e.pin)).push(e.t - last.get(e.pin));
    last.set(e.pin, e.t);
  }
  return out;
}

/** Pines (distintos del servo) con pulsos cada ~20 ms: alguien conectó el servo a otro pin. */
function servoLikeOtherPins(trace, pin) {
  return [...riseIntervals(trace)].filter(([p, iv]) => p !== pin && p > 1 && iv.length >= 10 && (() => {
    const m = median(iv);
    return m >= 15 && m <= 25;
  })()).map(([p]) => p);
}

/**
 * Resumen de la señal del servo: pulsos válidos, frecuencia típica (mediana de los periodos), fracción de periodos
 * dentro de [freqMin, freqMax] y motivo principal si no es una señal de servo.
 */
export function signalSummary(trace, S) {
  const pulses = trace.servo?.pulses || [];
  const valid = pulses.filter((p) => p.valid);
  const periods = valid.map((p) => p.periodMs).filter((x) => x !== null && x < 100);
  const freqs = periods.map((p) => 1000 / p);
  const typical = freqs.length ? median(freqs) : null;
  const share = freqs.length ? freqs.filter((f) => f >= S.freqMin && f <= S.freqMax).length / freqs.length : 0;
  const invalid = pulses.filter((p) => !p.valid);
  const ok = valid.length >= 50 && typical >= S.freqMin && typical <= S.freqMax && share >= 0.95;
  return { pulses, valid, typical, share, invalid, ok, widths: valid.map((p) => p.us) };
}

function signalCheck(trace, S, add) {
  const sig = signalSummary(trace, S);
  let detail;
  if (sig.ok) {
    const lo = Math.round(Math.min(...sig.widths));
    const hi = Math.round(Math.max(...sig.widths));
    detail = `${sig.valid.length} pulsos en D${SERVO_PIN} a ${sig.typical.toFixed(1).replace('.', ',')} Hz, de ${lo} a ${hi} µs.`;
  } else {
    const others = servoLikeOtherPins(trace, SERVO_PIN);
    const pwm = (trace.windows || []).some((w) => w.pin === SERVO_PIN && w.rises >= 2 && w.freq > 200);
    const byWidth = sig.invalid.filter((p) => p.reason === 'ancho').length;
    if (others.length && !sig.valid.length) detail = `Hay pulsos cada 20 ms en D${others.join(', D')}, pero el servo está en D${SERVO_PIN}: usa attach(${SERVO_PIN}).`;
    else if (pwm) detail = `D${SERVO_PIN} recibe el PWM de analogWrite (≈ 490 Hz): un servo necesita un pulso de 0,5–2,4 ms cada 20 ms. Usa la librería Servo (attach y write), no analogWrite.`;
    else if (!sig.pulses.length) detail = `D${SERVO_PIN} no generó ningún pulso: el servo no recibe órdenes. ¿Falta servo.attach(${SERVO_PIN})?`;
    else if (byWidth > sig.pulses.length / 2) detail = `Los pulsos de D${SERVO_PIN} no miden entre 0,4 y 2,6 ms (por ejemplo ${Math.round(sig.invalid[0].us)} µs): no son órdenes de servo.`;
    else if (sig.typical !== null) detail = `Los pulsos llegan a ${sig.typical.toFixed(1).replace('.', ',')} Hz; un servo espera unos 50 Hz (45–55 Hz).`;
    else detail = `D${SERVO_PIN} solo generó ${sig.valid.length} pulsos válidos: la señal no se mantiene.`;
  }
  add('senal', sig.ok, `Pulsos de servo en D${SERVO_PIN} a 45–55 Hz`, detail);
  return sig;
}

/**
 * Órdenes como fases: pulsos válidos seguidos cuyo ángulo está a ±tol de la fase. Una pausa sin pulsos válidos de más
 * de signalLostMs crea una fase «sin señal» (angle = null). La última queda `open` si llega al final.
 */
export function commandPhases(trace, tol = 2) {
  const pulses = (trace.servo?.pulses || []).filter((p) => p.valid);
  const lost = (trace.servo?.params || SERVO).signalLostMs;
  const out = [];
  let prev = null;
  for (const p of pulses) {
    let last = out[out.length - 1];
    if (prev && p.t - prev.t > lost) {
      last.end = prev.t + 20;
      out.push({ angle: null, start: last.end, end: p.t, n: 0 });
      last = null;
    }
    if (last && last.angle !== null && Math.abs(p.angle - last.first) <= tol) {
      last.sum += p.angle; last.n++; last.angle = last.sum / last.n; last.end = p.t;
    } else {
      if (last) last.end = p.t;
      out.push({ angle: p.angle, first: p.angle, sum: p.angle, n: 1, start: p.t, end: p.t });
    }
    prev = p;
  }
  const end = trace.durationMs;
  if (out.length) {
    const last = out[out.length - 1];
    if (prev && end - prev.t > lost) { last.end = prev.t + 20; out.push({ angle: null, start: last.end, end, n: 0, open: true }); }
    else { last.end = end; last.open = true; }
  }
  return out.map(({ angle, start, end: e, n, open = false }) => ({ angle, start, end: e, n, open }));
}

/** Tiempo desde `t` hasta que el eje modelado queda a ±1° de `angle` (null si no llega antes de `end`). */
function reachTime(trace, angle, t, end) {
  const s = (trace.servo?.samples || []).find((x) => x.t >= t && x.t <= end && Math.abs(x.a - angle) <= 1);
  return s ? s.t - t : null;
}

function checkBaud(trace, add) {
  const bauds = [...new Set(trace.serial.map((s) => s.baud))];
  add('baud', trace.serial.length > 0 && bauds.every((b) => Math.abs(b - BAUD) <= BAUD * 0.03), 'Monitor serie a 9600 baudios',
    trace.serial.length ? `Velocidad detectada: ${bauds.map((b) => Math.round(b)).join(', ')} baudios.` : 'No se recibió ningún texto por el puerto serie.');
}

// ---------------------------------------------------------------- 3.1 · Posiciones

/**
 * @param {{ windows, pins, serial, durationMs, servo: { pulses, samples, params } }} trace
 * @returns {{passed:boolean, checks:{id,ok,label,detail}[]}}
 */
export function evaluatePosiciones(trace, S = POSICIONES) {
  const checks = [];
  const add = (id, ok, label, detail) => checks.push({ id, ok, label, detail });
  const sig = signalCheck(trace, S, add);
  const phases = commandPhases(trace);
  const held = phases.filter((p) => p.angle !== null && (p.end - p.start >= S.minPhaseMs || p.open));
  const near = (a, b) => a !== null && Math.abs(a - b) <= S.tolDeg;

  // 1. Secuencia de ángulos (±5°) desde el arranque.
  let seqDetail = null;
  if (!sig.valid.length || !held.length) seqDetail = 'Sin una señal de servo estable no hay ángulos que comparar.';
  else if (held.length === 1 && Math.abs((sig.valid[0].us ?? 0) - DEFAULT_US) <= 15) {
    seqDetail = `El servo solo recibió la posición por defecto de attach() (${DEFAULT_US} µs ≈ ${deg(held[0].angle)}): falta write() con los ángulos del reto.`;
  } else if (held[0].start > S.maxStartMs) {
    seqDetail = `La primera posición estable empieza a los ${fmtS(held[0].start)}: la secuencia debe empezar al arrancar (antes de ${fmtS(S.maxStartMs)}).`;
  } else {
    for (let k = 0; k < S.angles.length + 1; k++) {
      const want = S.angles[k % S.angles.length];
      const got = held[k];
      if (!got) {
        // Sin quinta posición: si la cuarta sigue al final, lo explica la comprobación de tiempos.
        if (k < S.angles.length) seqDetail = `Después de ${held.slice(0, k).map((p) => deg(p.angle)).join(' → ')} no hubo más posiciones: falta ${deg(want)}.`;
        break;
      }
      if (!near(got.angle, want)) {
        const lineNote = Math.abs(got.angle - 93.3) < 2 && k === 0 ? ' Es la posición por defecto de attach(): escribe write(0) al empezar.' : '';
        seqDetail = `${k === 0 ? 'La primera posición' : `La posición ${k + 1}`} (a los ${fmtS(got.start)}) fue ${deg(got.angle)} (pulso de ${Math.round(angleUs(trace, got))} µs); tocaba ${deg(want)} ±${S.tolDeg}°.${lineNote}`;
        break;
      }
    }
  }
  const seqOk = !seqDetail;
  add('posiciones', seqOk, '0° → 90° → 180° → 90° (±5°), y vuelta a empezar',
    seqDetail || `Posiciones medidas: ${held.slice(0, 5).map((p) => `${deg(p.angle)} (${Math.round(angleUs(trace, p))} µs)`).join(' → ')}.`);

  // 2. Cada posición mantenida 0,9–1,1 s.
  let timeDetail = null;
  if (seqOk) {
    for (const p of held.slice(0, S.angles.length)) {
      const ms = p.end - p.start;
      if (p.open) {
        timeDetail = `${deg(p.angle)} empezó a los ${fmtS(p.start)} y seguía al final de la comprobación (${fmtS(trace.durationMs)}): cada posición dura 1 s y el loop vuelve a 0°.`;
        break;
      }
      if (Math.abs(ms - S.holdMs) > S.holdMs * S.holdTol) {
        timeDetail = `${deg(p.angle)} a los ${fmtS(p.start)} se mantuvo ${Math.round(ms)} ms; debe durar ${S.holdMs} ms ±${Math.round(S.holdTol * 100)} % (0,9–1,1 s).`;
        break;
      }
    }
  }
  add('tiempos', seqOk && !timeDetail, 'Cada posición se mantiene 1 s (0,9–1,1 s)',
    !seqOk ? 'Primero hace falta la secuencia de posiciones.' : timeDetail || held.slice(0, S.angles.length).map((p) => `${deg(p.angle)}: ${Math.round(p.end - p.start)} ms`).join(', ') + '.');

  // 3. El eje modelado llega a cada posición (respuesta mecánica del SG90 a 600 °/s).
  let mechDetail = null;
  const reaches = [];
  if (seqOk) {
    for (const p of held.slice(0, S.angles.length)) {
      const r = reachTime(trace, p.angle, p.start, p.end);
      if (r === null) { mechDetail = `El eje modelado no llegó a ${deg(p.angle)} antes de la orden siguiente (a los ${fmtS(p.end)}).`; break; }
      reaches.push(r);
    }
  }
  const moved = (trace.servo?.samples || []).some((s, k, a) => k && Math.abs(s.a - a[0].a) > 2);
  if (!seqOk && !moved) mechDetail = 'El eje modelado no se movió.';
  add('servo', seqOk && !mechDetail, 'El servo modelado llega a cada posición',
    !seqOk ? (mechDetail || 'Primero hace falta la secuencia de posiciones.')
      : mechDetail || `Llega a cada posición en ${Math.round(Math.min(...reaches))}–${Math.round(Math.max(...reaches))} ms: la orden es instantánea, el eje gira a ${SERVO.speedDegS} °/s como máximo.`);

  // 4. Una línea serie por posición con su ángulo, a ±150 ms de su inicio.
  const lines = timedSerialLines(trace.serial);
  let lineDetail = null;
  if (seqOk) {
    const used = new Set();
    for (const p of held.slice(0, S.angles.length)) {
      const want = S.angles[held.indexOf(p) % S.angles.length];
      const re = new RegExp(`(^|[^0-9])${want}([^0-9]|$)`);
      const match = lines.find((l) => !used.has(l) && re.test(l.text) && Math.abs(l.t - p.start) <= S.lineMs);
      if (match) { used.add(match); continue; }
      const late = lines.find((l) => !used.has(l) && re.test(l.text) && l.t > p.start - 2 * S.holdMs);
      lineDetail = late
        ? `La línea «${late.text.slice(0, 40)}» llegó a los ${fmtS(late.t)}, pero la posición ${want}° empezó a los ${fmtS(p.start)}: imprime el ángulo justo al mover el servo (±${S.lineMs} ms).`
        : `No hubo ninguna línea con el número ${want} cuando el servo fue a ${want}° (a los ${fmtS(p.start)}).`;
      break;
    }
  }
  add('mensajes', seqOk && !lineDetail && lines.length > 0, 'Una línea serie con el ángulo de cada posición (±150 ms)',
    !seqOk ? 'Primero hace falta la secuencia de posiciones.' : lineDetail || `${lines.length} líneas: ${lines.slice(0, 4).map((l) => `«${l.text.slice(0, 20)}»`).join(', ')}.`);
  checkBaud(trace, add);
  return { passed: checks.every((c) => c.ok), checks };
}

/** Ancho medio (µs) de los pulsos de una fase. */
function angleUs(trace, phase) {
  const ps = (trace.servo?.pulses || []).filter((p) => p.valid && p.t >= phase.start && p.t < phase.end);
  return ps.length ? ps.reduce((a, p) => a + p.us, 0) / ps.length : 0;
}

// ---------------------------------------------------------------- 3.2 · Barrido

/**
 * Tramos monótonos de la orden (con histéresis de `hyst` grados): [{ dir, start, end, from, to, pulses }].
 * Un cambio de sentido solo cuenta si la orden retrocede más de `hyst` desde el extremo.
 */
export function sweepSegments(pulses, hyst = 3) {
  const segs = [];
  let cur = null;
  for (const p of pulses) {
    if (!cur) { cur = { dir: 0, start: p.t, end: p.t, from: p.angle, to: p.angle, peak: p.angle, peakT: p.t, pulses: [p] }; continue; }
    if (cur.dir === 0) {
      if (Math.abs(p.angle - cur.from) > hyst) cur.dir = Math.sign(p.angle - cur.from);
    } else if ((p.angle - cur.peak) * cur.dir < -hyst) {
      // Cambio de sentido: el tramo termina en su extremo.
      const keep = cur.pulses.filter((x) => x.t <= cur.peakT);
      const rest = cur.pulses.filter((x) => x.t > cur.peakT);
      segs.push({ ...cur, end: cur.peakT, to: cur.peak, pulses: keep });
      cur = { dir: -cur.dir, start: cur.peakT, end: p.t, from: cur.peak, to: p.angle, peak: p.angle, peakT: p.t, pulses: [keep[keep.length - 1], ...rest, p] };
      continue;
    }
    cur.pulses.push(p);
    cur.end = p.t;
    cur.to = p.angle;
    if (cur.dir === 0 || (p.angle - cur.peak) * cur.dir >= 0) { cur.peak = p.angle; cur.peakT = p.t; }
  }
  if (cur) segs.push({ ...cur, open: true });
  return segs.map(({ dir, start, end, from, to, pulses: ps, open = false }) => ({ dir, start, end, from, to, pulses: ps, open }));
}

/** Pendiente (°/s) por mínimos cuadrados de los pulsos dentro de [lo, hi] grados. */
function slope(pulses, lo, hi) {
  const pts = pulses.filter((p) => p.angle >= lo && p.angle <= hi);
  if (pts.length < 10) return null;
  const n = pts.length;
  const mt = pts.reduce((a, p) => a + p.t, 0) / n;
  const ma = pts.reduce((a, p) => a + p.angle, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of pts) { num += (p.t - mt) * (p.angle - ma); den += (p.t - mt) ** 2; }
  return den ? (num / den) * 1000 : null;
}

/** Periodos de un pin digital a partir de sus flancos: [{ start, end, high, low }] (de subida a subida). */
export function blinkPeriods(trace, pin, from = 0) {
  const edges = (trace.pins || []).filter((e) => e.pin === pin && e.t >= from);
  const out = [];
  for (let k = 0; k + 2 < edges.length; k++) {
    if (!edges[k].high || edges[k + 1].high || !edges[k + 2].high) continue;
    out.push({ start: edges[k].t, end: edges[k + 2].t, high: edges[k + 1].t - edges[k].t, low: edges[k + 2].t - edges[k + 1].t });
  }
  return out;
}

export function evaluateBarrido(trace, S = BARRIDO) {
  const checks = [];
  const add = (id, ok, label, detail) => checks.push({ id, ok, label, detail });
  const sig = signalCheck(trace, S, add);
  const valid = sig.valid;

  // 1. Recorrido completo con cambios de sentido en los extremos.
  const segs = sweepSegments(valid);
  const moving = segs.filter((s) => s.dir !== 0);
  const reversals = moving.slice(1).map((s) => ({ t: s.start, angle: s.from }));
  const lo = valid.length ? Math.min(...valid.map((p) => p.angle)) : null;
  const hi = valid.length ? Math.max(...valid.map((p) => p.angle)) : null;
  const badRev = reversals.find((r) => r.angle > S.extremeTol && r.angle < 180 - S.extremeTol);
  let sweepDetail = null;
  if (!valid.length) sweepDetail = 'Sin pulsos válidos no hay barrido.';
  else if (!moving.length) sweepDetail = `El servo no se movió: la orden se quedó en ${deg(lo)}${Math.abs(sig.valid[0].us - DEFAULT_US) <= 15 && hi - lo < 1 ? ' (la posición por defecto de attach(): falta write())' : ''}.`;
  else if (lo > S.extremeTol || hi < 180 - S.extremeTol) sweepDetail = `La orden fue de ${deg(lo)} a ${deg(hi)}: el barrido debe llegar a 0° y a 180° (±${S.extremeTol}°).`;
  else if (badRev) sweepDetail = `A los ${fmtS(badRev.t)} el sentido cambió en ${deg(badRev.angle)}: debe cambiar solo en los extremos (0° y 180°).`;
  else if (reversals.length < S.minReversals) sweepDetail = `Solo ${reversals.length} cambio(s) de sentido en ${fmtS(trace.durationMs)}; el barrido debe ir y volver (al menos ${S.minReversals}).`;
  const sweepOk = !sweepDetail;
  add('barrido', sweepOk, 'Barrido 0° ↔ 180° con cambio de sentido en los extremos',
    sweepDetail || `De ${deg(lo)} a ${deg(hi)}, ${reversals.length} cambios de sentido (${reversals.slice(0, 3).map((r) => `${deg(r.angle)} a los ${fmtS(r.t)}`).join(', ')}).`);

  // 2. Paso a paso: la orden no salta más de 3° entre dos pulsos (20 ms).
  let jump = null;
  for (let k = 1; k < valid.length; k++) {
    const d = Math.abs(valid[k].angle - valid[k - 1].angle);
    if (!jump || d > jump.d) jump = { d, t: valid[k].t, from: valid[k - 1].angle, to: valid[k].angle };
  }
  const smooth = jump && jump.d <= S.maxStepDeg && moving.length > 0;
  add('suave', smooth, 'Movimiento gradual (≤ 3° entre pulsos)',
    !jump || !moving.length ? 'La orden no cambió.' : smooth ? `El mayor cambio entre pulsos fue de ${jump.d.toFixed(1).replace('.', ',')}°.`
      : jump.d > 10 ? `A los ${fmtS(jump.t)} la orden saltó de ${deg(jump.from)} a ${deg(jump.to)} entre dos pulsos: no es un barrido, es un salto. Avanza de 1° en 1°.`
        : `A los ${fmtS(jump.t)} la orden avanzó ${Math.round(jump.d)}° entre dos pulsos (20 ms): demasiado deprisa para un barrido de 1° cada 15 ms.`);

  // 3. Velocidad angular de cada tramo completo: 55–80 °/s (1° cada 15 ms ≈ 67 °/s).
  const speeds = moving.filter((s) => !s.open || Math.abs(s.to - s.from) >= 60)
    .map((s) => ({ s, v: slope(s.pulses, S.extremeTol + 5, 175 - S.extremeTol) })).filter((x) => x.v !== null);
  const badSpeed = speeds.find((x) => Math.abs(x.v) < S.speedMin || Math.abs(x.v) > S.speedMax);
  let speedDetail;
  if (!speeds.length) speedDetail = 'No hubo ningún tramo de barrido que medir.';
  else if (badSpeed) {
    const v = Math.abs(badSpeed.v);
    speedDetail = `El tramo que empieza a los ${fmtS(badSpeed.s.start)} va a ${Math.round(v)} °/s; el reto pide 1° cada 15 ms (≈ 67 °/s, entre ${S.speedMin} y ${S.speedMax}).${v > S.speedMax ? ' Va demasiado rápido: ¿esperas menos de 15 ms entre pasos?' : ' Va demasiado lento: ¿hay otra espera dentro del barrido?'}`;
  } else speedDetail = `Velocidad de los tramos: ${speeds.map((x) => `${Math.round(Math.abs(x.v))} °/s`).join(', ')}.`;
  add('velocidad', speeds.length > 0 && !badSpeed, `Velocidad angular de ${S.speedMin} a ${S.speedMax} °/s`, speedDetail);

  // 4. D13 parpadea 500/500 ms (periodo 1000 ms ±5 %) DURANTE el barrido.
  const sweepStart = moving.length ? moving[0].start : 0;
  const sweepEnd = moving.length ? moving[moving.length - 1].end : 0;
  const periods = blinkPeriods(trace, LED_PIN, sweepStart).filter((p) => p.end <= sweepEnd + S.ledPeriodMs);
  const badPeriod = periods.find((p) => Math.abs(p.end - p.start - S.ledPeriodMs) > S.ledPeriodMs * S.ledTol
    || Math.abs(p.high - S.ledPeriodMs / 2) > (S.ledPeriodMs / 2) * S.halfTol || Math.abs(p.low - S.ledPeriodMs / 2) > (S.ledPeriodMs / 2) * S.halfTol);
  const ledEdges = (trace.pins || []).filter((e) => e.pin === LED_PIN && e.t >= sweepStart && e.t <= sweepEnd);
  let ledDetail;
  if (!moving.length) ledDetail = 'Sin barrido no se puede comprobar el LED durante el barrido.';
  else if (!ledEdges.length) {
    const blinkers = [...new Set((trace.pins || []).filter((e) => e.pin !== LED_PIN && e.pin !== SERVO_PIN && e.pin > 1 && e.t >= sweepStart).map((e) => e.pin))];
    ledDetail = blinkers.length ? `Hay cambios en D${blinkers.join(', D')}, pero el LED está en D${LED_PIN}.` : `D${LED_PIN} no cambió durante el barrido: el LED se quedó ${trace.windows?.some((w) => w.pin === LED_PIN && w.level) ? 'encendido' : 'apagado'}.`;
  } else if (badPeriod) {
    const ms = Math.round(badPeriod.end - badPeriod.start);
    ledDetail = `A los ${fmtS(badPeriod.start)}, D${LED_PIN} tardó ${ms} ms en completar un parpadeo (encendido ${Math.round(badPeriod.high)} ms, apagado ${Math.round(badPeriod.low)} ms); debe ser 500/500 ms (1000 ms ±5 %).${ms > 1500 ? ' El barrido no deja avanzar al LED: ¿usas delay() dentro del barrido? Usa millis() para las dos tareas.' : ''}`;
  } else if (periods.length < S.minLedPeriods && (sweepEnd - sweepStart) / ledEdges.length > S.ledPeriodMs) {
    ledDetail = `D${LED_PIN} solo cambió ${ledEdges.length} ${ledEdges.length === 1 ? 'vez' : 'veces'} en ${fmtS(sweepEnd - sweepStart)} de barrido (debe cambiar cada 500 ms): mientras el servo se mueve, el LED espera. Un barrido con delay() bloquea el loop; usa millis() para las dos tareas.`;
  } else if (periods.length < S.minLedPeriods) {
    ledDetail = `D${LED_PIN} solo completó ${periods.length} parpadeo(s) durante el barrido (${fmtS(sweepEnd - sweepStart)}); se esperan al menos ${S.minLedPeriods}. ¿Se detiene el LED mientras se mueve el servo?`;
  } else {
    const avg = periods.reduce((a, p) => a + p.end - p.start, 0) / periods.length;
    ledDetail = `${periods.length} parpadeos durante el barrido, periodo medio ${Math.round(avg)} ms.`;
  }
  add('led', moving.length > 0 && ledEdges.length > 0 && !badPeriod && periods.length >= S.minLedPeriods,
    `D${LED_PIN} parpadea 500/500 ms mientras el servo se mueve`, ledDetail);

  // 5. El eje modelado sigue la orden y cambia de sentido.
  const samples = (trace.servo?.samples || []).filter((s) => s.g !== null && s.t >= sweepStart + 300);
  const worst = samples.reduce((m, s) => Math.max(m, Math.abs(s.a - s.g)), 0);
  const aLo = samples.length ? Math.min(...samples.map((s) => s.a)) : null;
  const aHi = samples.length ? Math.max(...samples.map((s) => s.a)) : null;
  const followOk = sweepOk && samples.length > 0 && worst <= S.trackDeg;
  add('servo', followOk, 'El servo modelado sigue el barrido',
    !sweepOk ? 'Primero hace falta un barrido completo.' : followOk ? `El eje fue de ${deg(aLo)} a ${deg(aHi)} siguiendo la orden (desfase máximo ${worst.toFixed(1).replace('.', ',')}°).`
      : `El eje se separó ${Math.round(worst)}° de la orden: va más rápido de lo que el servo puede seguir (${SERVO.speedDegS} °/s).`);
  return { passed: checks.every((c) => c.ok), checks };
}
