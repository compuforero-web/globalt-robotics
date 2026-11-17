// Banco de pruebas: decisiones medidas en los pines del HEX, nunca en el texto del programa.
import { PIN_MAPS } from '../motor.js';

export const EVASOR_PINS = PIN_MAPS.robot;
export const DECISION = {
  durationMs: 7900,
  responseMs: 150,
  script: [
    { t: 0, cm: 100 }, { t: 1037, cm: 18 }, { t: 1831, cm: 32 },
    { t: 2671, cm: 75 }, { t: 3593, cm: 24 }, { t: 4387, cm: 38 },
    { t: 5129, cm: 90 }, { t: 6017, cm: null }, { t: 6893, cm: 80 },
  ],
};
export const decisionStimulus = (script = DECISION.script) => ({
  sonar: { trig: 7, echo: 8, cm: script[0].cm }, sonarScript: script,
  motors: { channels: EVASOR_PINS },
});
const stop = (c) => !c || c.duty <= 0.02 || c.order === 'freno' || c.order === 'libre';
const direction = (c, d) => c?.order === d && c.duty > 0.30;
export function maneuver(a, b) {
  if (stop(a) && stop(b)) return 'parar';
  if (direction(a, 'adelante') && direction(b, 'adelante')) return 'avanzar';
  if (direction(a, 'atras') && direction(b, 'atras')) return 'retroceder';
  if ((direction(a, 'adelante') && direction(b, 'atras')) ||
      (direction(a, 'atras') && direction(b, 'adelante'))) return 'girar';
  return 'otra';
}

/** Intervalos simultáneos de ambos canales. Cambios de pines de <10 ms no cuentan como una maniobra. */
export function decisionPhases(trace) {
  const state = {};
  const phases = [];
  let start = 0;
  let kind = 'parar';
  for (const x of trace.motor?.orders || []) {
    state[x.ch] = x;
    const next = maneuver(state.A, state.B);
    if (next !== kind) {
      phases.push({ start, end: x.t, kind });
      start = x.t; kind = next;
    }
  }
  phases.push({ start, end: trace.durationMs, kind });
  const out = [];
  for (const p of phases) {
    if (p.end - p.start < 10) continue;
    const last = out.at(-1);
    if (last && last.kind === p.kind && p.start - last.end < 10) last.end = p.end;
    else out.push({ ...p });
  }
  return out;
}
const at = (ps, t) => ps.find((p) => p.start <= t && p.end > t)?.kind || 'otra';
const ms = (v) => `${Math.round(v)} ms`;

export function evaluateDecision(trace) {
  const checks = [];
  const add = (id, ok, label, detail) => checks.push({ id, ok: Boolean(ok), label, detail });
  const phases = decisionPhases(trace);
  const distances = trace.sonar?.distances || [];
  const triggers = trace.sonar?.triggers || [];
  const accepted = triggers.filter((x) => x.accepted);
  const echoes = trace.sonar?.echoes || [];
  const outputs = trace.motor?.outputs || [];
  const configured = EVASOR_PINS.every((ch, k) => ['in1', 'in2', 'en'].every((key) => outputs[k]?.[key]));
  add('pines', configured, 'Sensor y dos motores con el mapa del evasor',
    configured ? 'Los dos canales reciben salidas en D2/D4/D5 y D10/D11/D6; D7/D8 quedan para el sensor.' :
      'Configura IN1 D2, IN2 D4, IN3 D10 e IN4 D11 como OUTPUT y activa ENA D5 y ENB D6. No reutilices D7/D8 para motores.');
  const gaps = accepted.slice(1).map((x, k) => x.rise - accepted[k].rise);
  const sensor = accepted.length >= 20 && echoes.length >= 20 &&
    triggers.every((x) => x.accepted) && gaps.every((g) => g >= 60 && g <= 150) &&
    accepted[0].rise <= 150 && trace.durationMs - accepted.at(-1).rise <= 150;
  add('sensor', sensor, 'Mediciones reales separadas entre 60 y 150 ms',
    sensor ? `${accepted.length} disparos y ${echoes.length} ecos; el programa sigue leyendo durante las maniobras.` :
      'Dispara TRIG ≥ 10 µs y mide ECHO con pulseIn y un timeout de hasta 30000 µs. Mantén 60–150 ms entre disparos, también durante el retroceso y el giro.');

  let farProblem = null;
  const far = distances.filter((d) => d.cm !== null && d.cm > 40);
  for (const d of far) {
    const end = distances.find((s) => s.t > d.t)?.t ?? trace.durationMs;
    for (let t = d.t + DECISION.responseMs; t < end - 10; t += 10) {
      if (at(phases, t) !== 'avanzar') { farProblem = `A los ${ms(t)}, con ${d.cm} cm libres, la orden es «${at(phases, t)}». Debe avanzar en ≤150 ms y seguir avanzando.`; break; }
    }
    if (farProblem) break;
  }
  add('avanzar', far.length >= 3 && !farProblem, 'Avanza cuando el camino está libre',
    farProblem || (far.length >= 3 ? 'Avanza tras cada despeje sin esperar más de 150 ms.' : 'Falta el guion de distancias del banco de pruebas.'));

  let nearProblem = null;
  let reverseProblem = null;
  let turnProblem = null;
  const near = distances.filter((d, k) => d.cm !== null && d.cm <= 25 &&
    (k === 0 || distances[k - 1].cm === null || distances[k - 1].cm > 40));
  for (const d of near) {
    const clear = distances.find((s) => s.t > d.t && s.cm !== null && s.cm > 40);
    const end = clear?.t ?? trace.durationMs;
    const stopped = phases.find((p) => p.kind === 'parar' && p.start >= d.t - 10 && p.start <= d.t + 150 && p.end - p.start >= 19); // ±1 ms: resolución del modelo del puente H
    if (!stopped) nearProblem ||= `Obstáculo de ${d.cm} cm a los ${ms(d.t)}: falta parar ambos motores en ≤150 ms durante al menos 20 ms antes de retroceder.`;
    const back = phases.find((p) => p.kind === 'retroceder' && p.start >= (stopped?.end ?? d.t) - 10 && p.start < d.t + 300);
    if (!back || back.end - back.start < 300 || back.end - back.start > 500 || !stopped || stopped.end > back.start + 10) {
      reverseProblem ||= `Tras el obstáculo de los ${ms(d.t)}, retrocede con ambos motores 300–500 ms, después de la parada.`;
      continue;
    }
    for (let t = back.end + 50; t < end - 10; t += 10) {
      if (at(phases, t) !== 'girar') { turnProblem ||= `A los ${ms(t)} debe seguir girando: entre 25 y 40 cm aún no se ha despejado. No avances hasta superar 40 cm.`; break; }
    }
  }
  add('parada', near.length >= 2 && !nearProblem, 'Parada ante cada obstáculo en ≤150 ms', nearProblem || (near.length >= 2 ? 'Ambas detecciones produjeron una parada antes del retroceso.' : 'Faltan las dos aproximaciones del guion.'));
  add('retroceso', near.length >= 2 && !reverseProblem, 'Retroceso de 0,4 s (±0,1 s)', reverseProblem || 'Los dos motores retroceden después de parar.');
  add('giro', near.length >= 2 && !reverseProblem && !turnProblem, 'Gira hasta medir más de 40 cm', turnProblem || reverseProblem || 'Ruedas en sentidos opuestos; mantiene el giro al pasar por 32 y 38 cm.');

  let timeoutProblem = null;
  const absent = distances.filter((d) => d.cm === null);
  for (const d of absent) {
    const end = distances.find((s) => s.t > d.t)?.t ?? trace.durationMs;
    for (let t = d.t + 150; t < end - 10; t += 10) {
      if (at(phases, t) !== 'parar') { timeoutProblem = `Sin eco a los ${ms(t)}: detén ambos motores. Un timeout no significa camino libre.`; break; }
    }
  }
  add('sin-eco', absent.length > 0 && !timeoutProblem, 'Sin eco: parada segura en ≤150 ms', timeoutProblem || (absent.length ? 'Permanece parado sin eco y vuelve a leer el sensor.' : 'Falta el tramo sin eco.'));
  const moving = ['avanzar', 'retroceder', 'girar'].every((kind) => phases.some((p) => p.kind === kind && p.end - p.start > 250 &&
    (trace.motor?.samples || []).some((s) => s.t > p.start + 150 && s.t < p.end &&
      Math.abs(s.v[0]) > 0.1 && Math.abs(s.v[1]) > 0.1 &&
      (kind === 'avanzar' ? s.v[0] > 0 && s.v[1] > 0 : kind === 'retroceder' ? s.v[0] < 0 && s.v[1] < 0 : s.v[0] * s.v[1] < 0))));
  add('motores', moving, 'Los dos ejes responden a las maniobras', moving ? 'Avance, retroceso y giro medidos en los ejes del modelo.' : 'Falta movimiento de ambos motores. EN debe superar la zona muerta del 30 %; la orden de parada y la detención física no son instantáneas.');
  return { passed: checks.every((c) => c.ok), checks };
}
