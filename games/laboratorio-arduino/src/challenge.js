// Evalúa el reto a partir de la traza del microcontrolador emulado (pines y bytes serie medidos).
// No mira el texto del programa: solo el comportamiento observado.
export const EVAL_DURATION_MS = 5000;
const PIN = 13;
const ON_MS = 200;
const OFF_MS = 800;
const TOLERANCE = 0.1;
const BAUD = 9600;

const within = (value, expected) => Math.abs(value - expected) <= expected * TOLERANCE;

/** Separa los bytes recibidos en líneas de texto. */
export function serialLines(serial) {
  const text = serial.map((s) => String.fromCharCode(s.byte)).join('');
  return text.split(/\r?\n/).map((l) => l.replace(/\r/g, '').trim()).filter(Boolean);
}

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

  const lines = serialLines(trace.serial);
  const numbers = lines.map((l) => l.match(/^Latido\s*#?\s*(\d+)$/i)).filter(Boolean).map((m) => Number(m[1]));
  const sequential = numbers.length > 0 && numbers.every((n, i) => n === i + 1);
  const countOk = Math.abs(numbers.length - rises.length) <= 1;
  add('serial', sequential && countOk && numbers.length >= 4, 'Una línea «Latido N» por latido',
    numbers.length
      ? `Líneas «Latido»: ${numbers.slice(0, 6).join(', ')}${numbers.length > 6 ? '…' : ''} (${numbers.length} líneas para ${rises.length} latidos)${sequential ? '' : '; la numeración debe empezar en 1 y aumentar de uno en uno'}.`
      : `No apareció ninguna línea con el formato «Latido N».${lines.length ? ' Primera línea recibida: «' + lines[0].slice(0, 40) + '».' : ''}`);

  return { passed: checks.every((c) => c.ok), checks };
}
