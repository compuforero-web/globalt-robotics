// Evaluación del reto «Semáforo» a partir de la traza medida del microcontrolador emulado
// (flancos de D2/D3/D4 y bytes serie con su instante). No mira el texto del programa.
import { timedSerialLines } from '../challenge.js';

export const EVAL_DURATION_MS = 17000;   // dos ciclos de 7 s con margen para la tolerancia del ±10 %
export const LIGHTS = [
  { color: 'verde', pin: 2, ms: 3000 },
  { color: 'amarillo', pin: 3, ms: 1000 },
  { color: 'rojo', pin: 4, ms: 3000 },
];
export const MIN_PHASES = 6;             // dos ciclos completos
export const OVERLAP_MS = 20;            // se tolera un solape breve al cambiar de LED
export const LINE_MS = 100;              // la línea debe empezar a ±100 ms del cambio
const TOLERANCE = 0.1;
const BAUD = 9600;
const BY_PIN = new Map(LIGHTS.map((l, i) => [l.pin, i]));
const NEXT = (i) => (i + 1) % LIGHTS.length;

/** Intervalos en los que cada LED estuvo encendido: [{ i, start, end, open }]. */
function onIntervals(pins, durationMs) {
  const open = new Map();
  const out = [];
  for (const e of pins) {
    if (!BY_PIN.has(e.pin)) continue;
    const i = BY_PIN.get(e.pin);
    if (e.high && !open.has(i)) open.set(i, e.t);
    else if (!e.high && open.has(i)) { out.push({ i, start: open.get(i), end: e.t, open: false }); open.delete(i); }
  }
  for (const [i, start] of open) out.push({ i, start, end: durationMs, open: true });
  return out.sort((a, b) => a.start - b.start);
}

/** Mayor solape entre dos LED encendidos a la vez. */
function worstOverlap(intervals) {
  let worst = null;
  for (let a = 0; a < intervals.length; a++) {
    for (let b = a + 1; b < intervals.length && intervals[b].start < intervals[a].end; b++) {
      if (intervals[a].i === intervals[b].i) continue;
      const ms = Math.min(intervals[a].end, intervals[b].end) - intervals[b].start;
      if (!worst || ms > worst.ms) worst = { ms, at: intervals[b].start, a: intervals[a].i, b: intervals[b].i };
    }
  }
  return worst;
}

/** Fases: encendidos de más de OVERLAP_MS (los destellos más cortos no cuentan como fase). */
const phasesOf = (intervals) => intervals.filter((p) => p.end - p.start > OVERLAP_MS);

const colorIn = (text) => {
  const t = text.toLowerCase();
  return LIGHTS.map((l, i) => (t.includes(l.color) ? i : -1)).filter((i) => i >= 0);
};
const fmtS = (ms) => `${(ms / 1000).toFixed(2).replace('.', ',')} s`;

/**
 * @param {{pins:{pin,high,t}[], serial:{byte,t,baud}[], durationMs:number}} trace
 * @returns {{passed:boolean, checks:{id,ok,label,detail}[]}}
 */
export function evaluateSemaforo(trace) {
  const checks = [];
  const add = (id, ok, label, detail) => checks.push({ id, ok, label, detail });
  const intervals = onIntervals(trace.pins, trace.durationMs);
  const phases = phasesOf(intervals);
  const complete = phases.filter((p) => !p.open);

  // 1. Orden verde → amarillo → rojo, repetido.
  let orderDetail;
  const wrong = phases.findIndex((p, k) => k > 0 && p.i !== NEXT(phases[k - 1].i));
  const lit = new Set(phases.map((p) => p.i));
  if (!phases.length) orderDetail = 'Ningún LED de D2, D3 o D4 se encendió. ¿Configuraste los tres pines como OUTPUT?';
  else if (lit.size < 3) orderDetail = `Solo se encendieron: ${[...lit].map((i) => `${LIGHTS[i].color} (D${LIGHTS[i].pin})`).join(', ')}.`;
  else if (wrong >= 0) orderDetail = `A los ${fmtS(phases[wrong].start)} se pasó de ${LIGHTS[phases[wrong - 1].i].color} a ${LIGHTS[phases[wrong].i].color}; después de ${LIGHTS[phases[wrong - 1].i].color} va ${LIGHTS[NEXT(phases[wrong - 1].i)].color}.`;
  else orderDetail = `Se midieron ${complete.length} fases completas en ${trace.durationMs / 1000} s: ${complete.slice(0, 7).map((p) => LIGHTS[p.i].color).join(' → ')}${complete.length > 7 ? '…' : ''}.`;
  add('orden', phases.length > 0 && lit.size === 3 && wrong < 0 && complete.length >= MIN_PHASES,
    'Orden verde → amarillo → rojo, dos ciclos', orderDetail);

  // 2. Duración de cada fase completa.
  const bad = complete.find((p) => Math.abs((p.end - p.start) - LIGHTS[p.i].ms) > LIGHTS[p.i].ms * TOLERANCE);
  const byColor = LIGHTS.map((l, i) => complete.filter((p) => p.i === i).map((p) => Math.round(p.end - p.start)));
  add('tiempos', complete.length > 0 && !bad, 'Verde 3 s, amarillo 1 s, rojo 3 s',
    !complete.length ? 'No hubo fases completas para medir.'
      : bad ? `Una fase ${LIGHTS[bad.i].color} duró ${Math.round(bad.end - bad.start)} ms; se esperaban ${LIGHTS[bad.i].ms} ms (±10 %).`
        : `Medido (ms): ${LIGHTS.map((l, i) => `${l.color} ${byColor[i].slice(0, 3).join(', ') || '—'}`).join(' · ')}.`);

  // 3. Nunca dos LED a la vez.
  const overlap = worstOverlap(intervals);
  const overlapOk = !overlap || overlap.ms <= OVERLAP_MS;
  add('solape', phases.length > 0 && overlapOk, 'Nunca dos LED encendidos a la vez',
    !phases.length ? 'No hubo LED encendidos que comprobar.'
      : overlapOk ? 'En ningún momento hubo dos LED encendidos a la vez.'
        : `A los ${fmtS(overlap.at)} estuvieron encendidos ${LIGHTS[overlap.a].color} y ${LIGHTS[overlap.b].color} a la vez durante ${Math.round(overlap.ms)} ms. Apaga uno antes de encender el siguiente.`);

  // 4. Monitor serie a 9600 baudios.
  const bauds = [...new Set(trace.serial.map((s) => s.baud))];
  const baudOk = trace.serial.length > 0 && bauds.every((b) => Math.abs(b - BAUD) <= BAUD * 0.03);
  add('baud', baudOk, 'Monitor serie a 9600 baudios',
    trace.serial.length ? `Velocidad detectada: ${bauds.map((b) => Math.round(b)).join(', ')} baudios.` : 'No se recibió ningún texto por el puerto serie.');

  // 5. Una línea con el color por cada fase, a ±100 ms de su cambio.
  const lines = timedSerialLines(trace.serial).map((l) => ({ ...l, colors: colorIn(l.text) })).filter((l) => l.colors.length);
  const used = new Set();
  let missing = null;
  for (const p of phases) {
    // Las fases que empiezan casi al final pueden no haber transmitido aún su línea completa.
    if (p.start > trace.durationMs - LINE_MS - 50) continue;
    const k = lines.findIndex((l, j) => !used.has(j) && l.colors.includes(p.i) && Math.abs(l.t - p.start) <= LINE_MS);
    if (k < 0) { missing = p; break; }
    used.add(k);
  }
  const extra = lines.find((l, j) => !used.has(j) && l.t < trace.durationMs - LINE_MS - 50);
  let serialDetail;
  if (!lines.length) serialDetail = 'No apareció ninguna línea con «verde», «amarillo» o «rojo».';
  else if (missing) {
    const near = lines.filter((l) => l.colors.includes(missing.i)).sort((a, b) => Math.abs(a.t - missing.start) - Math.abs(b.t - missing.start))[0];
    serialDetail = `La fase ${LIGHTS[missing.i].color} empezó a los ${fmtS(missing.start)} sin su línea${near ? `; la más cercana con «${LIGHTS[missing.i].color}» llegó a los ${fmtS(near.t)}` : ''}. Escribe la línea justo al cambiar de LED.`;
  } else if (extra) serialDetail = `«${extra.text.slice(0, 40)}» (a los ${fmtS(extra.t)}) no corresponde a ningún cambio de fase: debe haber una línea por fase.`;
  else serialDetail = `${used.size} líneas, cada una junto a su cambio de fase.`;
  add('serial', used.size > 0 && !missing && !extra, 'Una línea con el color en cada cambio', serialDetail);

  return { passed: checks.every((c) => c.ok), checks };
}
