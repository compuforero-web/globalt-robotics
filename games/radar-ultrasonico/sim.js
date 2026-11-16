// Radar Ultrasónico · motor Canvas 2D, audio Web Audio y generador C++ (Arduino Nano)
export const W = 640, H = 400;
export const C = { bg: '#0b1120', cy: '#38bdf8', or: '#f97316', gr: '#22c55e', ye: '#facc15', rd: '#ef4444', tx: '#cbd5e1', mu: '#64748b', ln: '#16213a' };
export const usFromCm = d => d * 2 / 0.0343;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const rad = d => d * Math.PI / 180;

let actx = null;
export const audio = {
  on: true,
  beep(f = 1200, dur = 0.07, vol = 0.04) {
    if (!this.on) return;
    try {
      actx ||= new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime;
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(actx.destination); o.start(t); o.stop(t + dur + 0.03);
    } catch { /* audio no disponible */ }
  }
};

export function grid(c) {
  c.fillStyle = C.bg; c.fillRect(0, 0, W, H);
  c.strokeStyle = C.ln; c.lineWidth = 1; c.beginPath();
  for (let x = 0; x <= W; x += 40) { c.moveTo(x + .5, 0); c.lineTo(x + .5, H); }
  for (let y = 0; y <= H; y += 40) { c.moveTo(0, y + .5); c.lineTo(W, y + .5); }
  c.stroke();
}
export function text(c, s, x, y, col = C.tx, size = 13, align = 'left', bold = false) {
  c.fillStyle = col; c.font = `${bold ? '700 ' : ''}${size}px ui-monospace, Consolas, monospace`;
  c.textAlign = align; c.textBaseline = 'middle'; c.fillText(s, x, y);
}
export function sensor(c, x, y, ang = 0) { // placa HC-SR04 con dos transductores
  c.save(); c.translate(x, y); c.rotate(ang);
  c.fillStyle = '#1e40af'; c.strokeStyle = C.cy; c.lineWidth = 1.5;
  c.beginPath(); c.roundRect(-16, -30, 18, 60, 3); c.fill(); c.stroke();
  for (const dy of [-15, 15]) {
    c.fillStyle = '#94a3b8'; c.beginPath(); c.arc(6, dy, 11, 0, 7); c.fill();
    c.fillStyle = '#334155'; c.beginPath(); c.arc(6, dy, 6, 0, 7); c.fill();
  }
  c.restore();
}
export function cone(c, x, y, ang, half, len, col = C.cy, a = 0.08) {
  c.save(); c.globalAlpha = a; c.fillStyle = col; c.beginPath(); c.moveTo(x, y);
  c.arc(x, y, len, ang - half, ang + half); c.closePath(); c.fill();
  c.globalAlpha = Math.min(1, a * 4); c.strokeStyle = col; c.setLineDash([4, 6]); c.stroke(); c.restore();
}
export function echoAnim(c, x, y, ox, t, half = rad(14)) { // ida (cian) y eco (naranja)
  const d = Math.max(ox - x - 6, 1), L = 2 * d;
  c.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    const p = (t * 300 + i * L / 3) % L, out = p < d;
    c.globalAlpha = 0.9 - 0.6 * p / L; c.strokeStyle = out ? C.cy : C.or; c.beginPath();
    if (out) c.arc(x + 6, y, p, -half, half); else c.arc(ox, y, p - d, Math.PI - half, Math.PI + half);
    c.stroke();
  }
  c.globalAlpha = 1;
}
export function scope(c, x, y, w, us, maxUs) { // diagrama TRIG / ECHO
  c.fillStyle = '#020617'; c.strokeStyle = '#1e293b'; c.lineWidth = 1;
  c.beginPath(); c.roundRect(x, y, w, 76, 6); c.fill(); c.stroke();
  const x0 = x + 56, sw = w - 70, e = x0 + 14, pw = clamp(us / maxUs, 0, 1) * (sw - 20);
  text(c, 'TRIG', x + 10, y + 20, C.cy, 12, 'left', true); text(c, 'ECHO', x + 10, y + 54, C.or, 12, 'left', true);
  c.lineWidth = 2; c.strokeStyle = C.cy; c.beginPath();
  [[x0, 28], [x0 + 4, 28], [x0 + 4, 12], [x0 + 10, 12], [x0 + 10, 28], [x0 + sw, 28]].forEach(([a, b], i) => i ? c.lineTo(a, y + b) : c.moveTo(a, y + b));
  c.stroke(); c.strokeStyle = C.or; c.beginPath();
  [[x0, 64], [e, 64], [e, 44], [e + pw, 44], [e + pw, 64], [x0 + sw, 64]].forEach(([a, b], i) => i ? c.lineTo(a, y + b) : c.moveTo(a, y + b));
  c.stroke();
  text(c, `10 µs`, x0 + 16, y + 18, C.mu, 10);
  text(c, `ECHO = ${Math.round(us)} µs`, x + w - 10, y + 18, C.or, 13, 'right', true);
}
export function box(c, x, y, w, h, col = C.or, glow = false) {
  c.save(); if (glow) { c.shadowColor = col; c.shadowBlur = 18; }
  c.fillStyle = col + '33'; c.strokeStyle = col; c.lineWidth = 2;
  c.beginPath(); c.roundRect(x, y, w, h, 4); c.fill(); c.stroke(); c.restore();
}
export function ruler(c, x0, y, px, max) {
  c.strokeStyle = C.mu; c.lineWidth = 1; c.beginPath(); c.moveTo(x0, y); c.lineTo(x0 + max * px, y);
  for (let d = 0; d <= max; d += 10) { const x = x0 + d * px; c.moveTo(x, y); c.lineTo(x, y + (d % 50 ? 4 : 8)); }
  c.stroke();
  for (let d = 0; d <= max; d += 50) text(c, `${d} cm`, x0 + d * px, y + 17, C.mu, 10, 'center');
}
export function radar(c, cx, cy, R, max, ang, dir) { // sonar semicircular 0–180°
  c.fillStyle = 'rgba(34,197,94,.05)'; c.beginPath(); c.arc(cx, cy, R, Math.PI, 0); c.fill();
  c.lineWidth = 1; c.strokeStyle = 'rgba(34,197,94,.3)';
  for (let i = 1; i <= 4; i++) {
    c.beginPath(); c.arc(cx, cy, R * i / 4, Math.PI, 0); c.stroke();
    text(c, `${max * i / 4}`, cx + R * i / 4 - 3, cy - 8, C.mu, 10, 'right');
  }
  for (let a = 0; a <= 180; a += 30) {
    const t = rad(a); c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(t) * R, cy - Math.sin(t) * R); c.stroke();
    text(c, `${a}°`, cx + Math.cos(t) * (R + 15), cy - Math.sin(t) * (R + 12), C.mu, 10, 'center');
  }
  c.fillStyle = C.gr;
  for (let k = 0; k < 24; k++) {
    const a0 = -rad(ang - dir * k * 1.2); c.globalAlpha = .25 * (1 - k / 24);
    c.beginPath(); c.moveTo(cx, cy); c.arc(cx, cy, R, a0 - rad(.7), a0 + rad(.7)); c.closePath(); c.fill();
  }
  c.globalAlpha = 1; c.strokeStyle = C.gr; c.lineWidth = 2; c.beginPath(); c.moveTo(cx, cy);
  c.lineTo(cx + Math.cos(rad(ang)) * R, cy - Math.sin(rad(ang)) * R); c.stroke();
  c.fillStyle = '#1e40af'; c.fillRect(cx - 14, cy - 6, 28, 12);
}
export function rayDist(x, y, a, rects, max = 500) { // raycast contra paredes y obstáculos
  const dx = Math.cos(a), dy = Math.sin(a);
  for (let d = 0; d < max; d += 2) {
    const px = x + dx * d, py = y + dy * d;
    if (px > W) return max;
    if (px < 0 || py < 20 || py > H - 20 || rects.some(r => px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h)) return d;
  }
  return max;
}
export function robot(c, r) {
  c.save(); c.translate(r.x, r.y); c.rotate(r.h);
  c.fillStyle = '#020617'; for (const s of [-1, 1]) c.fillRect(-12, s * 15 - 4, 20, 8);
  c.fillStyle = '#0e7490'; c.strokeStyle = C.cy; c.lineWidth = 2;
  c.beginPath(); c.roundRect(-16, -12, 30, 24, 5); c.fill(); c.stroke();
  c.fillStyle = '#f8fafc'; c.fillRect(2, -4, 8, 8); // SG90
  c.translate(8, 0); c.rotate(r.servo || 0);
  c.fillStyle = '#1e40af'; c.fillRect(4, -9, 5, 18);
  c.fillStyle = '#94a3b8'; for (const s of [-5, 5]) { c.beginPath(); c.arc(10, s, 3.5, 0, 7); c.fill(); }
  c.restore();
}

// ---------- Generador de código C++ real para Arduino Nano ----------
const MEDIR = `float medirCm() {
  digitalWrite(trigPin, LOW);  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH); delayMicroseconds(10);
  digitalWrite(trigPin, LOW);
  unsigned long t = pulseIn(echoPin, HIGH, 30000); // µs
  return t * 0.0343 / 2;  // d = t·0.0343/2
}`;
const f1 = n => Number(n).toFixed(1);
const PARTS = { // título, includes/globales, funciones extra, setup extra, loop
  1: p => ['Nivel 1 · Física del eco', `// Lectura simulada: ECHO = ${Math.round(p.us)} µs → ${f1(p.cm)} cm`, '', '', `
  float d = medirCm();
  Serial.print("Distancia: "); Serial.print(d); Serial.println(" cm");
  delay(100);`],
  2: p => ['Nivel 2 · Calibración y cono de 15°', `const int ledAlarma = 4;
const int UMBRAL_CM = ${p.thr};
const bool FILTRO_CONO = ${p.cone}; // descarta ecos laterales`, `
bool lecturaValida(float &d) {
  float a = medirCm(); delay(15);
  float b = medirCm(); delay(15);
  float c = medirCm();
  d = (a + b + c) / 3.0;
  if (a == 0 || b == 0 || c == 0) return false; // sin eco
  if (!FILTRO_CONO) return true;
  return abs(a - b) < 2 && abs(b - c) < 2; // eco estable = dentro del cono
}`, '\n  pinMode(ledAlarma, OUTPUT);', `
  float d;
  bool alarma = lecturaValida(d) && d <= UMBRAL_CM;
  digitalWrite(ledAlarma, alarma);
  delay(60);`],
  3: p => ['Nivel 3 · Sensor de reversa progresivo', `const int ledVerde = 3, ledAmarillo = 4, ledRojo = 5, buzzer = 6;
const int LIM_AMARILLO = ${p.y}; // cm
const int LIM_ROJO = ${p.r};     // cm`, '', '\n  for (int p = 3; p <= 5; p++) pinMode(p, OUTPUT);', `
  float d = medirCm();
  if (d == 0) d = 400; // sin eco = libre
  digitalWrite(ledVerde, d > LIM_AMARILLO);
  digitalWrite(ledAmarillo, d <= LIM_AMARILLO && d >= LIM_ROJO);
  digitalWrite(ledRojo, d < LIM_ROJO);
  if (d < LIM_ROJO) { tone(buzzer, 1800, 60); delay(120); }
  else if (d <= LIM_AMARILLO) { tone(buzzer, 1200, 60); delay(450); }
  else { noTone(buzzer); delay(100); }`],
  4: p => ['Nivel 4 · Radar de barrido SG90 + HC-SR04', `#include <Servo.h>
Servo servo;
const int PASO_MS = ${Math.round(1000 / p.v)}; // ${p.v} °/s
// Marcas del jugador: ${p.mk.map(m => `(${m.a}°, ${m.d} cm)`).join(' ') || 'ninguna'}`, `
void barrer(int desde, int hasta, int paso) {
  for (int a = desde; a != hasta + paso; a += paso) {
    servo.write(a); delay(PASO_MS);
    float d = medirCm();
    Serial.print(a); Serial.print(","); Serial.println(d); // ángulo,distancia
  }
}`, '\n  servo.attach(3);', `
  barrer(0, 180, 1);
  barrer(180, 0, -1);`],
  5: p => ['Nivel 5 · Robot evasor autónomo (driver L298N)', `#include <Servo.h>
Servo cabeza; // SG90 bajo el HC-SR04
const int IN1 = 5, IN2 = 6, IN3 = 7, IN4 = 8;
const int D_MIN = ${p.d};      // cm
const int GIRO_MS = ${p.turn * 6}; // ≈ ${p.turn}°`, `
void motores(int a, int b, int c, int d) {
  digitalWrite(IN1, a); digitalWrite(IN2, b); digitalWrite(IN3, c); digitalWrite(IN4, d);
}
void avanzar()    { motores(1, 0, 1, 0); }
void parar()      { motores(0, 0, 0, 0); }
void retroceder() { motores(0, 1, 0, 1); delay(300); }
void izquierda()  { motores(0, 1, 1, 0); delay(GIRO_MS); }
void derecha()    { motores(1, 0, 0, 1); delay(GIRO_MS); }
float mirar(int ang) { cabeza.write(ang); delay(250); return medirCm(); }`,
  '\n  cabeza.attach(3);\n  for (int p = 5; p <= 8; p++) pinMode(p, OUTPUT);', `
  float frente = mirar(90), izq = 0, der = 0;
  if (frente <= D_MIN) { parar(); izq = mirar(170); der = mirar(10); }
  if (frente > D_MIN)  ${p.a1}();
  else if (izq > der)  ${p.a2}();
  else                 ${p.a3}();`],
};
export function genCode(id, p) {
  const [t, g0, fn, su, lp] = PARTS[id](p), inc = g0.match(/^#include.*\n/)?.[0] || '', g = g0.slice(inc.length);
  return `// ${t} — Arduino Nano
${inc}const int trigPin = 9;   // HC-SR04 TRIG
const int echoPin = 10;  // HC-SR04 ECHO
${g}

${MEDIR}
${fn}
void setup() {
  Serial.begin(9600);
  pinMode(trigPin, OUTPUT);
  pinMode(echoPin, INPUT);${su}
}

void loop() {${lp}
}`;
}
