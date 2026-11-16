// Fase 2: código C++ integrado con parámetros ajustables y línea activa resaltada.
const SLIDERS = [
  ['dmin', 'DISTANCIA_MIN (cm)', 8, 60, 'Distancia a la que frena'],
  ['vel', 'VEL_CRUCERO (PWM)', 40, 255, 'Velocidad al avanzar (bajo 70 el motor no gira)'],
  ['vt', 'VEL_GIRO (PWM)', 40, 255, 'Velocidad de giro: 150 ≈ 90° en 600 ms'],
];
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

export function buildLines(p, w) {
  const n = (k) => (w[k] ? w[k].replace(/^D/, '') : '?');
  const L = (t, st) => ({ t, st });
  return [
    L('#include <Servo.h>'),
    L(`const int TRIG=${n('trig')}, ECHO=${n('echo')}, SERVO_PIN=${n('servo')};`),
    L(`const int IN1=${n('in1')}, IN2=${n('in2')}, IN3=${n('in3')}, IN4=${n('in4')};`),
    L(`const int ENA=${n('ena')}, ENB=${n('enb')};`),
    L(`const int DISTANCIA_MIN = ${p.dmin};  // cm`),
    L(`const int VEL_CRUCERO  = ${p.vel};  // 0-255`),
    L(`const int VEL_GIRO     = ${p.vt};  // 0-255`),
    L('Servo cabeza;'),
    L(''),
    L('long medir() {'),
    L('  digitalWrite(TRIG, LOW);  delayMicroseconds(2);'),
    L('  digitalWrite(TRIG, HIGH); delayMicroseconds(10);'),
    L('  digitalWrite(TRIG, LOW);'),
    L('  long t = pulseIn(ECHO, HIGH, 30000);'),
    L('  return t == 0 ? 400 : (t * 0.034) / 2;'),
    L('}'),
    L('void motores(int i, int d) {  // + adelante, - atrás'),
    L('  digitalWrite(IN1, i > 0); digitalWrite(IN2, i < 0);'),
    L('  digitalWrite(IN3, d > 0); digitalWrite(IN4, d < 0);'),
    L('  analogWrite(ENA, abs(i)); analogWrite(ENB, abs(d));'),
    L('}'),
    L('void setup() {'),
    L('  pinMode(TRIG, OUTPUT); pinMode(ECHO, INPUT);'),
    L('  pinMode(IN1, OUTPUT); pinMode(IN2, OUTPUT);'),
    L('  pinMode(IN3, OUTPUT); pinMode(IN4, OUTPUT);'),
    L('  cabeza.attach(SERVO_PIN); cabeza.write(90);'),
    L('}'),
    L('void loop() {'),
    L('  cabeza.write(90);', 'FWD'),
    L('  motores(VEL_CRUCERO, VEL_CRUCERO);', 'FWD'),
    L('  if (medir() < DISTANCIA_MIN) {', 'FWD'),
    L('    motores(0, 0); delay(250);', 'STOP'),
    L('    cabeza.write(20);  delay(300); long der = medir();', 'LOOK_R'),
    L('    cabeza.write(160); delay(300); long izq = medir();', 'LOOK_L'),
    L('    cabeza.write(90);  delay(300);', 'CENTER'),
    L('    int ms = (izq < DISTANCIA_MIN && der < DISTANCIA_MIN) ? 1200 : 600;', 'CENTER'),
    L('    if (izq > der) motores(-VEL_GIRO, VEL_GIRO);', 'TURN'),
    L('    else           motores(VEL_GIRO, -VEL_GIRO);', 'TURN'),
    L('    delay(ms); motores(0, 0);', 'TURN'),
    L('  }'),
    L('}'),
  ];
}

export function mountCode(host, wiring, { onLoad }) {
  const params = { dmin: 20, vel: 150, vt: 150 };
  host.innerHTML = `<p class="l5-hint">Ajusta los parámetros: el código se actualiza y, al correr la pista, se resalta la línea en ejecución.</p>
    <div class="l5-sliders">${SLIDERS.map(([k, label, min, max, tip]) => `<label class="l5-range"><span>${label}: <b data-v="${k}">${params[k]}</b></span>
      <input type="range" data-k="${k}" min="${min}" max="${max}" value="${params[k]}"><small>${tip}</small></label>`).join('')}</div>
    <pre class="l5-code" tabindex="0" aria-label="Código del robot"></pre>
    <div class="l5-actions"><button type="button" class="l5-btn-primary" data-load>▶ Compilar y cargar al robot</button></div>
    <div class="l5-msg" role="status"></div>`;
  const pre = host.querySelector('.l5-code');
  const msg = host.querySelector('.l5-msg');
  const render = () => {
    pre.innerHTML = buildLines(params, wiring).map((l, i) => `<span class="l5-ln" data-i="${i}" data-st="${l.st || ''}">${esc(l.t) || ' '}</span>`).join('');
  };
  host.addEventListener('input', (e) => {
    const k = e.target.dataset.k;
    if (!k) return;
    params[k] = Number(e.target.value);
    host.querySelector(`[data-v="${k}"]`).textContent = params[k];
    render();
    msg.textContent = 'Cambios sin cargar: pulsa "Compilar y cargar".';
    msg.className = 'l5-msg';
  });
  host.querySelector('[data-load]').addEventListener('click', () => {
    msg.className = 'l5-msg is-ok';
    msg.textContent = `✔ Compilado (${buildLines(params, wiring).length} líneas). Programa cargado en el Nano.`;
    onLoad({ ...params });
  });
  render();
  return {
    params,
    render,
    setActive(state) {
      pre.querySelectorAll('.is-active').forEach((n) => n.classList.remove('is-active'));
      if (state) pre.querySelectorAll(`[data-st="${state}"]`).forEach((n) => n.classList.add('is-active'));
    },
  };
}
