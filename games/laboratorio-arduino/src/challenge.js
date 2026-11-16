// Evalúa el reto a partir de la traza del microcontrolador emulado (pines y bytes serie medidos).
// No mira el texto del programa: solo el comportamiento observado.
export const EVAL_DURATION_MS = 5000;
const PIN = 13;
const ON_MS = 200;
const OFF_MS = 800;
const TOLERANCE = 0.1;
const BAUD = 9600;
// Ventana para emparejar «Latido N» con el N-ésimo encendido de D13: la línea debe empezar a
// transmitirse desde 100 ms antes del encendido (imprimir justo antes de digitalWrite HIGH)
// hasta 250 ms después (los 200 ms encendido + 50 ms de margen). Con un periodo de 1000 ms las
// ventanas no se solapan: una línea emitida en otro momento no cuenta para ese latido.
export const LINE_BEFORE_MS = 100;
export const LINE_AFTER_MS = 250;

const within = (value, expected) => Math.abs(value - expected) <= expected * TOLERANCE;

/** Separa los bytes recibidos en líneas con el instante (ms simulados) de su primer byte. */
export function timedSerialLines(serial) {
  const lines = [];
  let text = '';
  let start = null;
  for (const { byte, t } of serial) {
    if (byte === 10) {
      if (text.trim()) lines.push({ text: text.replace(/\r/g, '').trim(), t: start });
      text = '';
      start = null;
    } else {
      if (start === null) start = t;
      text += String.fromCharCode(byte);
    }
  }
  if (text.trim()) lines.push({ text: text.replace(/\r/g, '').trim(), t: start });
  return lines;
}

/** Separa los bytes recibidos en líneas de texto. */
export function serialLines(serial) { return timedSerialLines(serial).map((l) => l.text); }

/**
 * @param {{pins:{pin:number,high:boolean,t:number}[], serial:{byte:number,t:number,baud:number}[], durationMs:number}} trace
 * @returns {{passed:boolean, checks:{id:string, ok:boolean, label:string, detail:string}[]}}
 */
export function evaluateChallenge(trace) {
  const events = trace.pins.filter((e) => e.pin === PIN);
  const rises = events.filter((e) => e.high).map((e) => e.t);
  const ons = [];
  const offs = [];
  for (let i = 0; i < events.length - 1; i++) {
    const length = events[i + 1].t - events[i].t;
    (events[i].high ? ons : offs).push(length);
  }
  const checks = [];
  const add = (id, ok, label, detail) => checks.push({ id, ok, label, detail });

  add('blink', rises.length >= 4, 'El LED de D13 parpadea',
    rises.length ? `Se midieron ${rises.length} encendidos en ${trace.durationMs / 1000} s.` : 'D13 nunca pasó a HIGH. ¿Configuraste el pin como OUTPUT y usas el pin 13?');

  const fmt = (list) => list.slice(0, 4).map((v) => Math.round(v)).join(', ') + (list.length > 4 ? '…' : '');
  const onOk = ons.length >= 3 && ons.every((v) => within(v, ON_MS));
  add('on', onOk, 'Encendido de 200 ms',
    ons.length ? `Encendidos medidos (ms): ${fmt(ons)}.` : 'No hubo encendidos completos para medir.');
  const offOk = offs.length >= 3 && offs.every((v) => within(v, OFF_MS));
  add('off', offOk, 'Apagado de 800 ms',
    offs.length ? `Apagados medidos (ms): ${fmt(offs)}.` : 'No hubo apagados completos para medir.');

  const bauds = [...new Set(trace.serial.map((s) => s.baud))];
  const baudOk = trace.serial.length > 0 && bauds.every((b) => Math.abs(b - BAUD) <= BAUD * 0.03);
  add('baud', baudOk, 'Monitor serie a 9600 baudios',
    trace.serial.length ? `Velocidad detectada: ${bauds.map((b) => Math.round(b)).join(', ')} baudios.` : 'No se recibió ningún texto por el puerto serie.');

  const lines = timedSerialLines(trace.serial);
  const beats = lines.map((l) => ({ m: l.text.match(/^Latido\s*#?\s*(\d+)$/i), t: l.t }))
    .filter((l) => l.m).map((l) => ({ n: Number(l.m[1]), t: l.t }));
  const sequential = beats.length > 0 && beats.every((b, i) => b.n === i + 1);
  // Los encendidos muy cercanos al final de la evaluación pueden no tener su línea completa todavía.
  const required = rises.filter((t) => t <= trace.durationMs - LINE_AFTER_MS).length;
  const countOk = beats.length >= required && beats.length <= rises.length;
  const late = beats.find((b, i) => rises[i] === undefined || b.t < rises[i] - LINE_BEFORE_MS || b.t > rises[i] + LINE_AFTER_MS);
  const timingOk = !late;
  let detail;
  if (!beats.length) {
    detail = `No apareció ninguna línea con el formato «Latido N».${lines.length ? ' Primera línea recibida: «' + lines[0].text.slice(0, 40) + '».' : ''}`;
  } else if (!sequential) {
    detail = `Líneas «Latido»: ${beats.slice(0, 6).map((b) => b.n).join(', ')}${beats.length > 6 ? '…' : ''}; la numeración debe empezar en 1 y aumentar de uno en uno.`;
  } else if (!timingOk) {
    const i = beats.indexOf(late);
    detail = rises[i] === undefined
      ? `«Latido ${late.n}» llegó a los ${Math.round(late.t)} ms, pero el LED solo se encendió ${rises.length} veces.`
      : `«Latido ${late.n}» empezó a los ${Math.round(late.t)} ms, pero el encendido ${i + 1} fue a los ${Math.round(rises[i])} ms. Cada línea debe salir junto a su latido (de ${LINE_BEFORE_MS} ms antes a ${LINE_AFTER_MS} ms después del encendido).`;
  } else if (!countOk) {
    detail = `${beats.length} líneas «Latido» para ${rises.length} encendidos: debe haber una por latido.`;
  } else {
    detail = `${beats.length} líneas «Latido», cada una junto a su encendido.`;
  }
  add('serial', sequential && countOk && timingOk && beats.length >= 4, 'Una línea «Latido N» por latido, a su tiempo', detail);

  return { passed: checks.every((c) => c.ok), checks };
}
