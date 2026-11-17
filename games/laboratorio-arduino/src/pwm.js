// Medición por ventanas de los pines del microcontrolador emulado (PWM y salidas digitales).
// Solo recibe los flancos que produce el HEX en ejecución (NanoRunner.onPin); no mira el código.
//
// Para cada pin y ventana (20 ms por defecto) calcula:
//   duty  fracción del tiempo en HIGH (0…1). Con 2 o más subidas se mide sobre periodos completos
//         (de la primera a la última subida), que es exacto para una señal PWM estable.
//   freq  frecuencia en Hz: inversa de la mediana de los intervalos entre subidas (incluye el que viene de la
//         ventana anterior). La mediana ignora el pulso suelto que aparece al cambiar analogWrite a mitad de
//         periodo. null con menos de 2 subidas: una salida continua (0 % o 100 %) no tiene frecuencia.
//   rises número de subidas en la ventana; level nivel al final de la ventana.
export const WINDOW_MS = 20;
export const PIN_COUNT = 20;   // D0–D19 (A0–A5 = D14–D19)
const MAX_EDGES = 4096;        // por pin y ventana (16 MHz / 20 ms nunca debería acercarse con PWM por hardware)

export class PwmMeter {
  /**
   * @param {{ windowMs?: number, watch?: number[] }} options  watch = pines que se registran en todas las
   *   ventanas aunque no cambien (los del circuito de la lección); los demás, solo cuando tienen actividad.
   */
  constructor({ windowMs = WINDOW_MS, watch = [] } = {}) {
    this.windowMs = windowMs;
    this.watch = new Set(watch);
    this.start = 0;
    this.pins = Array.from({ length: PIN_COUNT }, () => ({ level: false, edges: [], lastRise: null }));
  }

  /** Flanco observado en `pin` en el instante `t` (ms simulados). */
  edge(pin, high, t) {
    const p = this.pins[pin];
    if (!p || p.level === high) return;
    p.level = high;
    if (p.edges.length < MAX_EDGES) p.edges.push([t, high]);
  }

  /** Cierra la ventana en `end` y devuelve [{ pin, t0, t1, duty, freq, rises, level }]. */
  close(end) {
    const t0 = this.start;
    const out = [];
    if (end > t0) {
      for (let pin = 0; pin < PIN_COUNT; pin++) {
        const p = this.pins[pin];
        const startLevel = p.edges.length ? !p.edges[0][1] : p.level;
        const rises = p.edges.filter(([, h]) => h).map(([t]) => t);
        let duty = highTime(p.edges, startLevel, t0, end) / (end - t0);
        let freq = null;
        if (rises.length >= 2) {
          const first = rises[0];
          const last = rises[rises.length - 1];
          const from = p.lastRise !== null && t0 - p.lastRise < this.windowMs ? [p.lastRise, ...rises] : rises;
          freq = 1000 / median(from.slice(1).map((t, k) => t - from[k]));
          duty = highTime(p.edges, true, first, last) / (last - first);
        }
        if (rises.length) p.lastRise = rises[rises.length - 1];
        if (p.edges.length || duty > 0 || this.watch.has(pin)) {
          out.push({ pin, t0, t1: end, duty: Math.min(1, Math.max(0, duty)), freq, rises: rises.length, level: p.level });
        }
        p.edges = [];
      }
    }
    this.start = end;
    return out;
  }
}

function median(values) {
  const v = [...values].sort((a, b) => a - b);
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/** Tiempo en HIGH entre a y b, partiendo de `level` en a y aplicando los flancos posteriores. */
function highTime(edges, level, a, b) {
  let high = 0;
  let since = a;
  for (const [t, h] of edges) {
    if (t <= a) { level = h; continue; }
    if (t >= b) break;
    if (level) high += t - since;
    level = h;
    since = t;
  }
  if (level) high += b - since;
  return high;
}

/** ¿Ventana PWM con valor intermedio? (no una salida continua ni un cambio aislado) */
export const isPwmWindow = (w) => w.rises >= 2 && w.duty > 0 && w.duty < 1;
