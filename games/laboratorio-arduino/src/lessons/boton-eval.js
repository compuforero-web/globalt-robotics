// Evaluación de las lecciones con pulsador (2.2 «Leer un pulsador» y 2.3 «Flancos y antirrebote»).
// Todo sale de la traza del microcontrolador emulado con el guion reproducible aplicado al pulsador:
//   trace.pins     flancos de las salidas (D13), trace.serial bytes del monitor serie con su instante,
//   trace.input    { pin, contact: [{ t, closed }], modes: [{ t, mode }] }: lo que hizo el pulsador y el modo
//                  (INPUT, INPUT_PULLUP u OUTPUT) que tenía D2 en los registros del chip en cada momento.
// No se mira el texto del programa.
import { timedSerialLines } from '../challenge.js';
import { buildScript } from '../button.js';

export const BUTTON_PIN = 2;
export const LED_PIN = 13;
const BAUD = 9600;
const STARTUP_MS = 300;   // arranque: se aceptan mensajes de bienvenida y el primer estado del LED

/** Guion de la lección 2.2: 5 pulsaciones de 150–600 ms, sin rebotes (un pulsador ideal). */
export const ENTRADA = {
  durationMs: 5000,
  delayMs: 30,            // el LED debe seguir al botón en ≤ 30 ms
  lineMs: 50,             // el mensaje debe empezar en ≤ 50 ms tras el cambio
  ...buildScript([
    { down: 600.25, up: 900.25 },
    { down: 1350.5, up: 1500.5 },
    { down: 2000.75, up: 2600.75 },
    { down: 3100.125, up: 3320.125 },
    { down: 3850.375, up: 4300.375 },
  ]),
};

/** Guion de la lección 2.3: 6 pulsaciones de 120–400 ms; cada pulsación y cada suelta rebota 3–8 veces (0,2–2 ms). */
export const FLANCO = {
  durationMs: 5500,
  responseMs: 60,         // respuesta en ≤ 60 ms desde que el contacto deja de rebotar
  seed: 23,
  ...buildScript([
    { down: 500.3, up: 720.3 },
    { down: 1250.6, up: 1500.6 },
    { down: 2050.1, up: 2170.1 },
    { down: 2700.4, up: 3100.4 },
    { down: 3600.7, up: 3850.7 },
    { down: 4400.2, up: 4700.2 },
  ], { bounce: true, seed: 23 }),
};

export const fmtMs = (ms) => `${Math.round(ms)} ms`;
const fmtS = (ms) => `${(ms / 1000).toFixed(2).replace('.', ',')} s`;
const MODE_TEXT = { pullup: 'entrada con pull-up (INPUT_PULLUP)', input: 'entrada sin resistencia (INPUT)', output: 'salida (OUTPUT)' };

/** Modo de D2 en el instante t, según los cambios registrados. */
function modeAt(modes, t) {
  let mode = 'input';
  for (const m of modes) { if (m.t > t) break; mode = m.mode; }
  return mode;
}

/** Comprobación común: D2 debe estar en INPUT_PULLUP mientras se aplica el guion. */
export function checkInput(trace, firstMs, lastMs) {
  const modes = trace.input?.modes || [];
  const during = [modeAt(modes, firstMs), ...modes.filter((m) => m.t > firstMs && m.t < lastMs).map((m) => m.mode)];
  const bad = during.find((m) => m !== 'pullup');
  let detail;
  if (!bad) detail = 'D2 estuvo como entrada con pull-up interno durante todas las pulsaciones.';
  else if (bad === 'input') detail = 'D2 quedó como entrada sin resistencia (INPUT). Con el botón suelto nada fija su nivel: el pin «flota» y lee ruido (en la simulación, cambios al azar cada pocos milisegundos). Usa INPUT_PULLUP.';
  else detail = 'D2 está configurado como salida (OUTPUT): el programa no puede leer el botón y, al pulsarlo, uniría la salida con GND.';
  return { id: 'entrada', ok: !bad, label: 'D2 como entrada con INPUT_PULLUP', detail };
}

export function checkBaud(trace) {
  const bauds = [...new Set(trace.serial.map((s) => s.baud))];
  const ok = trace.serial.length > 0 && bauds.every((b) => Math.abs(b - BAUD) <= BAUD * 0.03);
  return { id: 'baud', ok, label: 'Monitor serie a 9600 baudios',
    detail: trace.serial.length ? `Velocidad detectada: ${bauds.map((b) => Math.round(b)).join(', ')} baudios.` : 'No se recibió ningún texto por el puerto serie.' };
}

/** Flancos de D13 a partir de `from` ms, con el nivel que había justo antes. */
function ledEdges(trace, from) {
  const all = trace.pins.filter((e) => e.pin === LED_PIN);
  let before = false;
  for (const e of all) { if (e.t >= from) break; before = e.high; }
  return { before, edges: all.filter((e) => e.t >= from), truncated: (trace.truncatedPins || []).includes(LED_PIN) };
}

const levelAt = (start, edges, t) => { let l = start; for (const e of edges) { if (e.t > t) break; l = e.high; } return l; };

// ---------------------------------------------------------------- Lección 2.2

/** Contacto del guion como cambios de estado: [{ t, pressed }]. */
const changesOf = (presses) => presses.flatMap((p) => [{ t: p.down, pressed: true }, { t: p.up, pressed: false }]);

/** Clasifica una línea: 'suelto', 'pulsado' o null. */
function kindOf(text) {
  const t = text.toLowerCase();
  if (t.includes('suelto')) return 'suelto';
  if (t.includes('pulsado')) return 'pulsado';
  return null;
}

/**
 * Reto 2.2: el LED de D13 sigue al pulsador (pulsado = encendido) con ≤ 30 ms de retardo y el monitor serie
 * escribe «Pulsado»/«Suelto» una sola vez en cada cambio.
 */
export function evaluateEntrada(trace, S = ENTRADA) {
  const checks = [];
  const changes = changesOf(S.presses);
  const first = changes[0].t;
  const last = changes[changes.length - 1].t;
  checks.push(checkInput(trace, first, last));

  // LED: en reposo apagado; cada cambio del botón produce exactamente un flanco de D13 en ≤ 30 ms, en el sentido correcto.
  const { before, edges, truncated } = ledEdges(trace, STARTUP_MS);
  let ledDetail = null;
  let worst = 0;
  const idle = levelAt(before, edges, first - 1);
  if (truncated || edges.length > 200) ledDetail = 'D13 cambió cientos de veces: el LED parpadea sin control. Revisa cómo lees D2.';
  else if (!edges.length && !idle) ledDetail = 'D13 nunca se encendió. ¿Configuraste D13 como OUTPUT y lo cambias según digitalRead(2)?';
  else if (idle) ledDetail = `Con el botón suelto (antes de ${fmtS(first)}) el LED ya estaba encendido. Con INPUT_PULLUP la lógica es invertida: suelto = HIGH, pulsado = LOW.`;
  else if (edges.some((e) => e.t < first)) ledDetail = `D13 cambió antes de la primera pulsación (a los ${fmtS(edges[0].t)}), con el botón quieto.`;
  else {
    for (let k = 0; k < changes.length && !ledDetail; k++) {
      const c = changes[k];
      const end = changes[k + 1]?.t ?? trace.durationMs;
      const inside = edges.filter((e) => e.t >= c.t && e.t < end);
      const what = c.pressed ? `pulsar a los ${fmtS(c.t)}` : `soltar a los ${fmtS(c.t)}`;
      const e = inside[0];
      if (!e || e.high !== c.pressed) {
        ledDetail = `Al ${what}, el LED no ${c.pressed ? 'se encendió' : 'se apagó'}${e ? ` (D13 pasó a ${e.high ? 'HIGH' : 'LOW'} a los ${fmtS(e.t)})` : ''}.${c.pressed ? ' Pulsado debe ser encendido: con INPUT_PULLUP, pulsado se lee como LOW.' : ''}`;
      } else if (e.t - c.t > S.delayMs) ledDetail = `Al ${what}, el LED tardó ${fmtMs(e.t - c.t)} en responder (máximo ${S.delayMs} ms). ¿Hay un delay() largo en loop()?`;
      else if (inside.length > 1) ledDetail = `Tras ${what}, D13 cambió ${inside.length} veces: debe cambiar una sola vez por cada cambio del botón.`;
      else worst = Math.max(worst, e.t - c.t);
    }
  }
  checks.push({ id: 'led', ok: !ledDetail, label: 'El LED de D13 sigue al botón (≤ 30 ms)',
    detail: ledDetail || `D13 siguió las ${S.presses.length} pulsaciones; mayor retardo medido: ${worst < 1 ? 'menos de 1 ms' : fmtMs(worst)}.` });

  checks.push(checkBaud(trace));

  // Mensajes: exactamente uno por cambio, del tipo correcto y a tiempo; ninguno más estando quieto.
  const lines = timedSerialLines(trace.serial).filter((l) => l.t >= STARTUP_MS && l.t < trace.durationMs - 30);
  const used = new Set();
  let msgDetail = null;
  for (const c of changes) {
    const want = c.pressed ? 'pulsado' : 'suelto';
    const k = lines.findIndex((l, j) => !used.has(j) && l.t >= c.t && l.t <= c.t + S.lineMs);
    if (k < 0) { msgDetail = `Al ${c.pressed ? 'pulsar' : 'soltar'} a los ${fmtS(c.t)} no apareció ninguna línea en ${S.lineMs} ms.`; break; }
    used.add(k);
    if (kindOf(lines[k].text) !== want) { msgDetail = `Al ${c.pressed ? 'pulsar' : 'soltar'} a los ${fmtS(c.t)} llegó «${lines[k].text.slice(0, 30)}»; se esperaba «${c.pressed ? 'Pulsado' : 'Suelto'}».`; break; }
  }
  if (!msgDetail) {
    const extra = lines.filter((_, j) => !used.has(j));
    if (extra.length) msgDetail = `${extra.length} línea(s) sin cambio del botón, por ejemplo «${extra[0].text.slice(0, 30)}» a los ${fmtS(extra[0].t)}. Escribe solo cuando el estado cambie (compara con la lectura anterior).`;
  }
  checks.push({ id: 'mensajes', ok: !msgDetail && used.size === changes.length, label: 'Un mensaje «Pulsado»/«Suelto» solo al cambiar',
    detail: msgDetail || `${used.size} mensajes para ${changes.length} cambios, sin repeticiones.` });

  return { passed: checks.every((c) => c.ok), checks };
}

// ---------------------------------------------------------------- Lección 2.3

/**
 * Reto 2.3: cada pulsación (con rebotes) alterna el LED una sola vez y escribe «Pulsaciones: N» (1…6),
 * en ≤ 60 ms desde que el contacto deja de rebotar.
 */
export function evaluateFlanco(trace, S = FLANCO) {
  const checks = [];
  const P = S.presses;
  checks.push(checkInput(trace, P[0].down, P[P.length - 1].stableUp));

  const lines = timedSerialLines(trace.serial)
    .map((l) => ({ ...l, m: l.text.match(/pulsaciones\s*:?\s*(-?\d+)/i) }))
    .filter((l) => l.m && l.t < trace.durationMs - 30)
    .map((l) => ({ t: l.t, n: Number(l.m[1]) }))
    .filter((l) => !(l.n === 0 && l.t < P[0].down));   // un «Pulsaciones: 0» al arrancar está permitido
  const nums = lines.map((l) => l.n);
  const seqOk = nums.length === P.length && nums.every((n, i) => n === i + 1);
  const shown = `${nums.slice(0, 8).join(', ')}${nums.length > 8 ? '…' : ''}`;
  checks.push({ id: 'cuenta', ok: seqOk, label: 'Cuenta exacta: «Pulsaciones: 1» … «Pulsaciones: 6»',
    detail: seqOk ? `Se contaron ${P.length} pulsaciones, numeradas de 1 a ${P.length}.`
      : !nums.length ? 'No apareció ninguna línea «Pulsaciones: N».'
        : nums.length > P.length ? `Hubo ${P.length} pulsaciones, pero se escribieron ${nums.length} cuentas (${shown}). Los rebotes se están contando como pulsaciones: añade el antirrebote.`
          : nums.length < P.length ? `Hubo ${P.length} pulsaciones y se escribi${nums.length === 1 ? 'ó 1 cuenta' : `eron ${nums.length} cuentas`} (${shown}). Alguna pulsación no se detectó: ¿la espera de antirrebote es demasiado larga?`
            : `Numeración recibida: ${shown}; debe ir de 1 a ${P.length} sin saltos.` });

  const { edges, truncated } = ledEdges(trace, STARTUP_MS);
  const ledOk = !truncated && edges.length === P.length;
  checks.push({ id: 'led', ok: ledOk, label: `El LED alterna exactamente ${P.length} veces`,
    detail: ledOk ? `D13 cambió ${P.length} veces, una por pulsación.`
      : truncated || edges.length > 200 ? 'D13 cambió cientos de veces.'
        : !edges.length ? 'D13 no cambió nunca. ¿Configuraste D13 como OUTPUT y lo alternas en cada pulsación?'
          : `D13 cambió ${edges.length === 1 ? '1 vez' : `${edges.length} veces`} con ${P.length} pulsaciones${edges.length > P.length ? ': debe cambiar solo en cada pulsación aceptada (¿lo alternan también los rebotes?)' : ''}.` });

  // Respuesta: el k-ésimo cambio de D13 y la k-ésima cuenta llegan tras la pulsación k, a ≤ 60 ms del final del rebote.
  let respDetail = null;
  let worst = 0;
  if (!ledOk || !seqOk) respDetail = 'Se mide cuando la cuenta y el LED son correctos.';
  else {
    for (let k = 0; k < P.length && !respDetail; k++) {
      const p = P[k];
      const limit = p.stableDown + S.responseMs;
      for (const [what, t] of [['el LED', edges[k].t], [`«Pulsaciones: ${k + 1}»`, lines[k].t]]) {
        if (t >= p.up && t <= p.stableUp + S.responseMs) { respDetail = `La pulsación ${k + 1} empezó a los ${fmtS(p.down)}, pero ${what} reaccionó al soltar (${fmtS(t)}). Detecta el flanco de pulsación (de HIGH a LOW con INPUT_PULLUP).`; break; }
        if (t < p.down || t > limit) { respDetail = `La pulsación ${k + 1} empezó a los ${fmtS(p.down)} y rebotó hasta los ${fmtS(p.stableDown)}; ${what} respondió a los ${fmtS(t)} (máximo ${S.responseMs} ms tras el rebote).`; break; }
        worst = Math.max(worst, t - p.stableDown);
      }
    }
  }
  checks.push({ id: 'respuesta', ok: !respDetail, label: `Respuesta en ≤ ${S.responseMs} ms tras cada pulsación`,
    detail: respDetail || `Mayor retardo medido desde el final del rebote: ${worst <= 0 ? 'ninguno (respondió durante el rebote)' : fmtMs(worst)}.` });

  checks.push(checkBaud(trace));
  return { passed: checks.every((c) => c.ok), checks };
}
