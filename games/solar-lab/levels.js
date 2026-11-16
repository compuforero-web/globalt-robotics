// SolarLab · levels.js — retos y modelos físicos fotovoltaicos
const R = Math.PI / 180, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const fmt = (v, d = 0) => Number(v).toFixed(d);
export const hhmm = h => { const m = Math.round(((h % 24) + 24) % 24 * 60); return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
// Nubosidad determinista (1 = cielo despejado)
export const clouds = (h, s = 1) => clamp(1 - 1.4 * Math.max(0, Math.sin(h * 1.9 + s) * Math.sin(h * 0.71 + 2 * s)) ** 1.5, 0.25, 1);
const sunUp = h => Math.max(0, Math.sin(Math.PI * ((h % 24) - 6) / 12));
// Módulo FV 18 V / 5 A (Vmp/Imp), Voc 22 V, Isc 5.3 A
export const PV = { voc: 22, isc: 5.3, vmp: 18, imp: 5, a: 1.39 };
export const ivI = (V, ns, np, g = 1) => Math.max(0, np * PV.isc * g * (1 - Math.exp((V / ns - PV.voc) / PV.a)));
const rng = s => () => (s = (s * 16807) % 2147483647) / 2147483647;

export const LEVELS = [{
  id: 1, kind: 'tilt', name: 'Ángulo de incidencia', title: 'Nivel 1 · Ángulo de Incidencia y Trayectoria Solar',
  brief: 'Sitio a 35° N en el solsticio de invierno (δ = −23.45°). El módulo de 320 W mira al sur. Ajusta la inclinación para cosechar al menos 1 330 Wh en el día pese a las nubes pasajeras. Pista: en invierno el sol va bajo.',
  controls: [{ id: 'tilt', label: 'Inclinación del panel', type: 'range', min: 0, max: 60, step: 1, v: 10, unit: '°' }],
  chart: { x: 'h', ys: [['G', '#f59e0b', 'Irradiancia W/m²'], ['pv', '#38bdf8', 'Potencia W']] },
  simulate(p) {
    const fr = [], ph = 35 * R, d = -23.45 * R, b = p.tilt * R, dt = 0.05; let E = 0;
    for (let h = 6; h <= 18.001; h += dt) {
      const w = 15 * (h - 12) * R, sa = Math.sin(ph) * Math.sin(d) + Math.cos(ph) * Math.cos(d) * Math.cos(w);
      const ct = Math.sin(ph - b) * Math.sin(d) + Math.cos(ph - b) * Math.cos(d) * Math.cos(w), c = clouds(h, 2);
      const dni = sa > 0.01 ? 1353 * 0.7 ** ((1 / sa) ** 0.678) : 0;
      const G = c * (dni * Math.max(0, ct) + 0.1 * dni * (1 + Math.cos(b)) / 2), pv = G * 1.6 * 0.2;
      E += pv * dt;
      fr.push({ h, el: Math.asin(sa) / R, az: (h - 6) / 12, cl: c, tilt: p.tilt, th: Math.acos(clamp(ct, -1, 1)) / R, G, pv, E });
    }
    const ok = E >= 1330;
    return { fr, ok, msg: ok ? `¡Excelente! ${fmt(E)} Wh cosechados con ${p.tilt}°: el panel queda casi perpendicular al sol bajo de invierno.` : `Solo ${fmt(E)} Wh (meta 1 330 Wh). Reduce el ángulo de incidencia θ al mediodía.`,
      stats: { 'Latitud': '35° N', 'Declinación': '−23.45°', 'Inclinación': p.tilt + '°', 'Energía diaria': fmt(E) + ' Wh', 'Meta': '1330 Wh' } };
  },
  live: f => [['Hora', hhmm(f.h)], ['Elevación solar', fmt(f.el, 1) + '°'], ['Incidencia θ', fmt(f.th, 1) + '°'], ['Irradiancia', fmt(f.G) + ' W/m²'], ['Potencia', fmt(f.pv) + ' W'], ['Energía', fmt(f.E) + ' Wh']]
}, {
  id: 2, kind: 'array', name: 'Serie vs. Paralelo', title: 'Nivel 2 · Conexión Serie vs. Paralelo',
  brief: 'Tienes 4 módulos de 18 V / 5 A (Voc 22 V). El controlador exige 36 V / 10 A en el punto de máxima potencia y admite máx. 50 V de Voc (con +10 % por frío) y 12 A. Elige la conexión correcta sin quemarlo.',
  controls: [{ id: 'cfg', label: 'Arreglo', type: 'select', v: '4S1P', opts: [['4S1P', 'Serie 4S'], ['1S4P', 'Paralelo 4P'], ['2S2P', 'Mixto 2S2P'], ['3S1P', 'Mixto 3S + 1 suelto']] },
    { id: 'g', label: 'Irradiancia de prueba', type: 'range', min: 200, max: 1000, step: 50, v: 1000, unit: ' W/m²' }],
  chart: { x: 'V', ys: [['I', '#38bdf8', 'Corriente A'], ['P', '#f59e0b', 'Potencia W']] },
  simulate(p) {
    const ns = +p.cfg[0], np = +p.cfg[2], g = p.g / 1000, vocC = ns * PV.voc * 1.1, fr = [];
    const vmp = ns * PV.vmp, imp = np * PV.imp;
    for (let i = 0; i <= 80; i++) { const V = vocC * i / 80, I = ivI(V, ns, np, g); fr.push({ V, I, P: V * I, ns, np, cfg: p.cfg, burn: V > 50, g }); }
    let ok = false, msg;
    if (vocC > 50) msg = `¡Sobrevoltaje! Voc en frío = ${fmt(vocC, 1)} V > 50 V. El controlador se quemó.`;
    else if (imp > 12) msg = `¡Sobrecorriente! ${imp} A supera los 12 A del controlador.`;
    else if (vmp !== 36 || imp !== 10) msg = `Punto MPP ${vmp} V / ${imp} A no coincide con 36 V / 10 A.`;
    else { ok = true; msg = `¡Correcto! 2S2P entrega 36 V / 10 A (360 W) con Voc frío ${fmt(vocC, 1)} V dentro del límite.`; }
    return { fr, ok, msg, stats: { 'Arreglo': p.cfg, 'Vmp': vmp + ' V', 'Imp': imp + ' A', 'Pmp': vmp * imp + ' W', 'Voc frío': fmt(vocC, 1) + ' V', 'Límite': '50 V / 12 A' } };
  },
  live: f => [['Arreglo', f.cfg], ['Tensión', fmt(f.V, 1) + ' V'], ['Corriente', fmt(f.I, 2) + ' A'], ['Potencia', fmt(f.P) + ' W'], ['Irradiancia', fmt(f.g * 1000) + ' W/m²'], ['Estado', f.burn ? '⚠ SOBREVOLTAJE' : 'OK']]
}, {
  id: 3, kind: 'chain', name: 'Baterías y MPPT', title: 'Nivel 3 · Banco de Baterías y Controlador MPPT',
  brief: 'Arreglo 4S de 720 W (72 V) por cable largo. Cargas: LED 40 W (18–23 h), router/antena 15 W 24 h y refrigerador 120 W (40 % ciclo) vía inversor 90 %. La batería amanece casi vacía: el sol debe recargarla y luego cubrir toda la noche sin apagón, respetando la DoD segura (AGM ≤ 50 %, LiFePO₄ ≤ 80 %) y sin sobredimensionar (> 2.5× la necesidad).',
  controls: [{ id: 'v', label: 'Tensión del banco', type: 'select', v: '12', opts: [['12', '12 V'], ['24', '24 V']] },
    { id: 'chem', label: 'Química', type: 'select', v: 'AGM', opts: [['AGM', 'Plomo AGM'], ['LFP', 'LiFePO₄']] },
    { id: 'ah', label: 'Capacidad', type: 'range', min: 50, max: 400, step: 10, v: 100, unit: ' Ah' },
    { id: 'dod', label: 'Profundidad de descarga (DoD)', type: 'range', min: 20, max: 100, step: 5, v: 70, unit: ' %' },
    { id: 'ctl', label: 'Controlador', type: 'select', v: 'PWM', opts: [['PWM', 'PWM'], ['MPPT', 'MPPT']] }],
  chart: { x: 'h', ys: [['pv', '#f59e0b', 'FV W'], ['load', '#f97316', 'Carga W'], ['soc', '#22c55e', 'SoC %']] },
  simulate(p) {
    const V = +p.v, cap = V * p.ah, dod = p.dod / 100, safe = p.chem === 'AGM' ? 0.5 : 0.8;
    const eff = p.ctl === 'MPPT' ? 0.96 : V * 1.2 / 72, floor = cap * (1 - dod), fr = [];
    const load = h => { const hh = h % 24; return (15 + (((h * 60) % 50) < 20 ? 120 : 0) + (hh >= 18 && hh < 23 ? 40 : 0) + (hh >= 9 && hh < 17 ? 50 : 0)) / 0.9; };
    let E = floor + 0.1 * cap, out = null, nightNeed = 0;
    for (let h = 18; h < 30; h += 0.05) nightNeed += load(h) * 0.05;
    for (let h = 6; h <= 30.001; h += 0.1) {
      const pv = 720 * 0.75 * sunUp(h) * clouds(h, 5) * eff, ld = out ? 0 : load(h);
      E = Math.min(cap, E + (pv * 0.95 - ld) * 0.1);
      if (E < floor) { E = floor; out ??= h; }
      fr.push({ h, el: sunUp(h) * 60 - (sunUp(h) ? 0 : 20), az: ((h % 24) - 6) / 12, cl: clouds(h, 5), pv, load: ld, soc: 100 * E / cap, n: 4, ctl: p.ctl, out: out !== null, kind: 'bank' });
    }
    const usable = cap * dod, over = usable > 2.5 * nightNeed; let ok = false, msg;
    if (dod > safe) msg = `DoD ${p.dod} % excede el máximo seguro de ${p.chem} (${safe * 100} %): vida útil muy corta.`;
    else if (out) msg = `¡Apagón a las ${hhmm(out)}! ${p.ctl === 'PWM' ? 'El PWM desperdicia la tensión del arreglo de 72 V.' : 'Banco insuficiente.'} Necesidad nocturna ≈ ${fmt(nightNeed)} Wh.`;
    else if (over) msg = `Sin apagón, pero el banco está sobredimensionado (${fmt(usable)} Wh útiles vs ${fmt(nightNeed)} Wh): costo y peso excesivos.`;
    else { ok = true; msg = `¡Sistema estable! ${fmt(usable)} Wh útiles cubren ${fmt(nightNeed)} Wh nocturnos con ${p.ctl}.`; }
    return { fr, ok, msg, stats: { 'Banco': `${V} V · ${p.ah} Ah (${fmt(cap)} Wh)`, 'Química': p.chem, 'DoD': p.dod + ' %', 'Energía útil': fmt(usable) + ' Wh', 'Necesidad noche': fmt(nightNeed) + ' Wh', 'Controlador': `${p.ctl} (η ${fmt(eff * 100)} %)` } };
  },
  live: f => [['Hora', hhmm(f.h)], ['Generación FV', fmt(f.pv) + ' W'], ['Consumo', fmt(f.load) + ' W'], ['Estado de carga', fmt(f.soc) + ' %'], ['Controlador', f.ctl], ['Suministro', f.out ? '⚠ APAGÓN' : 'OK']]
}, {
  id: 4, kind: 'track', name: 'Seguidor Arduino + LDR', title: 'Nivel 4 · Seguidor Solar de 1 Eje con Arduino + LDR',
  brief: 'Un Arduino Nano compara dos LDR separadas por una aleta de sombra y mueve un servo. Calibra sensibilidades iguales, una histéresis que ignore el ruido (±18 cuentas) y un paso de servo adecuado. Meta: error medio ≤ 5°, ≤ 12 inversiones de giro y ≤ 110 movimientos.',
  controls: [{ id: 'gL', label: 'Sensibilidad LDR izquierda', type: 'range', min: 0.5, max: 1.5, step: 0.05, v: 1.2, unit: '×' },
    { id: 'gR', label: 'Sensibilidad LDR derecha', type: 'range', min: 0.5, max: 1.5, step: 0.05, v: 0.9, unit: '×' },
    { id: 'hy', label: 'Histéresis (banda muerta)', type: 'range', min: 0, max: 150, step: 5, v: 10, unit: ' ADC' },
    { id: 'st', label: 'Paso del servomotor', type: 'range', min: 1, max: 10, step: 1, v: 8, unit: '°' }],
  chart: { x: 'h', ys: [['sun', '#f59e0b', 'Sol °'], ['pan', '#38bdf8', 'Panel °'], ['err', '#ef4444', '|Error| °']] },
  simulate(p) {
    const r = rng(7), fr = []; let pan = 0, moves = 0, rev = 0, last = 0, se = 0, E = 0, E0 = 0;
    for (let i = 0; i <= 360; i++) {
      const h = 6 + i / 30, sun = -75 + 150 * i / 360, G = (0.3 + 0.7 * sunUp(h)) * clouds(h, 9), e = (sun - pan) * R;
      const L = clamp(p.gL * G * (512 + 460 * Math.sin(e)) + (r() - 0.5) * 36, 0, 1023), Rr = clamp(p.gR * G * (512 - 460 * Math.sin(e)) + (r() - 0.5) * 36, 0, 1023), d = L - Rr;
      let dir = d > p.hy ? 1 : d < -p.hy ? -1 : 0;
      if (dir) { pan = clamp(pan + dir * p.st, -75, 75); moves++; if (last && dir !== last) rev++; last = dir; }
      const err = Math.abs(sun - pan); se += err; E += 320 * G * Math.max(0, Math.cos(err * R)) / 30; E0 += 320 * G * Math.cos(sun * R) / 30;
      fr.push({ h, sun, pan, err, L, R: Rr, cl: clouds(h, 9), el: 90 - Math.abs(sun), moves, rev });
    }
    const me = se / fr.length, sWh = moves * 0.12, ok = me <= 5 && rev <= 12 && moves <= 110;
    const why = me > 5 ? `error medio ${fmt(me, 1)}° (revisa sensibilidades o paso)` : rev > 12 ? `${rev} inversiones: el panel vibra (sube la histéresis)` : `${moves} movimientos gastan ${fmt(sWh, 1)} Wh (paso muy fino)`;
    return { fr, ok, msg: ok ? `¡Seguimiento estable! Error ${fmt(me, 1)}°, ${moves} pasos, +${fmt((E / E0 - 1) * 100)} % de energía vs. panel fijo.` : `Ajusta el seguidor: ${why}.`,
      stats: { 'Error medio': fmt(me, 1) + '°', 'Movimientos': moves, 'Inversiones': rev, 'Consumo servo': fmt(sWh, 1) + ' Wh', 'Ganancia vs fijo': '+' + fmt((E / E0 - 1) * 100) + ' %' } };
  },
  live: f => [['Hora', hhmm(f.h)], ['Sol', fmt(f.sun, 1) + '°'], ['Panel (servo)', fmt(f.pan + 90) + '°'], ['LDR izq / der', `${fmt(f.L)} / ${fmt(f.R)}`], ['Error', fmt(f.err, 1) + '°'], ['Movimientos', f.moves]]
}, {
  id: 5, kind: 'chain', name: 'Microrred autónoma', title: 'Nivel 5 · Microrred Solar Autónoma (Proyecto Final)',
  brief: 'Vivienda/nodo rural Off-Grid 24 V: router+antena, refrigerador, luces, TV y bomba de agua de 900 W (07–08 h). Presupuesto US$ 3 300 y peso máx. 160 kg. Supera 48 h aceleradas: día 1 soleado, día 2 nublado, sin bajar del 10 % de SoC.',
  controls: [{ id: 'n', label: 'Paneles 400 W (US$170 · 21 kg)', type: 'range', min: 1, max: 8, step: 1, v: 2, unit: ' u' },
    { id: 'b', label: 'Baterías LiFePO₄ 24 V 100 Ah (US$950 · 22 kg)', type: 'range', min: 1, max: 4, step: 1, v: 1, unit: ' u' },
    { id: 'm', label: 'Controlador MPPT', type: 'select', v: '30', opts: [['30', '30 A (US$110 · 2 kg)'], ['60', '60 A (US$240 · 4 kg)']] },
    { id: 'inv', label: 'Inversor onda pura', type: 'select', v: '1000', opts: [['1000', '1000 W (US$180 · 8 kg)'], ['2000', '2000 W (US$320 · 13 kg)'], ['3000', '3000 W (US$520 · 20 kg)']] }],
  chart: { x: 'h', ys: [['pv', '#f59e0b', 'FV W'], ['load', '#f97316', 'Carga W'], ['soc', '#22c55e', 'SoC %']] },
  simulate(p) {
    const inv = { 1000: [180, 8], 2000: [320, 13], 3000: [520, 20] }[p.inv], mp = p.m === '60' ? [240, 4, 1620] : [110, 2, 810];
    const cost = 250 + p.n * 170 + p.b * 950 + mp[0] + inv[0], kg = 15 + p.n * 21 + p.b * 22 + mp[1] + inv[1], cap = p.b * 2560, fr = [];
    const load = h => { const hh = h % 24; return (45 + (((h * 60) % 50) < 20 ? 120 : 0) + (hh >= 18 && hh < 23 ? 60 : 0) + (hh >= 19 && hh < 22 ? 100 : 0) + (hh >= 7 && hh < 8 ? 900 : 0)) / 0.92; };
    const peak = (45 + 120 + 900) / 0.92; let E = cap * 0.5, out = null, clip = 0;
    for (let h = 0; h <= 48.001; h += 0.1) {
      const c = h < 24 ? clouds(h, 4) * 0.3 + 0.7 : 0.18 + 0.12 * clouds(h, 6), raw = p.n * 400 * 0.8 * sunUp(h) * c, pv = Math.min(raw, mp[2]) * 0.97;
      clip = Math.max(clip, raw - mp[2]); const ld = out ? 0 : load(h);
      E = Math.min(cap, E + (pv * 0.96 - ld) * 0.1);
      if (E < cap * 0.1) { E = cap * 0.1; out ??= h; }
      fr.push({ h, el: sunUp(h) * 60 - (sunUp(h) ? 0 : 20), az: ((h % 24) - 6) / 12, cl: c, pv, load: ld, soc: 100 * E / cap, n: p.n, ctl: 'MPPT ' + p.m + 'A', out: out !== null, kind: 'house', inv: +p.inv });
    }
    let ok = false, msg;
    if (cost > 3300) msg = `Presupuesto excedido: US$ ${cost} > US$ 3 300.`;
    else if (kg > 160) msg = `Peso excedido: ${kg} kg > 160 kg.`;
    else if (+p.inv < peak * 1.25) msg = `El inversor de ${p.inv} W no soporta el arranque de la bomba (pico ${fmt(peak)} W × 1.25).`;
    else if (out) msg = `¡Apagón en la hora ${fmt(out, 1)} (${out < 24 ? 'día 1' : 'día 2 nublado'})! Más generación o almacenamiento.`;
    else { ok = true; msg = `¡Microrred certificada! 48 h sin apagón · US$ ${cost} · ${kg} kg.${clip > 0 ? ' (El MPPT recorta ' + fmt(clip) + ' W pico.)' : ''}`; }
    return { fr, ok, msg, stats: { 'Generador FV': `${p.n} × 400 W = ${p.n * 400} Wp`, 'Banco': `${p.b} × 2.56 kWh = ${fmt(cap / 1000, 2)} kWh`, 'Controlador': `MPPT ${p.m} A`, 'Inversor': `${p.inv} W onda pura`, 'Costo': `US$ ${cost} / 3300`, 'Peso': `${kg} / 160 kg` } };
  },
  live: f => [['Tiempo', `Día ${f.h < 24 ? 1 : 2} · ${hhmm(f.h)}`], ['Generación FV', fmt(f.pv) + ' W'], ['Consumo', fmt(f.load) + ' W'], ['Estado de carga', fmt(f.soc) + ' %'], ['Cielo', f.cl > 0.6 ? 'Soleado' : 'Nublado'], ['Suministro', f.out ? '⚠ APAGÓN' : 'OK']]
}];
