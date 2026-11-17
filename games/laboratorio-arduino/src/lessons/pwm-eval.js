// Evaluación del reto «LED que respira» con las ventanas de medición de D9 (pwm.js).
// Solo usa lo medido en el microcontrolador emulado; no mira el texto del programa.
import { isPwmWindow } from '../pwm.js';

export const EVAL_DURATION_MS = 6000;
export const PIN = 9;
export const PWM_PINS = [3, 5, 6, 9, 10, 11];
export const FREQ_MIN = 450;
export const FREQ_MAX = 1000;
export const LOW = 0.05;
export const HIGH = 0.95;
export const PERIOD_MIN = 1600;
export const PERIOD_MAX = 2400;
export const MAX_STEP = 0.08;   // puntos de % entre ventanas consecutivas de 20 ms
export const MIN_CYCLES = 2;

const pct = (d) => `${Math.round(d * 100)} %`;
const fmtS = (ms) => `${(ms / 1000).toFixed(2).replace('.', ',')} s`;

/**
 * Respiraciones: intervalos entre subidas consecutivas que cruzan el 50 % (con histéresis 40–60 %).
 * Cada una informa su duración y el mínimo y máximo medidos dentro.
 */
export function breaths(ws) {
  const ups = [];
  let state = null;
  for (const w of ws) {
    if (w.duty < 0.4) state = 'low';
    else if (w.duty >= 0.5 && state === 'low') { ups.push((w.t0 + w.t1) / 2); state = 'up'; }
    if (w.duty > 0.6) state = 'high';
  }
  const out = [];
  for (let k = 1; k < ups.length; k++) {
    const inside = ws.filter((w) => w.t0 >= ups[k - 1] - 10 && w.t1 <= ups[k] + 10);
    const duties = inside.map((w) => w.duty);
    out.push({ start: ups[k - 1], end: ups[k], ms: ups[k] - ups[k - 1], min: Math.min(...duties), max: Math.max(...duties) });
  }
  return out;
}

/**
 * @param {{windows:{pin,t0,t1,duty,freq,rises,level}[], durationMs:number}} trace
 * @returns {{passed:boolean, checks:{id,ok,label,detail}[]}}
 */
export function evaluatePwm(trace) {
  const checks = [];
  const add = (id, ok, label, detail) => checks.push({ id, ok, label, detail });
  const ws = trace.windows.filter((w) => w.pin === PIN).sort((a, b) => a.t0 - b.t0);
  const pwm = ws.filter(isPwmWindow);

  // 1. D9 genera PWM: valores intermedios, con la frecuencia del temporizador (solo donde hay flancos).
  // La frecuencia solo se mide donde hay valores intermedios (0 % y 100 % son salida continua, sin flancos).
  // Se toma la mediana de las ventanas y se exige que el 90 % esté en rango: el cambio de valor a mitad de
  // periodo puede dejar alguna ventana suelta con un pulso más corto.
  const freqs = pwm.map((w) => w.freq).sort((a, b) => a - b);
  const inRange = (f) => f >= FREQ_MIN && f <= FREQ_MAX;
  const typical = freqs.length ? freqs[freqs.length >> 1] : null;
  const share = freqs.length ? freqs.filter(inRange).length / freqs.length : 0;
  const badFreq = freqs.length && (!inRange(typical) || share < 0.9) ? { freq: typical, share } : null;
  let detail;
  if (!pwm.length) {
    const others = [...new Set(trace.windows.filter((w) => w.pin !== PIN && isPwmWindow(w)).map((w) => w.pin))];
    const onOff = [...new Set(trace.windows.filter((w) => w.pin !== PIN && !PWM_PINS.includes(w.pin) && w.duty > 0).map((w) => w.pin))];
    if (others.length) detail = `Hay PWM en ${others.map((p) => 'D' + p).join(', ')}, pero el LED está conectado a D9.`;
    else if (ws.some((w) => w.duty > 0)) detail = 'D9 solo estuvo apagado o encendido del todo, sin valores intermedios. Para brillos intermedios usa analogWrite(…) con valores entre 1 y 254.';
    else if (onOff.length) detail = `${onOff.map((p) => 'D' + p).join(', ')} no tiene PWM: allí analogWrite solo enciende (≥ 128) o apaga. El LED está en D9, que sí tiene PWM.`;
    else detail = 'D9 nunca recibió señal. ¿Escribes en el pin 9 con analogWrite(…)?';
  } else if (badFreq) {
    detail = `Frecuencia medida en D9: ${Math.round(badFreq.freq)} Hz (${Math.round(badFreq.share * 100)} % de las ventanas entre 450 y 1000 Hz). La salida PWM de analogWrite en D9 funciona a unos 490 Hz; un parpadeo hecho a mano con digitalWrite no cuenta.`;
  } else {
    detail = `${pwm.length} ventanas con valores intermedios; frecuencia típica ${Math.round(typical)} Hz.`;
  }
  add('pwm', pwm.length >= 5 && !badFreq, 'D9 genera PWM (450–1000 Hz)', detail);

  // 2. El brillo recorre todo el rango.
  const duties = ws.map((w) => w.duty);
  const min = duties.length ? Math.min(...duties) : 0;
  const max = duties.length ? Math.max(...duties) : 0;
  add('rango', duties.length > 0 && min <= LOW && max >= HIGH, 'El brillo llega a ≤ 5 % y a ≥ 95 %',
    duties.length ? `Mínimo medido: ${pct(min)} · máximo medido: ${pct(max)}.` : 'No hubo medidas de D9.');

  // 3. Respiraciones completas de 1,6 a 2,4 s que llegan a los dos extremos.
  const list = breaths(ws);
  const bad = list.find((b) => b.ms < PERIOD_MIN || b.ms > PERIOD_MAX || b.min > LOW || b.max < HIGH);
  let cyclesDetail;
  if (!list.length) cyclesDetail = 'No se midió ninguna respiración completa (subir y volver a bajar) en 6 s.';
  else if (bad) {
    cyclesDetail = bad.ms < PERIOD_MIN || bad.ms > PERIOD_MAX
      ? `Una respiración duró ${fmtS(bad.ms)}; debe durar entre 1,6 y 2,4 s.`
      : `La respiración que empieza a los ${fmtS(bad.start)} va de ${pct(bad.min)} a ${pct(bad.max)}: debe bajar hasta ≤ 5 % y subir hasta ≥ 95 %.`;
  } else cyclesDetail = `Respiraciones medidas: ${list.map((b) => fmtS(b.ms)).join(', ')}.`;
  add('ciclos', list.length >= MIN_CYCLES && !bad, 'Dos respiraciones completas de 1,6 a 2,4 s',
    !bad && list.length && list.length < MIN_CYCLES ? `Solo se midió ${list.length} respiración completa (${fmtS(list[0].ms)}) en 6 s; hacen falta al menos 2.` : cyclesDetail);

  // 4. Sin saltos bruscos entre ventanas consecutivas.
  let jump = null;
  for (let k = 1; k < ws.length; k++) {
    const d = Math.abs(ws[k].duty - ws[k - 1].duty);
    if (!jump || d > jump.d) jump = { d, t: ws[k].t0, from: ws[k - 1].duty, to: ws[k].duty };
  }
  const smooth = ws.length > 1 && jump.d <= MAX_STEP;
  add('suave', smooth && max > LOW, 'Cambios suaves (≤ 8 puntos cada 20 ms)',
    ws.length < 2 ? 'No hubo medidas de D9.'
      : max <= LOW ? 'D9 no llegó a encenderse.'
        : smooth ? `El mayor cambio entre ventanas fue de ${Math.round(jump.d * 100)} puntos.`
          : `A los ${fmtS(jump.t)} el brillo saltó de ${pct(jump.from)} a ${pct(jump.to)} en 20 ms. Cambia el valor poco a poco.`);

  return { passed: checks.every((c) => c.ok), checks };
}
