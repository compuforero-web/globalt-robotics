// Motor físico 2D, render Canvas, audio sintetizado y generador C++ (Arduino Nano)
export const R = 77, RING = 5;                       // Dohyo: radio 77 cm, línea blanca 5 cm
const VMAX = 120, WMAX = 5, GRIP = 300, TAU = Math.PI * 2, AVANCE_MS = 250;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const body = o => ({ x: 0, y: 0, a: 0, vx: 0, vy: 0, w: 0, r: 10, m: 1, pl: 0, pr: 0, grip: GRIP, lat: GRIP, fr: 0, out: false, fall: 0, drive: true, t: 0, ...o });
export const turnMs = p => Math.min(3000, Math.round(p.turnDeg / (WMAX * p.pwmPatrol / 255 * 180 / Math.PI) * 1000));

export function createWorld(lv, p) {
  const ang = Math.random() * TAU, d = lv.foe ? lv.foe.dist * (0.4 + Math.random() * 0.2) : 0, c = Math.cos(ang), s = Math.sin(ang);
  const me = body({ kind: 'me', x: -c * d, y: -s * d, a: ang + (lv.foe ? 0.8 + Math.random() * 4.7 : Math.random() * TAU),
    st: { mode: 'run', t: 0, dir: 1, label: 'BUSCAR' }, ir: [false, false], us: 999 });
  const k = lv.foe?.kind, f = !k ? null : body({ kind: k, x: c * d, y: s * d, a: ang + Math.PI, dir: Math.random() < 0.5 ? 1 : -1,
    ...({ can: { r: 6, m: 0.5, drive: false, fr: 60 }, block: { r: 9, m: 1.4, drive: false, fr: 150 },
      agile: { m: 1 }, heavy: { r: 11, m: 1.6, lat: GRIP * 0.35, grip: 220 } })[k] });
  return { t: 0, lv, p, me, foe: f, bodies: f ? [me, f] : [me], fx: [], over: null, hits: [] };
}

function irs(b) {                                   // TCRT5000: true = línea blanca (digitalRead LOW)
  const c = Math.cos(b.a), s = Math.sin(b.a);
  return [1, -1].map(k => { const r = Math.hypot(b.x + c * 10 + s * 4 * k, b.y + s * 10 - c * 4 * k); return r >= R - RING; });
}
function sonar(b, list) {                           // HC-SR04: cono ±15°, máx. 200 cm
  let best = 999;
  for (const o of list) {
    if (o === b || o.out) continue; const dx = o.x - b.x, dy = o.y - b.y, dist = Math.hypot(dx, dy);
    if (Math.abs(wrap(Math.atan2(dy, dx) - b.a)) < 0.26 + Math.asin(Math.min(1, o.r / dist)))
      best = Math.min(best, Math.max(2, Math.round(dist - o.r - 9)));
  }
  return best > 200 ? 999 : best;
}
const set = (b, l, r) => { b.pl = l; b.pr = r; };
function steer(b, ang, pwm, gain = 180) {
  const e = wrap(ang - b.a), tr = clamp(e * gain, -255, 255), fwd = Math.abs(e) > 0.9 ? 0 : pwm;
  set(b, clamp(fwd + tr, -255, 255), clamp(fwd - tr, -255, 255));
}

function brain(w, b, dt) {                          // Emula loop() del Arduino
  const p = w.p, st = b.st, P = p.pwmPatrol, [L, Rr] = (b.ir = irs(b));
  b.us = w.lv.radar ? sonar(b, w.bodies) : 999;   st.t += dt * 1000; const go = m => { st.mode = m; st.t = 0; };
  if (st.mode === 'back') { set(b, -P, -P); if (st.t >= p.backMs) go(p.edgeAction === 'back' ? 'run' : 'turn'); return; }
  if (st.mode === 'turn') { set(b, st.dir * P, -st.dir * P); if (st.t >= turnMs(p)) go(w.lv.search === 'spin' ? 'fwd' : 'run'); return; }
  if (st.mode === 'fwd') { set(b, P, P); if (st.t >= AVANCE_MS) go('run'); return; }   // alejarse del borde
  const rules = p.priority === 'edge' ? ['edge', 'atk'] : ['atk', 'edge'];
  for (const r of rules) {
    if (r === 'edge' && (L || Rr) && p.edgeAction !== 'none') {
      st.dir = L ? 1 : -1; st.label = 'EVADIR'; go(p.edgeAction === 'turn' ? 'turn' : 'back');
      return brain(w, b, 0);
    }
    if (r === 'atk' && b.us < p.range) { st.label = 'ATAQUE'; return set(b, p.pwmAttack, p.pwmAttack); }
  }
  st.label = 'BUSCAR'; w.lv.search === 'spin' ? set(b, P, -P) : set(b, P, P);
}

function foeAI(w, f, me, dt) {
  f.t -= dt; const toC = Math.atan2(-f.y, -f.x), dx = f.x - me.x, dy = f.y - me.y, dist = Math.hypot(dx, dy);
  if (f.kind === 'agile') {                         // ágil: ronda el borde y esquiva en el último momento
    const rr = Math.hypot(f.x, f.y); if (f.t > 0) return steer(f, f.ha, 210);
    if (rr > R - 12) return steer(f, toC, 220);
    if (f.t < -2.2 && dist < 34 && Math.abs(wrap(Math.atan2(dy, dx) - me.a)) < 0.4) {
      f.ha = me.a + (wrap(Math.atan2(f.y, f.x) - me.a) > 0 ? -1 : 1) * Math.PI / 2; f.t = 0.4; return;
    }
    if (dist < 23) return steer(f, Math.atan2(dy, dx) + 1.2, 200);   // en contacto: zafarse de lado
    return steer(f, toC + f.dir * clamp(1.57 + (R - 22 - rr) * 0.04, 0.8, 2.6), 110);
  }
  if (f.t > 0) return set(f, -140, -140);           // pesado: retrocede tarde ante el borde
  if (Math.hypot(f.x, f.y) > R - 9) { f.t = 0.4; return; }
  dist < 24 ? set(f, 150, 150) : steer(f, Math.atan2(-dy, -dx), 150, 70);   // en contacto empuja recto
}

export function step(w, dt) {
  if (w.over) return; w.t += dt; const { me, foe: f } = w;
  if (!me.out) brain(w, me, dt);
  if (f && !f.out && f.drive) foeAI(w, f, me, dt);
  for (const b of w.bodies) {
    if (b.out) { b.fall += dt; continue; }
    const c = Math.cos(b.a), s = Math.sin(b.a); if (b.drive) {
      let vp = b.vx * c + b.vy * s, vq = -b.vx * s + b.vy * c;
      const tgt = (b.pl + b.pr) / 510 * VMAX;
      const amx = vp > 0 && tgt < 0 ? b.grip * 1.4 : b.grip * (0.35 + 0.65 * (Math.abs(b.pl) + Math.abs(b.pr)) / 510);
      vp += clamp(tgt - vp, -amx * dt, amx * dt); vq += clamp(-vq, -b.lat * dt, b.lat * dt);
      b.vx = vp * c - vq * s; b.vy = vp * s + vq * c;
      const wt = (b.pl - b.pr) / 510 * WMAX; b.w += clamp(wt - b.w, -40 / b.m * dt, 40 / b.m * dt);
    } else {
      const sp = Math.hypot(b.vx, b.vy), k = sp ? Math.max(0, sp - b.fr * dt) / sp : 0; b.vx *= k; b.vy *= k; b.w *= 0.95; }
    b.x += b.vx * dt; b.y += b.vy * dt; b.a += b.w * dt;
  }
  if (f && !me.out && !f.out) collide(w, me, f);
  for (const b of w.bodies) if (!b.out && Math.hypot(b.x, b.y) > R) b.out = true;   // fuera del Dohyo
  w.fx = w.fx.filter(p => (p.x += p.vx * dt, p.y += p.vy * dt, p.life -= dt) > 0);
  const end = (win, msg) => (w.over = { win, msg });
  if (me.out) end(false, 'Tu robot salió del Dohyo.');
  else if (f?.out) end(true, f.drive ? '¡Rival expulsado del Dohyo!' : '¡Objetivo fuera del Dohyo!');
  else if (w.t >= w.lv.time) end(w.lv.winBy === 'survive', w.lv.winBy === 'survive' ? `¡Sobreviviste ${w.lv.time} s!` : 'Tiempo agotado.');
}

function collide(w, a, b) {                          // Colisión elástica circular con masas
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), ov = a.r + b.r - d;
  if (ov <= 0 || !d) return; const nx = dx / d, ny = dy / d, im = 1 / a.m + 1 / b.m;
  a.x -= nx * ov * (1 / a.m) / im; a.y -= ny * ov * (1 / a.m) / im;
  b.x += nx * ov * (1 / b.m) / im; b.y += ny * ov * (1 / b.m) / im;
  const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny; if (vn >= 0) return;
  const j = -(1 + (vn < -10 ? 0.35 : 0)) * vn / im, vt = (b.vx - a.vx) * -ny + (b.vy - a.vy) * nx, jt = clamp(-vt / im, -0.6 * j, 0.6 * j);
  const ix = j * nx - jt * ny, iy = j * ny + jt * nx;   // impulso normal + fricción tangencial
  a.vx -= ix / a.m; a.vy -= iy / a.m; b.vx += ix / b.m; b.vy += iy / b.m;
  if (-vn > 12) {
    const x = a.x + nx * a.r, y = a.y + ny * a.r;
    for (let i = 0; i < 10; i++) { const t = Math.random() * TAU, v = 20 + Math.random() * 50;
      w.fx.push({ x, y, vx: Math.cos(t) * v, vy: Math.sin(t) * v, life: 0.25 + Math.random() * 0.3 }); }
    w.hits.push(-vn);
  }
}

const COL = { me: '#38bdf8', agile: '#f97316', heavy: '#f97316', can: '#22c55e', block: '#22c55e' };
export function draw(ctx, w, size) {
  const sc = size / (2 * (R + 12));
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#0b1120'; ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(56,189,248,.07)'; ctx.lineWidth = 1;
  for (let i = 0; i < size; i += size / 16) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, size); ctx.moveTo(0, i); ctx.lineTo(size, i); ctx.stroke(); }
  ctx.translate(size / 2, size / 2); ctx.scale(sc, sc);
  const disc = (r, col) => { ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fillStyle = col; ctx.fill(); }; ctx.shadowColor = '#38bdf8'; ctx.shadowBlur = 25; disc(R + 2, '#1e293b'); ctx.shadowBlur = 0;
  disc(R, '#f1f5f9'); disc(R - RING, '#05070d');
  ctx.fillStyle = '#7c2d12'; ctx.fillRect(-11, -10, 2, 20); ctx.fillRect(9, -10, 2, 20);   // shikiri-sen
  const me = w.me;
  if (w.lv.radar && !me.out) {                       // haz HC-SR04
    const len = Math.min(me.us, 120) + 9;
    ctx.save(); ctx.translate(me.x, me.y); ctx.rotate(me.a);
    const g = ctx.createLinearGradient(0, 0, len, 0); g.addColorStop(0, 'rgba(56,189,248,.45)'); g.addColorStop(1, 'rgba(56,189,248,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(9, 0); ctx.arc(0, 0, len, -0.26, 0.26); ctx.closePath(); ctx.fill();
    if (me.us < 999) { ctx.strokeStyle = me.us < w.p.range ? '#f97316' : '#38bdf8'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(len, 0); ctx.stroke(); }
    ctx.restore(); }
  for (const b of w.bodies) drawBody(ctx, b);
  for (const p of w.fx) { ctx.globalAlpha = Math.min(1, p.life * 3); ctx.fillStyle = '#fbbf24'; ctx.fillRect(p.x - 0.8, p.y - 0.8, 1.6, 1.6); }
  ctx.globalAlpha = 1;
}
function drawBody(ctx, b) {
  ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.a);
  const k = Math.max(0.2, 1 - b.fall * 1.5); ctx.scale(k, k); ctx.globalAlpha = Math.max(0.15, k);
  const col = COL[b.kind], r = b.r;
  if (b.kind === 'can') { ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = '#052e16'; ctx.lineWidth = 1.5; ctx.stroke(); }
  else if (b.kind === 'block') { ctx.fillStyle = col; ctx.fillRect(-r, -r, 2 * r, 2 * r); ctx.strokeStyle = '#052e16'; ctx.strokeRect(-r + 2, -r + 2, 2 * r - 4, 2 * r - 4); }
  else {
    ctx.fillStyle = '#111827'; ctx.fillRect(-r * 0.7, -r - 2, r * 1.2, 3); ctx.fillRect(-r * 0.7, r - 1, r * 1.2, 3);  // ruedas
    ctx.fillStyle = col; ctx.beginPath(); ctx.roundRect(-r, -r + 1, r * 1.7, 2 * r - 2, 3); ctx.fill();
    ctx.fillStyle = '#cbd5e1'; ctx.beginPath(); ctx.moveTo(r * 0.7, -r); ctx.lineTo(r + 2, -r); ctx.lineTo(r + 2, r); ctx.lineTo(r * 0.7, r); ctx.fill(); // cuchilla
    ctx.fillStyle = '#0b1120'; ctx.fillRect(-r * 0.6, -r * 0.45, r * 0.9, r * 0.9);
    if (b.kind === 'me') {
      ctx.fillStyle = '#38bdf8'; ctx.beginPath(); ctx.arc(r * 0.55, -2.5, 1.4, 0, TAU); ctx.arc(r * 0.55, 2.5, 1.4, 0, TAU); ctx.fill(); // HC-SR04
      b.ir.forEach((on, i) => { ctx.fillStyle = on ? '#f97316' : '#22c55e'; ctx.beginPath(); ctx.arc(10, i ? 4 : -4, 1.6, 0, TAU); ctx.fill(); });
    }
  }
  ctx.restore(); }

export const sfx = {
  on: true, ctx: null,
  ac() { if (!this.on) return null; try { this.ctx ||= new (window.AudioContext || window.webkitAudioContext)(); if (this.ctx.state === 'suspended') this.ctx.resume(); } catch { return null; } return this.ctx; },
  tone(f, d, type = 'square', v = 0.12, f2) {
    const a = this.ac(); if (!a) return; const o = a.createOscillator(), g = a.createGain(), t = a.currentTime;
    o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + d); o.connect(g).connect(a.destination); o.start(t); o.stop(t + d);
  },
  hit(power) {
    const a = this.ac(); if (!a) return; const n = a.sampleRate * 0.18, buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 3;
    const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(); s.buffer = buf; f.type = 'lowpass'; f.frequency.value = 900 + power * 25;
    g.gain.value = Math.min(0.5, power / 120); s.connect(f).connect(g).connect(a.destination); s.start();
    this.tone(120, 0.15, 'sine', Math.min(0.4, power / 150), 45);
  },
  seq(fs, gap, type = 'square') { fs.forEach((f, i) => setTimeout(() => this.tone(f, 0.16, type, 0.13), i * gap)); },
  start() { this.seq([440, 440, 880], 160); }, win() { this.seq([523, 659, 784, 1046], 110, 'triangle'); }, lose() { this.tone(330, 0.6, 'sawtooth', 0.1, 80); },
};

export function genCode(lv, p) {
  const ea = p.edgeAction, radar = lv.radar, P = 'PWM_PATRULLA';
  const edge = ea === 'none' ? null : ['bordeIzq || bordeDer', [
    'int dir = bordeIzq ? 1 : -1;            // gira hacia el lado contrario a la línea',
    ...(ea !== 'turn' ? [`motores(-${P}, -${P}); delay(RETRO_MS);   // retroceder`] : []),
    ...(ea !== 'back' ? [`motores(dir * ${P}, -dir * ${P}); delay(GIRO_MS);   // girar`] : []),
    ...(lv.search === 'spin' && ea !== 'back' ? [`motores(${P}, ${P}); delay(${AVANCE_MS});  // volver al centro`] : [])]];
  const atk = radar ? ['d < RANGO_CM', ['motores(PWM_ATAQUE, PWM_ATAQUE);     // ¡empuje!']] : null;
  const rules = (p.priority === 'edge' ? [edge, atk] : [atk, edge]).filter(Boolean);
  const search = lv.search === 'spin' ? `motores(${P}, -${P});  // girar escaneando` : `motores(${P}, ${P});   // patrullar recto`;
  const body = rules.map(([c, l], i) => `  ${i ? '} else if' : 'if'} (${c}) {\n${l.map(x => '    ' + x).join('\n')}\n`).join('')
    + (rules.length ? `  } else {\n    ${search}\n  }` : `  ${search}`);
  const pins = [['ENA', 5, 'PWM motor izquierdo (L298N)'], ['IN1', 7], ['IN2', 8], ['ENB', 6, 'PWM motor derecho (L298N)'], ['IN3', 9], ['IN4', 10],
    ['IR_IZQ', 2, 'TCRT5000 izq. (LOW = línea blanca)'], ['IR_DER', 4, 'TCRT5000 der.'], ...(radar ? [['TRIG', 11, 'HC-SR04'], ['ECHO', 12]] : [])];
  const consts = [[P, p.pwmPatrol], ...(radar ? [['PWM_ATAQUE', p.pwmAttack], ['RANGO_CM', p.range]] : []), ['RETRO_MS', p.backMs], ['GIRO_MS', turnMs(p), `≈ ${p.turnDeg}° a PWM ${p.pwmPatrol}`]];
  return `// Sumo Bot Challenge · Nivel ${lv.id}: ${lv.title}
// Arduino Nano + L298N + 2x TCRT5000 + HC-SR04
${pins.map(([n, v, c]) => `#define ${n.padEnd(6)} ${String(v).padEnd(3)}${c ? ' // ' + c : ''}`.trimEnd()).join('\n')}

${consts.map(([n, v, c]) => `const int ${n.padEnd(12)} = ${v};${c ? '  // ' + c : ''}`).join('\n')}

void motores(int izq, int der) {
  digitalWrite(IN1, izq >= 0); digitalWrite(IN2, izq < 0);
  digitalWrite(IN3, der >= 0); digitalWrite(IN4, der < 0);
  analogWrite(ENA, constrain(abs(izq), 0, 255));
  analogWrite(ENB, constrain(abs(der), 0, 255));
}
${radar ? `
long distanciaCm() {
  digitalWrite(TRIG, LOW);  delayMicroseconds(2);
  digitalWrite(TRIG, HIGH); delayMicroseconds(10); digitalWrite(TRIG, LOW);
  long us = pulseIn(ECHO, HIGH, 12000UL);  // timeout ≈ 200 cm
  return us ? us / 58 : 999;
}
` : ''}
void setup() {
  int salidas[] = {ENA, IN1, IN2, ENB, IN3, IN4${radar ? ', TRIG' : ''}};
  for (int p : salidas) pinMode(p, OUTPUT);
  pinMode(IR_IZQ, INPUT); pinMode(IR_DER, INPUT);${radar ? ' pinMode(ECHO, INPUT);' : ''}
  delay(5000);  // regla de sumo: espera 5 s antes de moverse
}

void loop() {
  bool bordeIzq = digitalRead(IR_IZQ) == LOW;
  bool bordeDer = digitalRead(IR_DER) == LOW;${radar ? '\n  long d = distanciaCm();' : ''}
${body}
}
`;
}
