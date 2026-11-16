// SolarLab · sim.js — motor Canvas 2D, audio sintetizado y generadores técnicos
const R = Math.PI / 180, W = 960, H = 560, GY = 390;
const C = { cy: '#38bdf8', sun: '#f59e0b', or: '#f97316', gr: '#22c55e', red: '#ef4444', tx: '#e2e8f0', dim: '#64748b', box: '#111c33' };
const mix = (a, b, k) => { const p = s => [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16)), x = p(a), y = p(b); return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * k))})`; };

// ---------- Audio (Web Audio API) ----------
let AC = null; export const audio = { on: true };
function tone(f, d, type = 'sine', v = 0.06, at = 0) {
  const t = AC.currentTime + at, o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g).connect(AC.destination); o.start(t); o.stop(t + d + 0.05);
}
export function sfx(k) {
  if (!audio.on) return;
  try {
    AC ??= new (window.AudioContext || window.webkitAudioContext)(); AC.resume?.();
    if (k === 'alert') [0, 0.24, 0.48].forEach(a => { tone(520, 0.16, 'square', 0.035, a); tone(390, 0.16, 'square', 0.03, a + 0.11); });
    else if (k === 'full') [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.4, 'sine', 0.06, i * 0.1));
    else tone(880, 0.05, 'triangle', 0.03);
  } catch (e) { /* audio no disponible */ }
}

// ---------- Primitivas ----------
function sky(c, el, cl, t) {
  const d = Math.max(0, Math.min(1, (el + 8) / 25)), g = c.createLinearGradient(0, 0, 0, GY);
  g.addColorStop(0, mix('#020617', '#0e4a7a', d)); g.addColorStop(1, mix('#0b1120', '#3b6b8f', d * (0.4 + 0.6 * cl)));
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  for (let i = 0; i < 40; i++) { c.fillStyle = `rgba(226,232,240,${(1 - d) * (0.3 + 0.5 * Math.abs(Math.sin(i * 7 + t)))})`; c.fillRect((i * 173) % W, (i * 97) % 300, 2, 2); }
  for (let i = 0; i < 5; i++) {
    const x = ((i * 230 + t * (14 + i * 4)) % (W + 240)) - 120, y = 50 + i * 38, a = 0.12 + (1 - cl) * 0.75;
    c.fillStyle = `rgba(${cl < 0.5 ? '120,135,160' : '203,213,225'},${a})`; c.beginPath();
    [[0, 0, 28], [30, -12, 34], [64, 0, 26], [32, 10, 30]].forEach(([dx, dy, r]) => { c.moveTo(x + dx + r, y + dy); c.arc(x + dx, y + dy, r, 0, 7); }); c.fill();
  }
  const g2 = c.createLinearGradient(0, GY, 0, H); g2.addColorStop(0, '#14532d'); g2.addColorStop(1, '#0b1120');
  c.fillStyle = g2; c.fillRect(0, GY, W, H - GY);
}
function sunAt(c, x, y, t, k = 1) {
  if (y > GY) return; const g = c.createRadialGradient(x, y, 4, x, y, 70);
  g.addColorStop(0, `rgba(253,224,71,${k})`); g.addColorStop(0.35, `rgba(245,158,11,${0.6 * k})`); g.addColorStop(1, 'rgba(249,115,22,0)');
  c.fillStyle = g; c.beginPath(); c.arc(x, y, 70, 0, 7); c.fill();
  c.strokeStyle = `rgba(253,224,71,${0.6 * k})`; c.lineWidth = 2;
  for (let i = 0; i < 12; i++) { const a = i * 30 * R + t * 0.4; c.beginPath(); c.moveTo(x + Math.cos(a) * 26, y + Math.sin(a) * 26); c.lineTo(x + Math.cos(a) * 38, y + Math.sin(a) * 38); c.stroke(); }
  c.fillStyle = '#fde047'; c.beginPath(); c.arc(x, y, 18, 0, 7); c.fill();
}
const sunXY = f => [70 + Math.max(0, Math.min(1, f.az)) * (W - 140), GY - 20 - Math.sin(Math.max(-20, f.el) * R) * 330];
function panel(c, x, y, w, h, ang = 0, glow = 0) {
  c.save(); c.translate(x, y); c.rotate(ang * R); c.fillStyle = '#0f2a4f'; c.strokeStyle = '#94a3b8'; c.lineWidth = 3;
  c.fillRect(-w / 2, -h / 2, w, h); c.strokeRect(-w / 2, -h / 2, w, h); c.strokeStyle = `rgba(56,189,248,${0.35 + glow * 0.6})`; c.lineWidth = 1;
  for (let i = 1; i < 6; i++) { c.beginPath(); c.moveTo(-w / 2 + w * i / 6, -h / 2); c.lineTo(-w / 2 + w * i / 6, h / 2); c.stroke(); }
  for (let j = 1; j < 3; j++) { c.beginPath(); c.moveTo(-w / 2, -h / 2 + h * j / 3); c.lineTo(w / 2, -h / 2 + h * j / 3); c.stroke(); }
  c.restore();
}
function rays(c, x1, y1, x2, y2, k, t) {
  if (k <= 0.02) return; c.save(); c.setLineDash([10, 14]); c.lineDashOffset = -t * 60; c.lineWidth = 2;
  for (let i = -2; i <= 2; i++) { c.strokeStyle = `rgba(250,204,21,${Math.min(0.9, k)})`; c.beginPath(); c.moveTo(x1 + i * 6, y1); c.lineTo(x2 + i * 18, y2 + i * 4); c.stroke(); }
  c.restore();
}
function box(c, x, y, w, h, title, val, col = C.cy, warn = false) {
  c.fillStyle = C.box; c.strokeStyle = warn ? C.red : col; c.lineWidth = 2; c.beginPath(); c.roundRect(x, y, w, h, 10); c.fill(); c.stroke();
  c.fillStyle = C.dim; c.font = '600 13px system-ui'; c.textAlign = 'center'; c.fillText(title, x + w / 2, y + 20);
  c.fillStyle = warn ? C.red : C.tx; c.font = '700 16px ui-monospace,monospace'; c.fillText(val, x + w / 2, y + 42);
}
// Flujo de electrones animado a lo largo de una polilínea
function flow(c, pts, p, t, col = C.cy) {
  c.strokeStyle = 'rgba(100,116,139,.6)'; c.lineWidth = 3; c.beginPath(); pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.stroke();
  if (p < 1) return; let L = 0; const seg = pts.slice(1).map((q, i) => { const l = Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]); L += l; return l; });
  const sp = 20 + Math.min(160, p / 6), gap = 26; c.fillStyle = col;
  for (let s = (t * sp) % gap; s < L; s += gap) {
    let d = s, i = 0; while (d > seg[i]) d -= seg[i++]; const k = d / seg[i], a = pts[i], b = pts[i + 1];
    c.beginPath(); c.arc(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, 3.5, 0, 7); c.fill();
  }
}
const label = (c, s, x, y, col = C.tx, f = '600 15px system-ui', al = 'left') => { c.fillStyle = col; c.font = f; c.textAlign = al; c.fillText(s, x, y); };

// ---------- Escenas por tipo de nivel ----------
const scenes = {
  tilt(c, f, t) {
    sky(c, f.el, f.cl, t); const [sx, sy] = sunXY(f); sunAt(c, sx, sy, t, f.cl);
    const px = W / 2, py = GY - 70; rays(c, sx, sy, px, py, f.G / 700, t);
    c.fillStyle = '#475569'; c.fillRect(px - 5, py, 10, 70); panel(c, px, py, 220, 90, -f.tilt, f.pv / 320);
    c.strokeStyle = C.sun; c.lineWidth = 2; c.beginPath(); c.arc(px, py, 130, 0, -f.tilt * R, true); c.stroke();
    label(c, `β = ${f.tilt}°`, px + 140, py - 10, C.sun); label(c, `θ = ${f.th.toFixed(1)}°`, px - 220, py - 70, C.cy);
    box(c, 30, GY + 40, 190, 56, 'Cosecha diaria', `${f.E.toFixed(0)} Wh`, C.gr); box(c, W - 220, GY + 40, 190, 56, 'Potencia', `${f.pv.toFixed(0)} W`, C.sun);
    flow(c, [[px, py + 40], [px, GY + 68], [220, GY + 68]], f.pv * 2, t, C.cy);
  },
  array(c, f, t, done) {
    sky(c, 50, 1, t); sunAt(c, 110, 90, t, f.g); const burnt = f.burn && done;
    const xs = [180, 360, 540, 720]; xs.forEach((x, i) => { const used = i < f.ns * f.np; panel(c, x, 170, 150, 80, 0, used ? f.g : 0); rays(c, 110, 90, x, 140, used ? f.g * 0.5 : 0, t); label(c, `P${i + 1}  18V·5A`, x, 230, used ? C.tx : C.dim, '600 13px system-ui', 'center'); });
    for (let s = 0; s < f.np; s++) {
      const grp = xs.slice(s * f.ns, s * f.ns + f.ns), yb = 270 + s * 22, col = s ? C.or : C.sun;
      for (let i = 1; i < grp.length; i++) flow(c, [[grp[i - 1] + 60, 210], [grp[i] - 60, 210]], f.P, t, col);
      flow(c, [[grp.at(-1) + 60, 200], [grp.at(-1) + 80, 200], [grp.at(-1) + 80, yb], [480, yb], [480, 330]], f.P, t, col);
      flow(c, [[grp[0] - 60, 200], [grp[0] - 80, 200], [grp[0] - 80, yb + 8], [440, yb + 8], [440, 330]], f.P, t, C.cy);
    }
    box(c, 360, 330, 240, 60, burnt ? 'CONTROLADOR · QUEMADO' : 'Controlador 36 V / 10 A', `${f.V.toFixed(1)} V · ${f.I.toFixed(1)} A`, C.gr, f.burn);
    if (burnt) for (let i = 0; i < 14; i++) { const k = (t * 0.7 + i / 14) % 1; c.fillStyle = `rgba(148,163,184,${0.5 * (1 - k)})`; c.beginPath(); c.arc(480 + Math.sin(i * 3 + t) * 30 * k, 330 - k * 120, 8 + k * 22, 0, 7); c.fill(); }
    label(c, f.cfg, 30, GY + 120, C.sun, '700 28px system-ui');
  },
  chain(c, f, t) {
    sky(c, f.el, f.cl, t); const [sx, sy] = sunXY(f); sunAt(c, sx, sy, t, f.cl);
    if (f.kind === 'house') {
      c.fillStyle = '#334155'; c.fillRect(640, 250, 230, 140); c.fillStyle = '#7c2d12'; c.beginPath(); c.moveTo(620, 255); c.lineTo(755, 170); c.lineTo(890, 255); c.fill();
      c.fillStyle = f.load > 70 && !f.out ? '#fde68a' : '#1e293b'; c.fillRect(670, 290, 40, 34); c.fillRect(800, 290, 40, 34); c.fillStyle = '#0f172a'; c.fillRect(735, 320, 40, 70);
    }
    const n = Math.min(f.n, 8); for (let i = 0; i < n; i++) panel(c, 70 + (i % 4) * 95, 230 + Math.floor(i / 4) * 70, 86, 50, -12, f.pv / 400);
    rays(c, sx, sy, 200, 230, f.pv / 900, t);
    const y = GY + 60, nodes = [[20, 'Generador FV', `${f.pv.toFixed(0)} W`, C.sun], [205, 'Controlador', f.ctl, C.cy], [390, 'Batería', `${f.soc.toFixed(0)} %`, C.gr], [575, 'Inversor', 'Onda pura', C.cy], [760, 'Cargas', f.out ? 'APAGÓN' : `${f.load.toFixed(0)} W`, C.or]];
    flow(c, [[165, y + 28], [205, y + 28]], f.pv, t, C.sun); flow(c, [[350, y + 28], [390, y + 28]], f.pv, t, C.sun);
    flow(c, [[535, y + 28], [575, y + 28]], f.load, t, C.or); flow(c, [[720, y + 28], [760, y + 28]], f.load, t, C.or);
    nodes.forEach(([x, a, b, col]) => box(c, x, y, 145, 56, a, b, col, b === 'APAGÓN'));
    c.fillStyle = '#1e293b'; c.fillRect(398, y - 22, 129, 12); c.fillStyle = f.soc < 25 ? C.red : C.gr; c.fillRect(398, y - 22, 1.29 * f.soc, 12);
    if (f.out) label(c, '⚠ APAGÓN — protección por baja tensión', W / 2, 40, C.red, '700 22px system-ui', 'center');
  },
  track(c, f, t) {
    sky(c, f.el, f.cl, t); const cx = W / 2, cy = GY - 40, sx = cx + Math.sin(f.sun * R) * 300, sy = cy - Math.cos(f.sun * R) * 300;
    sunAt(c, sx, sy, t, f.cl); c.strokeStyle = 'rgba(245,158,11,.25)'; c.setLineDash([4, 8]); c.beginPath(); c.arc(cx, cy, 300, -165 * R, -15 * R); c.stroke(); c.setLineDash([]);
    rays(c, sx, sy, cx, cy - 20, 0.6 * f.cl, t);
    c.fillStyle = '#475569'; c.fillRect(cx - 8, cy, 16, 50); box(c, cx - 45, cy + 6, 90, 34, 'Servo', '', C.cy);
    c.save(); c.translate(cx, cy); c.rotate(f.pan * R); panel(c, 0, -18, 240, 26, 0, 1 - f.err / 40);
    c.fillStyle = '#e2e8f0'; c.fillRect(-3, -66, 6, 36);
    [[-22, f.L], [22, f.R]].forEach(([x, v]) => { c.fillStyle = `rgb(${120 + v / 8},${80 + v / 6},40)`; c.beginPath(); c.arc(x, -40, 10, 0, 7); c.fill(); });
    c.restore();
    box(c, 30, GY + 40, 200, 56, 'LDR izquierda', `${f.L.toFixed(0)}`, C.sun); box(c, W - 230, GY + 40, 200, 56, 'LDR derecha', `${f.R.toFixed(0)}`, C.sun);
    box(c, cx - 110, GY + 100, 220, 56, 'Arduino Nano · D9', `servo ${(f.pan + 90).toFixed(0)}°`, C.gr);
    flow(c, [[230, GY + 68], [cx - 110, GY + 128]], 200, t, C.sun); flow(c, [[W - 230, GY + 68], [cx + 110, GY + 128]], 200, t, C.sun);
  }
};
export function draw(c, lvl, f, t, done) {
  c.clearRect(0, 0, W, H); scenes[lvl.kind](c, f, t, done);
  label(c, lvl.name.toUpperCase(), W - 20, 30, 'rgba(226,232,240,.7)', '700 14px system-ui', 'right');
}

// ---------- Gráfica en vivo (I-V, potencia, SoC) ----------
export function drawChart(c, fr, idx, spec) {
  const w = c.canvas.width, h = c.canvas.height, m = 34, x0 = fr[0][spec.x], x1 = fr.at(-1)[spec.x];
  c.fillStyle = '#0a1324'; c.fillRect(0, 0, w, h); c.strokeStyle = '#1e293b'; c.lineWidth = 1;
  for (let i = 0; i <= 4; i++) { const y = m / 2 + (h - m * 1.5) * i / 4; c.beginPath(); c.moveTo(m, y); c.lineTo(w - 8, y); c.stroke(); }
  label(c, spec.x === 'V' ? 'Tensión (V) →' : 'Tiempo (h) →', w - 10, h - 6, C.dim, '12px system-ui', 'right');
  label(c, `${x0.toFixed(0)}`, m, h - 6, C.dim, '12px system-ui'); label(c, `${x1.toFixed(0)}`, w - 120, h - 6, C.dim, '12px system-ui');
  spec.ys.forEach(([k, col, name], j) => {
    const mx = Math.max(1e-6, ...fr.map(f => f[k])); c.strokeStyle = col; c.lineWidth = 2.2; c.beginPath();
    for (let i = 0; i <= idx; i++) { const X = m + (w - m - 8) * (fr[i][spec.x] - x0) / (x1 - x0 || 1), Y = h - m + (-(h - m * 1.5)) * fr[i][k] / mx; i ? c.lineTo(X, Y) : c.moveTo(X, Y); }
    c.stroke(); label(c, `■ ${name} (máx ${mx.toFixed(mx < 20 ? 1 : 0)})`, m + 4 + j * ((w - m) / spec.ys.length), 14, col, '600 12px system-ui');
  });
}

// ---------- Ficha técnica y código Arduino ----------
export const ficha = (lvl, res) => [`SOLARLAB · FICHA TÉCNICA`, lvl.title, '─'.repeat(38), ...Object.entries(res.stats).map(([k, v]) => `${k.padEnd(18, '.')} ${v}`), '─'.repeat(38), `Veredicto: ${res.ok ? 'APROBADO ✔' : 'PENDIENTE ✖'}`].join('\n');
export const arduino = p => `// SolarLab · Seguidor solar 1 eje · Arduino Nano
#include <Servo.h>
Servo servo;
const int LDR_L = A0, LDR_R = A1, SERVO_PIN = 9;
const float GAIN_L = ${p.gL}, GAIN_R = ${p.gR}; // sensibilidad LDR
const int HYST = ${p.hy};   // banda muerta (cuentas ADC)
const int STEP = ${p.st};   // paso del servo (grados)
int ang = 90;

int readAvg(int pin) {            // filtro: promedio de 8 lecturas
  long s = 0;
  for (int i = 0; i < 8; i++) { s += analogRead(pin); delay(2); }
  return s / 8;
}

void setup() {
  servo.attach(SERVO_PIN);
  servo.write(ang);
  Serial.begin(9600);
}

void loop() {
  int l = readAvg(LDR_L) * GAIN_L;
  int r = readAvg(LDR_R) * GAIN_R;
  int diff = l - r;
  if (abs(diff) > HYST) {
    ang = constrain(ang + (diff > 0 ? STEP : -STEP), 15, 165);
    if (!servo.attached()) servo.attach(SERVO_PIN);
    servo.write(ang);
  } else if (servo.attached()) {
    servo.detach();               // reposo: ahorra batería
  }
  Serial.print(l); Serial.print(','); Serial.print(r);
  Serial.print(','); Serial.println(ang);
  delay(500);
}`;
