// Radar Ultrasónico · 5 retos progresivos (Arduino Nano + HC-SR04 + SG90 + buzzer/LEDs)
import { C, W, H, clamp, rad, usFromCm, audio, grid, text, sensor, cone, echoAnim, scope, box, ruler, radar, robot, rayDist } from './sim.js';
const SX = 70, PX = 2.6;                 // sensor (x) y escala px/cm
const cmAt = x => (x - SX - 6) / PX, xAt = d => SX + 6 + d * PX;
const say = (s, m, tone = 'warn') => { s.msg = m; s.tone = tone; };
const win = (s, m) => { s.won = true; say(s, m, 'ok'); };
// ---------- Nivel 1 · Física del eco ----------
const L1 = {
  title: 'Física del Eco', act: 'Medir',
  goal: 'Arrastra el obstáculo frente al HC-SR04. Observa el pulso ECHO (µs) y el cálculo d = t·0.0343/2. Colócalo en cada distancia objetivo (±1.5 cm) y pulsa «Medir». Acierta 3.', controls: [],
  init(s) { s.ox = xAt(80); s.tg = [25, 62, 118]; s.k = 0; },
  code(s) { const cm = cmAt(s.ox); return { cm, us: usFromCm(cm) }; },
  draw(c, s) {
    const Y = 150, { cm, us } = this.code(s); grid(c); ruler(c, xAt(0), Y + 58, PX, 200);
    cone(c, SX + 6, Y, 0, rad(7.5), W, C.cy, .05); echoAnim(c, SX, Y, s.ox, s.t);
    box(c, s.ox, Y - 45, 22, 90, C.or, s.drag); sensor(c, SX, Y);
    text(c, `${cm.toFixed(1)} cm`, s.ox + 11, Y - 60, C.or, 14, 'center', true);
    text(c, s.k < 3 ? `Objetivo ${s.k + 1}/3: ${s.tg[s.k]} cm` : '✔ 3/3 distancias', 20, 26, C.gr, 16, 'left', true);
    text(c, `d = (${Math.round(us)} µs × 0.0343) / 2 = ${cm.toFixed(1)} cm`, 20, 290, C.tx, 14, 'left', true);
    scope(c, 20, 312, W - 40, us, usFromCm(200));
  },
  down(s, x, y) { s.drag = Math.abs(x - s.ox - 11) < 34 && Math.abs(y - 150) < 64; },
  move(s, x) { if (s.drag) s.ox = clamp(x - 11, xAt(3), xAt(200)); }, up(s) { s.drag = false; },
  action(s) {
    if (s.k >= 3) return; const d = cmAt(s.ox), tg = s.tg[s.k];
    if (Math.abs(d - tg) > 1.5) return say(s, `Lectura ${d.toFixed(1)} cm: demasiado ${d > tg ? 'lejos' : 'cerca'} del objetivo (${tg} cm).`, 'err'); s.k++; audio.beep(1500);
    if (s.k === 3) win(s, '¡Dominas la física del eco! El sonido recorre ida y vuelta: por eso se divide entre 2.');
    else say(s, `✔ ${d.toFixed(1)} cm ↔ ECHO ${Math.round(usFromCm(d))} µs. Siguiente objetivo: ${s.tg[s.k]} cm.`, 'ok');
  },
};
// ---------- Nivel 2 · Calibración y cono ----------
const SCN = [
  { n: 'Intruso a 40 cm', o: [{ d: 40, a: 0 }], e: true },
  { n: 'Pared de fondo a 90 cm', o: [{ d: 90, a: 0, w: 1 }], e: false },
  { n: 'Columna lateral a 30 cm (25°)', o: [{ d: 30, a: 25 }], e: false },
  { n: 'Intruso a 48 cm + pared', o: [{ d: 48, a: -4 }, { d: 90, a: 0, w: 1 }], e: true },
];
const seen = (p, o) => Math.abs(o.a) <= (p.cone ? 7.5 : 35) && o.d <= p.thr;
const L2 = {
  title: 'Calibración y Cono de Detección', act: 'Probar escenarios',
  goal: 'Zona protegida: 50 cm. Ajusta el umbral para detectar intrusos (≤ 50 cm) sin disparar con la pared del fondo (90 cm) y filtra los ecos fuera del cono de 15° para evitar falsas alarmas. Toca el lienzo para cambiar de escenario.',
  controls: [{ id: 'thr', type: 'range', label: 'Umbral de alarma', min: 10, max: 150, val: 120, unit: 'cm' },
    { id: 'cone', type: 'check', label: 'Filtrar ecos fuera del cono 15°', val: false }],
  init(s) { s.off = 0; s.res = null; },
  update(s) { s.sc = Math.floor((s.t + s.off) / 3) % SCN.length; },
  code: s => s.p,
  draw(c, s) {
    const Y = 200, sc = SCN[s.sc], p = s.p, on = sc.o.some(o => seen(p, o)); grid(c); cone(c, SX + 6, Y, 0, rad(35), W, C.mu, .05); cone(c, SX + 6, Y, 0, rad(7.5), W, C.cy, .12);
    c.strokeStyle = C.ye; c.lineWidth = 2; c.setLineDash([6, 6]); c.beginPath();
    c.arc(SX + 6, Y, p.thr * PX, -rad(38), rad(38)); c.stroke(); c.setLineDash([]);
    text(c, `umbral ${p.thr} cm`, xAt(p.thr) + 6, Y - 120, C.ye, 11);
    for (const o of sc.o) {
      const hit = seen(p, o), col = hit ? C.or : C.mu, x = SX + 6 + Math.cos(rad(o.a)) * o.d * PX, y = Y + Math.sin(rad(o.a)) * o.d * PX;
      if (o.w) box(c, x, Y - 130, 16, 260, col, hit); else box(c, x - 10, y - 18, 20, 36, col, hit);
    }
    sensor(c, SX, Y); text(c, `Escenario ${s.sc + 1}/4: ${sc.n}`, 20, 24, C.tx, 14, 'left', true);
    c.fillStyle = on ? C.rd : '#1e293b'; c.beginPath(); c.arc(W - 30, 24, 10, 0, 7); c.fill();
    text(c, on ? 'ALARMA' : 'SIN ALARMA', W - 48, 24, on ? C.rd : C.mu, 13, 'right', true);
    if (s.res) s.res.forEach((r, i) => text(c, `${r ? '✔' : '✘'} ${SCN[i].n} → ${SCN[i].e ? 'alarma' : 'silencio'}`, 20, 300 + i * 22, r ? C.gr : C.rd, 12));
  },
  down(s) { s.off += 3 - ((s.t + s.off) % 3); },
  action(s) {
    s.res = SCN.map(sc => sc.o.some(o => seen(s.p, o)) === sc.e); const n = s.res.filter(Boolean).length;
    if (n === 4) return win(s, 'Sensor calibrado: alarma solo para intrusos dentro del cono y de la zona protegida.');
    const hint = !s.res[0] || !s.res[3] ? 'El umbral es demasiado bajo.' : !s.res[1] ? 'El umbral alcanza la pared del fondo.' : 'Los ecos laterales generan falsas alarmas: activa el filtro del cono.';
    say(s, `${n}/4 escenarios correctos. ${hint}`, 'err');
  },
};
// ---------- Nivel 3 · Sensor de reversa ----------
const zone = (p, d) => d > p.y ? 'G' : d >= p.r ? 'Y' : 'R';
const ZC = { G: C.gr, Y: C.ye, R: C.rd }, CHK = [[80, 'G'], [52, 'G'], [48, 'Y'], [35, 'Y'], [22, 'Y'], [18, 'R'], [10, 'R']];
const L3 = {
  title: 'Sensor de Reversa Progresivo', act: 'Prueba de aproximación',
  goal: 'Configura las zonas: verde > 50 cm, amarillo 20–50 cm y rojo < 20 cm (pitido rápido). Arrastra la pared para probar y supera la prueba automática de aproximación.',
  controls: [{ id: 'y', type: 'range', label: 'Límite amarillo', min: 10, max: 100, val: 70, unit: 'cm' },
    { id: 'r', type: 'range', label: 'Límite rojo', min: 5, max: 60, val: 10, unit: 'cm' }],
  init(s) { s.wx = xAt(120); s.test = null; s.bt = 0; },
  code: s => s.p,
  update(s, dt) {
    const T = s.test; if (T) {
      s.wx -= 30 * PX * dt; const d = cmAt(s.wx);
      while (T.i < CHK.length && d <= CHK[T.i][0]) { T.log.push(zone(s.p, CHK[T.i][0]) === CHK[T.i][1]); T.i++; }
      if (d <= 6) { s.test = null; const n = T.log.filter(Boolean).length;
        if (n === CHK.length) win(s, '¡Prueba superada! Verde > 50 cm, amarillo 20–50 cm, rojo < 20 cm.');
        else say(s, `${n}/${CHK.length} puntos de control correctos. Revisa los límites.`, 'err');
      }
    }
    const z = zone(s.p, cmAt(s.wx)); s.bt -= dt;
    if ((T || s.drag) && z !== 'G' && s.bt <= 0) { audio.beep(z === 'R' ? 1800 : 1200, .06, .035); s.bt = z === 'R' ? .13 : .45; }
  },
  draw(c, s) {
    const Y = 170, d = cmAt(s.wx), z = zone(s.p, d), p = s.p; grid(c);
    [[0, p.r, C.rd], [p.r, p.y, C.ye], [p.y, 150, C.gr]].forEach(([a, b, col]) => {
      if (b > a) { c.fillStyle = col + '30'; c.fillRect(xAt(a), Y + 50, (b - a) * PX, 14); }
    });
    ruler(c, xAt(0), Y + 70, PX, 150);
    c.fillStyle = '#334155'; c.beginPath(); c.roundRect(-30, Y - 60, SX + 14, 120, 12); c.fill();
    c.fillStyle = C.rd; c.fillRect(SX - 22, Y - 52, 6, 22); c.fillRect(SX - 22, Y + 30, 6, 22);
    echoAnim(c, SX, Y, s.wx, s.t); box(c, s.wx, Y - 70, 24, 140, ZC[z], true); sensor(c, SX, Y);
    text(c, `${d.toFixed(0)} cm`, s.wx + 12, Y - 84, ZC[z], 16, 'center', true);
    ['G', 'Y', 'R'].forEach((k, i) => {
      c.fillStyle = k === z ? ZC[k] : '#1e293b'; c.save(); if (k === z) { c.shadowColor = ZC[k]; c.shadowBlur = 16; }
      c.beginPath(); c.arc(W - 110 + i * 36, 30, 12, 0, 7); c.fill(); c.restore();
    });
    text(c, s.test ? 'PRUEBA EN CURSO…' : 'Arrastra la pared', 20, 26, C.tx, 14, 'left', true);
    CHK.forEach(([cd, ez], i) => {
      const r = s.test?.log[i] ?? s.last?.[i]; c.fillStyle = ZC[ez]; c.beginPath(); c.arc(xAt(cd), Y + 120, 5, 0, 7); c.fill();
      if (r !== undefined) text(c, r ? '✔' : '✘', xAt(cd), Y + 138, r ? C.gr : C.rd, 12, 'center');
    });
    text(c, 'Puntos de control de la prueba', xAt(0), Y + 160, C.mu, 11); if (s.test) s.last = s.test.log;
  },
  down(s, x, y) { if (!s.test) s.drag = Math.abs(x - s.wx - 12) < 36 && Math.abs(y - 170) < 80; },
  move(s, x) { if (s.drag) s.wx = clamp(x - 12, xAt(4), xAt(150)); }, up(s) { s.drag = false; },
  action(s) { s.test = { i: 0, log: [] }; s.last = null; s.wx = xAt(150); say(s, 'El obstáculo se aproxima…', 'info'); },
};
// ---------- Nivel 4 · Radar de barrido ----------
const CX = 320, CY = 382, R = 290, MAXC = 100, K = R / MAXC;
const pol = (a, d) => [CX + Math.cos(rad(a)) * d * K, CY - Math.sin(rad(a)) * d * K];
const toPol = m => ({ a: Math.round(Math.atan2(CY - m.y, m.x - CX) * 180 / Math.PI), d: Math.round(Math.hypot(m.x - CX, CY - m.y) / K) });
const L4 = {
  title: 'Radar de Barrido SG90 + HC-SR04', act: 'Comprobar marcas',
  goal: 'El microservo SG90 barre de 0° a 180°. Cada eco deja un blip que se desvanece: toca el radar para marcar la posición exacta de los 3 objetos ocultos (toca una marca para quitarla). Tolerancia: 8 cm.',
  controls: [{ id: 'v', type: 'range', label: 'Velocidad del servo', min: 20, max: 120, val: 60, unit: '°/s' }],
  init(s) {
    s.a = 0; s.dir = 1; s.mk = []; s.ob = []; s.rev = false; while (s.ob.length < 3) { const a = 15 + Math.random() * 150, d = 25 + Math.random() * 65; if (s.ob.every(o => Math.abs(o.a - a) > 25)) s.ob.push({ a, d, v: 0 }); }
  },
  code: s => ({ v: s.p.v, mk: s.mk.map(toPol) }),
  update(s, dt) {
    const a0 = s.a; s.a += s.dir * s.p.v * dt; if (s.a >= 180 || s.a <= 0) { s.a = clamp(s.a, 0, 180); s.dir *= -1; }
    for (const o of s.ob) {
      if ((o.a - a0) * (o.a - s.a) <= 0) { audio.beep(950, .05, .03); o.v = 1; } else o.v = Math.max(0, o.v - dt * .3);
    }
  },
  draw(c, s) {
    grid(c); radar(c, CX, CY, R, MAXC, s.a, s.dir);
    for (const o of s.ob) {
      const [x, y] = pol(o.a, o.d);
      if (o.v > 0) { c.save(); c.globalAlpha = o.v; c.shadowColor = C.gr; c.shadowBlur = 14; c.fillStyle = C.gr; c.beginPath(); c.arc(x, y, 7, 0, 7); c.fill(); c.restore(); }
      if (s.rev) { c.strokeStyle = C.cy; c.lineWidth = 2; c.beginPath(); c.arc(x, y, 8 * K, 0, 7); c.stroke(); }
    }
    for (const m of s.mk) {
      const q = toPol(m); c.strokeStyle = C.or; c.lineWidth = 2; c.beginPath();
      c.moveTo(m.x - 9, m.y); c.lineTo(m.x + 9, m.y); c.moveTo(m.x, m.y - 9); c.lineTo(m.x, m.y + 9); c.stroke();
      text(c, `${q.a}° · ${q.d} cm`, m.x + 12, m.y - 12, C.or, 11);
    }
    const o = s.ob.find(o => Math.abs(o.a - s.a) < 3);
    text(c, `Servo ${s.a.toFixed(0).padStart(3)}°  ·  Eco ${o ? o.d.toFixed(1) + ' cm' : '—'}`, 16, 22, C.gr, 14, 'left', true);
    text(c, `Marcas ${s.mk.length}/3`, W - 16, 22, C.or, 14, 'right', true);
  },
  down(s, x, y) {
    if (CY - y < -4 || Math.hypot(x - CX, CY - y) > R + 8) return;
    const i = s.mk.findIndex(m => Math.hypot(m.x - x, m.y - y) < 18);
    if (i >= 0) s.mk.splice(i, 1); else if (s.mk.length < 3) s.mk.push({ x, y }); else say(s, 'Ya tienes 3 marcas: toca una para quitarla.');
  },
  action(s) {
    const used = new Set(); let n = 0; for (const o of s.ob) { const [x, y] = pol(o.a, o.d), i = s.mk.findIndex((m, j) => !used.has(j) && Math.hypot(m.x - x, m.y - y) <= 8 * K); if (i >= 0) { used.add(i); n++; } }
    if (n === 3) { s.rev = true; win(s, '¡3/3 objetos localizados! Ángulo del servo + distancia del eco = coordenadas polares.'); }
    else say(s, `${n}/3 marcas correctas. Observa dónde aparecen los blips y ajusta las marcas.`, 'err');
  },
};
// ---------- Nivel 5 · Robot evasor ----------
const PR = 2, SPD = 70, OBS = [{ x: 150, y: 120, w: 34, h: 150 }, { x: 290, y: 20, w: 34, h: 130 }, { x: 290, y: 260, w: 34, h: 120 }, { x: 440, y: 130, w: 34, h: 250 }];
const ACT = ['avanzar', 'izquierda', 'derecha', 'retroceder'];
const clr = (r, a, off) => Math.min(...[-off, 0, off].map(o => rayDist(r.x + Math.cos(a) * 16 - Math.sin(a) * o, r.y + Math.sin(a) * 16 + Math.cos(a) * o, a, OBS)));
const crash = r => r.y < 35 || r.y > H - 35 || r.x < 15 || OBS.some(o => Math.hypot(r.x - clamp(r.x, o.x, o.x + o.w), r.y - clamp(r.y, o.y, o.y + o.h)) < 15);
const L5 = {
  title: 'Robot Evasor Autónomo', act: 'Ejecutar robot',
  goal: 'Define las reglas if / else if: si la distancia frontal supera D_MIN el robot actúa; si no, el SG90 escanea izquierda/derecha y decide. Cruza la pista hasta la META sin chocar.',
  controls: [{ id: 'd', type: 'range', label: 'D_MIN (distancia frontal)', min: 5, max: 40, val: 8, unit: 'cm' },
    { id: 'turn', type: 'range', label: 'Ángulo de giro', min: 15, max: 90, step: 5, val: 30, unit: '°' },
    { id: 'a1', type: 'select', label: 'if (frente > D_MIN)', opts: ACT, val: 'avanzar' },
    { id: 'a2', type: 'select', label: 'else if (izq > der)', opts: ACT, val: 'derecha' },
    { id: 'a3', type: 'select', label: 'else', opts: ACT, val: 'izquierda' }],
  init(s) { s.rb = null; },
  code: s => s.p,
  start: () => ({ x: 40, y: 200, h: 0, m: 'drive', T: 0, servo: 0, f: 0, L: null, R: null, trail: [], rule: 1 }),
  exec(r, a, p) {
    if (a === 'izquierda' || a === 'derecha') { r.m = 'turn'; r.tg = r.h + (a === 'derecha' ? 1 : -1) * rad(p.turn); }
    else if (a === 'retroceder') { r.m = 'back'; r.k = 0; }
    else { r.m = 'drive'; if (Math.abs(r.h) > .01 && clr(r, 0, 18) > p.d * PR + 24) r.h -= Math.sign(r.h) * Math.min(Math.abs(r.h), .03); r.x += Math.cos(r.h) * SPD / 60; r.y += Math.sin(r.h) * SPD / 60; }
  },
  step(r, p) { // paso fijo de 1/60 s
    r.T += 1 / 60; if (r.m === 'drive') { r.f = clr(r, r.h, 12) / PR; if (r.f > p.d) { r.rule = 1; this.exec(r, p.a1, p); } else { r.m = 'scan'; r.k = 0; } }
    else if (r.m === 'scan') {
      r.k += 1 / 60; const k = r.k;
      r.servo = k < .4 ? -Math.PI / 2 * k / .4 : k < .8 ? -Math.PI / 2 + Math.PI * (k - .4) / .4 : Math.PI / 2 * Math.max(0, 1 - (k - .8) / .2);
      if (k >= .4 && r.L === null) r.L = clr(r, r.h - Math.PI / 2, 0) / PR;
      if (k >= .8 && r.R === null) r.R = clr(r, r.h + Math.PI / 2, 0) / PR;
      if (k >= 1) { r.servo = 0; r.rule = r.L > r.R ? 2 : 3; this.exec(r, r.L > r.R ? p.a2 : p.a3, p); r.L = r.R = null; }
    } else if (r.m === 'turn') {
      const dh = r.tg - r.h, st = .05;
      if (Math.abs(dh) <= st) { r.h = Math.atan2(Math.sin(r.tg), Math.cos(r.tg)); r.m = 'drive'; } else r.h += Math.sign(dh) * st;
    } else if (r.m === 'back') { r.k += 1 / 60; r.x -= Math.cos(r.h) * SPD / 60; r.y -= Math.sin(r.h) * SPD / 60; if (r.k > .4) r.m = 'drive'; }
    if (Math.round(r.T * 60) % 6 === 0) r.trail.push([r.x, r.y]);
    if (crash(r)) r.end = 'crash'; else if (r.x > W - 30) r.end = 'goal'; else if (r.T > 45) r.end = 'time';
  },
  update(s, dt) {
    const r = s.rb; if (!r || r.end) return; for (let i = 0; i < Math.round(dt * 120) && !r.end; i++) this.step(r, s.p);
    if (r.end === 'goal') win(s, `¡Meta alcanzada en ${r.T.toFixed(1)} s sin chocar! Tus reglas if / else if funcionan.`);
    else if (r.end === 'crash') say(s, '💥 ¡Choque! Aumenta D_MIN o revisa hacia dónde gira cada regla.', 'err');
    else if (r.end === 'time') say(s, '⏱ Tiempo agotado: el robot no encontró la salida. Revisa las reglas.', 'err');
  },
  draw(c, s) {
    const r = s.rb || this.start(), p = s.p; grid(c); c.fillStyle = '#334155'; c.fillRect(0, 0, W, 20); c.fillRect(0, H - 20, W, 20);
    for (const o of OBS) box(c, o.x, o.y, o.w, o.h, C.or);
    c.strokeStyle = C.gr; c.lineWidth = 3; c.setLineDash([8, 6]); c.beginPath(); c.moveTo(W - 30, 20); c.lineTo(W - 30, H - 20); c.stroke(); c.setLineDash([]);
    text(c, 'META', W - 15, H / 2, C.gr, 12, 'center', true);
    c.strokeStyle = 'rgba(56,189,248,.45)'; c.lineWidth = 2; c.beginPath(); r.trail.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.stroke();
    const sa = r.h + r.servo, ln = r.m === 'scan' ? clr(r, sa, 0) : r.f * PR;
    c.strokeStyle = r.m === 'scan' ? C.or : C.cy; c.beginPath(); c.moveTo(r.x + Math.cos(r.h) * 16, r.y + Math.sin(r.h) * 16);
    c.lineTo(r.x + Math.cos(r.h) * 16 + Math.cos(sa) * ln, r.y + Math.sin(r.h) * 16 + Math.sin(sa) * ln); c.stroke();
    robot(c, r); if (r.end === 'crash') text(c, '💥', r.x, r.y - 26, C.rd, 22, 'center');
    const rules = [`if (frente > ${p.d})`, 'else if (izq > der)', 'else'];
    text(c, `frente ${r.f.toFixed(0)} cm · regla: ${rules[r.rule - 1]} → ${p['a' + r.rule]}`, 8, 10, C.tx, 11);
    text(c, `t ${r.T.toFixed(1)} s`, W - 8, 10, C.mu, 11, 'right');
  },
  action(s) { s.rb = this.start(); s.won = false; say(s, 'Robot en marcha…', 'info'); },
};
export const LEVELS = [L1, L2, L3, L4, L5];
