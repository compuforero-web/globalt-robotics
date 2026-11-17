// Evaluación de las lecciones del sensor ultrasónico HC-SR04 (4.1 y 4.2 de la ruta).
// El guion mueve el obstáculo del modelo (sonar.js); el programa compilado dispara TRIG (D7) y mide el ECHO (D8)
// con pulseIn o micros. Se mide: los pulsos TRIG reales que vio el modelo, los ECHO que produjo, las líneas del
// monitor serie con su instante y, en 4.2, el PWM de D9 por ventanas (pwm.js). No se mira el texto del programa.
import { isPwmWindow } from '../pwm.js';
import { timedSerialLines } from '../challenge.js';
import { MIN_TRIG_US } from '../sonar.js';

export const TRIG = 7;
export const ECHO = 8;
export const LED = 9;
const BAUD = 9600;
const PWM_PINS = [3, 5, 6, 9, 10, 11];
const FREQ_MIN = 450;
const FREQ_MAX = 1000;
export const MIN_GAP_MS = 60;   // entre disparos: deja que se apague el eco anterior

/**
 * 4.1 · Medir distancia. Obstáculo a 10, 35, 80 y 150 cm; los cambios no caen en múltiplos de 100 ms.
 * En cada tramo, pasados 250 ms, todas las líneas «Distancia: N cm» deben estar a ±(1 cm + 3 %).
 */
export const DIST = {
  durationMs: 6100,
  settleMs: 250,
  minLines: 3,
  periodMin: 100,
  periodMax: 200,
  periodTol: 0.1,
  steps: [
    { t: 0, cm: 10 },
    { t: 1537.3, cm: 35 },
    { t: 3061.9, cm: 80 },
    { t: 4589.4, cm: 150 },
  ],
};
DIST.script = DIST.steps.map(({ t, cm }) => ({ t, cm }));

/**
 * 4.2 · Alerta. Brillo de D9: apagado > 50 cm, proporcional entre 50 y 10 cm, encendido < 10 cm; sin eco, LED
 * apagado y «Fuera de rango». Tramos de ~1 s; el tramo sin eco dura 1,1 s.
 */
export const ALERTA = {
  durationMs: 7200,
  settleMs: 250,
  dutyTol: 0.06,
  maxCycleMs: 300,     // ningún ciclo de medida (de un TRIG al siguiente) puede pasar de 300 ms
  maxBlockMs: 40,      // «Fuera de rango» debe salir ≤ 40 ms después del disparo
  near: 10,
  far: 50,
  steps: [
    { t: 0, cm: 70 },
    { t: 1013.3, cm: 40 },
    { t: 2027.9, cm: 30 },
    { t: 3041.1, cm: 20 },
    { t: 4058.7, cm: 6 },
    { t: 5072.3, cm: null },
    { t: 6181.6, cm: 30 },
  ],
};
ALERTA.script = ALERTA.steps.map(({ t, cm }) => ({ t, cm }));

/** Brillo que pide el reto 4.2 para un obstáculo a `cm` (null = sin eco → apagado). */
export function alertDuty(cm, S = ALERTA) {
  if (cm === null || cm === undefined) return 0;
  return Math.min(1, Math.max(0, (S.far - cm) / (S.far - S.near)));
}

const fmtS = (ms) => `${(ms / 1000).toFixed(2).replace('.', ',')} s`;
const fmtUs = (us) => `${us.toFixed(1).replace('.', ',')} µs`;
const fmtCm = (cm) => (cm === null ? 'sin obstáculo' : `${String(cm).replace('.', ',')} cm`);
const pct = (d) => `${Math.round(d * 100)} %`;
const where = (seg) => (seg.cm === null ? 'Sin obstáculo' : `Con el obstáculo a ${fmtCm(seg.cm)}`);
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Tramos del guion con su final. */
export function segments(S) {
  return S.steps.map((s, k) => ({ ...s, end: S.steps[k + 1]?.t ?? S.durationMs }));
}

function busyPins(trace) {
  return [...new Set(trace.windows.filter((w) => w.pin > 1 && w.pin !== TRIG && (w.rises || w.level)).map((w) => w.pin))];
}

/** Comprobación común: pulsos TRIG en D7 de ≥ 10 µs, separados ≥ 60 ms (medidos en el pin real). */
function checkTrig(trace, add) {
  const sonar = trace.sonar || { triggers: [], echoes: [] };
  const trig = sonar.triggers;
  const short = trig.find((x) => x.widthUs < MIN_TRIG_US);
  const gaps = trig.slice(1).map((x, k) => ({ gap: x.rise - trig[k].rise, at: x.rise }));
  const close = gaps.find((g) => g.gap < MIN_GAP_MS - 0.5);
  const accepted = trig.filter((x) => x.accepted);
  let detail;
  if (!trig.length) {
    const busy = busyPins(trace);
    detail = `D7 nunca dio un pulso TRIG. Configúralo con pinMode(7, OUTPUT) y genera LOW → HIGH (10 µs) → LOW.${busy.length ? ` Hay actividad en D${busy.join(', D')}: ¿están cambiados TRIG y ECHO?` : ''}`;
  } else if (short) {
    detail = `A los ${fmtS(short.fall)} el pulso TRIG duró ${fmtUs(short.widthUs)}: el HC-SR04 necesita al menos ${MIN_TRIG_US} µs en HIGH y lo ignoró (${trig.filter((x) => x.widthUs < MIN_TRIG_US).length} de ${trig.length} pulsos fueron demasiado cortos).`;
  } else if (close) {
    detail = `Entre dos disparos (a los ${fmtS(close.at)}) pasaron ${String(Math.round(close.gap * 10) / 10).replace('.', ',')} ms; deja al menos ${MIN_GAP_MS} ms para que se apague el eco anterior${trig.some((x) => x.reason === 'ocupado') ? ' (el módulo ignoró los disparos que llegaron mientras aún medía)' : ''}.`;
  } else {
    const widths = trig.map((x) => x.widthUs);
    detail = `${trig.length} disparos de ${fmtUs(Math.min(...widths))}–${fmtUs(Math.max(...widths))}, separados al menos ${Math.round(Math.min(...gaps.map((g) => g.gap)))} ms.`;
  }
  add('trig', Boolean(trig.length) && !short && !close && accepted.length > 0, 'Pulsos TRIG de ≥ 10 µs en D7, separados ≥ 60 ms', detail);
  return { trig, accepted, echoes: sonar.echoes };
}

function checkBaud(trace, add) {
  const bauds = [...new Set(trace.serial.map((s) => s.baud))];
  add('baud', trace.serial.length > 0 && bauds.every((b) => Math.abs(b - BAUD) <= BAUD * 0.03), 'Monitor serie a 9600 baudios',
    trace.serial.length ? `Velocidad detectada: ${bauds.map((b) => Math.round(b)).join(', ')} baudios.` : 'No se recibió ningún texto por el puerto serie.');
}

const DIST_RE = /distancia\s*:?\s*(-?\d+(?:[.,]\d+)?)\s*cm\b/i;

/**
 * @param {{windows, serial, durationMs, sonar: {triggers, echoes, distances}}} trace
 * @returns {{passed:boolean, checks:{id,ok,label,detail}[]}}
 */
export function evaluateDistancia(trace, S = DIST) {
  const checks = [];
  const add = (id, ok, label, detail) => checks.push({ id, ok, label, detail });
  const { echoes } = checkTrig(trace, add);
  const segs = segments(S);

  // Formato: líneas «Distancia: N cm» (N entero o decimal).
  const lines = timedSerialLines(trace.serial).filter((l) => l.t < S.durationMs - 30);
  const dist = lines.map((l) => ({ ...l, m: l.text.match(DIST_RE) })).filter((l) => l.m)
    .map((l) => ({ t: l.t, text: l.text, cm: Number(l.m[1].replace(',', '.')) }));
  add('formato', dist.length >= 4, 'Líneas con el formato «Distancia: N cm»',
    dist.length ? `${dist.length} líneas «Distancia: N cm» (primera: «${dist[0].text.slice(0, 40)}»).`
      : `No apareció ninguna línea «Distancia: N cm».${lines.length ? ` Primera línea recibida: «${lines[0].text.slice(0, 40)}».` : ''}`);

  // Valores: en cada tramo, pasados 250 ms, todas las líneas a ±(1 cm + 3 %) y cada una tras una medida real.
  let detail = null;
  if (dist.length) {
    for (const seg of segs) {
      const inside = dist.filter((l) => l.t >= seg.t + S.settleMs && l.t < seg.end);
      const tol = 1 + 0.03 * seg.cm;
      if (inside.length < S.minLines) {
        detail = `Con el obstáculo a ${fmtCm(seg.cm)} (de ${fmtS(seg.t + S.settleMs)} a ${fmtS(seg.end)}) llegaron ${inside.length} línea(s); se esperan al menos ${S.minLines}.`;
        break;
      }
      const bad = inside.find((l) => Math.abs(l.cm - seg.cm) > tol);
      if (bad) {
        let why = '';
        const r = bad.cm / seg.cm;
        if (bad.cm === 0) why = ' Un 0 suele significar que pulseIn no vio el eco: revisa el pulso TRIG y el pin ECHO (D8).';
        else if (Math.abs(r - 2) < 0.12) why = ' Es el doble: el sonido va y vuelve, así que hay que dividir el tiempo entre 58 (no entre 29).';
        else if (Math.abs(r - 0.5) < 0.06) why = ' Es la mitad: ¿divides dos veces entre 2?';
        else if (bad.cm > 300) why = ' ¿Imprimes los microsegundos sin convertirlos a cm?';
        detail = `Con el obstáculo a ${fmtCm(seg.cm)}, a los ${fmtS(bad.t)} se imprimió «${bad.text.slice(0, 40)}»; se admite ${seg.cm} ± ${tol.toFixed(1).replace('.', ',')} cm.${why}`;
        break;
      }
      const orphan = inside.find((l) => !echoes.some((e) => e.t1 <= l.t && l.t - e.t1 <= 300));
      if (orphan) {
        detail = `La línea de los ${fmtS(orphan.t)} no sigue a ninguna medida del sensor en los 300 ms anteriores: cada valor debe salir de un ECHO medido.`;
        break;
      }
    }
  } else detail = 'No hay líneas «Distancia: N cm» que comparar.';
  add('distancia', !detail, 'Distancia correcta: ±(1 cm + 3 %) en 10, 35, 80 y 150 cm',
    detail || `Medido: ${segs.map((s) => {
      const v = dist.filter((l) => l.t >= s.t + S.settleMs && l.t < s.end).map((l) => l.cm);
      return `${fmtCm(s.cm)} → ${Math.min(...v)}–${Math.max(...v)}`;
    }).join(' · ')}.`);

  // Ritmo: una línea cada 100–200 ms (±10 %).
  const gaps = dist.slice(1).map((l, k) => l.t - dist[k].t);
  const lo = S.periodMin * (1 - S.periodTol);
  const hi = S.periodMax * (1 + S.periodTol);
  const badGap = gaps.findIndex((g) => g < lo || g > hi);
  const sorted = [...gaps].sort((a, b) => a - b);
  add('ritmo', gaps.length >= 10 && badGap < 0, 'Una línea cada 100–200 ms',
    gaps.length < 2 ? 'No hubo suficientes líneas «Distancia» para medir el ritmo.'
      : badGap >= 0 ? `Entre las líneas de ${fmtS(dist[badGap].t)} y ${fmtS(dist[badGap + 1].t)} pasaron ${Math.round(gaps[badGap])} ms; se esperan ${S.periodMin}–${S.periodMax} ms (±${Math.round(S.periodTol * 100)} %).`
        : gaps.length < 10 ? `Solo ${dist.length} líneas en ${S.durationMs / 1000} s.`
          : `Intervalos medidos: ${Math.round(sorted[0])}–${Math.round(sorted[sorted.length - 1])} ms.`);

  checkBaud(trace, add);
  return { passed: checks.every((c) => c.ok), checks };
}

/**
 * @param {{windows, serial, durationMs, sonar: {triggers, echoes, distances}}} trace
 * @returns {{passed:boolean, checks:{id,ok,label,detail}[]}}
 */
export function evaluateAlerta(trace, S = ALERTA) {
  const checks = [];
  const add = (id, ok, label, detail) => checks.push({ id, ok, label, detail });
  const { trig } = checkTrig(trace, add);
  const segs = segments(S).map((s) => ({ ...s, duty: alertDuty(s.cm, S) }));
  const ws = trace.windows.filter((w) => w.pin === LED).sort((a, b) => a.t0 - b.t0);
  const settled = (seg) => ws.filter((w) => w.t0 >= seg.t + S.settleMs && w.t1 <= seg.end);
  const lit = ws.some((w) => w.level || w.duty > 0);

  // 1. PWM real en D9 en los tramos intermedios (40, 30 y 20 cm).
  const mids = segs.filter((s) => s.duty > 0.05 && s.duty < 0.95).flatMap(settled);
  const pwm = mids.filter(isPwmWindow);
  const freqs = pwm.map((w) => w.freq).sort((a, b) => a - b);
  const typical = freqs.length ? freqs[freqs.length >> 1] : null;
  const share = freqs.length ? freqs.filter((f) => f >= FREQ_MIN && f <= FREQ_MAX).length / freqs.length : 0;
  const pwmOk = mids.length > 0 && pwm.length >= mids.length * 0.9 && typical >= FREQ_MIN && typical <= FREQ_MAX && share >= 0.9;
  const other = PWM_PINS.filter((p) => p !== LED && trace.windows.some((w) => w.pin === p && isPwmWindow(w)));
  let pwmDetail;
  if (pwmOk) pwmDetail = `D9 genera PWM a ${Math.round(typical)} Hz con valores intermedios.`;
  else if (other.length) pwmDetail = `Hay PWM en D${other.join(', D')}, pero el LED está en D9.`;
  else if (!lit) pwmDetail = 'D9 no se encendió en ningún momento: el LED del circuito está en D9 y necesita analogWrite.';
  else if (typical && (typical < FREQ_MIN || typical > FREQ_MAX)) pwmDetail = `D9 cambia a unos ${Math.round(typical)} Hz: no es el PWM de analogWrite (≈ 490 Hz).`;
  else pwmDetail = 'Entre 50 y 10 cm, D9 no mostró valores intermedios: solo encendido o apagado. Usa analogWrite con un valor proporcional a la distancia.';
  add('pwm', pwmOk, 'D9 con PWM proporcional (analogWrite)', pwmDetail);

  // 2. Brillo según la distancia: tras ≤ 250 ms, todas las ventanas a ±6 puntos.
  let brightDetail = null;
  for (const seg of segs) {
    const inside = settled(seg);
    if (!inside.length) { brightDetail = 'No hubo medidas de D9.'; break; }
    const bad = inside.find((w) => Math.abs(w.duty - seg.duty) > S.dutyTol);
    if (!bad) continue;
    let why = '';
    if (seg.cm === null && bad.duty > 0.5) why = ' Sin eco, pulseIn devuelve 0 (con tiempo máximo) y tu programa lo trató como un obstáculo pegado: trata ese 0 como «fuera de rango» y apaga el LED.';
    else if (seg.cm !== null && Math.abs(bad.duty - (1 - seg.duty)) <= S.dutyTol) why = ' Parece invertido: cuanto más cerca, más brillo.';
    else if (inside.some((w) => w.t0 > bad.t0 && Math.abs(w.duty - seg.duty) <= S.dutyTol)) why = ' Después sí llegó al valor correcto: el brillo tarda demasiado en actualizarse (¿una espera larga en loop()?).';
    brightDetail = `${where(seg)} (desde ${fmtS(seg.t)}), D9 midió ${pct(bad.duty)} a los ${fmtS(bad.t0)}; se esperaba ${pct(seg.duty)} (±${Math.round(S.dutyTol * 100)} puntos, tras ${S.settleMs} ms).${why}`;
    break;
  }
  add('brillo', !brightDetail, 'Brillo según la distancia (≤ 250 ms, ±6 puntos)',
    brightDetail || `Medido: ${segs.map((s) => `${fmtCm(s.cm)} → ${pct(settled(s).reduce((a, w) => a + w.duty, 0) / Math.max(1, settled(s).length))}`).join(' · ')}.`);

  // 3. «Fuera de rango» en el tramo sin eco (sin bloquear > 40 ms) y nunca con eco.
  const lines = timedSerialLines(trace.serial).filter((l) => l.t < S.durationMs - 30);
  const out = lines.filter((l) => norm(l.text).includes('fuera de rango'));
  const silent = segs.filter((s) => s.cm === null);
  let outDetail = null;
  const wrong = out.find((l) => segs.some((s) => s.cm !== null && l.t >= s.t + S.settleMs && l.t < s.end));
  if (wrong) {
    const seg = segs.find((s) => wrong.t >= s.t && wrong.t < s.end);
    outDetail = `A los ${fmtS(wrong.t)} se escribió «${wrong.text.slice(0, 40)}» con el obstáculo a ${fmtCm(seg.cm)}: solo debe salir cuando no hay eco.`;
  }
  for (const seg of outDetail ? [] : silent) {
    const inside = out.filter((l) => l.t >= seg.t + S.settleMs && l.t < seg.end);
    if (!inside.length) {
      const during = lines.filter((l) => l.t >= seg.t + S.settleMs && l.t < seg.end);
      outDetail = `Sin obstáculo (de ${fmtS(seg.t + S.settleMs)} a ${fmtS(seg.end)}) no apareció «Fuera de rango».${during.length ? ` Llegó «${during[0].text.slice(0, 40)}».` : ''} Con pulseIn(ECHO, HIGH, 30000) el resultado es 0 cuando no hay eco (sin tercer argumento devolvería unos 38 000 µs).`;
      break;
    }
    // Respuesta a cada disparo: la primera línea «Fuera de rango» que sigue a un disparo debe llegar en ≤ 40 ms.
    const answered = new Set();
    const late = inside.map((l) => {
      const before = trig.filter((x) => x.fall <= l.t);
      const last = before[before.length - 1];
      return { l, last, wait: last ? l.t - last.fall : Infinity };
    }).filter((x) => { if (!x.last) return true; if (answered.has(x.last)) return false; answered.add(x.last); return true; })
      .find((x) => x.wait > S.maxBlockMs);
    if (late) {
      outDetail = `«Fuera de rango» llegó ${Number.isFinite(late.wait) ? `${Math.round(late.wait)} ms` : 'sin ningún disparo'} después del último disparo (a los ${fmtS(late.l.t)}); debe salir en ≤ ${S.maxBlockMs} ms. Pon un tiempo máximo a pulseIn (tercer argumento, en µs) y avisa en cuanto vuelva.`;
      break;
    }
  }
  add('fuera', !outDetail, '«Fuera de rango» sin eco (≤ 40 ms tras el disparo) y solo entonces',
    outDetail || `${out.length} línea(s) «Fuera de rango», todas en el tramo sin eco.`);

  // 4. Ciclo de medida: un disparo al menos cada 300 ms (D9 se actualiza en cada ciclo).
  const rises = trig.map((x) => x.rise);
  const cycles = [rises[0] ?? S.durationMs, ...rises.slice(1).map((t, k) => t - rises[k]), S.durationMs - (rises[rises.length - 1] ?? 0)];
  const worst = Math.max(...cycles);
  add('ciclo', rises.length > 0 && worst <= S.maxCycleMs, 'Un ciclo de medida cada ≤ 300 ms',
    !rises.length ? 'No hubo ningún disparo en D7.'
      : worst > S.maxCycleMs ? `Hubo ${Math.round(worst)} ms seguidos sin un disparo nuevo: D9 quedó ese tiempo sin actualizar. Revisa las esperas de loop().`
        : `Ciclo más largo: ${Math.round(worst)} ms.`);

  checkBaud(trace, add);
  return { passed: checks.every((c) => c.ok), checks };
}
