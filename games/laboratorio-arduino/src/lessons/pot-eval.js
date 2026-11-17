// Evaluación del reto «El brillo sigue al potenciómetro» (2.4 de la ruta).
// El guion fija la tensión del cursor en A0; el programa compilado la lee con analogRead en el ADC emulado.
// Se mide el PWM de D9 en ventanas de 20 ms (pwm.js) y las líneas del monitor serie con su instante.
// No se mira el texto del programa.
import { isPwmWindow } from '../pwm.js';
import { timedSerialLines } from '../challenge.js';
import { adcValue } from '../pot.js';

export const PIN = 9;
export const CHANNEL = 0;
const PWM_PINS = [3, 5, 6, 9, 10, 11];
const FREQ_MIN = 450;
const FREQ_MAX = 1000;
const BAUD = 9600;

/**
 * Guion: tensión del cursor en cada tramo (0 V, 1,25 V, 2,5 V, 5 V y vuelta a 1,25 V para comprobar que baja).
 * Los cambios no caen en múltiplos de 250 ms (resto 130, 10, 140 y 20 ms): un programa que solo lee A0 cada
 * 250 ms (p. ej. con delay(250)) tarda más de 100 ms en reaccionar a alguno, aunque su reloj empiece en otro punto.
 */
export const POT = {
  durationMs: 5400,
  settleMs: 100,          // el brillo debe estar en su valor tras ≤ 100 ms
  dutyTol: 0.04,          // ±4 puntos de %
  readTol: 8,             // lecturas impresas ±8 cuentas
  periodMs: 250,          // una línea cada 250 ms (±10 %)
  periodTol: 0.1,
  steps: [
    { t: 0, volts: 0 },
    { t: 1130.37, volts: 1.25 },
    { t: 2260.61, volts: 2.5 },
    { t: 3390.13, volts: 5 },
    { t: 4520.49, volts: 1.25 },
  ],
};
POT.script = POT.steps.map(({ t, volts }) => ({ t, volts }));

const fmtS = (ms) => `${(ms / 1000).toFixed(2).replace('.', ',')} s`;
const fmtV = (v) => `${String(v).replace('.', ',')} V`;
const pct = (d) => `${Math.round(d * 100)} %`;

/** Tramos del guion con su lectura y su brillo esperados. */
export function segments(S = POT) {
  return S.steps.map((s, k) => {
    const reading = adcValue(s.volts);
    return { ...s, end: S.steps[k + 1]?.t ?? S.durationMs, reading, duty: reading / 1023 };
  });
}

/**
 * @param {{windows, serial, durationMs}} trace
 * @returns {{passed:boolean, checks:{id,ok,label,detail}[]}}
 */
export function evaluatePot(trace, S = POT) {
  const checks = [];
  const add = (id, ok, label, detail) => checks.push({ id, ok, label, detail });
  const segs = segments(S);
  const ws = trace.windows.filter((w) => w.pin === PIN).sort((a, b) => a.t0 - b.t0);
  const settled = (seg) => ws.filter((w) => w.t0 >= seg.t + S.settleMs && w.t1 <= seg.end);
  const reads = (trace.adc || []).filter((a) => a.channel === CHANNEL);

  // 1. D9 con PWM real en los tramos intermedios (1,25 V y 2,5 V).
  const mids = segs.filter((s) => s.duty > 0.05 && s.duty < 0.95).flatMap(settled);
  const pwm = mids.filter(isPwmWindow);
  const freqs = pwm.map((w) => w.freq).sort((a, b) => a - b);
  const typical = freqs.length ? freqs[freqs.length >> 1] : null;
  const share = freqs.length ? freqs.filter((f) => f >= FREQ_MIN && f <= FREQ_MAX).length / freqs.length : 0;
  const pwmOk = mids.length > 0 && pwm.length >= mids.length * 0.9 && typical >= FREQ_MIN && typical <= FREQ_MAX && share >= 0.9;
  let pwmDetail;
  const other = PWM_PINS.filter((p) => p !== PIN && trace.windows.some((w) => w.pin === p && isPwmWindow(w)));
  const busy = [...new Set(trace.windows.filter((w) => w.pin !== PIN && w.pin > 1 && (w.rises || w.level)).map((w) => w.pin))];
  if (pwmOk) pwmDetail = `D9 genera PWM a ${Math.round(typical)} Hz con valores intermedios.`;
  else if (!reads.length) pwmDetail = 'El programa nunca leyó A0 con analogRead, así que el brillo no puede seguir al potenciómetro.';
  else if (other.length) pwmDetail = `Hay PWM en D${other.join(', D')}, pero el LED está en D9.`;
  else if (busy.length && !ws.some((w) => w.rises || w.level)) pwmDetail = `Hay actividad en D${busy.join(', D')}, pero el LED está en D9${busy.some((p) => !PWM_PINS.includes(p)) ? ' (y un pin sin «~» no tiene PWM)' : ''}.`;
  else if (typical && (typical < FREQ_MIN || typical > FREQ_MAX)) pwmDetail = `D9 cambia a unos ${Math.round(typical)} Hz: no es el PWM de analogWrite (≈ 490 Hz). ¿Lo haces a mano con digitalWrite?`;
  else pwmDetail = 'Con 1,25 V y 2,5 V en A0, D9 no mostró valores intermedios: solo encendido o apagado. Usa analogWrite con la lectura convertida a 0–255.';
  add('pwm', pwmOk, 'D9 con PWM (analogWrite)', pwmDetail);

  // 2. Brillo de D9 según la tensión, en ≤ 100 ms y ±4 puntos.
  let brightDetail = null;
  for (const seg of segs) {
    const inside = settled(seg);
    const bad = inside.find((w) => Math.abs(w.duty - seg.duty) > S.dutyTol);
    if (!inside.length) { brightDetail = 'No hubo medidas de D9.'; break; }
    if (bad && !ws.some((w) => w.level || w.duty > 0)) { brightDetail = 'D9 no se encendió en ningún momento: el LED del circuito está en D9 y necesita analogWrite.'; break; }
    if (bad) {
      let why = '';
      if (Math.abs(bad.duty - (1 - seg.duty)) <= S.dutyTol) why = ' Parece invertido: más tensión debería dar más brillo.';
      else if (inside.some((w) => w.t0 > bad.t0 && Math.abs(w.duty - seg.duty) <= S.dutyTol)) why = ' Después sí llegó al valor correcto: el brillo tarda demasiado en actualizarse (¿una espera larga en loop()?).';
      else if (seg.reading > 255 && ws.some((w) => w.level || w.duty > 0)) why = ' La lectura de A0 llega en 0–1023 y analogWrite solo acepta 0–255: conviértela con map o dividiendo entre 4.';
      brightDetail = `Con ${fmtV(seg.volts)} en A0 (desde ${fmtS(seg.t)}), D9 midió ${pct(bad.duty)} a los ${fmtS(bad.t0)}; se esperaba ${pct(seg.duty)} (±${Math.round(S.dutyTol * 100)} puntos, tras ${S.settleMs} ms).${why}`;
      break;
    }
  }
  add('brillo', !brightDetail, 'El brillo de D9 sigue al potenciómetro (≤ 100 ms, ±4 puntos)',
    brightDetail || `Medido: ${segs.map((s) => `${fmtV(s.volts)} → ${pct(settled(s).reduce((a, w) => a + w.duty, 0) / Math.max(1, settled(s).length))}`).join(' · ')}.`);

  // 3. Lecturas impresas: en cada tramo, las líneas (pasados 100 ms) llevan un número a ±8 de la lectura esperada.
  const lines = timedSerialLines(trace.serial).map((l) => ({ ...l, nums: (l.text.match(/\b\d+\b/g) || []).map(Number) }));
  const numbered = lines.filter((l) => l.nums.length && l.t < S.durationMs - 30);
  let readDetail = null;
  for (const seg of segs) {
    const inside = numbered.filter((l) => l.t >= seg.t + S.settleMs && l.t < seg.end);
    if (inside.length < 2) {
      readDetail = numbered.length ? `Entre ${fmtS(seg.t + S.settleMs)} y ${fmtS(seg.end)} (${fmtV(seg.volts)}) hubo ${inside.length} línea(s) con número; se esperan al menos 2 (una cada 250 ms).`
        : `No apareció ninguna línea con la lectura.${lines.length ? ` Primera línea: «${lines[0].text.slice(0, 40)}».` : ''}`;
      break;
    }
    const bad = inside.find((l) => !l.nums.some((n) => Math.abs(n - seg.reading) <= S.readTol));
    if (bad) {
      const always0 = numbered.every((l) => l.nums.every((n) => n === 0));
      readDetail = `Con ${fmtV(seg.volts)} en A0 se esperaba una lectura de ${seg.reading} (±${S.readTol}), pero a los ${fmtS(bad.t)} llegó «${bad.text.slice(0, 40)}».${always0 ? ' Todas las lecturas son 0: ¿lees el canal A0?' : ''}`;
      break;
    }
  }
  add('lecturas', !readDetail, 'Lecturas impresas correctas (0, 256, 512, 1023 ±8)',
    readDetail || `${numbered.length} líneas con la lectura; todas coinciden con la tensión de A0.`);

  // 4. Una línea cada 250 ms (±10 %).
  const gaps = numbered.slice(1).map((l, k) => l.t - numbered[k].t);
  const lo = S.periodMs * (1 - S.periodTol);
  const hi = S.periodMs * (1 + S.periodTol);
  const badGap = gaps.findIndex((g) => g < lo || g > hi);
  const sorted = [...gaps].sort((a, b) => a - b);
  add('ritmo', gaps.length >= 10 && badGap < 0, 'Una lectura cada 250 ms',
    gaps.length < 2 ? 'No hubo suficientes líneas con la lectura para medir el ritmo.'
      : badGap >= 0 ? `Entre las líneas de ${fmtS(numbered[badGap].t)} y ${fmtS(numbered[badGap + 1].t)} pasaron ${Math.round(gaps[badGap])} ms; se esperan ${S.periodMs} ms (±${Math.round(S.periodTol * 100)} %).`
        : gaps.length < 10 ? `Solo ${numbered.length} líneas en ${S.durationMs / 1000} s.`
          : `Intervalos medidos: ${Math.round(sorted[0])}–${Math.round(sorted[sorted.length - 1])} ms.`);

  // 5. Monitor a 9600 baudios.
  const bauds = [...new Set(trace.serial.map((s) => s.baud))];
  add('baud', trace.serial.length > 0 && bauds.every((b) => Math.abs(b - BAUD) <= BAUD * 0.03), 'Monitor serie a 9600 baudios',
    trace.serial.length ? `Velocidad detectada: ${bauds.map((b) => Math.round(b)).join(', ')} baudios.` : 'No se recibió ningún texto por el puerto serie.');

  return { passed: checks.every((c) => c.ok), checks };
}
